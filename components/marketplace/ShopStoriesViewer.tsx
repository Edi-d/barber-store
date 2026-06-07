/**
 * ShopStoriesViewer — full-screen promo-story viewer for the shop section.
 *
 * A deliberately lean viewer for the flat, image-only nop promo stories (the
 * social StoryViewer is grouped-by-author + video + auth-bound and doesn't fit).
 * Core loop: progress bars + auto-advance + tap-to-skip.
 *
 *   • Progress: one segment per story; the active one animates width 0→100% over
 *     DURATION_MS (linear). Done = 100%, upcoming = 0.
 *   • Auto-advance: a timer started when the image's onLoad fires (NOT on index
 *     change) so the bar never runs ahead of a still-loading image.
 *   • Skip: full-screen press — left half → prev, right half → next.
 *   • Close: next past the last story calls onClose(); ✕ button also closes.
 *   • Tap-through: routable stories show a CTA that opens the link and closes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { ShopStorySlide } from '@/hooks/use-shop-stories';
import { Brand, FontFamily } from '@/constants/theme';

const DURATION_MS = 5000;

type Props = {
  visible: boolean;
  stories: ShopStorySlide[];
  initialIndex?: number;
  onClose: () => void;
};

export function ShopStoriesViewer({
  visible,
  stories,
  initialIndex = 0,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageLoaded, setImageLoaded] = useState(false);
  const progress = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Reset to the requested start index each time the viewer opens.
  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      setImageLoaded(false);
      progress.value = 0;
    }
  }, [visible, initialIndex, progress]);

  const goNext = useCallback(() => {
    clearTimer();
    cancelAnimation(progress);
    if (currentIndex < stories.length - 1) {
      progress.value = 0;
      setImageLoaded(false); // forces the timer to wait for the next onLoad
      setCurrentIndex((i) => i + 1);
    } else {
      onClose();
    }
  }, [clearTimer, currentIndex, stories.length, onClose, progress]);

  const goPrev = useCallback(() => {
    clearTimer();
    cancelAnimation(progress);
    progress.value = 0;
    setImageLoaded(false);
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, [clearTimer, progress]);

  // Timer + progress bar start ONLY once the current image has loaded.
  useEffect(() => {
    if (!visible || !imageLoaded) return;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: DURATION_MS,
      easing: Easing.linear,
    });
    timer.current = setTimeout(goNext, DURATION_MS);
    return clearTimer;
  }, [imageLoaded, visible, currentIndex, goNext, clearTimer, progress]);

  const handleTap = useCallback(
    (evt: GestureResponderEvent) => {
      if (evt.nativeEvent.locationX < screenWidth / 2) goPrev();
      else goNext();
    },
    [screenWidth, goPrev, goNext],
  );

  const current = stories[currentIndex];

  const handleCtaPress = useCallback(() => {
    if (!current?.route) return;
    clearTimer();
    onClose();
    router.push(current.route as never);
  }, [current?.route, clearTimer, onClose, router]);

  const activeBarStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  if (!visible || stories.length === 0 || !current) return null;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent transparent={false}>
      <View style={styles.container}>
        {/* Tap zone — left half = prev, right half = next */}
        <TouchableWithoutFeedback onPress={handleTap}>
          <View style={StyleSheet.absoluteFill}>
            <Image
              key={current.id}
              source={{ uri: current.imageUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onLoad={() => setImageLoaded(true)}
            />
          </View>
        </TouchableWithoutFeedback>

        {/* Top overlay — progress bars + close, outside the tap zone */}
        <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.progressRow}>
            {stories.map((s, i) => (
              <View key={s.id} style={styles.progressTrack}>
                {i < currentIndex ? (
                  <View style={[styles.progressFill, styles.progressFull]} />
                ) : i === currentIndex ? (
                  <Animated.View style={[styles.progressFill, activeBarStyle]} />
                ) : null}
              </View>
            ))}
          </View>

          <View style={styles.headerRow}>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="x" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Tap-through CTA — only for routable stories. Honors CMS colors. */}
        {current.route ? (
          <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 24 }]} pointerEvents="box-none">
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.cta, { backgroundColor: current.buttonColor ?? Brand.primary }]}
              onPress={handleCtaPress}
            >
              <Text style={[styles.ctaText, { color: current.textColor ?? '#fff' }]}>
                VEZI ACUM
              </Text>
              <Feather name="arrow-up-right" size={16} color={current.textColor ?? '#fff'} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  progressFull: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: Brand.primary,
  },
  ctaText: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    letterSpacing: 0.6,
    color: '#fff',
  },
});
