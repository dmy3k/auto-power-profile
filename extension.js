import Gio from "gi://Gio";
import GLib from "gi://GLib";
import UPower from "gi://UPowerGlib";
import Shell from "gi://Shell";
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
  _winCreatedWatcher;

  _notifier;
  _tracker;

  constructor(metadata) {
    super(metadata);
    this._trackedWindows = new Map();
    this._animationsEnabled = null; // Store original animation setting
    this._desktopSettings = null;
  }

  enable() {
    this._transition = new ProfileTransition();
    this._tracker = Shell.WindowTracker.get_default();

    this._settings = this.getSettings(
      "org.gnome.shell.extensions.auto-power-profile"
    );

    // Initialize desktop settings for animation control
    this._desktopSettings = new Gio.Settings({
      schema: "org.gnome.desktop.interface",
    });
    this._settingsWatcher = this._settings.connect(
      "changed",
      this._onSettingsChange
    );

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
    if (this._winCreatedWatcher) {
      global.display.disconnect(this._winCreatedWatcher);
      this._winCreatedWatcher = null;
    }
    if (this._notifier) {
      this._notifier.destroy();
      this._notifier = null;
    }
    this._settings?.disconnect(this._settingsWatcher);

    // Restore original animation setting on disable
    if (this._animationsEnabled !== null && this._desktopSettings) {
      this._desktopSettings.set_boolean(
        "enable-animations",
        this._animationsEnabled
      );
    }

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

    this._tracker = null;
    this._desktopSettings = null;
    this._animationsEnabled = null;

    for (const [win, cid] of this._trackedWindows.entries()) {
      win.disconnect(cid);
    }
    this._trackedWindows = new Map();
  }

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
      performanceApps: this._settings.get_strv("performance-apps"),
      perfAppsAcMode: this._settings.get_string("performance-apps-ac"),
      perfAppsBatMode: this._settings.get_string("performance-apps-bat"),
      disableAnimationsOnBattery: this._settings.get_boolean(
        "disable-animations-on-battery"
      ),
    };

    this._transition.report({});
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

  _getPowerConditions = () => {
    let configuredProfile = "balanced";

    const hasBattery = !(
      this._powerManagerProxy?.State === UPower.DeviceState.UNKNOWN ||
      this._powerManagerProxy?.Percentage === undefined
    );

    const onBattery =
      this._powerManagerProxy?.State === UPower.DeviceState.PENDING_DISCHARGE ||
      this._powerManagerProxy?.State === UPower.DeviceState.DISCHARGING;

    const acPowered =
      this._powerManagerProxy?.State === UPower.DeviceState.CHARGING ||
      this._powerManagerProxy?.State === UPower.DeviceState.FULLY_CHARGED ||
      this._powerManagerProxy?.State === UPower.DeviceState.PENDING_CHARGE ||
      onBattery === false;

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

    if (this._trackedWindows.size && onBattery === true) {
      configuredProfile = this._settingsCache.perfAppsBatMode;
    } else if (this._trackedWindows.size && onBattery === false) {
      configuredProfile = this._settingsCache.perfAppsAcMode;
    }

    return {
      hasBattery,
      onBattery,
      acPowered,
      onAC: onBattery === false,
      lowBattery: onBattery === true && lowBattery,
      perfApps: this._trackedWindows.size > 0,
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

    // Manage animations based on power state
    this._manageAnimationsBasedOnPower();
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

  /**
   * Manages GNOME animations based on power state for battery optimization
   */
  _manageAnimationsBasedOnPower() {
    if (!this._settingsCache.disableAnimationsOnBattery) {
      return; // Feature disabled
    }

    const powerConditions = this._getPowerConditions();
    const isOnBattery = !powerConditions.acPowered;

    if (isOnBattery) {
      // Store original setting if not already stored
      if (this._animationsEnabled === null) {
        this._animationsEnabled =
          this._desktopSettings.get_boolean("enable-animations");
      }
      // Disable animations on battery
      this._desktopSettings.set_boolean("enable-animations", false);
    } else {
      // Restore original setting when on AC power
      if (this._animationsEnabled !== null) {
        this._desktopSettings.set_boolean(
          "enable-animations",
          this._animationsEnabled
        );
        this._animationsEnabled = null; // Reset stored value
      }
    }
  }
}
