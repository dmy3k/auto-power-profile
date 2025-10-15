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
        ActiveProfile: this.ActiveProfile,
      };

      const payload = Object.entries(props).reduce(
        (acc, [k, v]) => ({ ...acc, [k]: { unpack: () => v } }),
        {}
      );
      this.handlers.forEach((x) => x(null, { deep_unpack: () => payload }));

      this.PerformanceDegraded = null;
    },
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
      Profile: { unpack: () => x },
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
    state: DeviceState.CHARGING,
    percentage: 0,
    warningLevel: DeviceLevel.NONE,
    handlers: [],

    update({ state, percentage, warningLevel }) {
      this.state = state || this.state;
      this.on_battery = this.state === DeviceState.DISCHARGING;
      this.percentage = percentage !== undefined ? percentage : this.percentage;
      this.warningLevel =
        warningLevel !== undefined ? warningLevel : this.warningLevel;
      this.handlers.forEach((x) => x());
    },
  };

  constructor(dbus, bus_name, obj_path, callback) {
    process.nextTick(() => callback(this, null));
  }

  get State() {
    return UpowerProxyMock._state.state;
  }

  get Percentage() {
    return UpowerProxyMock._state.percentage;
  }

  get WarningLevel() {
    return UpowerProxyMock._state.warningLevel;
  }

  get_cached_property(propertyName) {
    if (propertyName === "WarningLevel") {
      return {
        unpack: () => UpowerProxyMock._state.warningLevel,
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

class SettingsMock {
  static _state = {
    "power-saver-profile-on-low-battery": true,
    handlers: [],
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

module.exports = {
  DBus: { system: { call: jest.fn() } },
  DBusProxy: {
    makeProxyWrapper(ref) {
      if (ref.includes("org.freedesktop.UPower.Device")) {
        return UpowerProxyMock;
      } else if (
        ref.includes("net.hadess.PowerProfiles") ||
        ref.includes("org.freedesktop.UPower.PowerProfiles")
      ) {
        return PowerProfilesProxyMock;
      } else {
        throw new Error(`No mock is defined for makeProxyWrapper("${ref}")`);
      }
    },
  },
  Settings: SettingsMock,
  SettingsSchemaSource: SettingsSchemaSourceMock,
  PowerProfilesProxyMock,
  UpowerProxyMock,
  SettingsMock,
};
