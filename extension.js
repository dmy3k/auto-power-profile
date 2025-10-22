import GLib from "gi://GLib";
import {
  Extension,
  gettext as _
} from "resource:///org/gnome/shell/extensions/extension.js";

import { Notifier } from "./lib/notifier.js";
import { CustomSettings } from "./lib/customSettings.js";
import { UpowerDbus } from "./lib/upowerDbus.js";
import { PowerProfilesDbus } from "./lib/powerProfilesDbus.js";
import { PerformanceAppTracker } from "./lib/performanceAppTracker.js";

export default class AutoPowerProfile extends Extension {
  _settings;
  _upowerDbus;
  _powerProfilesDbus;
  _perfAppTracker;

  // Used to distinguish between user and extension-initiated changes
  _currentPowerState = {};
  _currentProfile;
  _requestedProfile;

  _perfDebounceTimerId;
  _perfDebounceTimeout = 10;

  _notifier;

  constructor(metadata) {
    super(metadata);
  }

  enable() {
    const settings = this.getSettings(
      "org.gnome.shell.extensions.auto-power-profile"
    );
    this._settings = new CustomSettings(settings);
    this._settings.connect(this._onSettingsChange);

    this._perfAppTracker = new PerformanceAppTracker();
    this._perfAppTracker.initialize(this._checkProfile);

    this._notifier = new Notifier(this, this._settings);

    this._initDBusServices()
      .then(() => {
        this._validateDrivers();
        this._onSettingsChange();
      })
      .catch((err) => {
        console.error("Failed to initialize power management proxies:", err);
        this._notifier?.notify(
          _("Error connecting to power management services")
        );
      });
  }

  async _initDBusServices() {
    this._upowerDbus = new UpowerDbus();
    this._powerProfilesDbus = new PowerProfilesDbus();

    await Promise.all([
      this._upowerDbus.initialize(),
      this._powerProfilesDbus.initialize()
    ]);

    this._upowerDbus.connectSignal("g-properties-changed", this._checkProfile);
    this._powerProfilesDbus.connectSignal(
      "g-properties-changed",
      this._onProfileChange
    );
  }

  disable() {
    if (this._notifier) {
      this._notifier.destroy();
      this._notifier = null;
    }

    if (this._powerProfilesDbus) {
      this._powerProfilesDbus.switchProfile("balanced");
      this._powerProfilesDbus.destroy();
      this._powerProfilesDbus = null;
    }

    if (this._perfDebounceTimerId) {
      GLib.Source.remove(this._perfDebounceTimerId);
      this._perfDebounceTimerId = null;
    }

    this._clearCurrentPowerState();

    if (this._settings) {
      this._settings.destroy();
      this._settings = null;
    }

    if (this._upowerDbus) {
      this._upowerDbus.destroy();
      this._upowerDbus = null;
    }

    if (this._perfAppTracker) {
      this._perfAppTracker.destroy();
      this._perfAppTracker = null;
    }
  }

  _onUserProfileChange = (profile, { lowBattery, onBattery, onAC }) => {
    // Don't remember user changes if the feature is disabled
    if (!this._settings.rememberUserProfile) {
      return;
    }

    // Only update defaults for basic profiles, not when performance apps are active
    // Don't update if we're in low battery mode (power-saver is forced)
    if (lowBattery || this._perfAppTracker?.hasActiveApps) {
      return;
    }

    // Update the appropriate default based on current power state
    if (onAC && this._settings.acProfile !== profile) {
      this._settings.acProfile = profile;
      this._notifier?.notify(
        _(
          `Power profile '%s' will now be used by default when connected to AC power`
        ).format(profile),
        { isTransient: true }
      );
    } else if (onBattery && this._settings.batteryProfile !== profile) {
      this._settings.batteryProfile = profile;
      this._notifier?.notify(
        _(
          `Power profile '%s' will now be used by default when running on battery`
        ).format(profile),
        { isTransient: true }
      );
    }
  };

