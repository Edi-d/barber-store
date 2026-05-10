// Web stub for @livekit/react-native and @livekit/react-native-webrtc.
// Metro's web resolver redirects those packages here (see metro.config.js).
// All fields are no-ops or null. Consumers must use optional chaining.

const noop = () => {};
const asyncNoop = async () => {};

const stub: any = {
  // registerGlobals is called once at app start by lib/livekit-setup.native.ts.
  registerGlobals: noop,
  // AudioSession surface used by hooks/useLiveConnection.ts on native.
  AudioSession: {
    startAudioSession: asyncNoop,
    stopAudioSession: asyncNoop,
    configureAudio: asyncNoop,
  },
  // Component placeholders. Consumers check for truthiness before rendering.
  VideoTrack: null,
  AudioTrack: null,
  // Hooks — return empty so iterations are no-ops.
  useTracks: () => [],
  useLocalParticipant: () => null,
  useRoomContext: () => null,
};

export default stub;
export const registerGlobals = stub.registerGlobals;
export const AudioSession = stub.AudioSession;
export const VideoTrack = stub.VideoTrack;
export const AudioTrack = stub.AudioTrack;
export const useTracks = stub.useTracks;
export const useLocalParticipant = stub.useLocalParticipant;
export const useRoomContext = stub.useRoomContext;

module.exports = stub;
module.exports.default = stub;
