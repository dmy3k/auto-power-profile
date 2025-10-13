import GLib from "gi://GLib";
import Gio from "gi://Gio";
import UPower from "gi://UPowerGlib";
import Shell from "gi://Shell";
import * as FileUtils from "resource:///org/gnome/shell/misc/fileUtils.js";
import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

import { Notifier } from "./lib/notifier.js";
import {
  createPowerProfilesProxy,
  createPowerManagerProxy,
} from "./lib/utils.js";

export default class AutoPowerProfile extends Extension {
  _settings;
  _settingsCache = {};

  // Used to distinguish between user and extension-initiated changes
  _currentPowerState = {};
  _currentProfile;
  _requestedProfile;

  _perfDebounceTimerId;

  _powerManagerProxy;
  _powerManagerWatcher;

  _gnomePowerSettings;

  _powerProfilesProxy;
  _powerProfileWatcher;
  _winCreatedWatcher;

  _notifier;
  _tracker;

  constructor(metadata) {
    super(metadata);
    this._trackedWindows = new Map();
  }

  enable() {
    this._tracker = Shell.WindowTracker.get_default();

    this._settings = this.getSettings(
      "org.gnome.shell.extensions.auto-power-profile"
    );
    this._settingsWatcher = this._settings.connect(
      "changed",
      this._onSettingsChange
    );

    try {
      this._gnomePowerSettings = new Gio.Settings({
        schema_id: "org.gnome.settings-daemon.plugins.power",
      });
      this._gnomePowerSettingsWatcher = this._gnomePowerSettings.connect(
        "changed::power-saver-profile-on-low-battery",
        this._onSettingsChange
      );
    } catch (e) {
      console.log("Could not load GNOME power settings:", e.message);
    }

    this._winCreatedWatcher = global.display.connect_after(
      "window-created",
      (display, win) => {
        if (this._settingsCache.performanceApps?.length) {
          GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._onWindowCreated(win);
            return GLib.SOURCE_REMOVE;
          });
        }
      }
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

    this._notifier = new Notifier(this, this._settings);
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
    if (this._winCreatedWatcher) {
      global.display.disconnect(this._winCreatedWatcher);
      this._winCreatedWatcher = null;
    }
    if (this._notifier) {
      this._notifier.destroy();
      this._notifier = null;
    }
    this._settings?.disconnect(this._settingsWatcher);
    this._gnomePowerSettings?.disconnect(this._gnomePowerSettingsWatcher);

    this._switchProfile("balanced");

    if (this._perfDebounceTimerId) {
      GLib.Source.remove(this._perfDebounceTimerId);
      this._perfDebounceTimerId = null;
    }

    this._clearCurrentPowerState();

    this._settings = null;
    this._gnomePowerSettings = null;
    this._settingsCache = {};

    this._powerManagerProxy = null;
    this._powerProfilesProxy = null;

    this._tracker = null;

