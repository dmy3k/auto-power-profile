const { Adw, Gio, GLib, GObject } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const FileUtils = imports.misc.fileUtils;
const gettextDomain = Me.metadata["gettext-domain"];
const Gettext = imports.gettext.domain(gettextDomain);
const _ = Gettext.gettext;

const { General } = Me.imports.preferences.general;
const { About } = Me.imports.preferences.about;

const POWER_PROFILES_BUS_NAME = "net.hadess.PowerProfiles";
const POWER_PROFILES_OBJECT_PATH = "/net/hadess/PowerProfiles";

const PowerProfilesIface = FileUtils.loadInterfaceXML(
  "net.hadess.PowerProfiles"
);
const PowerProfilesProxy = Gio.DBusProxy.makeProxyWrapper(PowerProfilesIface);

function init() {
  ExtensionUtils.initTranslations(Me.metadata["gettext-domain"]);
}

function fillPreferencesWindow(window) {
  const settings = ExtensionUtils.getSettings(
    "org.gnome.shell.extensions.auto-power-profile"
  );

  const proxy = new Promise((resolve, reject) => {
    new PowerProfilesProxy(
      Gio.DBus.system,
      POWER_PROFILES_BUS_NAME,
      POWER_PROFILES_OBJECT_PATH,
      (proxy, error) => {
        if (error) {
          reject(error);
        } else {
          resolve(proxy);
        }
      }
    );
  }).catch((e) => {
    console.error(`failed to create dbus proxy (${e?.message})`);
  });

  window.add(new General(settings, proxy));
  window.add(new About(settings, proxy));
}
