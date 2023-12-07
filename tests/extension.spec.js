import AutoPowerProfile from "../extension.js";

import { mock, DeviceState } from "./__mocks__/gi/UPowerGlib.js";
import { mockSettings } from "./__mocks__/resource/org/gnome/shell/extensions/extension.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  mock.update({ state: DeviceState.DISCHARGING, percentage: 24 });
  mockSettings.update({ ac: "performance", bat: "balanced", threshold: 25 });
});

test("extension enabled successfully", async () => {
  expect(AutoPowerProfile).toBeDefined();

  const p = new AutoPowerProfile();
  expect(p.enable).toBeDefined();

  p.enable();
  await sleep(1);
});

test("starts in performance profile on AC according to settings", async () => {
  mock.update({ state: DeviceState.CHARGING, percentage: 5 });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.connect).toHaveBeenCalled();

  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");
});

test("switch from balanced to power-saver when low-battery threshold reached", async () => {
  mock.update({ state: DeviceState.DISCHARGING, percentage: 29 });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  mock.update({ state: DeviceState.DISCHARGING, percentage: 29 });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  mock.update({ state: DeviceState.DISCHARGING, percentage: 24 });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("switch from power-saver to performance when AC connected", async () => {
  mock.update({ state: DeviceState.DISCHARGING, percentage: 24 });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");

  mock.update({ state: DeviceState.CHARGING, percentage: 24 });
  await sleep(1);

  expect(p._powerProfilesProxy.ActiveProfile).toBe("performance");
});

test("switch to balanced after corresponding setting changed", async () => {
  mock.update({
    state: DeviceState.DISCHARGING,
    percentage: 29,
  });

  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);
  expect(p._powerProfilesProxy.ActiveProfile).toBe("balanced");

  mockSettings.update({ threshold: 50 });
  await sleep(1);
  expect(p._powerProfilesProxy.ActiveProfile).toBe("power-saver");
});

test("extension disabled successfully", async () => {
  const p = new AutoPowerProfile();

  p.enable();
  await sleep(1);

  p.disable();
  await sleep(1);
});