  _onProfileChange = (p, properties) => {
    if (!this._powerProfilesDbus) {
      return;
    }
    const payload = properties?.deep_unpack();
    const powerState = this._getConfiguredPowerState();

    if (!powerState) {
      return;
    }

    if (payload?.ActiveProfile) {
      if (this._perfDebounceTimerId) {
        GLib.Source.remove(this._perfDebounceTimerId);
        this._perfDebounceTimerId = null;
      }
      if (!payload?.PerformanceDegraded) {
        this._currentProfile = this._powerProfilesDbus.activeProfile;
        this._currentPowerState = powerState;

        if (this._currentProfile === this._requestedProfile) {
          // This was our requested change - mark as complete
          this._requestedProfile = null;
        } else {
          // This appears to be a user-initiated change
          this._onUserProfileChange(this._currentProfile, powerState);
          this._requestedProfile = null;
        }
      }
    }

    if (powerState.onAC && payload?.PerformanceDegraded) {
      try {
        const reason = payload?.PerformanceDegraded?.unpack();

        if (reason === "lap-detected") {
          // the computer is sitting on the user's lap
          // has false triggers when device sits stationary on a bit shaky stand/arm
          // try to re-apply performance profile
          if (this._perfDebounceTimerId) {
            GLib.Source.remove(this._perfDebounceTimerId);
          }
          this._perfDebounceTimerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            this._perfDebounceTimeout,
            () => {
              this._clearCurrentPowerState();
              this._checkProfile();
              this._perfDebounceTimerId = null;
              return GLib.SOURCE_REMOVE;
            }
          );
        } else if (reason) {
          // the computer is close to overheating ("high-operating-temperature")
          // and other values potentially might be added in newer versions of dbus interface
          console.log(
            `ActiveProfile: ${this._powerProfilesDbus.activeProfile}, PerformanceDegraded: ${reason}`
          );
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  _onSettingsChange = () => {
    this._clearCurrentPowerState();
    this._perfAppTracker?.setPerformanceApps(this._settings.performanceApps);
    this._checkProfile();
  };

  /**
   * Determine the configured profile based on power state and performance apps
   * @returns {Object} Extended power state with configured profile
   */
  _getConfiguredPowerState() {
    if (!this._upowerDbus || !this._powerProfilesDbus) {
      return null;
    }

    const powerState = this._upowerDbus.getPowerState();
    const perfAppsActive = this._perfAppTracker?.hasActiveApps ?? false;
    let configuredProfile = "balanced";

    const gnomeLowBatteryEnabled =
      this._settings?.powerSaverOnLowBatteryEnabled ?? true;

    // Determine configured profile based on power state
    if (powerState.onBattery === false) {
      configuredProfile = this._settings.acProfile;
    } else if (powerState.lowBattery && gnomeLowBatteryEnabled) {
      configuredProfile = "power-saver";
    } else if (powerState.onBattery && !powerState.lowBattery) {
      configuredProfile = this._settings.batteryProfile;
    } else if (powerState.lowBattery && !gnomeLowBatteryEnabled) {
      configuredProfile = this._settings.batteryProfile;
    }

    // Override with performance app settings if performance apps are active
    if (perfAppsActive && powerState.onBattery) {
      configuredProfile = this._settings.performanceAppsBatteryMode;
    } else if (perfAppsActive && !powerState.onBattery) {
      configuredProfile = this._settings.performanceAppsACMode;
    }

    return {
      ...powerState,
      perfApps: perfAppsActive,
      configuredProfile
    };
  }

  _clearCurrentPowerState() {
    this._currentProfile = null;
    this._requestedProfile = null;
    this._currentPowerState = {};
  }

  _checkProfile = () => {
    const newState = this._getConfiguredPowerState();

    if (!newState || !this._powerProfilesDbus) {
      return;
    }

    const hasPowerConditionChanged =
      this._currentPowerState.onBattery !== newState.onBattery ||
      this._currentPowerState.lowBattery !== newState.lowBattery ||
      this._currentPowerState.perfApps !== newState.perfApps;

    if (
      hasPowerConditionChanged &&
      this._currentProfile === newState.configuredProfile
    ) {
      // handling edge case where user-initiated profile matches target
      this._currentPowerState = newState;
    } else if (hasPowerConditionChanged || !this._currentProfile) {
      this._requestedProfile = newState.configuredProfile;
      this._powerProfilesDbus.switchProfile(this._requestedProfile);
    }
  };

  _validateDrivers() {
    const { active, hasDrivers } = this._powerProfilesDbus.validateDrivers();

    if (!active) {
      this._notifier.notify(
        _(
          "Power profile management is not available - this extension will have no effect on your system"
        )
      );
    } else if (!hasDrivers) {
      this._notifier.notify(
        _(
          "Power profile switching may not work properly on this device - energy savings will be limited. Your system may need updates to enable full functionality"
        ),
        {
          uri: "https://upower.pages.freedesktop.org/power-profiles-daemon/power-profiles-daemon-Platform-Profile-Drivers.html"
        }
      );
    }
  }
}
