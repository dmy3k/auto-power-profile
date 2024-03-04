const { Adw, Gio, GLib, GObject } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const gettextDomain = Me.metadata["gettext-domain"];
const Gettext = imports.gettext.domain(gettextDomain);
const _ = Gettext.gettext;

var About = GObject.registerClass(
  {
    GTypeName: "AutoPowerProfileAboutPrefs",
    Template: `file://${GLib.build_filenamev([Me.path, "ui", "about.ui"])}`,
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
    ],
  },
  class About extends Adw.PreferencesPage {
    EMBLEMS = {
      success: { icon: "emblem-default-symbolic", classname: "success" },
      error: { icon: "emblem-important-symbolic", classname: "error" },
    };

    _init(settings, proxyPromise, params = {}) {
      super._init(params);

      proxyPromise
        .then((ppdProxy) => {
          if (!ppdProxy) {
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

          ppdProxy.connect("g-properties-changed", () =>
            this._updatePPDdriverInfo(ppdProxy)
          );

          this._updatePPDversion(ppdProxy).catch(console.error);
          this._updatePPDdriverInfo(ppdProxy);
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
        this._version_icon.add_css_class(classname);
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
