module.exports = {
  Source: { remove: jest.fn() },
  timeout_add_seconds: (prio, s, fn) => {
    setTimeout(() => fn(), s * 1000);
  }
};
