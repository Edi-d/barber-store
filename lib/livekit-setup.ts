let isLiveKitAvailable = false;

try {
  const { registerGlobals } = require('@livekit/react-native');
  registerGlobals();
  isLiveKitAvailable = true;
} catch {
  // LiveKit native modules not available (Expo Go or build without LiveKit compiled)
  console.log('[livekit-setup] Native LiveKit not available - using fallback mode');
}

export { isLiveKitAvailable };
