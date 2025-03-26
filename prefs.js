import Adw from "gi://Adw";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";

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

export default class AutoPowerProfilePreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const ppdProxy = new Promise((resolve, reject) => {
      createPowerProfilesProxy(
        (x) => loadInterfaceXML(x),
        (proxy, error) => {
          if (error) {
            reject(error);
          } else {
            resolve(proxy);
          }
        }
      );
    }).catch((e) =>
      console.error(`failed to create dbus proxy (${e?.message})`)
    );

    window.add(new General(settings, ppdProxy));
  }
}
