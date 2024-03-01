import Adw from "gi://Adw";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

async function execCheck(argv) {
  const flags =
    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

  const proc = new Gio.Subprocess({
    argv,
    flags,
  });
  proc.init(null);

  return new Promise((resolve, reject) => {
    proc.communicate_utf8_async(null, null, (obj, res) => {
      try {
        const [, stdout, stderr] = obj.communicate_utf8_finish(res);
        const status = obj.get_exit_status();
        resolve([status, stdout]);
      } catch (e) {
        reject(e);
      }
    });
  });
}

function loadInterfaceXML(iface) {
  let uri = `resource:///org/gnome/shell/dbus-interfaces/${iface}.xml`;
  let f = Gio.File.new_for_uri(uri);

  try {
    let [ok_, bytes] = f.load_contents(null);
    return new TextDecoder().decode(bytes);
  } catch (e) {
    log(`Failed to load D-Bus interface ${iface}`);
  }

  return null;
}

const POWER_PROFILES_BUS_NAME = "net.hadess.PowerProfiles";
const POWER_PROFILES_OBJECT_PATH = "/net/hadess/PowerProfiles";

const PowerProfilesIface = loadInterfaceXML("net.hadess.PowerProfiles");
const PowerProfilesProxy = Gio.DBusProxy.makeProxyWrapper(PowerProfilesIface);

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

export const General = GObject.registerClass(
  {
    GTypeName: "AutoPowerProfileGeneralPrefs",
    Template: GLib.Uri.resolve_relative(
      import.meta.url,
      "./ui/general.ui",
      GLib.UriFlags.NONE
    ),
    InternalChildren: [
      "ac_profile",
      "bat_profile",
      "threshold",

      "row_version",
      "row_cpu_driver",
      "row_platform_driver",
      "version_icon",
      "platform_driver_icon",
      "cpu_driver_icon",

      "ppd_version_label",
      "platform_driver_label",
      "cpu_driver_label",
      "debug_logging",
      "platform_profile_model",
    ],
  },
  class General extends Adw.PreferencesPage {
    PROFILES_I18N = [
      ["performance", _("Performance")],
      ["balanced", _("Balanced")],
      ["power-saver", _("Power Saver")],
    ];

    EMBLEMS = {
      success: { icon: "emblem-default-symbolic", classname: "success" },
      error: { icon: "emblem-important-symbolic", classname: "error" },
    };

    _init(settings, params = {}) {
      super._init(params);

      settings.bind(
        "threshold",
        this._threshold,
        "value",
        Gio.SettingsBindFlags.DEFAULT
      );
      settings.bind(
        "debug",
        this._debug_logging,
        "active",
        Gio.SettingsBindFlags.DEFAULT
      );

      this._powerProfilesProxy = new PowerProfilesProxy(
        Gio.DBus.system,
        POWER_PROFILES_BUS_NAME,
        POWER_PROFILES_OBJECT_PATH,
        (proxy, error) => {
          if (error) {
            console.error(`failed to create proxy (${error?.message})`);

            this._version_icon.icon_name = this.EMBLEMS.error.icon;
            this._version_icon.add_css_class(this.EMBLEMS.error.classname);

            this._platform_driver_icon.icon_name = this.EMBLEMS.error.icon;
            this._platform_driver_icon.add_css_class(
              this.EMBLEMS.error.classname
            );

            this._cpu_driver_icon.icon_name = this.EMBLEMS.error.icon;
            this._cpu_driver_icon.add_css_class(this.EMBLEMS.error.classname);
            return;
          }
          this._powerProfilesProxy.connect("g-properties-changed", () =>
            this._updatePPDdriverInfo()
          );

          const profileKeys =
            this._powerProfilesProxy.Profiles?.map((x) => x.Profile.unpack()) ||
            [];
          const availableProfiles = this.PROFILES_I18N.filter(([k, name]) =>
            profileKeys.includes(k)
          );
          const indexedProfiles = availableProfiles.map(([k, name]) => k);

          availableProfiles.forEach(([k, name]) => {
            this._platform_profile_model.append(name);
          });
          bindAdwComboRow(this._ac_profile, settings, "ac", indexedProfiles);
          bindAdwComboRow(this._bat_profile, settings, "bat", indexedProfiles);

          this._updatePPDversion().catch(console.error);
          this._updatePPDdriverInfo();
        }
      );
    }

    async _updatePPDversion() {
      let ppdVersion = "";
      try {
        const [v] = this._powerProfilesProxy
          .get_cached_property("Version")
          .get_string();
        ppdVersion = v;
      } catch (e) {
        try {
          const [status, stdout] = await execCheck([
            "/usr/bin/powerprofilesctl",
            "version",
          ]);
          ppdVersion = stdout.replace(/\s/, "");
        } catch (e1) {
          console.error(`failed to read PPD version from dbus (${e?.message})`);
          console.error(`failed to read PPD version from cli (${e1?.message})`);
        }
      } finally {
        const { icon, classname } = ppdVersion
          ? this.EMBLEMS.success
          : this.EMBLEMS.error;

        this._version_icon.icon_name = icon;
        this._version_icon.add_css_class(classname);
        this._ppd_version_label.label = ppdVersion || "?";
      }
    }

    _updatePPDdriverInfo() {
      const active = this._powerProfilesProxy.ActiveProfile;
      const profile = this._powerProfilesProxy.Profiles.find(
        (x) => x.Profile.unpack() === active
      );
      try {
        const [platformDriver] =
          profile.PlatformDriver?.get_string() || profile.Driver?.get_string();

        const { icon, classname } =
          platformDriver && platformDriver !== "placeholder"
            ? this.EMBLEMS.success
            : this.EMBLEMS.error;

        this._platform_driver_icon.icon_name = icon;
        this._platform_driver_icon.add_css_class(classname);
        this._platform_driver_label.label = platformDriver;
      } catch (e) {
        console.error(`failed to get PlatformDriver from PPD (${e?.message})`);
      }

      try {
        const [cpuDriver] = profile.CpuDriver?.get_string();
        const { icon, classname } =
          cpuDriver && cpuDriver !== "placeholder"
            ? this.EMBLEMS.success
            : this.EMBLEMS.error;

        this._cpu_driver_icon.icon_name = icon;
        this._cpu_driver_icon.add_css_class(classname);
        this._cpu_driver_label.label = cpuDriver;
      } catch (e) {
        console.error(`failed to get CpuDriver from PPD (${e?.message})`);
        this._row_cpu_driver.visible = false;
      }
    }
  }
);

export default class AutoPowerProfilePreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    window.add(new General(settings));
  }
}
