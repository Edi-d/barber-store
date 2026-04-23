import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOutDown,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brand, Typography, Bubble, Shadows, Spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  points: number;
  source: string;
  onDismiss: () => void;
}

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const COUNT_STEPS = 20;
const COUNT_DURATION = 1200;
const AUTO_DISMISS_MS = 4000;

const SUBTITLES: Record<string, string> = {
  appointment:         'Programare finalizata',
  order:               'Comanda platita',
  voucher:             'Voucher generat',
  reverse:             'Stornare',
  reverse_appointment: 'Stornare programare',
  reverse_order:       'Stornare comanda',
  bonus:               'Bonus primit',
  adjustment:          'Ajustare cont',
};

export function PointsEarnedToast({ visible, points, source, onDismiss }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const subtitle = SUBTITLES[source] ?? 'Puncte primite';

  // Count-up animation
  useEffect(() => {
    if (!visible || points <= 0) {
      setDisplayed(points);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const step = Math.max(1, Math.ceil(points / COUNT_STEPS));
    const intervalMs = Math.floor(COUNT_DURATION / COUNT_STEPS);
    let current = 0;
    setDisplayed(0);
    intervalRef.current = setInterval(() => {
      current = Math.min(points, current + step);
      setDisplayed(current);
      if (current >= points && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible, points]);

  // Auto-dismiss
  useEffect(() => {
    if (!visible) return;
    dismissTimerRef.current = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(350).easing(SMOOTH)}
      exiting={FadeOutDown.duration(250)}
      style={[styles.wrap, { bottom: 100 + insets.bottom }]}
      pointerEvents="box-none"
    >
      <Pressable onPress={onDismiss}>
        <LinearGradient
          colors={[Brand.gradientStart, Brand.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.card}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="trophy" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title}>Ai castigat puncte!</Text>
            <Text style={styles.value}>+{displayed.toLocaleString('ro-RO')} puncte</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
    zIndex: 9999,
    ...Shadows.glow,
  },
  card: {
    ...Bubble.radiiSm,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  iconWrap: {
    width: 44,
    height: 44,
    ...Bubble.radiiSm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: {
    ...Typography.captionSemiBold,
    color: 'rgba(255,255,255,0.9)',
  },
  value: {
    ...Typography.h3,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  subtitle: {
    ...Typography.small,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
});
