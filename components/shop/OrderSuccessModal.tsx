import { useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';

import { Brand, Bubble, Colors, Shadows, Spacing, Typography } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

const PARTICLE_COUNT = 24;

type Particle = {
  id: number;
  x: number;
  size: number;
  color: string;
  delay: number;
};

const CONFETTI_COLORS = [
  Brand.gradientStart,
  Brand.gradientEnd,
  '#22C55E',
  '#F59E0B',
  '#8B5CF6',
  Brand.primary,
];

function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    size: 4 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 600,
  }));
}

/* ─── Confetti Particle ─── */
function ConfettiParticle({ particle }: { particle: Particle }) {
  const translateY = useSharedValue(-20);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    const dur = 1200 + Math.random() * 800;
    opacity.value = withDelay(
      particle.delay,
      withSequence(
        withTiming(0.8, { duration: 200, easing: SMOOTH }),
        withDelay(dur - 400, withTiming(0, { duration: 400, easing: SMOOTH })),
      ),
    );
    translateY.value = withDelay(
      particle.delay,
      withTiming(SCREEN_HEIGHT * 0.6, { duration: dur, easing: Easing.in(Easing.quad) }),
    );
    rotate.value = withDelay(
      particle.delay,
      withTiming(180 + Math.random() * 360, { duration: dur, easing: SMOOTH }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: particle.x,
          width: particle.size,
          height: particle.size * 1.4,
          backgroundColor: particle.color,
          borderRadius: particle.size * 0.3,
        },
        style,
      ]}
    />
  );
}

/* ─── Main Modal ─── */
type Props = {
  visible: boolean;
  orderNumber: string;
  onViewOrders: () => void;
  onContinueShopping: () => void;
};

export function OrderSuccessModal({
  visible,
  orderNumber,
  onViewOrders,
  onContinueShopping,
}: Props) {
  const backdropOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.9);
  const contentOpacity = useSharedValue(0);
  const checkScale = useSharedValue(0);
  const checkOpacity = useSharedValue(0);

  const particles = useMemo(() => (visible ? generateParticles() : []), [visible]);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 300, easing: SMOOTH });
      contentOpacity.value = withDelay(100, withTiming(1, { duration: 350, easing: SMOOTH }));
      contentScale.value = withDelay(100, withTiming(1, { duration: 350, easing: SMOOTH }));
      checkOpacity.value = withDelay(300, withTiming(1, { duration: 300, easing: SMOOTH }));
      checkScale.value = withDelay(
        300,
        withSequence(
          withTiming(1.15, { duration: 250, easing: SMOOTH }),
          withTiming(1, { duration: 200, easing: SMOOTH }),
        ),
      );
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200, easing: SMOOTH });
      contentOpacity.value = withTiming(0, { duration: 150, easing: SMOOTH });
      contentScale.value = withTiming(0.9, { duration: 150, easing: SMOOTH });
      checkScale.value = 0;
      checkOpacity.value = 0;
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0 ? ('auto' as const) : ('none' as const),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ scale: contentScale.value }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: checkScale.value }],
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Confetti */}
      {particles.map((p) => (
        <ConfettiParticle key={p.id} particle={p} />
      ))}

      {/* Content */}
      <Animated.View style={[styles.centerContainer, contentStyle]}>
        <View
          style={[
            styles.modalCard,
            Shadows.glass,
            {
              backgroundColor: 'rgba(255,255,255,0.92)',
              borderColor: 'rgba(255,255,255,0.7)',
            },
          ]}
        >
          {/* Checkmark */}
          <Animated.View style={[styles.checkCircle, checkStyle]}>
            <LinearGradient
              colors={['#22C55E', '#16A34A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.checkGradient}
            >
              <Feather name="check" size={44} color="#fff" />
            </LinearGradient>
          </Animated.View>

          {/* Title */}
          <Text style={[styles.successTitle, { color: Colors.text }]}>
            Comanda plasata!
          </Text>

          {/* Message */}
          <Text style={[styles.successMessage, { color: Colors.textSecondary }]}>
            Comanda ta a fost plasata cu succes!
          </Text>

          {/* Order number */}
          <View style={[styles.orderNumberBadge, { backgroundColor: Brand.primaryMuted }]}>
            <Feather name="hash" size={14} color={Brand.primary} />
            <Text style={[styles.orderNumberText, { color: Brand.primary }]}>
              {orderNumber}
            </Text>
          </View>

          {/* Info */}
          <Text style={[styles.infoText, { color: Colors.textTertiary }]}>
            Vei fi notificat cand comanda isi schimba statusul
          </Text>

          {/* Buttons */}
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onViewOrders}
              style={Shadows.glow}
            >
              <LinearGradient
                colors={[Brand.gradientStart, Brand.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryButton}
              >
                <Feather name="list" size={17} color="#fff" />
                <Text style={styles.primaryButtonText}>Vezi comenzile</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onContinueShopping}
              style={[
                styles.secondaryButton,
                { borderColor: Colors.inputBorder },
              ]}
            >
              <Feather name="shopping-bag" size={17} color={Colors.text} />
              <Text style={[styles.secondaryButtonText, { color: Colors.text }]}>
                Continua cumparaturile
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  particle: {
    position: 'absolute',
    top: -10,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    ...Bubble.radiiLg,
    borderWidth: 1,
    padding: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.md,
  },

  /* ── Checkmark ── */
  checkCircle: {
    marginBottom: Spacing.sm,
  },
  checkGradient: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Text ── */
  successTitle: {
    ...Typography.h2,
    textAlign: 'center',
  },
  successMessage: {
    ...Typography.body,
    textAlign: 'center',
  },

  /* ── Order number ── */
  orderNumberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    ...Bubble.radiiSm,
  },
  orderNumberText: {
    ...Typography.captionSemiBold,
    fontSize: 15,
    letterSpacing: 1,
  },

  /* ── Info ── */
  infoText: {
    ...Typography.small,
    textAlign: 'center',
  },

  /* ── Buttons ── */
  buttonGroup: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
    ...Bubble.radii,
  },
  primaryButtonText: {
    ...Typography.button,
    color: '#fff',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base - 1,
    borderWidth: 1.5,
    ...Bubble.radii,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  secondaryButtonText: {
    ...Typography.button,
  },
});
