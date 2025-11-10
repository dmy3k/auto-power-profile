import Gio from "gi://Gio";

const POWER_PROFILE_DBUS_SERVICES = [
  [
    "org.freedesktop.UPower.PowerProfiles",
    "/org/freedesktop/UPower/PowerProfiles"
  ],
  ["net.hadess.PowerProfiles", "/net/hadess/PowerProfiles"]
];

const UPOWER_BUS_NAME = "org.freedesktop.UPower";
const UPOWER_OBJECT_PATH = "/org/freedesktop/UPower/devices/DisplayDevice";

export const createPowerProfilesProxy = (loadInterfaceXML) => {
  return new Promise((resolve, reject) => {
    for (const [busName, objectPath] of POWER_PROFILE_DBUS_SERVICES) {
      const xml = loadInterfaceXML(busName);
      if (xml) {
        const PowerProfilesProxy = Gio.DBusProxy.makeProxyWrapper(xml);
        return new PowerProfilesProxy(
          Gio.DBus.system,
          busName,
          objectPath,
          (proxy, error) => {
            if (error) {
              reject(error);
            } else {
              resolve(proxy);
            }
          }
        );
      }
    }
    reject(new Error("No power profiles service found"));
  });
};

export const createPowerManagerProxy = (loadInterfaceXML) => {
  return new Promise((resolve, reject) => {
    const xml = loadInterfaceXML("org.freedesktop.UPower.Device");
    const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(xml);

    return new PowerManagerProxy(
      Gio.DBus.system,
      UPOWER_BUS_NAME,
      UPOWER_OBJECT_PATH,
      (proxy, error) => {
        if (error) {
          reject(error);
        } else {
          resolve(proxy);
        }
      }
    );
  });
};

export const createUPowerDeviceProxy = (devicePath, loadInterfaceXML) => {
  return new Promise((resolve, reject) => {
    const xml = loadInterfaceXML("org.freedesktop.UPower.Device");
    const DeviceProxy = Gio.DBusProxy.makeProxyWrapper(xml);

    return new DeviceProxy(
      Gio.DBus.system,
      "org.freedesktop.UPower",
      devicePath,
      (proxy, error) => {
        if (error) {
          reject(error);
        } else {
          resolve(proxy);
        }
      }
    );
  });
};
