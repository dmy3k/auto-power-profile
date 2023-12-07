import Gio from "gi://Gio";
import GLib from "gi://GLib";
import UPower from "gi://UPowerGlib";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";
import * as FileUtils from "resource:///org/gnome/shell/misc/fileUtils.js";

const UPOWER_BUS_NAME = "org.freedesktop.UPower";
const UPOWER_OBJECT_PATH = "/org/freedesktop/UPower/devices/DisplayDevice";

const POWER_PROFILES_BUS_NAME = "net.hadess.PowerProfiles";
const POWER_PROFILES_OBJECT_PATH = "/net/hadess/PowerProfiles";

class ProfileTransition {
  effectiveProfile;
  requestedProfile;
  committedProfile;

  onBat;
  lowBat;

  report({ effectiveProfile, onBattery, lowBattery }) {
    this.effectiveProfile = effectiveProfile;
    this.onBat = onBattery;
    this.lowBat = lowBattery;

    if (
      this.requestedProfile &&
      !this.committedProfile &&
      this.effectiveProfile === this.requestedProfile
    ) {
      this.committedProfile = this.requestedProfile;
    }

    if (!effectiveProfile) {
      this.effectiveProfile = null;
      this.requestedProfile = null;
      this.committedProfile = null;
    }
  }

  request({ configuredProfile, onBattery, lowBattery }) {
    const allowed =
      this.lowBat !== lowBattery ||
      this.onBat !== onBattery ||
      !this.committedProfile;

    if (allowed) {
      this.requestedProfile = configuredProfile;
      this.committedProfile = null;
    }
    return allowed;
  }
}

export default class AutoPowerProfile extends Extension {
  _settings;
  _settingsCache = {};

  _transition;

  _perfDebounceTimerId;

  _powerManagerProxy;
  _powerManagerWatcher;

  _powerProfilesProxy;
  _powerProfileWatcher;

  _availableProfiles = [];

  _quickSettingsItem;

  constructor(metadata) {
    super(metadata);
  }

  enable() {
    const DisplayDeviceInterface = FileUtils.loadInterfaceXML(
      "org.freedesktop.UPower.Device"
    );
    const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(
      DisplayDeviceInterface
    );

    const PowerProfilesIface = FileUtils.loadInterfaceXML(
      "net.hadess.PowerProfiles"
    );
    const PowerProfilesProxy =
      Gio.DBusProxy.makeProxyWrapper(PowerProfilesIface);

    this._transition = new ProfileTransition();

    this._settings = this.getSettings(
      "org.gnome.shell.extensions.auto-power-profile"
    );
    this._settingsWatcher = this._settings.connect(
      "changed",
      this._onSettingsChange
    );

    this._powerManagerProxy = new PowerManagerProxy(
      Gio.DBus.system,
      UPOWER_BUS_NAME,
      UPOWER_OBJECT_PATH,
      (proxy, error) => {
        if (error) {
          console.error(error.message);
          return;
        }
        this._powerManagerWatcher = this._powerManagerProxy.connect(
          "g-properties-changed",
          this._checkProfile
        );
        this._availableProfiles = this._powerProfilesProxy.Profiles.map((p) =>
          p.Profile.unpack()
        );
        this._onSettingsChange();
      }
    );

    this._powerProfilesProxy = new PowerProfilesProxy(
      Gio.DBus.system,
      POWER_PROFILES_BUS_NAME,
      POWER_PROFILES_OBJECT_PATH,
      (proxy, error) => {
        if (error) {
          console.error(error.message);
        } else {
          this._powerProfileWatcher = this._powerProfilesProxy.connect(
            "g-properties-changed",
            this._onProfileChange
          );
          this._quickSettingsItem = this._addQuickSettingsItem();
        }
      }
    );
  }

