import { DeviceState, DeviceLevel } from "./UPowerGlib";

class PowerProfilesProxyMock {
  static _state = {
    ActiveProfile: "balanced",
    PerformanceDegraded: null,
    Profiles: ["performance", "balanced", "power-saver"],
    handlers: [],

    notifyPerformanceDegraded(reason = "lap-detected") {
      this.ActiveProfile = "balanced";
      this.notify({ PerformanceDegraded: reason });
    },

    notify(extra = {}) {
      const props = {
        ...extra,
        ActiveProfile: this.ActiveProfile
      };

      const payload = Object.entries(props).reduce(
        (acc, [k, v]) => ({ ...acc, [k]: { unpack: () => v } }),
        {}
      );
      this.handlers.forEach((x) => x(null, { deep_unpack: () => payload }));

      this.PerformanceDegraded = null;
    }
  };

  constructor(dbus, bus_name, obj_path, callback) {
    process.nextTick(() => callback(this, null));
  }

  connect = (name, handler) => {
    return PowerProfilesProxyMock._state.handlers.push(handler) - 1;
  };

  disconnect = (handlerId) => {
    PowerProfilesProxyMock._state.handlers.splice(handlerId, 1);
  };

  get Profiles() {
    return PowerProfilesProxyMock._state.Profiles.map((x) => ({
      Profile: { unpack: () => x }
    }));
  }

  get ActiveProfile() {
    return PowerProfilesProxyMock._state.ActiveProfile;
  }

  set ActiveProfile(v) {
    PowerProfilesProxyMock._state.ActiveProfile = v;
    process.nextTick(() => {
      PowerProfilesProxyMock._state.notify();
    });
  }
}

class UpowerProxyMock {
  static _state = {
    on_battery: false,
    online: true,
    state: DeviceState.CHARGING,
    percentage: 0,
    warningLevel: DeviceLevel.NONE,
    handlers: [],

    update({ state, percentage, warningLevel, online }) {
      this.state = state || this.state;
      this.on_battery = this.state === DeviceState.DISCHARGING;
      this.online =
        online !== undefined ? online : this.state !== DeviceState.DISCHARGING;
      this.percentage = percentage !== undefined ? percentage : this.percentage;
      this.warningLevel =
        warningLevel !== undefined ? warningLevel : this.warningLevel;

      // Update LinePowerProxyMock state BEFORE triggering handlers
      if (online !== undefined) {
        LinePowerProxyMock._state.online = online;
      }

      // Trigger all handlers after state is updated
      this.handlers.forEach((x) => x());
      LinePowerProxyMock._state.handlers.forEach((x) => x());
    }
  };

  constructor(dbus, bus_name, obj_path, callback) {
    this._devicePath = obj_path;
    process.nextTick(() => callback(this, null));
  }

  get State() {
    return UpowerProxyMock._state.state;
  }

  get Online() {
    return UpowerProxyMock._state.online;
  }

  get Percentage() {
    return UpowerProxyMock._state.percentage;
  }

  get WarningLevel() {
    return UpowerProxyMock._state.warningLevel;
  }

  get Type() {
    // Return LINE_POWER (1) if path contains "line_power" or "AC"
    // Otherwise return BATTERY (2)
    if (
      this._devicePath &&
      (this._devicePath.includes("line_power") ||
        this._devicePath.includes("/AC"))
    ) {
      return 1;
    }
    return 2;
  }

  get_cached_property(propertyName) {
    if (propertyName === "WarningLevel") {
      return {
        unpack: () => UpowerProxyMock._state.warningLevel
      };
    }
    if (propertyName === "Type") {
      return {
        unpack: () => this.Type
      };
    }
    if (propertyName === "Online") {
      // For line power devices, use LinePowerProxy state
      if (this.Type === 1) {
        return {
          unpack: () => LinePowerProxyMock._state.online
        };
      }
      return {
        unpack: () => UpowerProxyMock._state.online
      };
    }
    return null;
  }

  connect = (name, handler) => {
    return UpowerProxyMock._state.handlers.push(handler) - 1;
  };

  disconnect = (handlerId) => {
    UpowerProxyMock._state.handlers.splice(handlerId, 1);
  };
}

class LinePowerProxyMock {
  static _state = {
    online: true,
    handlers: [],

    update({ online }) {
      this.online = online !== undefined ? online : this.online;
      this.handlers.forEach((x) => x());
      // Also update the main UPower state to keep them in sync
      UpowerProxyMock._state.update({ online });
    }
  };

  constructor(dbus, bus_name, obj_path, callback) {
    process.nextTick(() => callback(this, null));
  }

  get Online() {
    return LinePowerProxyMock._state.online;
  }

  get Type() {
    return 1; // LINE_POWER type
  }

  get_cached_property(propertyName) {
    if (propertyName === "Online") {
      return {
        unpack: () => LinePowerProxyMock._state.online
      };
    }
    if (propertyName === "Type") {
      return {
        unpack: () => this.Type
      };
    }
    return null;
  }

  connect = (name, handler) => {
    return LinePowerProxyMock._state.handlers.push(handler) - 1;
  };

  disconnect = (handlerId) => {
    LinePowerProxyMock._state.handlers.splice(handlerId, 1);
  };
}

class SettingsMock {
  static _state = {
    "power-saver-profile-on-low-battery": true,
    handlers: []
  };

  constructor({ schema_id }) {
    this.schema_id = schema_id;
  }

  get_boolean(key) {
    return SettingsMock._state[key] ?? false;
  }

  connect(signal, handler) {
    return SettingsMock._state.handlers.push(handler) - 1;
  }

  disconnect(handlerId) {
    SettingsMock._state.handlers.splice(handlerId, 1);
  }
}

class SettingsSchemaSourceMock {
  static get_default() {
    return new SettingsSchemaSourceMock();
  }

  lookup(schema_id, recursive) {
    // Return a truthy value for org.gnome.settings-daemon.plugins.power
    if (schema_id === "org.gnome.settings-daemon.plugins.power") {
      return { schema_id };
    }
    return null;
  }
}

class UPowerEnumeratorMock {
  constructor(dbus, bus_name, obj_path, callback) {
    process.nextTick(() => callback(this, null));
  }

  EnumerateDevicesRemote(callback) {
    process.nextTick(() => {
      callback(
        [
          [
            "/org/freedesktop/UPower/devices/line_power_AC",
            "/org/freedesktop/UPower/devices/battery_BAT0"
          ]
        ],
        null
      );
    });
  }
}

module.exports = {
  DBus: { system: { call: jest.fn() } },
  DBusProxy: {
    makeProxyWrapper(ref) {
      // Check EnumerateDevices FIRST before checking for Device
      if (
        ref.includes("org.freedesktop.UPower") &&
        ref.includes("EnumerateDevices")
      ) {
        return UPowerEnumeratorMock;
      } else if (ref.includes("org.freedesktop.UPower.Device")) {
        return UpowerProxyMock;
      } else if (
        ref.includes("net.hadess.PowerProfiles") ||
        ref.includes("org.freedesktop.UPower.PowerProfiles")
      ) {
        return PowerProfilesProxyMock;
      } else {
        throw new Error(`No mock is defined for makeProxyWrapper("${ref}")`);
      }
    }
  },
  Settings: SettingsMock,
  SettingsSchemaSource: SettingsSchemaSourceMock,
  PowerProfilesProxyMock,
  UpowerProxyMock,
  LinePowerProxyMock,
  SettingsMock
};
