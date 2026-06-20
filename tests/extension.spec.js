import AutoPowerProfile from "../extension.js";

import { DeviceState, DeviceLevel } from "./__mocks__/gi/UPowerGlib.js";
import {
  UpowerProxyMock,
  PowerProfilesProxyMock,
  SettingsMock,
  LinePowerProxyMock
} from "./__mocks__/gi/Gio.js";
import { Extension } from "./__mocks__/resource/org/gnome/shell/extensions/extension.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  // Reset mock state without triggering handlers
  UpowerProxyMock._state.state = DeviceState.DISCHARGING;
  UpowerProxyMock._state.online = false;
  UpowerProxyMock._state.percentage = 24;
  UpowerProxyMock._state.warningLevel = DeviceLevel.LOW;
  UpowerProxyMock._state.handlers = [];

  LinePowerProxyMock._state.online = false;
  LinePowerProxyMock._state.handlers = [];

  Extension._mock.state.ac = "performance";
  Extension._mock.state.bat = "balanced";
  Extension._mock.state["weak-adapter-protection"] = false;
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
  await sleep(10);

  // Verify proxies are initialized
  expect(p._upowerDbus).toBeDefined();
  expect(p._powerProfilesDbus).toBeDefined();
});

test("starts in performance profile on AC according to settings", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 5,
    warningLevel: DeviceLevel.NONE
  });

  const p = new AutoPowerProfile();

  p.enable();

  await sleep(10);

  expect(p._upowerDbus).toBeDefined();
  expect(p._powerProfilesDbus).toBeDefined();

  jest.spyOn(p._upowerDbus._proxy, "connect");
  jest.spyOn(p._powerProfilesDbus._proxy, "connect");

  expect(p._upowerDbus._proxy.connect).toBeDefined();
  expect(p._powerProfilesDbus._proxy.connect).toBeDefined();

  expect(p._powerProfilesDbus.activeProfile).toBe("performance");
});

test("switch from balanced to power-saver when low-battery threshold reached", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 29,
    warningLevel: DeviceLevel.NONE
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 29,
    warningLevel: DeviceLevel.NONE
  });
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");

  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 24,
    warningLevel: DeviceLevel.LOW
  });
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
});

test("switch from power-saver to performance when AC connected", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 24,
    warningLevel: DeviceLevel.LOW
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");

  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 24,
    warningLevel: DeviceLevel.NONE
  });
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");
});

test("switch to balanced after corresponding setting changed", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 29,
    warningLevel: DeviceLevel.NONE
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");

  UpowerProxyMock._state.update({
    warningLevel: DeviceLevel.LOW
  });
  await sleep(10);
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
});

test("handles lap-mode when on performance while pluggen in", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 29,
    warningLevel: DeviceLevel.NONE
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

  jest.useFakeTimers();

  PowerProfilesProxyMock._state.notifyPerformanceDegraded();
  jest.runAllTicks();
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");

  jest.advanceTimersByTime(10000);
  jest.useRealTimers();

  await sleep(10);
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");
});

test("ignores lap-mode when on battery", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 33,
    warningLevel: DeviceLevel.NONE
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  p._powerProfilesDbus._proxy.ActiveProfile = "performance";
  await sleep(10);

  jest.useFakeTimers();

  PowerProfilesProxyMock._state.notifyPerformanceDegraded();
  jest.runAllTicks();

  await jest.advanceTimersByTimeAsync(10000);
  jest.useRealTimers();

  await sleep(10);
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");
});

test("extension disabled successfully and cleans up resources", async () => {
  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  // Verify proxies were created
  expect(p._upowerDbus).toBeDefined();
  expect(p._powerProfilesDbus).toBeDefined();
  expect(p._settings).toBeDefined();
  expect(p._perfAppTracker).toBeDefined();

  p.disable();
  await sleep(10);

  // Verify proxies and settings were cleaned up
  expect(p._upowerDbus).toBeNull();
  expect(p._powerProfilesDbus).toBeNull();
  expect(p._settings).toBeNull();
  expect(p._perfAppTracker).toBeNull();
});

