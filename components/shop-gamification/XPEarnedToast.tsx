/**
 * XPEarnedToast
 *
 * Toast notification that appears when XP is earned.
 * Gold sparkle circle, animated "+XX XP" counter, scales up and auto-dismisses.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutUp,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import {
  Colors,
  Spacing,
  Shadows,
  Bubble,
  FontFamily,
} from '@/constants/theme';

// ─── Constants ──────────────────────────────────────────

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const AUTO_DISMISS_MS = 2500;
const COUNT_DURATION = 600;
const COUNT_STEPS = 12;

const TOAST_COLORS = {
  gold: '#FFB300',
  goldDark: '#FF8F00',
  goldLight: '#FFD54F',
  sparkle: '#FFF8E1',
  sparkleBorder: 'rgba(255, 179, 0, 0.3)',
};

// ─── Props ──────────────────────────────────────────────

interface XPEarnedToastProps {
  /** XP amount earned */
  xp: number;
  /** Whether the toast is visible */
  visible: boolean;
  /** Callback on dismiss */
  onDismiss?: () => void;
  /** Optional source label, e.g. "Comanda finalizata" */
  source?: string;
}

// ─── Component ──────────────────────────────────────────

export function XPEarnedToast({
  xp,
  visible,
  onDismiss,
  source,
}: XPEarnedToastProps) {
  const colors = Colors.light;
  const insets = useSafeAreaInsets();

  const [displayXP, setDisplayXP] = useState(0);
  const [show, setShow] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Sparkle scale pulse
  const sparkleScale = useSharedValue(1);
  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sparkleScale.value }],
  }));

  const handleDismiss = useCallback(() => {
    setShow(false);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    if (visible && xp > 0) {
      setShow(true);
      setDisplayXP(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Sparkle pulse
      sparkleScale.value = withSequence(
        withTiming(1.2, { duration: 200, easing: SMOOTH }),
        withTiming(0.95, { duration: 150, easing: SMOOTH }),
        withTiming(1, { duration: 250, easing: SMOOTH }),
      );

      // Counting animation
      countTimers.current.forEach(clearTimeout);
      countTimers.current = [];

      for (let i = 1; i <= COUNT_STEPS; i++) {
        const timer = setTimeout(() => {
          const progress = i / COUNT_STEPS;
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplayXP(Math.round(xp * eased));
        }, (COUNT_DURATION / COUNT_STEPS) * i);
        countTimers.current.push(timer);
      }

      // Auto-dismiss
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        setShow(false);
        onDismiss?.();
      }, AUTO_DISMISS_MS);
    } else {
      setShow(false);
    }

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      countTimers.current.forEach(clearTimeout);
    };
  }, [visible, xp]);

  if (!show) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(400).easing(SMOOTH).withInitialValues({ transform: [{ translateY: -12 }] })}
      exiting={FadeOutUp.duration(300).easing(SMOOTH)}
      style={[
        styles.container,
        Shadows.lg,
        { top: insets.top + Spacing.sm },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        {/* Main content row */}
        <View style={styles.mainRow}>
          {/* Gold sparkle circle */}
          <Animated.View style={[styles.sparkleCircle, sparkleStyle]}>
            <Feather name="zap" size={20} color={TOAST_COLORS.gold} />
          </Animated.View>

          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.textSecondary }]}>
              {source ?? 'Ai castigat XP!'}
            </Text>
            <View style={styles.xpRow}>
              <Text style={styles.xpValue}>
                +{displayXP.toLocaleString('ro-RO')}
              </Text>
              <Text style={[styles.xpLabel, { color: colors.textSecondary }]}>
                {' '}XP
              </Text>
            </View>
          </View>

          {/* Dismiss — NativeWind className for Pressable layout, Bubble.radiiSm for asymmetric close shape */}
          <Pressable
            onPress={handleDismiss}
            hitSlop={12}
            className="p-1 -mr-1 items-center justify-center"
            style={[styles.dismissBtn, Bubble.radiiSm]}
          >
            <Feather name="x" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 9999,
  },

  card: {
    ...Bubble.radii,
    ...Bubble.accent,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: TOAST_COLORS.sparkleBorder,
    padding: Spacing.base,
    borderBottomColor: 'rgba(255, 179, 0, 0.25)',
  },

  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sparkleCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TOAST_COLORS.sparkle,
    borderWidth: 1,
    borderColor: TOAST_COLORS.sparkleBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  xpValue: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    color: TOAST_COLORS.goldDark,
  },
  xpLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    lineHeight: 28,
  },
  dismissBtn: {
    width: 26,
    height: 26,
  },
});
