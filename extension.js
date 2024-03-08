const { Gio, GLib, St, GObject } = imports.gi;
const UPower = imports.gi.UPowerGlib;

const ExtensionUtils = imports.misc.extensionUtils;
const FileUtils = imports.misc.fileUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;

const UPOWER_BUS_NAME = "org.freedesktop.UPower";
const UPOWER_OBJECT_PATH = "/org/freedesktop/UPower/devices/DisplayDevice";

const POWER_PROFILES_BUS_NAME = "net.hadess.PowerProfiles";
const POWER_PROFILES_OBJECT_PATH = "/net/hadess/PowerProfiles";

class Notifier {
  constructor(extensionObject) {
    this._uuid = extensionObject.uuid;
    this._name = extensionObject.metadata.name;
  }

  notify(msg, action = "error") {
    let notifyIcon = "battery-level-100-charged-symbolic";
    let notifyTitle = _("Auto Power Profiles");
    let urgency = MessageTray.Urgency.NORMAL;

    if (action === "error") {
      urgency === MessageTray.Urgency.CRITICAL;
      notifyIcon = "dialog-warning-symbolic";
    }

    this._source = new MessageTray.Source(this._name, notifyIcon);
    Main.messageTray.add(this._source);

    if (this._notification) {
      this._notification.destroy(NotificationDestroyedReason.REPLACED);
      this._notification = null;
    }

    Main.messageTray.add(this._source);
    this._notification = new MessageTray.Notification(
      this._source,
      notifyTitle,
      msg
    );

    if (action === "show-details") {
      this._notification.addAction(_("Show details"), () => {
        const uri = `https://upower.pages.freedesktop.org/power-profiles-daemon/power-profiles-daemon-Platform-Profile-Drivers.html`;
        Gio.app_info_launch_default_for_uri(uri, null, null, null);
      });
    }

    this._notification.setUrgency(urgency);
    this._notification.setTransient(true);
    this._source.showNotification(this._notification);

    this._notification.connectObject(
      "destroy",
      () => {
        this._notification = null;
      },
      this._notification
    );
  }

  _removeActiveNofications() {
    if (this._notification) {
      this._notification.destroy(
        MessageTray.NotificationDestroyedReason.SOURCE_CLOSED
      );
    }
    this._notification = null;
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

class AutoPowerProfile {
  _settings;
  _settingsCache = {};

  _transition;

  _perfDebounceTimerId;

  _powerManagerProxy;
  _powerManagerWatcher;

  _powerProfilesProxy;
  _powerProfileWatcher;

  _notifier;

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

    this._settings = ExtensionUtils.getSettings(
      "org.gnome.shell.extensions.auto-power-profile"
    );
    this._settingsWatcher = this._settings.connect(
      "changed",
      this._onSettingsChange
    );

    this._powerProfilesProxy = new PowerProfilesProxy(
      Gio.DBus.system,
      POWER_PROFILES_BUS_NAME,
      POWER_PROFILES_OBJECT_PATH,
      (proxy, error) => {
        if (error) {
          console.error(error.message);
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

    this._powerManagerProxy = new PowerManagerProxy(
      Gio.DBus.system,
      UPOWER_BUS_NAME,
      UPOWER_OBJECT_PATH,
      (proxy, error) => {
        if (error) {
          console.error(error.message);
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

    this._notifier = new Notifier(Me);
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
      console.error(`Profile ${profile} is not in list of available profiles`);
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
    const profile = this._powerProfilesProxy?.Profiles?.find(
      (x) => x.Profile?.unpack() === active
    );

    const driver = profile?.Driver?.get_string()?.[0];
    const platformDriver = profile?.PlatformDriver?.get_string()?.[0];
    const cpuDriver = profile?.CpuDriver?.get_string()?.[0];
    const drivers = [driver, platformDriver, cpuDriver];

    return drivers.some((x) => x && x !== "placeholder");
  }
}

let inst = null;

function init() {
  ExtensionUtils.initTranslations(Me.metadata.uuid);
}

function enable() {
  inst = new AutoPowerProfile();
  inst.enable();
}

function disable() {
  inst.disable();
  inst = null;
}