test("uses power-saver on CRITICAL warning level", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 10,
    warningLevel: DeviceLevel.CRITICAL
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
});

test("uses power-saver on ACTION warning level", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 5,
    warningLevel: DeviceLevel.ACTION
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
});

test("respects battery default setting when battery is not low", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 50,
    warningLevel: DeviceLevel.NONE
  });

  Extension._mock.update({ bat: "power-saver" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
});

test("user can manually override profile on AC", async () => {
  UpowerProxyMock._state.state = DeviceState.CHARGING;
  UpowerProxyMock._state.online = true;
  UpowerProxyMock._state.percentage = 80;
  UpowerProxyMock._state.warningLevel = DeviceLevel.NONE;

  Extension._mock.state.ac = "performance";

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

  // Clear the requested profile to simulate user change
  p._requestedProfile = null;

  // Simulate user manually changing to balanced
  PowerProfilesProxyMock._state.ActiveProfile = "balanced";
  await sleep(10); // Give more time for async handlers

  // Profile should be changed
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");
});

test("user can manually override profile on battery (not low)", async () => {
  UpowerProxyMock._state.state = DeviceState.DISCHARGING;
  UpowerProxyMock._state.percentage = 60;
  UpowerProxyMock._state.warningLevel = DeviceLevel.NONE;

  Extension._mock.state.bat = "balanced";

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");

  // Clear the requested profile to simulate user change
  p._requestedProfile = null;

  // Simulate user manually changing to power-saver
  PowerProfilesProxyMock._state.ActiveProfile = "power-saver";
  await sleep(10); // Give more time for async handlers

  // Profile should be changed
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
});

test("does not update settings when user changes profile during low battery", async () => {
  UpowerProxyMock._state.state = DeviceState.DISCHARGING;
  UpowerProxyMock._state.percentage = 15;
  UpowerProxyMock._state.warningLevel = DeviceLevel.LOW;

  const originalBatSetting = Extension._mock.state.bat;

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");

  // Simulate user manually trying to change profile during low battery
  const settingsSpy = jest.spyOn(Extension._mock, "set_string");
  PowerProfilesProxyMock._state.ActiveProfile = "balanced";
  await sleep(10);

  // Extension should NOT update the battery default setting
  expect(settingsSpy).not.toHaveBeenCalled();
  expect(Extension._mock.state.bat).toBe(originalBatSetting);
});

test("switches to balanced profile when settings change from AC to battery", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 80,
    warningLevel: DeviceLevel.NONE
  });

  Extension._mock.update({ ac: "performance", bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

  // Unplug the charger
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 80,
    warningLevel: DeviceLevel.NONE
  });
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");
});

test("handles device without battery", async () => {
  UpowerProxyMock._state.state = DeviceState.UNKNOWN;
  UpowerProxyMock._state.percentage = undefined;
  UpowerProxyMock._state.online = true;
  UpowerProxyMock._state.warningLevel = DeviceLevel.NONE;

  Extension._mock.state.ac = "performance";

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  // Should use AC default for desktop without battery
  // When battery state is UNKNOWN and percentage is undefined, onBattery = false
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");
});

test("uses Online property to detect AC power when battery present", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    online: true,
    percentage: 50,
    warningLevel: DeviceLevel.NONE
  });

  Extension._mock.update({ ac: "performance", bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(20); // Increased to allow time for line power device initialization

  // Should be on AC (Online=true)
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

  // Unplug - Online becomes false even though state might still be CHARGING momentarily
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    online: false,
    percentage: 50,
    warningLevel: DeviceLevel.NONE
  });
  await sleep(20); // Increased to allow time for profile switch

  // Should switch to battery profile because Online=false
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");
});

test("handles PENDING_DISCHARGE state correctly", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.PENDING_DISCHARGE,
    online: false,
    percentage: 80,
    warningLevel: DeviceLevel.NONE
  });

  Extension._mock.update({ ac: "performance", bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  // PENDING_DISCHARGE should use battery profile
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");
});

test("switches profile when AC setting is changed", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 80,
    warningLevel: DeviceLevel.NONE
  });

  Extension._mock.update({ ac: "performance" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

  // User changes AC default to balanced
  Extension._mock.update({ ac: "balanced" });
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");
});

