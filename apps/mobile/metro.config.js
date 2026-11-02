const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo SDK 52+ configures Metro for monorepos automatically (workspace roots, node_modules paths).
const config = getDefaultConfig(__dirname);
// On web, expo-sqlite's wasm worker is not shipped in the package, so use a localStorage stand-in for the kv-store.
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-sqlite/kv-store') {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'lib', 'kv-store.web.ts') };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
