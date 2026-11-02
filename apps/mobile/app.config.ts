import type { ExpoConfig } from 'expo/config';

// Release builds (see .github/workflows/release.yml) inject these via env vars; local dev falls back to defaults.
const APP_ID = 'com.talibibrahim.splitr';

const config: ExpoConfig = {
  name: 'Splitr',
  slug: 'splitr',
  version: process.env.APP_VERSION ?? '0.0.0-dev',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'splitr',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: APP_ID,
    buildNumber: process.env.IOS_BUILD_NUMBER ?? '1',
    icon: './assets/images/icon.png',
    infoPlist: {
      LSApplicationQueriesSchemes: ['whatsapp'],
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
    },
  },
  android: {
    package: APP_ID,
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
    adaptiveIcon: {
      backgroundColor: '#15131A',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // D30: no Google auto-backup of local data. D31: release builds also drop INTERNET.
    allowBackup: false,
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      ...(process.env.SPLITR_RELEASE === '1' ? ['android.permission.INTERNET'] : []),
    ],
  },
  web: {
    output: 'server',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        dark: {
          backgroundColor: '#0F0E12',
          image: './assets/images/splash-icon-dark.png',
        },
      },
    ],
    'expo-font',
    'expo-sqlite',
    'expo-system-ui',
    'expo-sharing',
    ['react-native-document-scanner-plugin', { cameraPermission: 'Splitr uses the camera to scan receipts.' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Splitr reads a photo of your receipt from your library to fill in the bill.',
        cameraPermission: 'Splitr uses the camera to scan receipts.',
        microphonePermission: false,
      },
    ],
    './plugins/withReleaseSigning',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
