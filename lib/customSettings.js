import Gio from "gi://Gio";

export class CustomSettings {
  _settings;
  _connectionIds = [];

  _pwrSettings;
  _pwrConnectionIds = [];

  constructor(settings) {
    this._settings = settings;

    try {
      this._pwrSettings = new Gio.Settings({
        schema_id: "org.gnome.settings-daemon.plugins.power"
      });
    } catch (e) {
      console.log("Could not load GNOME power settings:", e.message);
    }
  }

  get acProfile() {
    return this._settings.get_string("ac");
  }

  set acProfile(profile) {
    this._settings.set_string("ac", profile);
  }

  get batteryProfile() {
    return this._settings.get_string("bat");
  }

  set batteryProfile(profile) {
    this._settings.set_string("bat", profile);
  }

  get notificationsEnabled() {
    return this._settings.get_boolean("notifications");
  }

  set notificationsEnabled(value) {
    return this._settings.set_boolean("notifications", value);
  }

  get rememberUserProfile() {
    return this._settings.get_boolean("remember-user-profile");
  }

  get performanceApps() {
    return this._settings.get_strv("performance-apps");
  }

  get performanceAppsACMode() {
    return this._settings.get_string("performance-apps-ac");
  }

  get performanceAppsBatteryMode() {
    return this._settings.get_string("performance-apps-bat");
  }

  get powerSaverOnLowBatteryEnabled() {
    return this._pwrSettings?.get_boolean("power-saver-profile-on-low-battery");
  }

  connect(callback) {
    const id = this._settings.connect("changed", callback);
    this._connectionIds.push(id);

    const pwrid = this._pwrSettings?.connect(
      "changed::power-saver-profile-on-low-battery",
      callback
    );
    if (pwrid !== undefined) {
      this._pwrConnectionIds.push(pwrid);
    }
  }

  destroy() {
    if (this._settings) {
      this._connectionIds.forEach((id) => {
        this._settings.disconnect(id);
      });
      this._connectionIds = [];
      this._settings = null;
    }

    if (this._pwrSettings) {
      this._pwrConnectionIds.forEach((id) => {
        this._pwrSettings.disconnect(id);
      });
      this._pwrConnectionIds = [];
      this._pwrSettings = null;
    }
  }
}
