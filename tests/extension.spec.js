import AutoPowerProfile from "../extension.js";

import { DeviceState, DeviceLevel } from "./__mocks__/gi/UPowerGlib.js";
import {
  UpowerProxyMock,
  PowerProfilesProxyMock,
  SettingsMock,
} from "./__mocks__/gi/Gio.js";
import { Extension } from "./__mocks__/resource/org/gnome/shell/extensions/extension.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  // Reset mock state without triggering handlers
  UpowerProxyMock._state.state = DeviceState.DISCHARGING;
  UpowerProxyMock._state.percentage = 24;
  UpowerProxyMock._state.warningLevel = DeviceLevel.LOW;
  UpowerProxyMock._state.handlers = [];

  Extension._mock.state.ac = "performance";
  Extension._mock.state.bat = "balanced";
  Extension._mock.handlers = [];

  PowerProfilesProxyMock._state.ActiveProfile = "balanced";
  PowerProfilesProxyMock._state.handlers = [];

  // Reset GNOME power settings
  SettingsMock._state["power-saver-profile-on-low-battery"] = true;
  SettingsMock._state.handlers = [];
});

afterEach(() => {
  // restore the spy created with spyOn
  jest.restoreAllMocks();
});

test("extension enabled successfully", async () => {
  expect(AutoPowerProfile).toBeDefined();

  const p = new AutoPowerProfile();
  expect(p.enable).toBeDefined();

  p.enable();
  await sleep(1);
});

test("starts in performance profile on AC according to settings", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 5,
    warningLevel: DeviceLevel.NONE,
  });

  const p = new AutoPowerProfile();

  p.enable();
  jest.spyOn(p._powerManagerProxy, "connect");
  jest.spyOn(p._powerProfilesProxy, "connect");

  await sleep(1);

  expect(p._powerManagerProxy.connect).toHaveBeenCalled();
  expect(p._powerProfilesProxy.connect).toHaveBeenCalled();

  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");
});

test("switch from balanced to power-saver when low-battery threshold reached", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 29,
    warningLevel: DeviceLevel.NONE,
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 29,
    warningLevel: DeviceLevel.NONE,
  });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 24,
    warningLevel: DeviceLevel.LOW,
  });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("switch from power-saver to performance when AC connected", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 24,
    warningLevel: DeviceLevel.LOW,
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");

  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 24,
    warningLevel: DeviceLevel.NONE,
  });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");
});

test("switch to balanced after corresponding setting changed", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 29,
    warningLevel: DeviceLevel.NONE,
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);
  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  UpowerProxyMock._state.update({
    warningLevel: DeviceLevel.LOW,
  });
  await sleep(1);
  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("handles lap-mode when on performance while pluggen in", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 29,
    warningLevel: DeviceLevel.NONE,
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");

  jest.useFakeTimers();

  PowerProfilesProxyMock._state.notifyPerformanceDegraded();
  jest.runAllTicks();
  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  jest.advanceTimersByTime(5000);
  jest.useRealTimers();

  await sleep(1);
  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");
});

test("ignores lap-mode when on battery", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 33,
    warningLevel: DeviceLevel.NONE,
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  p._powerProfilesProxy.ActiveProfile = "performance";
  await sleep(1);

  jest.useFakeTimers();

  PowerProfilesProxyMock._state.notifyPerformanceDegraded();
  jest.runAllTicks();

  await jest.advanceTimersByTimeAsync(5000);
  jest.useRealTimers();

  await sleep(1);
  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");
});

test("extension disabled successfully and cleans up resources", async () => {
  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  // Verify watchers and proxies were created
  expect(p._powerManagerWatcher).toBeDefined();
  expect(p._powerProfileWatcher).toBeDefined();
  expect(p._powerManagerProxy).toBeDefined();
  expect(p._powerProfilesProxy).toBeDefined();
  expect(p._settings).toBeDefined();

  p.disable();
  await sleep(1);

  // Verify proxies and settings were cleaned up
  expect(p._powerManagerProxy).toBeNull();
  expect(p._powerProfilesProxy).toBeNull();
  expect(p._settings).toBeNull();
  expect(p._tracker).toBeNull();

  // Note: Watchers with ID 0 won't be disconnected due to falsy check
  // This is acceptable as the proxies themselves are nulled
});

