import { useState, useRef, useEffect } from "react";
import {
  Image,
  StyleSheet,
  ActivityIndicator,
  View,
  Text,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent, useEventListener } from "expo";

type LoadPhase = "loading" | "buffering" | "ready";

type StoryMediaProps = {
  type: "image" | "video";
  uri: string;
  isPaused: boolean;
  isMuted: boolean;
  onMediaReady: () => void;
  onVideoEnd?: () => void;
  onVideoDurationKnown: (ms: number) => void;
  onBufferingChange: (buffering: boolean) => void;
  onVideoError: () => void;
};

const VIDEO_LOAD_TIMEOUT_MS = 10000;

export function StoryMedia({
  type,
  uri,
  isPaused,
  isMuted,
  onMediaReady,
  onVideoEnd,
  onVideoDurationKnown,
  onBufferingChange,
  onVideoError,
}: StoryMediaProps) {
  const isVideo = type === "video";

  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [hasError, setHasError] = useState(false);
  const errorAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timeout that fires if the video stays unready too long
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we've already surfaced the duration so we don't fire twice
  const durationReported = useRef(false);
  // Track whether the video has reached readyToPlay at least once
  const hasBeenReady = useRef(false);

  // expo-video player. For image stories we pass a null source so the hook is
  // still called unconditionally (rules of hooks) but loads nothing.
  const player = useVideoPlayer(isVideo ? uri : null, (p) => {
    p.loop = false;
    p.muted = isMuted;
  });

  // Latest status: 'idle' | 'loading' | 'readyToPlay' | 'error'.
  const { status } = useEvent(player, "statusChange", { status: player.status });

  const clearLoadTimeout = () => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  };

  const handleMediaError = () => {
    clearLoadTimeout();
    setHasError(true);
    if (errorAdvanceTimer.current) clearTimeout(errorAdvanceTimer.current);
    errorAdvanceTimer.current = setTimeout(() => {
      onVideoError();
    }, 2000);
  };

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (errorAdvanceTimer.current) clearTimeout(errorAdvanceTimer.current);
      clearLoadTimeout();
    };
  }, []);

  // Reset state when the story (uri/type) changes
  useEffect(() => {
    setPhase("loading");
    setHasError(false);
    durationReported.current = false;
    hasBeenReady.current = false;
    clearLoadTimeout();

    if (isVideo) {
      // Safety timeout for the initial load phase
      loadTimeoutRef.current = setTimeout(() => {
        if (!hasBeenReady.current) {
          setHasError(true);
          onVideoError();
        }
      }, VIDEO_LOAD_TIMEOUT_MS);
    }

    return () => {
      clearLoadTimeout();
    };
  }, [uri, type]);

  // Drive play/pause from the parent-controlled isPaused flag
  useEffect(() => {
    if (!isVideo) return;
    if (isPaused) player.pause();
    else player.play();
  }, [isPaused, isVideo, player]);

  // Keep mute in sync
  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  // React to player status transitions
  useEffect(() => {
    if (!isVideo) return;

    if (status === "readyToPlay") {
      clearLoadTimeout();

      // Report duration once (player.duration is in seconds)
      if (!durationReported.current && player.duration > 0) {
        durationReported.current = true;
        onVideoDurationKnown(player.duration * 1000);
      }

      if (!hasBeenReady.current) {
        // First time ready — reveal media and start the progress bar
        hasBeenReady.current = true;
        setPhase("ready");
        onMediaReady();
      } else if (phase === "buffering") {
        // Recovered from a mid-playback stall
        setPhase("ready");
        onBufferingChange(false);
      }
    } else if (status === "loading") {
      // Mid-playback buffering (ignore the very first load — that's "loading")
      if (hasBeenReady.current && phase !== "buffering") {
        setPhase("buffering");
        onBufferingChange(true);
      }
    } else if (status === "error") {
      handleMediaError();
    }
  }, [status, isVideo]);

  // Advance to the next story when the video reaches its end
  useEventListener(player, "playToEnd", () => {
    if (isVideo) onVideoEnd?.();
  });

  const handleImageLoad = () => {
    setPhase("ready");
    onMediaReady();
  };

  const handleImageError = () => {
    setHasError(true);
    errorAdvanceTimer.current = setTimeout(() => {
      onVideoError();
    }, 2000);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {isVideo ? (
        <VideoView
          player={player}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Image
          source={{ uri }}
          resizeMode="contain"
          style={StyleSheet.absoluteFill}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {/* Full-screen initial loader */}
      {phase === "loading" && !hasError && (
        <View style={styles.fullLoader}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Mid-playback buffering spinner — smaller, semi-transparent */}
      {phase === "buffering" && !hasError && (
        <View style={styles.bufferingOverlay}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.85)" />
        </View>
      )}

      {/* Error state */}
      {hasError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>Video indisponibil</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullLoader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  bufferingOverlay: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 20,
    padding: 8,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  errorText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
