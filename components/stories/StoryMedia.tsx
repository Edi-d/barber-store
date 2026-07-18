import { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  ActivityIndicator,
  View,
  Text,
} from "react-native";
import { Image } from '@/components/ui/Image';
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent, useEventListener } from "expo";

type LoadPhase = "loading" | "buffering" | "ready";

type StoryMediaProps = {
  /**
   * Identity of the story currently being shown. This component is deliberately
   * NOT remounted per story (no `key` at the call site) — remounting reset
   * `phase` to "loading" and painted a full-screen scrim over every advance,
   * even for images already prefetched into the expo-image cache, and it tore
   * down + rebuilt the native video player on image-only stories too. Instead
   * the source is swapped in place and internal state is reset off this id.
   */
  storyId: string;
  type: "image" | "video";
  uri: string;
  /** Cheap blurred/low-res frame shown while the full image decodes, if known. */
  thumbnailUrl?: string | null;
  isPaused: boolean;
  isMuted: boolean;
  onMediaReady: () => void;
  onVideoEnd?: () => void;
  onVideoDurationKnown: (ms: number) => void;
  onBufferingChange: (buffering: boolean) => void;
  onVideoError: () => void;
};

const VIDEO_LOAD_TIMEOUT_MS = 10000;
// A warm (memory/disk cached) image resolves within a frame or two. Showing a
// spinner for that single frame IS the flicker we're fixing, so the loading
// scrim is withheld until the media has genuinely been slow for this long.
const LOADER_DELAY_MS = 250;
// Short cross-fade between stories instead of a hard cut on source swap.
const IMAGE_TRANSITION_MS = 150;

export function StoryMedia({
  storyId,
  type,
  uri,
  thumbnailUrl,
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
  // Gated version of `phase === "loading"` — see LOADER_DELAY_MS.
  const [showLoader, setShowLoader] = useState(false);
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

  // Reset per-story state when the story identity changes. The component
  // instance is reused across stories, so everything story-scoped has to be
  // cleared here rather than relying on unmount.
  useEffect(() => {
    setPhase("loading");
    setHasError(false);
    durationReported.current = false;
    hasBeenReady.current = false;
    clearLoadTimeout();
    // A pending "advance after error" timer belongs to the PREVIOUS story —
    // letting it fire would skip the story we just navigated to.
    if (errorAdvanceTimer.current) {
      clearTimeout(errorAdvanceTimer.current);
      errorAdvanceTimer.current = null;
    }

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
  }, [storyId]);

  // Withhold the full-screen loading scrim until the media has been slow for
  // LOADER_DELAY_MS. Cached images never reach this, so advancing through
  // prefetched stories no longer flashes a spinner.
  useEffect(() => {
    if (phase !== "loading" || hasError) {
      setShowLoader(false);
      return;
    }
    const t = setTimeout(() => setShowLoader(true), LOADER_DELAY_MS);
    return () => clearTimeout(t);
  }, [phase, hasError, storyId]);

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
          // Tells expo-image this view is being recycled for a different item,
          // so it clears the previous image instead of showing it under the new
          // one while that decodes.
          recyclingKey={storyId}
          placeholder={thumbnailUrl ? { uri: thumbnailUrl } : undefined}
          placeholderContentFit="contain"
          transition={IMAGE_TRANSITION_MS}
          cachePolicy="memory-disk"
          contentFit="contain"
          style={StyleSheet.absoluteFill}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {/* Full-screen initial loader — delayed, so warm images never show it */}
      {showLoader && !hasError && (
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
