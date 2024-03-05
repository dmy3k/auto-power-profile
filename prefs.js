import Gio from "gi://Gio";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { About } from "./preferences/about.js";
import { General } from "./preferences/general.js";

function loadInterfaceXML(iface) {
  let uri = `resource:///org/gnome/shell/dbus-interfaces/${iface}.xml`;
  let f = Gio.File.new_for_uri(uri);

  try {
    let [ok_, bytes] = f.load_contents(null);
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error(`Failed to load D-Bus interface ${iface}`);
  }

  return null;
}

const UPOWER_BUS_NAME = "org.freedesktop.UPower";
const UPOWER_OBJECT_PATH = "/org/freedesktop/UPower/devices/DisplayDevice";

const POWER_PROFILES_BUS_NAME = "net.hadess.PowerProfiles";
const POWER_PROFILES_OBJECT_PATH = "/net/hadess/PowerProfiles";

export default class AutoPowerProfilePreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const ppdProxy = new Promise((resolve, reject) => {
      const PowerProfilesIface = loadInterfaceXML("net.hadess.PowerProfiles");

      const PowerProfilesProxy =
        Gio.DBusProxy.makeProxyWrapper(PowerProfilesIface);

      new PowerProfilesProxy(
        Gio.DBus.system,
        POWER_PROFILES_BUS_NAME,
        POWER_PROFILES_OBJECT_PATH,
        (proxy, error) => {
          if (error) {
            reject(error);
          } else {
            resolve(proxy);
          }
        }
      );
    }).catch((e) => {
      console.error(`failed to create dbus proxy (${e?.message})`);
    });

    const upowerProxy = new Promise((resolve, reject) => {
      const DisplayDeviceInterface = loadInterfaceXML(
        "org.freedesktop.UPower.Device"
      );
      const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(
        DisplayDeviceInterface
      );

      new PowerManagerProxy(
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
    }).catch((e) => {
      console.error(`failed to create dbus proxy (${e?.message})`);
    });

    window.add(new General(settings, ppdProxy));
    window.add(new About(settings, ppdProxy, upowerProxy));
  }
}
