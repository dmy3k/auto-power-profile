export class ProfileTransition {
  effectiveProfile;
  requestedProfile;
  committedProfile;
  pendingExtensionChange; // Track extension-initiated changes

  onBat;
  lowBat;
  perfApps;
  onAC;

  // Callback for updating default profiles when user manually changes them
  onUserProfileChange = null;

  report({ effectiveProfile, onBattery, lowBattery, perfApps, onAC }) {
    const previousProfile = this.effectiveProfile;

    this.effectiveProfile = effectiveProfile;
    this.onBat = onBattery;
    this.lowBat = lowBattery;
    this.perfApps = perfApps;
    this.onAC = onAC;

    // Check if this was an extension-initiated change that completed
    if (
      this.requestedProfile &&
      !this.committedProfile &&
      this.effectiveProfile === this.requestedProfile
    ) {
      this.committedProfile = this.requestedProfile;
      this.pendingExtensionChange = false;
    }
    // Check if this was a user-initiated change
    else if (
      previousProfile &&
      effectiveProfile &&
      previousProfile !== effectiveProfile &&
      !this.pendingExtensionChange &&
      this.onUserProfileChange
    ) {
      // This is likely a user-initiated profile change
      this.onUserProfileChange(effectiveProfile, { onBattery, onAC });
    }

    if (!effectiveProfile) {
      this.effectiveProfile = null;
      this.requestedProfile = null;
      this.committedProfile = null;
      this.pendingExtensionChange = false;
    }
  }

  request({ configuredProfile, onBattery, lowBattery, perfApps }) {
    const allowed =
      this.lowBat !== lowBattery ||
      this.onBat !== onBattery ||
      this.perfApps !== perfApps ||
      !this.committedProfile;

    if (allowed) {
      this.requestedProfile = configuredProfile;
      this.committedProfile = null;
      this.pendingExtensionChange = true; // Mark as extension-initiated
    }
    return allowed;
  }

  // Method to set callback for handling user profile changes
  setUserChangeCallback(callback) {
    this.onUserProfileChange = callback;
  }
}
