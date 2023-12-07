const state = {
  ac: "performance",
  bat: "balanced",
  threshold: 25,
};
const handlers = [];

const mockSettings = {
  get_string(k) {
    return String(state[k]);
  },
  get_int(k) {
    return Number(state[k]);
  },
  update(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v && k in state) {
        state[k] = v;
      }
    }
    handlers.forEach((x) => x());
  },
  connect(name, handler) {
    handlers.push(handler);
  },
  disconnect(handler) {
    handlers.splice(0, handlers.length);
  },
};

class Extension {
  getSettings() {
    return mockSettings;
  }
}

module.exports = {
  Extension,
  mockSettings,
};