test("switches profile when battery setting is changed", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 60,
    warningLevel: DeviceLevel.NONE
  });

  Extension._mock.update({ bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");

  // User changes battery default to power-saver
  Extension._mock.update({ bat: "power-saver" });
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
});

test("restores to balanced profile on disable", async () => {
  UpowerProxyMock._state.state = DeviceState.CHARGING;
  UpowerProxyMock._state.online = true;
  UpowerProxyMock._state.percentage = 80;
  UpowerProxyMock._state.warningLevel = DeviceLevel.NONE;

  Extension._mock.state.ac = "performance";

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

  // Save reference before disable
  const profileProxy = p._powerProfilesDbus._proxy;

  p.disable();
  await sleep(10);

  // Check on the saved reference since p._powerProfilesDbus._proxy is nulled
  expect(profileProxy.ActiveProfile).toBe("balanced");
});

test("transitions from LOW to CRITICAL warning level", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 50,
    warningLevel: DeviceLevel.NONE
  });

  Extension._mock.update({ bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");

  // Battery gets low
  UpowerProxyMock._state.update({
    percentage: 15,
    warningLevel: DeviceLevel.LOW
  });
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");

  // Battery gets critical
  UpowerProxyMock._state.update({
    percentage: 8,
    warningLevel: DeviceLevel.CRITICAL
  });
  await sleep(10);

  // Should remain in power-saver
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
});

test("exits low battery mode when charged above threshold", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 15,
    warningLevel: DeviceLevel.LOW
  });

  Extension._mock.update({ bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");

  // Connect charger and battery level increases
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 25,
    warningLevel: DeviceLevel.NONE
  });
  await sleep(10);

  // Should switch to AC profile
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

  // Disconnect charger but battery is no longer low
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 25,
    warningLevel: DeviceLevel.NONE
  });
  await sleep(10);

  // Should use battery default, not power-saver
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");
});

test("respects GNOME low battery setting when disabled", async () => {
  const { SettingsMock } = require("./__mocks__/gi/Gio.js");

  // Disable GNOME's automatic low battery power-saver
  SettingsMock._state["power-saver-profile-on-low-battery"] = false;

  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 15,
    warningLevel: DeviceLevel.LOW
  });

  Extension._mock.update({ bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  // Should use battery default instead of power-saver when GNOME setting is disabled
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");

  // Re-enable for other tests
  SettingsMock._state["power-saver-profile-on-low-battery"] = true;
});

test("reacts to GNOME low battery setting changes", async () => {
  const { SettingsMock } = require("./__mocks__/gi/Gio.js");

  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 15,
    warningLevel: DeviceLevel.LOW
  });

  Extension._mock.update({ bat: "balanced" });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(10);

  // Initially should use power-saver (GNOME setting is enabled by default)
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");

  // Disable GNOME's automatic low battery power-saver
  SettingsMock._state["power-saver-profile-on-low-battery"] = false;

  // Trigger settings change
  SettingsMock._state.handlers.forEach((handler) => handler());
  await sleep(10);

  // Should now use battery default
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");

  // Re-enable GNOME setting
  SettingsMock._state["power-saver-profile-on-low-battery"] = true;

  // Trigger settings change
  SettingsMock._state.handlers.forEach((handler) => handler());
  await sleep(10);

  // Should go back to power-saver
  expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
});

