const FileUtils = imports.misc.fileUtils;
const { Adw, Gio, GLib, GObject } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const gettextDomain = Me.metadata["gettext-domain"];
const Gettext = imports.gettext.domain(gettextDomain);
const _ = Gettext.gettext;

function bindAdwComboRow(comboRow, settings, key, map_) {
  const initValue = settings.get_string(key);
  comboRow.selected = map_.indexOf(initValue);

  settings.connect(`changed::${key}`, () => {
    const idx = map_.indexOf(settings.get_string(key));
    comboRow.selected = idx;
  });
  comboRow.connect("notify::selected", () => {
    const value = map_[comboRow.selected];
    settings.set_string(key, value);
  });
}

var General = GObject.registerClass(
  {
    GTypeName: "AutoPowerProfileGeneralPrefs",
    Template: `file://${GLib.build_filenamev([Me.path, "ui", "general.ui"])}`,
    InternalChildren: [
      "ac_profile",
      "bat_profile",
      "threshold",
      "platform_profile_model",
      "row_lap_mode",
      "lap_mode",
    ],
  },
  class General extends Adw.PreferencesPage {
    _init(settings, proxyPromise, params = {}) {
      super._init(params);

      const PROFILES_I18N = [
        ["performance", _("Performance")],
        ["balanced", _("Balanced")],
        ["power-saver", _("Power Saver")],
      ];

      proxyPromise
        .then((proxy) => {
          const profileKeys =
            proxy?.Profiles?.map((x) => x.Profile.unpack()) || [];

          const availableProfiles = PROFILES_I18N.filter(([k, name]) =>
            profileKeys.includes(k)
          );
          const indexedProfiles = availableProfiles.map(([k, name]) => k);

          availableProfiles.forEach(([k, name]) => {
            this._platform_profile_model.append(name);
          });

          bindAdwComboRow(this._ac_profile, settings, "ac", indexedProfiles);
          bindAdwComboRow(this._bat_profile, settings, "bat", indexedProfiles);
          settings.bind(
            "threshold",
            this._threshold,
            "value",
            Gio.SettingsBindFlags.DEFAULT
          );
          settings.bind(
            "lapmode",
            this._lap_mode,
            "active",
            Gio.SettingsBindFlags.DEFAULT
          );

          const onSettingsUpdate = () => {
            const acDefault = settings.get_string("ac");
            this._row_lap_mode.visible = acDefault === "performance";
          };
          settings.connect("changed::ac", onSettingsUpdate);
          onSettingsUpdate();
        })
        .catch((e) => {
          console.log(e);
        });
    }
  }
);

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
}
