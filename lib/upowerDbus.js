import UPower from "gi://UPowerGlib";
import Gio from "gi://Gio";
import { createPowerManagerProxy, createUPowerDeviceProxy } from "./utils.js";
import * as FileUtils from "resource:///org/gnome/shell/misc/fileUtils.js";

export class UpowerDbus {
  constructor() {
    this._proxy = null;
    this._linePowerProxy = null;
    this._connectionIds = [];
  }

  async initialize() {
    const loadInterfaceXML = (x) => FileUtils.loadInterfaceXML(x);

    // Initialize battery display device
    this._proxy = await createPowerManagerProxy(loadInterfaceXML);

    // Find and initialize line power device
    await this._findLinePowerDevice(loadInterfaceXML);
  }

  async _enumerateDevices() {
    return new Promise((resolve, reject) => {
      const UPowerProxy = Gio.DBusProxy.makeProxyWrapper(
        `<node>
          <interface name="org.freedesktop.UPower">
            <method name="EnumerateDevices">
              <arg type="ao" direction="out" name="devices"/>
            </method>
          </interface>
        </node>`
      );

      const proxy = new UPowerProxy(
        Gio.DBus.system,
        "org.freedesktop.UPower",
        "/org/freedesktop/UPower",
        (proxy, error) => {
          if (error) {
            reject(error);
          } else {
            proxy.EnumerateDevicesRemote((result, error) => {
              if (error) {
                reject(error);
              } else {
                resolve(result[0]);
              }
            });
          }
        }
      );
    });
  }

  async _findLinePowerDevice(loadInterfaceXML) {
    try {
      const devices = await this._enumerateDevices();

      for (const devicePath of devices) {
        const device = await createUPowerDeviceProxy(
          devicePath,
          loadInterfaceXML
        );
        const deviceType =
          device?.Type ?? device?.get_cached_property?.("Type")?.unpack();

        // Type 1 = LINE_POWER
        if (deviceType === 1) {
          this._linePowerProxy = device;
          break;
        }
      }

      if (!this._linePowerProxy) {
        console.warn("No AC line power device found");
      }
    } catch (error) {
      console.warn("Failed to find line power device:", error);
    }
  }

  connectSignal(signal, callback) {
    const id = this._proxy?.connect(signal, callback);
    if (id !== null && id !== undefined) {
      this._connectionIds.push(id);
    }
  }

  getWarningLevel() {
    let warningLevel = this._proxy?.WarningLevel;
    if (warningLevel === undefined && this._proxy) {
      const variant = this._proxy.get_cached_property("WarningLevel");
      warningLevel = variant?.unpack() ?? UPower.DeviceLevel.NONE;
    }
    return warningLevel;
  }

  getPowerState() {
    if (!this._proxy) {
      return { onBattery: false, onAC: true, lowBattery: false };
    }

    // Primary detection: AC Online property (most reliable when available)
    let acOnline = null;
    if (this._linePowerProxy) {
      acOnline =
        this._linePowerProxy.Online ??
        this._linePowerProxy.get_cached_property?.("Online")?.unpack() ??
        null;
    }

    // Fallback: Battery state
    const batteryDischarging =
      this._proxy.State === UPower.DeviceState.PENDING_DISCHARGE ||
      this._proxy.State === UPower.DeviceState.DISCHARGING;

    const onBattery = acOnline !== null ? !acOnline : batteryDischarging;
    const warningLevel = this.getWarningLevel();

    return {
      onBattery,
      onAC: !onBattery,
      lowBattery:
        onBattery === true &&
        (warningLevel === UPower.DeviceLevel.LOW ||
          warningLevel === UPower.DeviceLevel.CRITICAL ||
          warningLevel === UPower.DeviceLevel.ACTION)
    };
  }

  destroy() {
    if (this._proxy) {
      for (const id of this._connectionIds) {
        this._proxy.disconnect(id);
      }
      this._connectionIds = [];
    }
    if (this._linePowerProxy) {
      this._linePowerProxy = null;
    }
    this._proxy = null;
  }
}
