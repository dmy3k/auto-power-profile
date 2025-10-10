const DeviceState = {
  PENDING_DISCHARGE: 6,
  DISCHARGING: 2,
  CHARGING: 1,
  UNKNOWN: 0,
};

const DeviceLevel = {
  UNKNOWN: 0,
  NONE: 1,
  DISCHARGING: 2,
  LOW: 3,
  CRITICAL: 4,
  ACTION: 5,
};

module.exports = {
  DeviceState,
  DeviceLevel,
};
