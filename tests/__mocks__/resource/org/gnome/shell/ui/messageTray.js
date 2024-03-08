class Notification {
  addAction() {}
  setUrgency() {}
  setTransient() {}
}

class Source {
  showNotification() {}
}

module.exports = {
  Urgency: {},
  NotificationDestroyedReason: {},
  Source,
  Notification: Notification,
};
