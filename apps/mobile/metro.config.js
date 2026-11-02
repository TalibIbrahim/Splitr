const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo SDK 52+ configures Metro for monorepos automatically (workspace roots, node_modules paths).
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
