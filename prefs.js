import Adw from "gi://Adw";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const PROFILE_CHOICES = ["performance", "balanced", "power-saver"];

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
    GTypeName: "AutoPowerProfilePreferences",
    Template: GLib.Uri.resolve_relative(
      import.meta.url,
      "./ui/general.ui",
      GLib.UriFlags.NONE
    ),
    InternalChildren: ["ac_profile", "bat_profile", "threshold"],
  },
  class General extends Adw.PreferencesPage {
    _init(settings, params = {}) {
      super._init(params);

      bindAdwComboRow(this._ac_profile, settings, "ac", PROFILE_CHOICES);
      bindAdwComboRow(this._bat_profile, settings, "bat", PROFILE_CHOICES);
      settings.bind(
        "threshold",
        this._threshold,
        "value",
        Gio.SettingsBindFlags.DEFAULT
      );
    }
  }
);

export default class AutoPowerProfilePreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    window.add(new General(settings));
  }
}
