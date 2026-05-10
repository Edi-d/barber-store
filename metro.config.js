const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Redirect native-only packages to web-safe stubs when bundling for web.
// Falls through to default Metro resolution for all other cases and all
// non-web platforms, so iOS/Android bundles are completely unaffected.
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (moduleName === 'react-native-maps') {
      return {
        filePath: path.resolve(__dirname, 'lib/stubs/react-native-maps.ts'),
        type: 'sourceFile',
      };
    }
    // LiveKit native modules link against compiled WebRTC binaries that don't
    // exist in the browser. Even though our app guards `require('@livekit/*')`
    // calls in try/catch, Metro resolves require() arguments statically at
    // bundle time and pulls in the entire native module graph. Redirect to a
    // null stub so the web bundle never sees them.
    if (
      moduleName === '@livekit/react-native' ||
      moduleName === '@livekit/react-native-webrtc'
    ) {
      return {
        filePath: path.resolve(__dirname, 'lib/stubs/livekit.ts'),
        type: 'sourceFile',
      };
    }
  }

  // Fall through: use the existing custom resolver if one was already set,
  // otherwise delegate to Metro's default resolution logic.
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