  disable() {
    this._switchProfile("balanced");

    this._settings?.disconnect(this._settingsWatcher);

    if (this._powerManagerWatcher) {
      this._powerManagerProxy?.disconnect(this._powerManagerWatcher);
      this._powerManagerWatcher = null;
    }
    if (this._powerProfileWatcher) {
      this._powerProfilesProxy?.disconnect(this._powerProfileWatcher);
      this._powerProfileWatcher = null;
    }

    if (this._perfDebounceTimerId) {
      GLib.Source.remove(this._perfDebounceTimerId);
      this._perfDebounceTimerId = null;
    }

    this._quickSettingsItem?.destroy();
    this._quickSettingsItem = null;

    this._transition?.report({});
    this._transition = null;

    this._settings = null;
    this._settingsCache = {};
    this._availableProfiles = [];

    this._powerManagerProxy = null;
    this._powerProfilesProxy = null;
  }

  _addQuickSettingsItem() {
    const ppIndicator = Main.panel?.statusArea?.quickSettings?._powerProfiles;

    if (ppIndicator) {
      const ppToggle = ppIndicator.quickSettingsItems[0];
      return ppToggle.menu.addAction(_("Power Mode Defaults"), () =>
        this.openPreferences()
      );
    }
  }

  _onProfileChange = (p, properties) => {
    const payload = properties?.deep_unpack();
    const powerConditions = this._getPowerConditions();

    if (payload?.ActiveProfile) {
      if (this._perfDebounceTimerId) {
        GLib.Source.remove(this._perfDebounceTimerId);
        this._perfDebounceTimerId = null;
      }
      if (!payload?.PerformanceDegraded) {
        this._transition.report({
          effectiveProfile: this._powerProfilesProxy?.ActiveProfile,
          ...powerConditions,
        });
      }
    }

    if (powerConditions.onAC && payload?.PerformanceDegraded) {
      try {
        const reason = payload?.PerformanceDegraded?.unpack();

        if (reason === "lap-detected") {
          this._perfDebounceTimerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            5,
            () => {
              this._transition.report({});
              this._checkProfile();
              this._perfDebounceTimerId = null;
              return GLib.SOURCE_REMOVE;
            }
          );
        } else if (reason) {
          console.log(
            `ActiveProfile: ${this._powerProfilesProxy?.ActiveProfile}, PerformanceDegraded: ${reason}`
          );
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  _onSettingsChange = () => {
    this._settingsCache = {
      ACDefault: this._settings.get_string("ac"),
      batteryDefault: this._settings.get_string("bat"),
      batteryThreshold: this._settings.get_int("threshold"),
    };
    this._transition.report({});
    this._checkProfile();
  };

  _getPowerConditions = () => {
    let configuredProfile = "balanced";

    if (
      this._powerManagerProxy?.State === UPower.DeviceState.UNKNOWN ||
      this._powerManagerProxy?.Percentage === undefined
    ) {
      return { configuredProfile };
    }

    const onBattery =
      this._powerManagerProxy?.State === UPower.DeviceState.PENDING_DISCHARGE ||
      this._powerManagerProxy?.State === UPower.DeviceState.DISCHARGING;

    const lowBattery =
      this._settingsCache?.batteryThreshold >=
      this._powerManagerProxy?.Percentage;

    if (onBattery === false) {
      configuredProfile = this._settingsCache?.ACDefault;
    } else if (onBattery === true && lowBattery) {
      configuredProfile = "power-saver";
    } else if (onBattery === true && !lowBattery) {
      configuredProfile = this._settingsCache?.batteryDefault;
    }

    return {
      onBattery,
      onAC: onBattery === false,
      lowBattery: onBattery === true && lowBattery,
      configuredProfile,
    };
  };

  _switchProfile = (profile) => {
    if (profile === this._powerProfilesProxy?.ActiveProfile) {
      return;
    }
    if (!this._availableProfiles.includes(profile)) {
      console.error(
        `Profile ${profile} is not in list of available profiles (${this._availableProfiles})`
      );
      return;
    }
    this._powerProfilesProxy.ActiveProfile = profile;
  };

  _checkProfile = () => {
    const powerConditions = this._getPowerConditions();
    const allowed = this._transition.request(powerConditions);

    if (allowed) {
      this._switchProfile(powerConditions.configuredProfile);
    }
  };
}
