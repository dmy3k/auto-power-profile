import Gio from "gi://Gio";

const UPOWER_CONFIG_PATH = "/etc/UPower/UPower.conf";
const DEFAULT_PERCENTAGE_LOW = 20;

/**
 * Reads the UPower configuration file and extracts the PercentageLow setting
 * @returns {number} The PercentageLow value, or default (20) if not found or on error
 */
export function readPercentageLow() {
  try {
    const configFile = Gio.File.new_for_path(UPOWER_CONFIG_PATH);
    const [success, contents] = configFile.load_contents(null);

    if (!success) {
      console.error(
        `Failed to read UPower config at ${UPOWER_CONFIG_PATH}, using default ${DEFAULT_PERCENTAGE_LOW}%`
      );
      return DEFAULT_PERCENTAGE_LOW;
    }

    const decoder = new TextDecoder("utf-8");
    const configText = decoder.decode(contents);

    // Parse the config file for PercentageLow
    const lines = configText.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (trimmed.startsWith("#") || trimmed.length === 0) {
        continue;
      }
      if (trimmed.startsWith("PercentageLow=")) {
        const value = parseInt(trimmed.split("=")[1]);
        if (!isNaN(value) && value >= 0 && value <= 100) {
          console.log(`Read UPower PercentageLow from config: ${value}%`);
          return value;
        }
      }
    }

    console.log(
      `PercentageLow not found in ${UPOWER_CONFIG_PATH}, using default ${DEFAULT_PERCENTAGE_LOW}%`
    );
    return DEFAULT_PERCENTAGE_LOW;
  } catch (e) {
    console.error(
      `Error reading UPower config (using default ${DEFAULT_PERCENTAGE_LOW}%):`,
      e.message
    );
    return DEFAULT_PERCENTAGE_LOW;
  }
}
