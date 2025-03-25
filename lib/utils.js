import Gio from "gi://Gio";

function isBusNameAvailable(busName) {
  try {
    const bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
    bus.call_sync(
      busName,
      "/",
      "org.freedesktop.DBus.Peer",
      "Ping",
      null,
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null
    );
    return true;
  } catch (e) {
    return false;
  }
}

export function findPowerProfilesDbus() {
  const aliases = [
    [
      "org.freedesktop.UPower.PowerProfiles",
      "/org/freedesktop/UPower/PowerProfiles",
    ],
    ["net.hadess.PowerProfiles", "/net/hadess/PowerProfiles"],
  ];
  return aliases.find(([busName]) => isBusNameAvailable(busName)) || aliases[0];
}
