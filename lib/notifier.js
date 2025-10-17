import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import * as Config from "resource:///org/gnome/shell/misc/config.js";

export class Notifier {
  constructor(extensionObject, settings) {
    this._uuid = extensionObject.uuid;
    this._name = extensionObject.metadata.name;
    this._settings = settings;
    this._source = null;
  }

  notify(body, { uri, isTransient = false } = {}) {
    if (!this._settings.notificationsEnabled) {
      return;
    }

    const [major] = Config.PACKAGE_VERSION.split(".");
    const shellVersion45 = Number.parseInt(major) < 46;

    const iconName = "dialog-warning-symbolic";
    const title = _("Auto Power Profiles");
    const urgency = isTransient
      ? MessageTray.Urgency.LOW
      : MessageTray.Urgency.CRITICAL;

    // Remove any active notification before showing a new one
    if (this._checkActiveNotification()) {
      this._source.destroy(MessageTray.NotificationDestroyedReason.REPLACED);
      this._source = null;
    }

    let notification;

    if (shellVersion45) {
      this._source = new MessageTray.Source(this._name, iconName);
      notification = new MessageTray.Notification(this._source, title, body);
      notification.setUrgency(urgency);
      notification.setTransient(isTransient); // notification disappears automatically
    } else {
      this._source = new MessageTray.Source({
        title: this._name,
        icon: Gio.icon_new_for_string(iconName)
      });
      notification = new MessageTray.Notification({
        source: this._source,
        title,
        body,
        urgency
      });
      notification.isTransient = isTransient;
    }

    Main.messageTray.add(this._source);

    // Add 'Do not show again' action for all notifications
    notification.addAction(_("Do not show again"), () => {
      this._settings.notificationsEnabled = false;
    });

    if (uri) {
      notification.addAction(_("Show details"), () => {
        Gio.app_info_launch_default_for_uri(uri, null, null, null);
      });
    }

    if (shellVersion45) {
      this._source.showNotification(notification);
    } else {
      this._source.addNotification(notification);
    }
  }

  _checkActiveNotification() {
    let status = false;
    const activeSource = Main.messageTray.getSources();
    if (activeSource[0] == null) {
      this._source = null;
    } else {
      activeSource.forEach((item) => {
        if (item === this._source) status = true;
      });
    }
    return status;
  }

  _removeActiveNofications() {
    if (this._checkActiveNotification())
      this._source.destroy(
        MessageTray.NotificationDestroyedReason.SOURCE_CLOSED
      );
    this._source = null;
  }

  destroy() {
    this._removeActiveNofications();
  }
}
