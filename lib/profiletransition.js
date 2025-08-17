export class ProfileTransition {
  effectiveProfile;
  requestedProfile;
  committedProfile;

  onBat;
  lowBat;
  perfApps;

  report({ effectiveProfile, onBattery, lowBattery, perfApps }) {
    this.effectiveProfile = effectiveProfile;
    this.onBat = onBattery;
    this.lowBat = lowBattery;
    this.perfApps = perfApps;

    if (
      this.requestedProfile &&
      !this.committedProfile &&
      this.effectiveProfile === this.requestedProfile
    ) {
      this.committedProfile = this.requestedProfile;
    }

    if (!effectiveProfile) {
      this.effectiveProfile = null;
      this.requestedProfile = null;
      this.committedProfile = null;
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
    }
    return allowed;
  }
}
