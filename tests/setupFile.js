global.logError = function (...args) {
  console.error(...args);
};

global.log = function (...args) {
  console.log(...args);
};

global._ = (x) => x;

global.display = {
  connect_after: () => {}
};

global.get_window_actors = () => [];
