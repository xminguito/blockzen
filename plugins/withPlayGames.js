/**
 * Expo Config Plugin — Google Play Games Services
 *
 * Injects the GPGS APP_ID as <meta-data> into AndroidManifest.xml
 * during prebuild. Required for Play Games sign-in on Android.
 *
 * The APP_ID comes from:
 *   Google Play Console → Play Games Services → Setup & management → Configuration
 *
 * Set it in app.json:
 *   "extra": { "googlePlayGamesAppId": "123456789012" }
 */

const { withAndroidManifest } = require('@expo/config-plugins');

function withPlayGames(config) {
  return withAndroidManifest(config, (config) => {
    const appId =
      config.extra?.googlePlayGamesAppId ?? 'REPLACE_WITH_YOUR_GPGS_APP_ID';

    const mainApplication =
      config.modResults.manifest.application?.[0];

    if (!mainApplication) return config;

    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }

    const metaKey = 'com.google.android.gms.games.APP_ID';
    const existing = mainApplication['meta-data'].find(
      (m) => m.$?.['android:name'] === metaKey,
    );

    if (existing) {
      existing.$['android:value'] = `\\u0020${appId}`;
    } else {
      mainApplication['meta-data'].push({
        $: {
          'android:name': metaKey,
          'android:value': `\\u0020${appId}`,
        },
      });
    }

    return config;
  });
}

module.exports = withPlayGames;
