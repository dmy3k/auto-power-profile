import Shell from "gi://Shell";
import GLib from "gi://GLib";

/**
 * Tracks performance-critical application windows and manages their lifecycle
 * Provides active state detection for performance app override logic
 */
export class PerformanceAppTracker {
  _tracker;
  _trackedWindows;
  _performanceAppIds;
  _onActiveStateChange;
  _winCreatedWatcher;

  constructor() {
    this._tracker = null;
    this._trackedWindows = new Map();
    this._performanceAppIds = [];
    this._onActiveStateChange = null;
    this._winCreatedWatcher = null;
  }

  /**
   * Initialize the tracker with window tracker instance
   * @param {Function} onActiveStateChange - Callback when active state changes (true/false)
   */
  initialize(onActiveStateChange) {
    this._tracker = Shell.WindowTracker.get_default();
    this._onActiveStateChange = onActiveStateChange;

    // Watch for new windows being created
    this._winCreatedWatcher = global.display.connect_after(
      "window-created",
      (display, win) => {
        if (this._performanceAppIds?.length) {
          GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.onWindowCreated(win);
            return GLib.SOURCE_REMOVE;
          });
        }
      }
    );
  }

  /**
   * Update the list of performance app IDs to track
   * @param {string[]} appIds - Array of application IDs to track
   */
  setPerformanceApps(appIds) {
    this._performanceAppIds = appIds || [];

    if (this._performanceAppIds?.length || this._trackedWindows.size) {
      global
        .get_window_actors()
        .forEach((actor) => this.onWindowCreated(actor.meta_window));
    }
  }

  /**
   * Check if performance apps are currently active
   * @returns {boolean} True if any tracked windows exist
   */
  get hasActiveApps() {
    return this._trackedWindows.size > 0;
  }

  /**
   * Handle a window creation or update event
   * @param {Object} win - The window (MetaWindow) to check
   */
  onWindowCreated(win) {
    if (!this._tracker) {
      return;
    }

    const app = this._tracker.get_window_app(win);
    const appId = app?.get_id();
    const isPerfApp = this._performanceAppIds.includes(appId);

    const wasActive = this.hasActiveApps;

    if (isPerfApp && !this._trackedWindows.has(win)) {
      // Start tracking this performance app window
      const cid = win.connect("unmanaged", (win) => {
        this._onWindowUnmanaged(win);
      });

      this._trackedWindows.set(win, cid);

      // Notify if state changed from inactive to active
      if (!wasActive && this._onActiveStateChange) {
        this._onActiveStateChange(true);
      }
    } else if (!isPerfApp && this._trackedWindows.has(win)) {
      // Stop tracking this window (app was removed from perf apps list)
      const cid = this._trackedWindows.get(win);
      win.disconnect(cid);
      this._trackedWindows.delete(win);

      // Notify if state changed from active to inactive
      if (wasActive && !this.hasActiveApps && this._onActiveStateChange) {
        this._onActiveStateChange(false);
      }
    }
  }

  /**
   * Handle window being unmanaged (closed)
   * @param {Object} win - The window that was closed
   */
  _onWindowUnmanaged(win) {
    const wasActive = this.hasActiveApps;

    this._trackedWindows.delete(win);

    // Notify if this was the last tracked window
    if (wasActive && !this.hasActiveApps && this._onActiveStateChange) {
      this._onActiveStateChange(false);
    }
  }

  /**
   * Cleanup and disconnect all signals
   */
  destroy() {
    if (
      this._winCreatedWatcher !== null &&
      this._winCreatedWatcher !== undefined
    ) {
      global.display.disconnect(this._winCreatedWatcher);
      this._winCreatedWatcher = null;
    }

    for (const [win, cid] of this._trackedWindows.entries()) {
      win.disconnect(cid);
    }
    this._trackedWindows.clear();
    this._tracker = null;
    this._onActiveStateChange = null;
  }
}
