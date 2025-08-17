import { DeviceState } from "./UPowerGlib";

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
        {},
      );
      this.handlers.forEach((x) => x(null, { deep_unpack: () => payload }));

      this.PerformanceDegraded = null;
    },
  };

  constructor(dbus, bus_name, obj_path, callback) {
    process.nextTick(callback);
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
    handlers: [],

    update({ state, percentage }) {
      this.state = state || this.state;
      this.on_battery = this.state === DeviceState.DISCHARGING;
      this.percentage = percentage || this.percentage || 0;
      this.handlers.forEach((x) => x());
    },
  };

  constructor(dbus, bus_name, obj_path, callback) {
    process.nextTick(callback);
  }

  get State() {
    return UpowerProxyMock._state.state;
  }

  get Percentage() {
    return UpowerProxyMock._state.percentage;
  }

  connect = (name, handler) => {
    return UpowerProxyMock._state.handlers.push(handler) - 1;
  };

  disconnect = (handlerId) => {
    UpowerProxyMock._state.handlers.splice(handlerId, 1);
  };
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
  PowerProfilesProxyMock,
  UpowerProxyMock,
};
