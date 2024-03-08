import Adw from "gi://Adw";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import UPower from "gi://UPowerGlib";

import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export const About = GObject.registerClass(
  {
    GTypeName: "AutoPowerProfileAboutPrefs",
    Template: GLib.Uri.resolve_relative(
      import.meta.url,
      "../ui/about.ui",
      GLib.UriFlags.NONE
    ),
    InternalChildren: [
      "row_version",
      "row_cpu_driver",
      "row_platform_driver",
      "version_icon",
      "platform_driver_icon",
      "cpu_driver_icon",

      "ppd_version_label",
      "platform_driver_label",
      "cpu_driver_label",

      "batt_status_icon",
      "row_batt_status",
    ],
  },
  class About extends Adw.PreferencesPage {
    EMBLEMS = {
      success: { icon: "emblem-default-symbolic", classname: "success" },
      error: { icon: "emblem-important-symbolic", classname: "error" },
    };

    _init(settings, ppdProxyPromise, upowerProxyPromise, params = {}) {
      super._init(params);

      ppdProxyPromise
        .then((proxy) => {
          if (!proxy) {
            return;
          }

          proxy.connect("g-properties-changed", () =>
            this._updatePPDdriverInfo(proxy)
          );

          this._updatePPDversion(proxy).catch(console.error);
          this._updatePPDdriverInfo(proxy);
        })
        .catch((e) => {
          console.log(e);
        });

      upowerProxyPromise
        .then((proxy) => {
          if (!proxy) {
            return;
          }

          if (proxy.State !== UPower.DeviceState.UNKNOWN) {
            this._batt_status_icon.icon_name = this.EMBLEMS.success.icon;
            this._batt_status_icon.set_css_classes([
              this.EMBLEMS.success.classname,
            ]);
            this._row_batt_status.title = _("Battery is present");
          }
        })
        .catch((e) => {
          console.log(e);
        });
    }

    async _updatePPDversion(ppdProxy) {
      let ppdVersion = "";
      try {
        const [v] = ppdProxy.get_cached_property("Version").get_string();
        ppdVersion = v;
      } catch (e) {
        if (ppdProxy?.Profiles && ppdProxy?.ActiveProfile) {
          ppdVersion = "<0.20";
        }
      } finally {
        const { icon, classname } = ppdVersion
          ? this.EMBLEMS.success
          : this.EMBLEMS.error;

        this._version_icon.icon_name = icon;
        this._version_icon.set_css_classes([classname]);
        this._ppd_version_label.label = ppdVersion || "";
      }
    }

    _updatePPDdriverInfo(ppdProxy) {
      const active = ppdProxy.ActiveProfile;
      const profile = ppdProxy.Profiles.find(
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
        this._platform_driver_icon.set_css_classes([classname]);
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
        this._cpu_driver_icon.set_css_classes([classname]);
        this._cpu_driver_label.label = cpuDriver;
      } catch (e) {
        console.error(`failed to get CpuDriver from PPD (${e?.message})`);
        this._row_cpu_driver.visible = false;
      }
    }
  }
);