describe("Async Initialization & Race Conditions", () => {
  test("proxies are initialized asynchronously before profile switching", async () => {
    const p = new AutoPowerProfile();

    p.enable();

    // Check that wrapper objects are created but proxies not yet initialized
    expect(p._upowerDbus).toBeDefined();
    expect(p._powerProfilesDbus).toBeDefined();
    expect(p._upowerDbus._proxy).toBeNull();
    expect(p._powerProfilesDbus._proxy).toBeNull();

    // Wait for async initialization
    await sleep(10);

    // Proxies should now be initialized
    expect(p._upowerDbus._proxy).toBeDefined();
    expect(p._powerProfilesDbus._proxy).toBeDefined();
  });

  test("no race condition errors when extension enables", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    const consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation();

    UpowerProxyMock._state.state = DeviceState.CHARGING;
    UpowerProxyMock._state.online = true;
    UpowerProxyMock._state.percentage = 80;
    UpowerProxyMock._state.warningLevel = DeviceLevel.NONE;

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    // Should NOT have any race condition errors
    const raceConditionError = consoleErrorSpy.mock.calls.find((call) =>
      call[0]?.includes("proxy not initialized")
    );

    expect(raceConditionError).toBeUndefined();
    expect(p._powerProfilesDbus._proxy).toBeDefined();
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  test("settings change during initialization waits for proxies", async () => {
    const consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation();

    UpowerProxyMock._state.state = DeviceState.CHARGING;
    UpowerProxyMock._state.online = true;
    UpowerProxyMock._state.percentage = 80;

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    // Change settings after initialization
    Extension._mock.update({ ac: "balanced" });
    await sleep(10);

    // Should work without errors
    const debugCalls = consoleDebugSpy.mock.calls.filter((call) =>
      call[0]?.includes("proxy not initialized")
    );

    expect(debugCalls.length).toBe(0);
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");

    consoleDebugSpy.mockRestore();
  });

  test("power state changes during initialization waits for proxies", async () => {
    const consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation();

    UpowerProxyMock._state.state = DeviceState.DISCHARGING;
    UpowerProxyMock._state.percentage = 50;

    const p = new AutoPowerProfile();
    p.enable();

    // Change power state immediately
    UpowerProxyMock._state.update({
      state: DeviceState.CHARGING,
      percentage: 50
    });

    await sleep(10);

    const debugCalls = consoleDebugSpy.mock.calls.filter((call) =>
      call[0]?.includes("proxy not initialized")
    );

    expect(debugCalls.length).toBe(0);
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

    consoleDebugSpy.mockRestore();
  });

  test("rapid settings changes are handled correctly", async () => {
    const consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation();

    UpowerProxyMock._state.state = DeviceState.DISCHARGING;
    UpowerProxyMock._state.percentage = 50;
    UpowerProxyMock._state.warningLevel = DeviceLevel.NONE;

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    // Rapid settings changes on battery
    for (let i = 0; i < 5; i++) {
      Extension._mock.state.bat = i % 2 === 0 ? "performance" : "balanced";
      p._onSettingsChange();
    }

    await sleep(10);

    const debugCalls = consoleDebugSpy.mock.calls.filter((call) =>
      call[0]?.includes("proxy not initialized")
    );

    expect(debugCalls.length).toBe(0);
    // Final iteration (i=4, even) sets bat to "performance"
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

    consoleDebugSpy.mockRestore();
  });
});

describe("Weak AC Adapter Protection", () => {
  test("feature off by default: Online=true with DISCHARGING keeps AC profile", async () => {
    // Simulate the Lenovo Yoga scenario: adapter connected but battery drains under load
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: true,
      percentage: 31,
      warningLevel: DeviceLevel.NONE
    });

    Extension._mock.update({ ac: "performance" });
    // Feature is off (default false)

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    // Without the feature, Online=true means AC profile is used even while discharging
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");
    expect(p._weakAdapterModeActive).toBe(false);
  });

  test("no false-positive on adapter connect: brief DISCHARGING does not immediately trigger", async () => {
    // Start on battery
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: false,
      percentage: 50,
      warningLevel: DeviceLevel.NONE
    });

    Extension._mock.update({ ac: "performance", bat: "balanced" });
    Extension._mock.state["weak-adapter-protection"] = true;

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");

    jest.useFakeTimers();

    // Plug in any adapter: Online=true but State still briefly DISCHARGING
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: true,
      percentage: 50,
      warningLevel: DeviceLevel.NONE
    });
    jest.runAllTicks();

    // Debounce started but not fired — must NOT switch to power-saver yet
    expect(p._weakAdapterPending).toBe(true);
    expect(p._weakAdapterModeActive).toBe(false);
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

    jest.useRealTimers();
  });

  test("feature on: Online=true with sustained DISCHARGING activates power-saver after debounce", async () => {
    UpowerProxyMock._state.update({
      state: DeviceState.CHARGING,
      online: true,
      percentage: 50,
      warningLevel: DeviceLevel.NONE
    });

    Extension._mock.update({ ac: "performance" });
    Extension._mock.state["weak-adapter-protection"] = true;

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

    jest.useFakeTimers();

    // Adapter can no longer keep up — battery starts discharging while AC stays Online
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: true,
      percentage: 49,
      warningLevel: DeviceLevel.NONE
    });
    jest.runAllTicks();

    // Debounce pending — profile unchanged
    expect(p._weakAdapterPending).toBe(true);
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");

    // Condition persists past debounce timeout
    jest.advanceTimersByTime(5000);
    jest.runAllTicks();

    jest.useRealTimers();
    await sleep(10);

    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
    expect(p._weakAdapterModeActive).toBe(true);
    expect(p._weakAdapterPending).toBe(false);
  });

  test("debounce cancelled when adapter charges normally before timeout", async () => {
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: false,
      percentage: 50,
      warningLevel: DeviceLevel.NONE
    });

    Extension._mock.update({ ac: "performance" });
    Extension._mock.state["weak-adapter-protection"] = true;

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    jest.useFakeTimers();

    // Adapter connects — brief DISCHARGING state
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: true,
      percentage: 50,
      warningLevel: DeviceLevel.NONE
    });
    jest.runAllTicks();
    expect(p._weakAdapterPending).toBe(true);

    // Battery transitions to CHARGING before debounce fires — good adapter
    UpowerProxyMock._state.update({
      state: DeviceState.CHARGING,
      online: true,
      percentage: 50,
      warningLevel: DeviceLevel.NONE
    });
    jest.runAllTicks();

    // Debounce should be cancelled
    expect(p._weakAdapterPending).toBe(false);
    expect(p._weakAdapterModeActive).toBe(false);

    // Even after timeout would have fired, mode stays off
    jest.advanceTimersByTime(5000);
    jest.runAllTicks();

    jest.useRealTimers();
    await sleep(10);

    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("performance");
    expect(p._weakAdapterModeActive).toBe(false);
  });

  // Helper: put extension directly into weak adapter mode without going through debounce
  async function activateWeakAdapterMode(p) {
    p._weakAdapterModeActive = true;
    p._currentProfile = null;
    p._currentPowerState = {};
    p._checkProfile();
    await sleep(10);
  }

  test("weak adapter mode persists when battery starts charging again (no oscillation)", async () => {
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: true,
      percentage: 30,
      warningLevel: DeviceLevel.NONE
    });

    Extension._mock.update({ ac: "performance" });
    Extension._mock.state["weak-adapter-protection"] = true;

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    await activateWeakAdapterMode(p);
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");

    // Power Saver reduced load enough that the adapter can now charge the battery
    UpowerProxyMock._state.update({
      state: DeviceState.CHARGING,
      online: true,
      percentage: 31,
      warningLevel: DeviceLevel.NONE
    });
    await sleep(10);

    // Mode must stay active to prevent oscillation — only clears on unplug
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
    expect(p._weakAdapterModeActive).toBe(true);
  });

  test("weak adapter mode clears when AC is unplugged", async () => {
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: true,
      percentage: 30,
      warningLevel: DeviceLevel.NONE
    });

    Extension._mock.update({ ac: "performance", bat: "balanced" });
    Extension._mock.state["weak-adapter-protection"] = true;

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    await activateWeakAdapterMode(p);
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
    expect(p._weakAdapterModeActive).toBe(true);

    // User unplugs adapter
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: false,
      percentage: 29,
      warningLevel: DeviceLevel.NONE
    });
    await sleep(10);

    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("balanced");
    expect(p._weakAdapterModeActive).toBe(false);
  });

  test("does not update AC settings when user changes profile during weak adapter mode", async () => {
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: true,
      percentage: 30,
      warningLevel: DeviceLevel.NONE
    });

    Extension._mock.update({ ac: "performance" });
    Extension._mock.state["weak-adapter-protection"] = true;

    const originalAcSetting = Extension._mock.state.ac;

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    await activateWeakAdapterMode(p);
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");

    // Simulate user manually changing profile during weak adapter mode
    const settingsSpy = jest.spyOn(Extension._mock, "set_string");
    p._requestedProfile = null;
    PowerProfilesProxyMock._state.ActiveProfile = "balanced";
    await sleep(10);

    // Extension must NOT update the AC default setting
    expect(settingsSpy).not.toHaveBeenCalled();
    expect(Extension._mock.state.ac).toBe(originalAcSetting);
  });

  test("performance app override is blocked while in weak adapter mode", async () => {
    UpowerProxyMock._state.update({
      state: DeviceState.DISCHARGING,
      online: true,
      percentage: 30,
      warningLevel: DeviceLevel.NONE
    });

    Extension._mock.update({
      ac: "performance",
      "performance-apps-ac": "performance"
    });
    Extension._mock.state["weak-adapter-protection"] = true;

    const p = new AutoPowerProfile();
    p.enable();
    await sleep(10);

    await activateWeakAdapterMode(p);
    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
    expect(p._weakAdapterModeActive).toBe(true);

    // Even with a performance app active, weak adapter mode must keep power-saver.
    // Perf app changes call _checkProfile directly (not _onSettingsChange).
    jest.spyOn(p._perfAppTracker, "hasActiveApps", "get").mockReturnValue(true);
    p._checkProfile();
    await sleep(10);

    expect(p._powerProfilesDbus._proxy.ActiveProfile).toBe("power-saver");
  });
});

