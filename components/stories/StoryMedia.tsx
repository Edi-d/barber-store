import { useState, useRef, useEffect } from "react";
import {
  Image,
  StyleSheet,
  ActivityIndicator,
  View,
  Text,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";

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
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<Video>(null);
  const errorAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timeout that fires if video stays in "loading" phase too long
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we've already surfaced the duration so we don't fire twice
  const durationReported = useRef(false);
  // Track whether the video has successfully loaded to cancel the timeout
  const videoLoadedRef = useRef(false);

  const clearLoadTimeout = () => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      videoRef.current?.unloadAsync();
      if (errorAdvanceTimer.current) clearTimeout(errorAdvanceTimer.current);
      clearLoadTimeout();
    };
  }, []);

  // Reset state when uri changes (new story)
  useEffect(() => {
    setPhase("loading");
    setHasError(false);
    durationReported.current = false;
    videoLoadedRef.current = false;
    clearLoadTimeout();

    if (type === "video") {
      // Start a 10-second timeout for the initial video load phase
      loadTimeoutRef.current = setTimeout(() => {
        if (!videoLoadedRef.current) {
          setHasError(true);
          onVideoError();
        }
      }, VIDEO_LOAD_TIMEOUT_MS);
    }

    return () => {
      clearLoadTimeout();
    };
  }, [uri, type]);

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

  const handleVideoError = () => {
    clearLoadTimeout();
    setHasError(true);
    if (errorAdvanceTimer.current) clearTimeout(errorAdvanceTimer.current);
    errorAdvanceTimer.current = setTimeout(() => {
      onVideoError();
    }, 2000);
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      // Unloaded with error
      if (status.error) {
        clearLoadTimeout();
        setHasError(true);
        if (errorAdvanceTimer.current) clearTimeout(errorAdvanceTimer.current);
        errorAdvanceTimer.current = setTimeout(() => {
          onVideoError();
        }, 2000);
      }
      return;
    }

    // Report duration as soon as we know it (fires once)
    if (!durationReported.current && status.durationMillis && status.durationMillis > 0) {
      durationReported.current = true;
      onVideoDurationKnown(status.durationMillis);
    }

    // Buffering state
    if (status.isBuffering) {
      if (phase === "loading") {
        // Still in initial load — keep "loading" phase, no mid-playback spinner yet
      } else {
        setPhase("buffering");
        onBufferingChange(true);
      }
    } else if (phase === "buffering") {
      setPhase("ready");
      onBufferingChange(false);
    }

    // Video finished
    if (status.didJustFinish) {
      onVideoEnd?.();
    }
  };

  const handleReadyForDisplay = () => {
    if (phase === "loading") {
      // Cancel the load timeout — video is ready
      videoLoadedRef.current = true;
      clearLoadTimeout();
      setPhase("ready");
      onMediaReady();
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {type === "video" ? (
        <Video
          ref={videoRef}
          source={{ uri }}
          resizeMode={ResizeMode.COVER}
          shouldPlay={!isPaused}
          isMuted={isMuted}
          isLooping={false}
          style={StyleSheet.absoluteFill}
          onReadyForDisplay={handleReadyForDisplay}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          onError={handleVideoError}
        />
      ) : (
        <Image
          source={{ uri }}
          resizeMode="cover"
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