    for (const [win, cid] of this._trackedWindows.entries()) {
      win.disconnect(cid);
    }
    this._trackedWindows = new Map();
  }

  _onUserProfileChange = (profile, { lowBattery, onBattery, onAC }) => {
    // Only update defaults for basic profiles, not when performance apps are active
    // Don't update if we're in low battery mode (power-saver is forced)
    if (lowBattery || this._trackedWindows.size > 0) {
      return;
    }

    // Update the appropriate default based on current power state
    if (onAC) {
      const currentACDefault = this._settings.get_string("ac");
      if (currentACDefault !== profile) {
        this._settings.set_string("ac", profile);
        this._notifier?.notify(
          _(
            `Power profile '%s' will now be used by default when connected to AC power`
          ).format(profile),
          { isTransient: true }
        );
      }
    } else if (onBattery) {
      const currentBatDefault = this._settings.get_string("bat");
      if (currentBatDefault !== profile) {
        this._settings.set_string("bat", profile);
        this._notifier?.notify(
          _(
            `Power profile '%s' will now be used by default when running on battery`
          ).format(profile),
          { isTransient: true }
        );
      }
    }
  };

  _onWindowCreated = (win) => {
    const app = this._tracker.get_window_app(win);
    const appId = app?.get_id();
    const isPerfApp = this._settingsCache.performanceApps.includes(appId);

    if (isPerfApp && !this._trackedWindows.has(win)) {
      const cid = win.connect("unmanaged", (win) => {
        this._trackedWindows.delete(win);
        this._checkProfile();
      });

      this._trackedWindows.set(win, cid);
      this._checkProfile();
    } else if (!isPerfApp && this._trackedWindows.has(win)) {
      const cid = this._trackedWindows.get(win);
      win.disconnect(cid);
      this._trackedWindows.delete(win);
    }
  };

  _onProfileChange = (p, properties) => {
    if (!this._powerProfilesProxy) {
      return;
    }
    const payload = properties?.deep_unpack();
    const powerState = this._getPowerState();

    if (payload?.ActiveProfile) {
      if (this._perfDebounceTimerId) {
        GLib.Source.remove(this._perfDebounceTimerId);
        this._perfDebounceTimerId = null;
      }
      if (!payload?.PerformanceDegraded) {
        this._currentProfile = this._powerProfilesProxy.ActiveProfile;
        this._currentPowerState = powerState;

        if (this._currentProfile === this._requestedProfile) {
          // This was our requested change - mark as complete
          this.requestedProfile = null;
        } else {
          // This appears to be a user-initiated change
          this._onUserProfileChange(this._currentProfile, powerState);
          this.requestedProfile = null;
        }
      }
    }

    if (powerState.onAC && payload?.PerformanceDegraded) {
      try {
        const reason = payload?.PerformanceDegraded?.unpack();

        if (reason === "lap-detected" && this._settingsCache.lapmode) {
          this._perfDebounceTimerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            5,
            () => {
              this._clearCurrentPowerState();
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
      lapmode: this._settings.get_boolean("lapmode"),
      notifications: this._settings.get_boolean("notifications"),
      performanceApps: this._settings.get_strv("performance-apps"),
      perfAppsAcMode: this._settings.get_string("performance-apps-ac"),
      perfAppsBatMode: this._settings.get_string("performance-apps-bat"),
      lowBatteryEnabled: this._gnomePowerSettings?.get_boolean(
        "power-saver-profile-on-low-battery"
      ),
    };

    this._clearCurrentPowerState();
    this._checkPerformanceApps();
    this._checkProfile();
  };

  _checkPerformanceApps = () => {
    if (
      this._settingsCache.performanceApps?.length ||
      this._trackedWindows.size
    ) {
      global
        .get_window_actors()
        .forEach((actor) => this._onWindowCreated(actor.meta_window));
    }
  };

  _getWarningLevel() {
    // WarningLevel may not be exposed via the proxy wrapper if the DBus XML is outdated
    // Access it directly via get_cached_property as a fallback
    let warningLevel = this._powerManagerProxy?.WarningLevel;
    if (warningLevel === undefined && this._powerManagerProxy) {
      const variant =
        this._powerManagerProxy.get_cached_property("WarningLevel");
      warningLevel = variant?.unpack() ?? UPower.DeviceLevel.NONE;
    }
    return warningLevel;
  }

  _getPowerState = () => {
    let configuredProfile = "balanced";

    const hasBattery = !(
      this._powerManagerProxy?.State === UPower.DeviceState.UNKNOWN ||
      this._powerManagerProxy?.Percentage === undefined
    );

    const onBattery =
      this._powerManagerProxy?.State === UPower.DeviceState.PENDING_DISCHARGE ||
      this._powerManagerProxy?.State === UPower.DeviceState.DISCHARGING;

    const warningLevel = this._getWarningLevel();
    const lowBattery =
      onBattery &&
      (warningLevel === UPower.DeviceLevel.LOW ||
        warningLevel === UPower.DeviceLevel.CRITICAL ||
        warningLevel === UPower.DeviceLevel.ACTION);

    const gnomeLowBatteryEnabled =
      this._settingsCache.lowBatteryEnabled ?? true;

    if (onBattery === false) {
      configuredProfile = this._settingsCache?.ACDefault;
    } else if (onBattery === true && lowBattery && gnomeLowBatteryEnabled) {
      configuredProfile = "power-saver";
    } else if (onBattery === true && !lowBattery) {
      configuredProfile = this._settingsCache?.batteryDefault;
    } else if (onBattery === true && lowBattery && !gnomeLowBatteryEnabled) {
      configuredProfile = this._settingsCache?.batteryDefault;
    }

    if (this._trackedWindows.size && onBattery === true) {
      configuredProfile = this._settingsCache.perfAppsBatMode;
    } else if (this._trackedWindows.size && onBattery === false) {
      configuredProfile = this._settingsCache.perfAppsAcMode;
    }

    return {
      hasBattery,
      onBattery,
      onAC: onBattery === false,
      lowBattery: onBattery === true && lowBattery,
      perfApps: this._trackedWindows.size > 0,
      configuredProfile,
    };
  };

  _clearCurrentPowerState() {
    this._currentProfile = null;
    this._requestedProfile = null;
    this._currentPowerState = {};
  }

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
    const newState = this._getPowerState();

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
      this._switchProfile(this._requestedProfile);
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
        _(
          "Power profile management is not available - this extension will have no effect on your system"
        )
      );
    } else if (!drivers.some((x) => x && x !== "placeholder")) {
      this._notifier.notify(
        _(
          "Power profile switching may not work properly on this device - energy savings will be limited. Your system may need updates to enable full functionality"
        ),
        {
          uri: "https://upower.pages.freedesktop.org/power-profiles-daemon/power-profiles-daemon-Platform-Profile-Drivers.html",
        }
      );
    }
  }
}
