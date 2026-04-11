import { useRef, useEffect, useCallback, useState } from 'react';
import { View, Image, Pressable, StyleSheet, Text } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

interface VideoPlayerProps {
  mediaUrl: string;
  thumbUrl: string | null;
  isActive: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
}

// ---------------------------------------------------------------------------
// Skeleton pulse — loops opacity between 0.3 and 1.0 using Reanimated
// ---------------------------------------------------------------------------
function usePulse() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 700 }),
        withTiming(1.0, { duration: 700 })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

// ---------------------------------------------------------------------------
// VideoPlayer
// ---------------------------------------------------------------------------
export function VideoPlayer({
  mediaUrl,
  thumbUrl,
  isActive,
  isMuted,
  onMuteToggle,
}: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const thumbOpacity = useSharedValue(1);
  const pulseStyle = usePulse();

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // 10-second load timeout
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Reset state whenever the source or retryKey changes
    setIsLoading(true);
    setHasError(false);
    thumbOpacity.value = 1;

    timeoutRef.current = setTimeout(() => {
      setIsLoading((current) => {
        if (current) {
          // Still loading after 10 s — show error
          setHasError(true);
          return false;
        }
        return current;
      });
    }, 10_000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [mediaUrl, retryKey, thumbOpacity]);

  // -------------------------------------------------------------------------
  // Playback status handler
  // -------------------------------------------------------------------------
  const handlePlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        // status.error is present when the native player failed
        if ((status as { error?: string }).error) {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setIsLoading(false);
          setHasError(true);
        }
        return;
      }

      // First frame rendered — clear timeout, mark loaded, fade thumbnail
      if (status.positionMillis > 0 && isLoading) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsLoading(false);
      }

      if (status.positionMillis > 0 && thumbOpacity.value > 0) {
        thumbOpacity.value = withTiming(0, { duration: 100 });
      }
    },
    [isLoading, thumbOpacity]
  );

  // -------------------------------------------------------------------------
  // Native video error callback
  // -------------------------------------------------------------------------
  const handleError = useCallback((errorMessage: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsLoading(false);
    setHasError(true);
    if (__DEV__) {
      console.warn('[VideoPlayer] native error:', errorMessage);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Sync mute state (still needs setStatusAsync — mute has no Video prop race)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.setStatusAsync({ isMuted }).catch(() => {});
  }, [isMuted]);

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      videoRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  // -------------------------------------------------------------------------
  // Retry handler
  // -------------------------------------------------------------------------
  const handleRetry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  // -------------------------------------------------------------------------
  // Animated styles
  // -------------------------------------------------------------------------
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: thumbOpacity.value,
  }));

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* ------------------------------------------------------------------ */}
      {/* Video — shouldPlay is the single source of truth for play/pause.   */}
      {/* No duplicate setStatusAsync({ shouldPlay }) effect needed.          */}
      {/* ------------------------------------------------------------------ */}
      {!hasError && (
        <Video
          key={retryKey}
          ref={videoRef}
          source={{ uri: mediaUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          isLooping
          isMuted={isMuted}
          shouldPlay={isActive}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          onError={handleError}
          useNativeControls={false}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Thumbnail overlay — fades out when the first frame is ready        */}
      {/* ------------------------------------------------------------------ */}
      {thumbUrl && (
        <Animated.View
          style={[StyleSheet.absoluteFill, thumbStyle]}
          pointerEvents="none"
        >
          <Image
            source={{ uri: thumbUrl }}
            style={styles.thumb}
            resizeMode="cover"
          />

          {/* Pulse shimmer overlay on top of the thumb while loading */}
          {isLoading && (
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.skeletonOverlay, pulseStyle]}
              pointerEvents="none"
            />
          )}
        </Animated.View>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Skeleton placeholder — shown when loading and no thumb available   */}
      {/* ------------------------------------------------------------------ */}
      {isLoading && !thumbUrl && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.skeleton, pulseStyle]}
          pointerEvents="none"
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Error state with retry button                                       */}
      {/* ------------------------------------------------------------------ */}
      {hasError && (
        <View className="absolute inset-0 items-center justify-center">
          <Pressable
            onPress={handleRetry}
            className="items-center justify-center gap-2"
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Reîncarcă video"
          >
            <View className="items-center justify-center rounded-full bg-black/50 p-4">
              <Ionicons name="refresh" size={28} color="#fff" />
            </View>
            <Text className="text-white text-xs font-medium opacity-80">
              Tap to retry
            </Text>
          </Pressable>
        </View>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Mute / unmute pill button                                           */}
      {/* ------------------------------------------------------------------ */}
      {!hasError && (
        <Pressable
          onPress={onMuteToggle}
          className="absolute bottom-3 right-3 flex-row items-center justify-center"
          style={styles.mutePill}
        >
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-medium'}
            size={16}
            color="#fff"
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  // Translucent shimmer overlay rendered on top of the thumbnail
  skeletonOverlay: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 0,
  },
  // Full-area skeleton when no thumbnail is available
  skeleton: {
    backgroundColor: '#1a1a1a',
  },
  mutePill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
