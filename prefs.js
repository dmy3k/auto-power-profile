import Adw from "gi://Adw";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";

import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { createPowerProfilesProxy } from "./lib/utils.js";

// https://github.com/GNOME/gnome-shell/blob/3c1f6113fafda391e360114987298a14c6d72f66/js/misc/dbusUtils.js#L26
function loadInterfaceXML(iface) {
  let uri = `resource:///org/gnome/shell/dbus-interfaces/${iface}.xml`;
  let f = Gio.File.new_for_uri(uri);

  try {
    let [ok_, bytes] = f.load_contents(null);
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error(`Failed to load D-Bus interface ${iface}`);
  }

  return null;
}

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
      "platform_profile_model",
      "row_lap_mode",
      "lap_mode",
      "disable_animations_on_battery",
    ],
  },
  class General extends Adw.PreferencesPage {
    _init(settings, availableProfilesPromise, params = {}) {
      super._init({
        ...params,
        name: "general",
        title: _("General"),
        icon_name: "power-profile-performance-symbolic",
      });

      availableProfilesPromise
        .then((availableProfiles) => {
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
          settings.bind(
            "disable-animations-on-battery",
            this._disable_animations_on_battery,
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
        .catch((e) => console.error(e));
    }
  }
);

export const PerformanceApps = GObject.registerClass(
  { GTypeName: "AutoPowerProfilePerformanceAppsPrefs" },
  class PerformanceApps extends Adw.PreferencesPage {
    _init(settings, availableProfilesPromise, params = {}) {
      super._init({
        ...params,
        name: "performance-apps",
        title: _("Performance Apps"),
        icon_name: "application-x-executable-symbolic",
      });

      const modesGroup = new Adw.PreferencesGroup({
        title: _("Application-Based Profiles"),
        description: _(
          "Activate profiles for running selected apps. Can be used to prioritize performance ad-hoc"
        ),
      });
      this.add(modesGroup);

      availableProfilesPromise.then((allProfiles) => {
        const availableProfiles = allProfiles.filter(
          ([k, _]) => k !== "power-saver"
        );
        const profileKeys = availableProfiles.map(([k, _]) => k);

        const performanceAppsBatKey = "performance-apps-bat";
        const performanceAppsAcKey = "performance-apps-ac";

        const [defaultProfile] = availableProfiles[0];

        const currentBatProfile =
          settings.get_string(performanceAppsBatKey) || defaultProfile;
        const currentAcProfile =
          settings.get_string(performanceAppsAcKey) || defaultProfile;

        const batCombo = new Adw.ComboRow({
          title: _("On Battery"),
          model: Gtk.StringList.new(availableProfiles.map(([_, n]) => n)),
          selected: profileKeys.indexOf(currentBatProfile),
        });
        bindAdwComboRow(batCombo, settings, performanceAppsBatKey, profileKeys);
        modesGroup.add(batCombo);

        const acCombo = new Adw.ComboRow({
          title: _("On AC"),
          model: Gtk.StringList.new(availableProfiles.map(([_, n]) => n)),
          selected: profileKeys.indexOf(currentAcProfile),
        });
        bindAdwComboRow(acCombo, settings, performanceAppsAcKey, profileKeys);
        modesGroup.add(acCombo);

        const group = new Adw.PreferencesGroup({});
        this.add(group);

        const apps = Gio.AppInfo.get_all().filter((app) => {
          try {
            return app.should_show() && app.get_id();
          } catch {
            return false;
          }
        });

        apps.sort((a, b) =>
          a.get_display_name().localeCompare(b.get_display_name())
        );
        const selectedIds = new Set(settings.get_strv("performance-apps"));
        this._switchRows = {};

        apps.forEach((app) => {
          const appId = app.get_id();
          const appName = app.get_display_name();
          const icon = app.get_icon();

          const row = new Adw.SwitchRow({
            title: appName,
            active: selectedIds.has(appId),
          });

          if (icon) {
            const image = new Gtk.Image({
              gicon: icon,
              pixel_size: 24,
              margin_end: 8,
            });
            row.add_prefix(image);
          }

          row.connect("notify::active", (sw) => {
            let current = new Set(settings.get_strv("performance-apps"));
            if (sw.active) {
              current.add(appId);
            } else {
              current.delete(appId);
            }
            settings.set_strv("performance-apps", Array.from(current));
          });
          this._switchRows[appId] = row;
          group.add(row);
        });

        this._settingsChangedId = settings.connect(
          "changed::performance-apps",
          () => {
            let updated = new Set(settings.get_strv("performance-apps"));
            Object.entries(this._switchRows).forEach(([appId, row]) => {
              row.active = updated.has(appId);
            });
          }
        );
      });
    }

    vfunc_dispose() {
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
      }
      super.vfunc_dispose();
    }
  }
);

export default class AutoPowerProfilePreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    // Configure window size for better usability
    // Format: width x height  
    window.set_default_size(600, 720);
    window.set_size_request(550, 650);
    
    const settings = this.getSettings();
    const availableProfiles = this._loadAvailableProfiles();

    window.add(new General(settings, availableProfiles));
    window.add(new PerformanceApps(settings, availableProfiles));
  }

  _loadAvailableProfiles = () => {
    const PROFILES_I18N = [
      ["performance", _("Performance")],
      ["balanced", _("Balanced")],
      ["power-saver", _("Power Saver")],
    ];

    return new Promise((resolve, reject) => {
      createPowerProfilesProxy(loadInterfaceXML, (proxy, error) => {
        if (error) {
          reject(error);
        } else {
          const keys = proxy?.Profiles?.map((x) => x.Profile.unpack()) || [];
          const profiles = PROFILES_I18N.filter(([k, n]) => keys.includes(k));
          if (profiles.length) {
            resolve(profiles);
          } else {
            reject(new Error("No available power profiles"));
          }
        }
      });
    });
  };
}
