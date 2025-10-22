import { createPowerProfilesProxy } from "./utils.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import * as FileUtils from "resource:///org/gnome/shell/misc/fileUtils.js";

/**
 * Manages power-profiles-daemon DBus connection and profile switching
 */
export class PowerProfilesDbus {
  _proxy;
  _connectionIds;

  constructor() {
    this._proxy = null;
    this._connectionIds = [];
  }

  /**
   * Initialize the power profiles proxy
   * @returns {Promise<PowerProfilesDbus>}
   */
  async initialize() {
    const loadInterfaceXML = (x) => FileUtils.loadInterfaceXML(x);

    try {
      this._proxy = await createPowerProfilesProxy(loadInterfaceXML);
      return this;
    } catch (error) {
      console.error("Failed to initialize power profiles proxy:", error);
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
    if (id !== null && id !== undefined) {
      this._connectionIds.push(id);
    }
    return id;
  }

  /**
   * Get the currently active power profile
   * @returns {string|null} The active profile name
   */
  get activeProfile() {
    return this._proxy?.ActiveProfile ?? null;
  }

  /**
   * Get the list of available profiles
   * @returns {Array} Array of profile objects
   */
  get profiles() {
    return this._proxy?.Profiles ?? [];
  }

  /**
   * Switch to a specific power profile
   * @param {string} profile - The profile name to switch to
   * @returns {boolean} True if switch was successful or unnecessary, false otherwise
   */
  switchProfile(profile) {
    if (!this._proxy) {
      console.debug(
        `Cannot switch to profile '${profile}' - power profiles proxy not initialized yet`
      );
      return false;
    }

    if (!this._proxy.Profiles) {
      console.warn(
        `Cannot switch to profile '${profile}' - power profiles daemon not responding properly`
      );
      return false;
    }

    if (profile === this._proxy.ActiveProfile) {
      return true;
    }

    const canSwitch = this._proxy.Profiles.some(
      (p) => p.Profile.unpack() === profile
    );

    if (!canSwitch) {
      const available = this._proxy.Profiles.map((p) =>
        p.Profile.unpack()
      ).join(", ");

      console.error(
        `Cannot switch to profile '${profile}' - not in available profiles: ${available}`
      );
      return false;
    }

    this._proxy.ActiveProfile = profile;
    return true;
  }

  /**
   * Validate that power profile drivers are properly configured
   * @returns {Object} Validation result with status and message
   */
  validateDrivers() {
    const active = this._proxy?.ActiveProfile;
    const profile = this._proxy?.Profiles?.find(
      (x) => x.Profile?.unpack() === active
    );

    const driver = profile?.Driver?.get_string()?.[0];
    const platformDriver = profile?.PlatformDriver?.get_string()?.[0];
    const cpuDriver = profile?.CpuDriver?.get_string()?.[0];
    const drivers = [driver, platformDriver, cpuDriver];

    return {
      active: !!active,
      hasDrivers: drivers.some((x) => x && x !== "placeholder")
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
