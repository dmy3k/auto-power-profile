import AutoPowerProfile from "../extension.js";

import { DeviceState } from "./__mocks__/gi/UPowerGlib.js";
import { UpowerProxyMock, PowerProfilesProxyMock } from "./__mocks__/gi/Gio.js";
import { Extension } from "./__mocks__/resource/org/gnome/shell/extensions/extension.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 24,
  });
  Extension._mock.update({ ac: "performance", bat: "balanced", threshold: 25 });
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
  UpowerProxyMock._state.update({ state: DeviceState.CHARGING, percentage: 5 });

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
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 29,
  });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 24,
  });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("switch from power-saver to performance when AC connected", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 24,
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");

  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 24,
  });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");
});

test("switch to balanced after corresponding setting changed", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.DISCHARGING,
    percentage: 29,
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);
  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  Extension._mock.update({ threshold: 50 });
  await sleep(1);
  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("handles lap-mode when on performance while pluggen in", async () => {
  UpowerProxyMock._state.update({
    state: DeviceState.CHARGING,
    percentage: 29,
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

test("extension disabled successfully", async () => {
  const p = new AutoPowerProfile();

  p.enable();
  const spy1 = jest.spyOn(p._powerManagerProxy, "disconnect");
  const spy2 = jest.spyOn(p._powerProfilesProxy, "disconnect");
  await sleep(1);

  p.disable();
  await sleep(1);

  expect(spy1).toHaveBeenCalled();
  expect(spy2).toHaveBeenCalled();
});
