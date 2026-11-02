/* eslint-disable no-undef, @typescript-eslint/no-require-imports -- CommonJS Expo config plugin, loaded by Node at prebuild */
// Expo config plugin: signs the Android release build with a keystore described by env vars at prebuild/build time.
// If SPLITR_KEYSTORE_PATH is unset, the template's default (debug key) is left untouched.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// splitr-release-signing';

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: expected a Groovy app/build.gradle');
    }
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    const releaseConfig = `
        release { ${MARKER}
            if (System.getenv("SPLITR_KEYSTORE_PATH")) {
                storeFile file(System.getenv("SPLITR_KEYSTORE_PATH"))
                storePassword System.getenv("SPLITR_KEYSTORE_PASSWORD")
                keyAlias System.getenv("SPLITR_KEY_ALIAS")
                keyPassword System.getenv("SPLITR_KEY_PASSWORD")
            }
        }`;
    // Add a `release` signing config right after the template's `signingConfigs {` opener.
    src = src.replace(/signingConfigs\s*\{/, (m) => `${m}${releaseConfig}`);

    // Point the release build type at it (only when the env is present; otherwise keep the template's choice).
    src = src.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      '$1signingConfig System.getenv("SPLITR_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug',
    );
    if (!src.includes('signingConfigs.release :')) {
      throw new Error('withReleaseSigning: could not patch release signingConfig in app/build.gradle');
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
