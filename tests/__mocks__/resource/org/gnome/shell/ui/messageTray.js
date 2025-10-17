class Notification {
  addAction() {}
  setUrgency() {}
  setTransient() {}
}

class Source {
  showNotification() {}
  addNotification() {}
}

module.exports = {
  Urgency: {},
  NotificationDestroyedReason: {},
  Source,
  Notification: Notification
};
