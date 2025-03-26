import Gio from "gi://Gio";

const POWER_PROFILE_DBUS_SERVICES = [
  [
    "org.freedesktop.UPower.PowerProfiles",
    "/org/freedesktop/UPower/PowerProfiles",
  ],
  ["net.hadess.PowerProfiles", "/net/hadess/PowerProfiles"],
];

const UPOWER_BUS_NAME = "org.freedesktop.UPower";
const UPOWER_OBJECT_PATH = "/org/freedesktop/UPower/devices/DisplayDevice";

export const createPowerProfilesProxy = (loadInterfaceXML, callback) => {
  for (const [busName, objectPath] of POWER_PROFILE_DBUS_SERVICES) {
    const xml = loadInterfaceXML(busName);
    if (xml) {
      const PowerProfilesProxy = Gio.DBusProxy.makeProxyWrapper(xml);
      return new PowerProfilesProxy(
        Gio.DBus.system,
        busName,
        objectPath,
        callback
      );
    }
  }
  callback(null, "Failed to load D-Bus interface");
};

export const createPowerManagerProxy = (loadInterfaceXML, callback) => {
  const xml = loadInterfaceXML("org.freedesktop.UPower.Device");
  const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(xml);

  return new PowerManagerProxy(
    Gio.DBus.system,
    UPOWER_BUS_NAME,
    UPOWER_OBJECT_PATH,
    callback
  );
};
