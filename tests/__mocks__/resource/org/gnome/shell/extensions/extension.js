class Extension {
  metadata = {};

  static _mock = {
    state: {
      ac: "performance",
      bat: "balanced",
      threshold: 25,
      debug: false,
      lapmode: true,
    },
    handlers: [],

    get_string(k) {
      return String(this.state[k]);
    },

    get_boolean(k) {
      return Boolean(this.state[k]);
    },

    get_int(k) {
      return Number(this.state[k]);
    },

    update(patch) {
      for (const [k, v] of Object.entries(patch)) {
        if (v && k in this.state) {
          this.state[k] = v;
        }
      }
      this.handlers.forEach((x) => x());
    },

    connect(name, handler) {
      return this.handlers.push(handler);
    },

    disconnect(handlerId) {
      this.handlers.splice(handlerId, 1);
    },
  };

  getSettings() {
    return Extension._mock;
  }
}

module.exports = {
  Extension,
};
