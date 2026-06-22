const DeviceState = {
  UNKNOWN: 0,
  CHARGING: 1,
  DISCHARGING: 2,
  FULLY_CHARGED: 4,
  PENDING_CHARGE: 5,
  PENDING_DISCHARGE: 6
};

const DeviceLevel = {
  UNKNOWN: 0,
  NONE: 1,
  DISCHARGING: 2,
  LOW: 3,
  CRITICAL: 4,
  ACTION: 5
};

module.exports = {
  DeviceState,
  DeviceLevel
};
