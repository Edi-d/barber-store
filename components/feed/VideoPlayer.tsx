import { useRef, useEffect, useCallback, useState } from 'react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { Image } from '@/components/ui/Image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
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
// VideoPlayer — expo-video (SDK 54+). expo-av was removed; this uses the
// useVideoPlayer/VideoView API. The player drives play/pause via isActive,
// and we watch its `statusChange` event to fade the thumb / surface errors.
// ---------------------------------------------------------------------------
export function VideoPlayer({
  mediaUrl,
  thumbUrl,
  isActive,
  isMuted,
  onMuteToggle,
}: VideoPlayerProps) {
  const [timedOut, setTimedOut] = useState(false);
  const thumbOpacity = useSharedValue(1);
  const pulseStyle = usePulse();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create (and auto-release) the player. Looping + initial mute are set once.
  const player = useVideoPlayer(mediaUrl, (p) => {
    p.loop = true;
    p.muted = isMuted;
  });

  // Latest player status: 'idle' | 'loading' | 'readyToPlay' | 'error'.
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  const isReady = status === 'readyToPlay';
  const hasError = status === 'error' || timedOut;
  const isLoading = !isReady && !hasError;

  // -------------------------------------------------------------------------
  // Play when this card is the active one; pause otherwise.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  // -------------------------------------------------------------------------
  // Keep mute in sync with the parent-controlled prop.
  // -------------------------------------------------------------------------
  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  // -------------------------------------------------------------------------
  // Fade the thumbnail out once the first frame is ready.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isReady) {
      thumbOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [isReady, thumbOpacity]);

  // -------------------------------------------------------------------------
  // 10-second safety timeout: if the player never reaches readyToPlay, show
  // the retry affordance instead of an indefinite spinner.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isLoading) {
      timeoutRef.current = setTimeout(() => setTimedOut(true), 10_000);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isLoading]);

  // -------------------------------------------------------------------------
  // Retry — reload the source and resume if active.
  // -------------------------------------------------------------------------
  const handleRetry = useCallback(() => {
    setTimedOut(false);
    thumbOpacity.value = 1;
    player.replace(mediaUrl);
    if (isActive) player.play();
  }, [player, mediaUrl, isActive, thumbOpacity]);

  const thumbStyle = useAnimatedStyle(() => ({
    opacity: thumbOpacity.value,
  }));

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* Video surface — play/pause is driven by the player, not props. */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {/* Thumbnail overlay — fades out when the first frame is ready */}
      {thumbUrl && (
        <Animated.View
          style={[StyleSheet.absoluteFill, thumbStyle]}
          pointerEvents="none"
        >
          <Image
            source={{ uri: thumbUrl }}
            style={styles.thumb}
            contentFit="cover"
          />
        </Animated.View>
      )}

      {/* Skeleton placeholder — shown when loading and no thumb available */}
      {isLoading && !thumbUrl && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.skeleton, pulseStyle]}
          pointerEvents="none"
        />
      )}

      {/* Error state with retry button */}
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

      {/* Mute / unmute pill button */}
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
