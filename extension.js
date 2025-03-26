import GLib from "gi://GLib";
import UPower from "gi://UPowerGlib";

import * as FileUtils from "resource:///org/gnome/shell/misc/fileUtils.js";
import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

import { Notifier } from "./lib/notifier.js";
import { ProfileTransition } from "./lib/profiletransition.js";
import {
  createPowerProfilesProxy,
  createPowerManagerProxy,
} from "./lib/utils.js";

export default class AutoPowerProfile extends Extension {
  _settings;
  _settingsCache = {};

  _transition;

  _perfDebounceTimerId;

  _powerManagerProxy;
  _powerManagerWatcher;

  _powerProfilesProxy;
  _powerProfileWatcher;

  _notifier;

  constructor(metadata) {
    super(metadata);
  }

  enable() {
    this._transition = new ProfileTransition();

    this._settings = this.getSettings(
      "org.gnome.shell.extensions.auto-power-profile"
    );
    this._settingsWatcher = this._settings.connect(
      "changed",
      this._onSettingsChange
    );

    this._powerManagerProxy = createPowerManagerProxy(
      (x) => FileUtils.loadInterfaceXML(x),
      (proxy, error) => {
        if (error) {
          console.error(error);
          this._notifier.notify(_("Error connecting UPower DBus"));
          return;
        }
        this._powerManagerWatcher = this._powerManagerProxy.connect(
          "g-properties-changed",
          this._checkProfile
        );
        this._onSettingsChange();
      }
    );

    this._powerProfilesProxy = createPowerProfilesProxy(
      (x) => FileUtils.loadInterfaceXML(x),
      (proxy, error) => {
        if (error) {
          console.error(error);
          this._notifier.notify(
            _("Error connecting power-profiles-daemon DBus")
          );
          return;
        }

        this._powerProfileWatcher = this._powerProfilesProxy.connect(
          "g-properties-changed",
          this._onProfileChange
        );
        this._validateDrivers();
      }
    );

    this._notifier = new Notifier(this);
  }

  disable() {
    if (this._powerManagerWatcher) {
      this._powerManagerProxy?.disconnect(this._powerManagerWatcher);
      this._powerManagerWatcher = null;
    }
    if (this._powerProfileWatcher) {
      this._powerProfilesProxy?.disconnect(this._powerProfileWatcher);
      this._powerProfileWatcher = null;
    }
    if (this._notifier) {
      this._notifier.destroy();
      this._notifier = null;
    }
    this._settings?.disconnect(this._settingsWatcher);

    this._switchProfile("balanced");

    if (this._perfDebounceTimerId) {
      GLib.Source.remove(this._perfDebounceTimerId);
      this._perfDebounceTimerId = null;
    }

    this._transition?.report({});
    this._transition = null;

    this._settings = null;
    this._settingsCache = {};

    this._powerManagerProxy = null;
    this._powerProfilesProxy = null;
  }

  _onProfileChange = (p, properties) => {
    if (!this._powerProfilesProxy) {
      return;
    }
    const payload = properties?.deep_unpack();
    const powerConditions = this._getPowerConditions();

    if (payload?.ActiveProfile) {
      if (this._perfDebounceTimerId) {
        GLib.Source.remove(this._perfDebounceTimerId);
        this._perfDebounceTimerId = null;
      }
      if (!payload?.PerformanceDegraded) {
        this._transition.report({
          effectiveProfile: this._powerProfilesProxy.ActiveProfile,
          ...powerConditions,
        });
      }
    }

    if (powerConditions.onAC && payload?.PerformanceDegraded) {
      try {
        const reason = payload?.PerformanceDegraded?.unpack();

        if (reason === "lap-detected" && this._settingsCache.lapmode) {
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
            `ActiveProfile: ${this._powerProfilesProxy.ActiveProfile}, PerformanceDegraded: ${reason}`
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
      lapmode: this._settings.get_boolean("lapmode"),
    };
    this._transition.report({});
    this._checkProfile();
  };

  _getPowerConditions = () => {
    let configuredProfile = "balanced";

    const hasBattery = !(
      this._powerManagerProxy?.State === UPower.DeviceState.UNKNOWN ||
      this._powerManagerProxy?.Percentage === undefined
    );

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
      hasBattery,
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
    const canSwitch = this._powerProfilesProxy?.Profiles?.some(
      (p) => p.Profile.unpack() === profile
    );

    if (!canSwitch) {
      console.error(
        `switchProfile: Profile ${profile} is not in list of available profiles`
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

  _validateDrivers() {
    const active = this._powerProfilesProxy.ActiveProfile;
    const profile = this._powerProfilesProxy?.Profiles?.find(
      (x) => x.Profile?.unpack() === active
    );

    const driver = profile?.Driver?.get_string()?.[0];
    const platformDriver = profile?.PlatformDriver?.get_string()?.[0];
    const cpuDriver = profile?.CpuDriver?.get_string()?.[0];
    const drivers = [driver, platformDriver, cpuDriver];

    if (!active) {
      this._notifier.notify(
        _("Package power-profiles-daemon is not installed")
      );
    } else if (!drivers.some((x) => x && x !== "placeholder")) {
      this._notifier.notify(
        _(
          "No system-specific platform driver is available. Consider upgrading power-profiles-daemon and linux kernel"
        ),
        "https://upower.pages.freedesktop.org/power-profiles-daemon/power-profiles-daemon-Platform-Profile-Drivers.html"
      );
    }
  }
}
