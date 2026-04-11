import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { BarberService } from '@/types/database';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

// ─── Spring presets ───────────────────────────────────────────────────────────

const SPRING_ENTRANCE = {
  damping: 22,
  stiffness: 280,
  mass: 0.8,
} as const;

const SPRING_BADGE = {
  damping: 14,
  stiffness: 380,
  mass: 0.5,
} as const;

const SPRING_PRICE = {
  damping: 12,
  stiffness: 320,
  mass: 0.6,
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

interface BookingFloatingBarProps {
  selectedServices: BarberService[];
  onContinue: () => void;
  formatPrice: (cents: number, currency: string) => string;
}

export function BookingFloatingBar({
  selectedServices,
  onContinue,
  formatPrice,
}: BookingFloatingBarProps) {
  const insets = useSafeAreaInsets();

  // ── Derived values ──────────────────────────────────────────────────────────

  const { totalCents, totalMin, currency, count } = useMemo(() => {
    const cents = selectedServices.reduce((acc, s) => acc + s.price_cents, 0);
    const mins = selectedServices.reduce((acc, s) => acc + s.duration_min, 0);
    const cur = selectedServices[0]?.currency ?? 'RON';
    return { totalCents: cents, totalMin: mins, currency: cur, count: selectedServices.length };
  }, [selectedServices]);

  const isVisible = count > 0;

  // ── Shared values ───────────────────────────────────────────────────────────

  const translateY = useSharedValue(120);
  const priceScale = useSharedValue(1);
  const badgeScale = useSharedValue(1);

  // ── Entrance / exit ─────────────────────────────────────────────────────────

  useEffect(() => {
    translateY.value = withSpring(isVisible ? 0 : 120, SPRING_ENTRANCE);
    if (isVisible) {
      // .catch() is required: Haptics throws on simulators / devices that
      // do not support haptics, causing an unhandled promise rejection crash.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [isVisible]);

  // ── Price pulse when total changes ──────────────────────────────────────────

  useEffect(() => {
    if (!isVisible) return;
    priceScale.value = withSequence(
      withSpring(1.15, SPRING_PRICE),
      withSpring(1.0, SPRING_PRICE),
    );
  }, [totalCents]);

  // ── Badge scale when count changes ──────────────────────────────────────────

  useEffect(() => {
    if (!isVisible) return;
    badgeScale.value = withSequence(
      withSpring(1.25, SPRING_BADGE),
      withSpring(1.0, SPRING_BADGE),
    );
  }, [count]);

  // ── Animated styles ─────────────────────────────────────────────────────────

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const priceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: priceScale.value }],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  // ── Label helpers ───────────────────────────────────────────────────────────

  const serviceLabel = count === 1 ? '1 serviciu' : `${count} servicii`;
  const durationLabel = totalMin > 0 ? `~${totalMin} min` : '';
  const priceLabel = isVisible ? formatPrice(totalCents, currency) : '';

  // ── Bottom offset: respect safe-area but keep a minimum gap ────────────────

  const bottomOffset = Math.max(insets.bottom, 8) + 8;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Animated.View
      style={[styles.wrapper, { bottom: bottomOffset }, containerStyle]}
      pointerEvents={isVisible ? 'box-none' : 'none'}
    >
      {/* Top accent gradient line */}
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentLine}
      />

      {/* Glassmorphic background */}
      {Platform.OS === 'ios' ? (
        <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidFill]} />
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* ── Left: meta + price ── */}
        <View style={styles.leftSection}>
          {/* Service count badge */}
          <View style={styles.badgeRow}>
            <Animated.View style={[styles.countBadge, badgeStyle]}>
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.countBadgeGradient}
              >
                <Text style={styles.countBadgeText}>{count}</Text>
              </LinearGradient>
            </Animated.View>
            <Text style={styles.serviceLabel}>{serviceLabel}</Text>
          </View>

          {/* Duration */}
          {durationLabel ? (
            <Text style={styles.durationLabel}>{durationLabel}</Text>
          ) : null}

          {/* Price */}
          <Animated.Text style={[styles.priceText, priceStyle]}>
            {priceLabel}
          </Animated.Text>
        </View>

        {/* ── Right: continue button ── */}
        <View style={styles.rightSection}>
          <Button
            variant="primary"
            size="md"
            onPress={onContinue}
            style={styles.continueButton}
          >
            <View style={styles.buttonInner}>
              <Text style={styles.buttonLabel}>Continuă</Text>
              <Ionicons
                name="arrow-forward"
                size={17}
                color={Colors.white}
                style={styles.buttonIcon}
              />
            </View>
          </Button>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
    // Squircle shape
    ...Bubble.radii,
    // Glass shadow
    ...Shadows.glass,
    // Ensure the bar floats above scroll content
    zIndex: 100,
  },

  accentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 1,
  },

  androidFill: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },

  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 16, // extra top padding to clear the accent line
    minHeight: 72,
  },

  leftSection: {
    flex: 1,
    gap: 3,
  },

  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  countBadge: {
    // scale animation applied via Animated.View
  },

  countBadgeGradient: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  countBadgeText: {
    ...Typography.smallSemiBold,
    color: Colors.white,
    lineHeight: 14,
  },

  serviceLabel: {
    ...Typography.captionSemiBold,
    color: Colors.textSecondary,
  },

  durationLabel: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginLeft: 29, // aligns under the label, past the badge width (22) + gap (7)
  },

  priceText: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 20,
    lineHeight: 24,
    color: Colors.gradientStart,
    marginLeft: 29,
  },

  rightSection: {
    marginLeft: 12,
  },

  continueButton: {
    minWidth: 130,
  },

  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  buttonLabel: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.2,
    color: Colors.white,
  },

  buttonIcon: {
    marginTop: 1, // optical baseline alignment
  },
});
