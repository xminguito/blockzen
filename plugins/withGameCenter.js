/**
 * Expo Config Plugin — Game Center Entitlement
 *
 * Injects com.apple.developer.game-center into the iOS entitlements
 * during prebuild. Required for Game Center connection on physical devices.
 *
 * Bundle ID must match App Store Connect exactly:
 * - app.json: ios.bundleIdentifier = "com.blockzen.app"
 * - Apple Developer Portal: Enable Game Center for this App ID
 */

const { withEntitlementsPlist } = require('@expo/config-plugins');

function withGameCenter(config) {
  return withEntitlementsPlist(config, (config) => {
    config.modResults['com.apple.developer.game-center'] = true;
    return config;
  });
}

module.exports = withGameCenter;
