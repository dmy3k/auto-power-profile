import { mock } from "./UPowerGlib";

class PowerProfilesProxyMock {
  constructor(dbus, bus_name, obj_path, callback) {
    process.nextTick(callback);
  }
  connect = () => jest.fn();
  disconnect = () => jest.fn();

  Profiles = ["performance", "balanced", "power-saver"].map((x) => ({
    Profile: { unpack: () => x },
  }));

  ActiveProfile = "balanced";
}

class UpowerProxyMock {
  constructor(dbus, bus_name, obj_path, callback) {
    process.nextTick(callback);
  }

  get State() {
    return mock.state;
  }

  get Percentage() {
    return mock.percentage;
  }

  connect = (name, handler) => {
    mock.handlers.push(handler);
  };

  disconnect = (handler) => {
    mock.handlers = [];
  };
}

module.exports = {
  DBus: { system: { call: jest.fn() } },
  DBusProxy: {
    makeProxyWrapper(ref) {
      if (ref.includes("org.freedesktop.UPower.Device")) {
        return UpowerProxyMock;
      } else if (ref.includes("net.hadess.PowerProfiles")) {
        return PowerProfilesProxyMock;
      } else {
        throw new Error(`No mock is defined for makeProxyWrapper("${ref}")`);
      }
    },
  },
};
