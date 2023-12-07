const DeviceState = {
  PENDING_DISCHARGE: 6,
  DISCHARGING: 2,
  CHARGING: 1,
  UNKNOWN: 0,
};

const mock = {
  on_battery: false,
  state: DeviceState.CHARGING,
  percentage: 0,
  handlers: [],

  update({ state, percentage }) {
    this.state = state || this.state;
    this.on_battery = this.state === DeviceState.DISCHARGING;
    this.percentage = percentage || this.percentage || 0;
    this.handlers.forEach((x) => x());
  },
};

module.exports = {
  DeviceState,
  mock,
};
