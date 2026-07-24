/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "appointmentactivity",
  // Pinned explicitly (rather than left to derive from `type`) so the Xcode
  // target name and bundle id stay stable and match the provisioning
  // profile/credentials already registered with EAS.
  bundleIdentifier: "com.reverbarber.tapzi.widget",
  displayName: "Tapzi Appointment",
  // Must stay in sync with ios.infoPlist.NSSupportsLiveActivities + the
  // expo-build-properties ios.deploymentTarget in app.json.
  deploymentTarget: "16.2",
  colors: {
    // Used by the system for the widget-editing UI accent (not really applicable to
    // Live Activities, but harmless to set) and referenced by ASSETCATALOG build settings.
    $accent: "#F5A623",
    $widgetBackground: "#121417",
  },
};