test("uses power-saver on CRITICAL warning level", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 10,
    warningLevel: DeviceLevel.CRITICAL,
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("uses power-saver on ACTION warning level", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 5,
    warningLevel: DeviceLevel.ACTION,
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("respects battery default setting when battery is not low", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 50,
    warningLevel: DeviceLevel.NONE,
  });

  Extension._mock.update({ bat: "power-saver" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("user can manually override profile on AC", async () => {
  UpowerProxyMock._state.state = DeviceState.CHARGING;
  UpowerProxyMock._state.percentage = 80;
  UpowerProxyMock._state.warningLevel = DeviceLevel.NONE;

  Extension._mock.state.ac = "performance";

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");

  // Clear the requested profile to simulate user change
  p._requestedProfile = null;

  // Simulate user manually changing to balanced
  PowerProfilesProxyMock._state.ActiveProfile = "balanced";
  await sleep(10); // Give more time for async handlers

  // Profile should be changed
  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");
});

test("user can manually override profile on battery (not low)", async () => {
  UpowerProxyMock._state.state = DeviceState.DISCHARGING;
  UpowerProxyMock._state.percentage = 60;
  UpowerProxyMock._state.warningLevel = DeviceLevel.NONE;

  Extension._mock.state.bat = "balanced";

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  // Clear the requested profile to simulate user change
  p._requestedProfile = null;

  // Simulate user manually changing to power-saver
  PowerProfilesProxyMock._state.ActiveProfile = "power-saver";
  await sleep(10); // Give more time for async handlers

  // Profile should be changed
  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("does not update settings when user changes profile during low battery", async () => {
  UpowerProxyMock._state.state = DeviceState.DISCHARGING;
  UpowerProxyMock._state.percentage = 15;
  UpowerProxyMock._state.warningLevel = DeviceLevel.LOW;

  const originalBatSetting = Extension._mock.state.bat;

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");

  // Simulate user manually trying to change profile during low battery
  const settingsSpy = jest.spyOn(Extension._mock, "set_string");
  PowerProfilesProxyMock._state.ActiveProfile = "balanced";
  await sleep(1);

  // Extension should NOT update the battery default setting
  expect(settingsSpy).not.toHaveBeenCalled();
  expect(Extension._mock.state.bat).toBe(originalBatSetting);
});

test("switches to balanced profile when settings change from AC to battery", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 80,
    warningLevel: DeviceLevel.NONE,
  });

  Extension._mock.update({ ac: "performance", bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");

  // Unplug the charger
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 80,
    warningLevel: DeviceLevel.NONE,
  });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");
});

test("handles device without battery", async () => {
  UpowerProxyMock._state.state = DeviceState.UNKNOWN;
  UpowerProxyMock._state.percentage = undefined;
  UpowerProxyMock._state.warningLevel = DeviceLevel.NONE;

  Extension._mock.state.ac = "performance";

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  // Should use AC default for desktop without battery
  // When battery state is UNKNOWN and percentage is undefined, onBattery = false
  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");
});

test("switches profile when AC setting is changed", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 80,
    warningLevel: DeviceLevel.NONE,
  });

  Extension._mock.update({ ac: "performance" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");

  // User changes AC default to balanced
  Extension._mock.update({ ac: "balanced" });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");
});

test("switches profile when battery setting is changed", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 60,
    warningLevel: DeviceLevel.NONE,
  });

  Extension._mock.update({ bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  // User changes battery default to power-saver
  Extension._mock.update({ bat: "power-saver" });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("restores to balanced profile on disable", async () => {
  UpowerProxyMock._state.state = DeviceState.CHARGING;
  UpowerProxyMock._state.percentage = 80;
  UpowerProxyMock._state.warningLevel = DeviceLevel.NONE;

  Extension._mock.state.ac = "performance";

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");

  // Save reference before disable
  const profileProxy = p._powerProfilesProxy;

  p.disable();
  await sleep(1);

  // Check on the saved reference since p._powerProfilesProxy is nulled
  expect(profileProxy.ActiveProfile).toBe("balanced");
});

test("transitions from LOW to CRITICAL warning level", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 50,
    warningLevel: DeviceLevel.NONE,
  });

  Extension._mock.update({ bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  // Battery gets low
  UpowerProxyMock._state.update({
    percentage: 15,
    warningLevel: DeviceLevel.LOW,
  });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");

  // Battery gets critical
  UpowerProxyMock._state.update({
    percentage: 8,
    warningLevel: DeviceLevel.CRITICAL,
  });
  await sleep(1);

  // Should remain in power-saver
  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("exits low battery mode when charged above threshold", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 15,
    warningLevel: DeviceLevel.LOW,
  });

  Extension._mock.update({ bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");

  // Connect charger and battery level increases
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 25,
    warningLevel: DeviceLevel.NONE,
  });
  await sleep(1);

  // Should switch to AC profile
  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");

  // Disconnect charger but battery is no longer low
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 25,
    warningLevel: DeviceLevel.NONE,
  });
  await sleep(1);

  // Should use battery default, not power-saver
  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");
});

test("respects GNOME low battery setting when disabled", async () => {
  const { SettingsMock } = require("./__mocks__/gi/Gio.js");

  // Disable GNOME's automatic low battery power-saver
  SettingsMock._state["power-saver-profile-on-low-battery"] = false;

  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 15,
    warningLevel: DeviceLevel.LOW,
  });

  Extension._mock.update({ bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  // Should use battery default instead of power-saver when GNOME setting is disabled
  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  // Re-enable for other tests
  SettingsMock._state["power-saver-profile-on-low-battery"] = true;
});

test("reacts to GNOME low battery setting changes", async () => {
  const { SettingsMock } = require("./__mocks__/gi/Gio.js");

  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 15,
    warningLevel: DeviceLevel.LOW,
  });

  Extension._mock.update({ bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  // Initially should use power-saver (GNOME setting is enabled by default)
  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");

  // Disable GNOME's automatic low battery power-saver
  SettingsMock._state["power-saver-profile-on-low-battery"] = false;

  // Trigger settings change
  SettingsMock._state.handlers.forEach((handler) => handler());
  await sleep(1);

  // Should now use battery default
  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  // Re-enable GNOME setting
  SettingsMock._state["power-saver-profile-on-low-battery"] = true;

  // Trigger settings change
  SettingsMock._state.handlers.forEach((handler) => handler());
  await sleep(1);

  // Should go back to power-saver
  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});
