import { UpowerProxyMock, PowerProfilesProxyMock } from "../gi/Gio.js";

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
