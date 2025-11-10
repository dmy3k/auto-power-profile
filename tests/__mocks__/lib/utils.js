import {
  UpowerProxyMock,
  PowerProfilesProxyMock,
  LinePowerProxyMock
} from "../gi/Gio.js";

/**
 * Mock implementation of createPowerProfilesProxy
 * Mimics the async behavior of the real implementation
 */
export const createPowerProfilesProxy = () => {
  return new Promise((resolve, reject) => {
    // Simulate async DBus call with nextTick
    process.nextTick(() => {
      const proxy = new PowerProfilesProxyMock(null, null, null, (p, error) => {
        if (error) {
          reject(error);
        } else {
          resolve(p);
        }
      });
    });
  });
};

/**
 * Mock implementation of createPowerManagerProxy
 * Mimics the async behavior of the real implementation
 */
export const createPowerManagerProxy = () => {
  return new Promise((resolve, reject) => {
    // Simulate async DBus call with nextTick
    process.nextTick(() => {
      const proxy = new UpowerProxyMock(null, null, null, (p, error) => {
        if (error) {
          reject(error);
        } else {
          resolve(p);
        }
      });
    });
  });
};

/**
 * Mock implementation of enumerateUPowerDevices
 * Returns mock device paths
 */
export const enumerateUPowerDevices = () => {
  return Promise.resolve([
    "/org/freedesktop/UPower/devices/line_power_AC",
    "/org/freedesktop/UPower/devices/battery_BAT0"
  ]);
};

/**
 * Mock implementation of createUPowerDeviceProxy
 * Returns appropriate mock based on device path
 */
export const createUPowerDeviceProxy = (devicePath) => {
  return new Promise((resolve, reject) => {
    process.nextTick(() => {
      if (devicePath.includes("line_power") || devicePath.includes("AC")) {
        const proxy = new LinePowerProxyMock(
          null,
          null,
          devicePath,
          (p, error) => {
            if (error) {
              reject(error);
            } else {
              resolve(p);
            }
          }
        );
      } else {
        const proxy = new UpowerProxyMock(
          null,
          null,
          devicePath,
          (p, error) => {
            if (error) {
              reject(error);
            } else {
              resolve(p);
            }
          }
        );
      }
    });
  });
};