describe("Error Handling & Defensive Programming", () => {
  test("switchProfile has defensive guards when proxy undefined", () => {
    const consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation();

    const { PowerProfilesDbus } = require("../lib/powerProfilesDbus.js");
    const dbus = new PowerProfilesDbus();

    dbus.switchProfile("performance");

    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining("proxy not initialized")
    );

    consoleDebugSpy.mockRestore();
  });

  test("distinguishes proxy not ready from profile not available", () => {
    const consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    const { PowerProfilesDbus } = require("../lib/powerProfilesDbus.js");

    // Scenario 1: Proxy undefined (should be debug message)
    const dbus1 = new PowerProfilesDbus();
    dbus1.switchProfile("performance");

    const debugMessage = consoleDebugSpy.mock.calls[0]?.[0];
    expect(debugMessage).toContain("proxy not initialized");

    // Scenario 2: Proxy ready but profile genuinely missing (should be error)
    const dbus2 = new PowerProfilesDbus();
    dbus2._proxy = new PowerProfilesProxyMock(null, null, null, () => {});
    dbus2.switchProfile("nonexistent-profile");

    const errorMessage = consoleErrorSpy.mock.calls[0]?.[0];
    expect(errorMessage).toBeDefined();
    expect(errorMessage).toContain("not in available profiles");

    consoleDebugSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test("error message includes list of available profiles", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    const { PowerProfilesDbus } = require("../lib/powerProfilesDbus.js");
    const dbus = new PowerProfilesDbus();
    dbus._proxy = new PowerProfilesProxyMock(null, null, null, () => {});

    dbus.switchProfile("invalid-profile");

    const errorMessage = consoleErrorSpy.mock.calls[0]?.[0];

    expect(errorMessage).toBeDefined();
    expect(errorMessage).toContain("invalid-profile");
    expect(errorMessage).toContain("performance");
    expect(errorMessage).toContain("balanced");
    expect(errorMessage).toContain("power-saver");

    consoleErrorSpy.mockRestore();
  });

  test("handles missing Profiles property gracefully", () => {
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

    const { PowerProfilesDbus } = require("../lib/powerProfilesDbus.js");
    const dbus = new PowerProfilesDbus();

    // Proxy exists but Profiles is undefined (DBus communication issue)
    dbus._proxy = { Profiles: undefined, ActiveProfile: "balanced" };
    dbus.switchProfile("performance");

    const warnMessage = consoleWarnSpy.mock.calls[0]?.[0];
    expect(warnMessage).toBeDefined();
    expect(warnMessage).toContain("daemon not responding properly");

    consoleWarnSpy.mockRestore();
  });
});
