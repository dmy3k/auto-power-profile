import Gio from "gi://Gio";
import GLib from "gi://GLib";
import UPower from "gi://UPowerGlib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as FileUtils from "resource:///org/gnome/shell/misc/fileUtils.js";

import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import * as Config from "resource:///org/gnome/shell/misc/config.js";

const UPOWER_BUS_NAME = "org.freedesktop.UPower";
const UPOWER_OBJECT_PATH = "/org/freedesktop/UPower/devices/DisplayDevice";

const POWER_PROFILES_BUS_NAME = "net.hadess.PowerProfiles";
const POWER_PROFILES_OBJECT_PATH = "/net/hadess/PowerProfiles";

class Notifier {
  constructor(extensionObject) {
    this._uuid = extensionObject.uuid;
    this._name = extensionObject.metadata.name;
    this._source = null;
  }

  notify(msg, action = "error") {
    const [major] = Config.PACKAGE_VERSION.split(".");
    const shellVersion45 = Number.parseInt(major) < 46;

    let notifyIcon = "battery-level-100-charged-symbolic";
    let notifyTitle = _("Auto Power Profiles");
    let urgency = MessageTray.Urgency.NORMAL;

    if (action === "error") {
      urgency === MessageTray.Urgency.CRITICAL;
      notifyIcon = "dialog-warning-symbolic";
    }

    if (this._checkActiveNotification()) {
      this._source.destroy(MessageTray.NotificationDestroyedReason.REPLACED);
      this._source = null;
    }

    if (shellVersion45) {
      this._source = new MessageTray.Source(this._name, notifyIcon);
    } else {
      this._source = new MessageTray.Source({
        title: this._name,
        icon: notifyIcon,
      });
    }

    Main.messageTray.add(this._source);
    const notification = new MessageTray.Notification(
      this._source,
      notifyTitle,
      msg
    );

    if (action === "show-details") {
      notification.addAction(_("Show details"), () => {
        const uri = `https://upower.pages.freedesktop.org/power-profiles-daemon/power-profiles-daemon-Platform-Profile-Drivers.html`;
        Gio.app_info_launch_default_for_uri(uri, null, null, null);
      });
    }

    notification.setUrgency(urgency);
    notification.setTransient(true);
    this._source.showNotification(notification);
  }

  _checkActiveNotification() {
    let status = false;
    const activeSource = Main.messageTray.getSources();
    if (activeSource[0] == null) {
      this._source = null;
    } else {
      activeSource.forEach((item) => {
        if (item === this._source) status = true;
      });
    }
    return status;
  }

  _removeActiveNofications() {
    if (this._checkActiveNotification())
      this._source.destroy(NotificationDestroyedReason.SOURCE_CLOSED);
    this._source = null;
  }

  destroy() {
    this._removeActiveNofications();
  }
}

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

  _notifier;

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
          console.error(error);
          this._notifier.notify(
            _("Error connecting UPower DBus. Check your installation")
          );
          return;
        }
        this._powerManagerWatcher = this._powerManagerProxy.connect(
          "g-properties-changed",
          this._checkProfile
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
          console.error(error);
          this._notifier.notify(
            _(
              "Error connecting power-profiles-daemon DBus. Check your installation"
            )
          );
          return;
        }

        this._powerProfileWatcher = this._powerProfilesProxy.connect(
          "g-properties-changed",
          this._onProfileChange
        );

        if (!this._isValidDrivers()) {
          this._notifier.notify(
            _("No system-specific platform driver is available"),
            "show-details"
          );
        }
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
    const canSwitch = this._powerProfilesProxy.Profiles.some(
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

  _isValidDrivers() {
    const active = this._powerProfilesProxy.ActiveProfile;
    const profile = this._powerProfilesProxy.Profiles?.find(
      (x) => x.Profile?.unpack() === active
    );

    const driver = profile?.Driver?.get_string()?.[0];
    const platformDriver = profile?.PlatformDriver?.get_string()?.[0];
    const cpuDriver = profile?.CpuDriver?.get_string()?.[0];
    const drivers = [driver, platformDriver, cpuDriver];

    return drivers.some((x) => x && x !== "placeholder");
  }
}
