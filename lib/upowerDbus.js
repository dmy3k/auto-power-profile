import UPower from "gi://UPowerGlib";
import { createPowerManagerProxy } from "./utils.js";
import * as FileUtils from "resource:///org/gnome/shell/misc/fileUtils.js";

/**
 * Manages UPower DBus connection and power state detection
 */
export class UpowerDbus {
  _proxy;
  _connectionIds;

  constructor() {
    this._proxy = null;
    this._connectionIds = [];
  }

  /**
   * Initialize the UPower proxy
   * @returns {Promise<UpowerDbus>}
   */
  async initialize() {
    const loadInterfaceXML = (x) => FileUtils.loadInterfaceXML(x);

    try {
      this._proxy = await createPowerManagerProxy(loadInterfaceXML);
      return this;
    } catch (error) {
      console.error("Failed to initialize UPower proxy:", error);
      throw error;
    }
  }

  /**
   * Connect to proxy signals
   * @param {string} signal - Signal name (e.g., 'g-properties-changed')
   * @param {Function} callback - Callback function
   * @returns {number} Connection ID
   */
  connectSignal(signal, callback) {
    if (!this._proxy) {
      console.warn("Cannot connect signal: proxy not initialized");
      return null;
    }

    const id = this._proxy.connect(signal, callback);
    this._connectionIds.push(id);
    return id;
  }

  /**
   * Get the battery warning level
   * WarningLevel may not be exposed via the proxy wrapper if the DBus XML is outdated
   * Access it directly via get_cached_property as a fallback
   * @returns {number} The warning level
   */
  getWarningLevel() {
    let warningLevel = this._proxy?.WarningLevel;
    if (warningLevel === undefined && this._proxy) {
      const variant = this._proxy.get_cached_property("WarningLevel");
      warningLevel = variant?.unpack() ?? UPower.DeviceLevel.NONE;
    }
    return warningLevel;
  }

  getPowerState() {
    const hasBattery = !(
      this._proxy?.State === UPower.DeviceState.UNKNOWN ||
      this._proxy?.Percentage === undefined
    );

    const onBattery =
      this._proxy?.State === UPower.DeviceState.PENDING_DISCHARGE ||
      this._proxy?.State === UPower.DeviceState.DISCHARGING;

    const warningLevel = this.getWarningLevel();

    const lowBattery =
      onBattery &&
      (warningLevel === UPower.DeviceLevel.LOW ||
        warningLevel === UPower.DeviceLevel.CRITICAL ||
        warningLevel === UPower.DeviceLevel.ACTION);

    return {
      hasBattery,
      onBattery,
      onAC: onBattery === false,
      lowBattery: onBattery === true && lowBattery,
    };
  }

  destroy() {
    if (this._proxy) {
      for (const id of this._connectionIds) {
        this._proxy.disconnect(id);
      }
      this._connectionIds = [];
    }
    this._proxy = null;
  }
}
