/**
 * LevelUpModal — web fallback
 *
 * Mirrors LevelUpModal.tsx exactly, except react-native-confetti-cannon is
 * replaced with an emoji-sparkle effect (same pattern as TierUpModal.web.tsx).
 * All Reanimated animations are preserved — they work on web.
 *
 * Mobile (iOS/Android) loads LevelUpModal.tsx — this file is web-only.
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';

import { FontFamily, Spacing, Bubble, Shadows } from '@/constants/theme';
import { getLevelTitle } from './XPProgressBar';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

// ─── Gold palette ───────────────────────────────────────

const GOLD = {
  light: '#FFD54F',
  main: '#FFB300',
  dark: '#FF8F00',
  amber: '#F57C00',
};

// ─── Level perks ────────────────────────────────────────

const LEVEL_PERKS: Record<number, string[]> = {
  2: [
    'Acces la oferte exclusive',
    'Produse recompensa deblocate',
  ],
  3: [
    'Multiplicator XP x1.2',
    'Acces anticipat la produse noi',
    'Recompense extra la comenzi',
  ],
  4: [
    'Multiplicator XP x1.5',
    'Livrare gratuita o data pe luna',
    'Produse exclusive deblocate',
  ],
  5: [
    'Multiplicator XP x1.8',
    'Acces la produse premium',
    'Recompense speciale la comenzi',
    'Cadou surpriza lunar',
  ],
  6: [
    'Multiplicator XP x2.0',
    'Livrare gratuita nelimitata',
    'Produse premium deblocate',
    'Prioritate la stoc limitat',
  ],
  7: [
    'Multiplicator XP x2.2',
    'Acces VIP la lansari',
    'Recompense VIP la comenzi',
    'Consultanta personalizata',
  ],
  8: [
    'Multiplicator XP x2.5',
    'Produse exclusive deblocate',
    'Toate beneficiile deblocate',
    'Pachet premium aniversar',
  ],
  9: [
    'Multiplicator XP x2.8',
    'Recompense exclusive Erou',
    'Produse limitate deblocate',
  ],
  10: [
    'Multiplicator XP x3.0',
    'Toate produsele deblocate',
    'Toate recompensele deblocate',
    'Statut VIP permanent',
  ],
};

function getPerksForLevel(level: number): string[] {
  return LEVEL_PERKS[level] ?? [
    'Noi beneficii deblocate',
    'Noi recompense disponibile',
  ];
}

// ─── Sparkle types ──────────────────────────────────────

interface Sparkle {
  id: number;
  x: number;
  y: number;
  emoji: string;
  size: number;
}

const SPARKLE_EMOJIS = ['✨', '🌟', '💫', '🎊', '🏆'];

function generateSparkles(count: number): Sparkle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_W,
    y: Math.random() * (SCREEN_H * 0.55),
    emoji: SPARKLE_EMOJIS[i % SPARKLE_EMOJIS.length],
    size: 14 + Math.random() * 22,
  }));
}

// ─── Props ──────────────────────────────────────────────

interface LevelUpModalProps {
  visible: boolean;
  /** The new level the user just reached */
  newLevel: number;
  /** Callback when modal is dismissed */
  onDismiss: () => void;
}

// ─── Component ──────────────────────────────────────────

export function LevelUpModal({ visible, newLevel, onDismiss }: LevelUpModalProps) {
  const insets = useSafeAreaInsets();
  const title = getLevelTitle(newLevel);
  const perks = getPerksForLevel(newLevel);

  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const sparkleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reanimated shared values ──
  const overlayOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0.3);
  const badgeOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(16);
  const perksOpacity = useSharedValue(0);
  const perksTranslateY = useSharedValue(16);
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(16);

  // ── Animated styles ──
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badgeOpacity.value,
    transform: [{ scale: badgeScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));
  const perksStyle = useAnimatedStyle(() => ({
    opacity: perksOpacity.value,
    transform: [{ translateY: perksTranslateY.value }],
  }));
  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));

  const fireSparkles = useCallback(() => {
    if (sparkleTimerRef.current) clearTimeout(sparkleTimerRef.current);
    setSparkles(generateSparkles(16));
    sparkleTimerRef.current = setTimeout(() => setSparkles([]), 2000);
  }, []);

  useEffect(() => {
    if (!visible) {
      setSparkles([]);
      return;
    }

    // Reset all values
    overlayOpacity.value = 0;
    badgeScale.value = 0.3;
    badgeOpacity.value = 0;
    glowScale.value = 0;
    glowOpacity.value = 0;
    titleOpacity.value = 0;
    titleTranslateY.value = 20;
    subtitleOpacity.value = 0;
    subtitleTranslateY.value = 16;
    perksOpacity.value = 0;
    perksTranslateY.value = 16;
    buttonOpacity.value = 0;
    buttonTranslateY.value = 16;

    const cfg = { easing: SMOOTH };

    // 1. Overlay fade in
    overlayOpacity.value = withTiming(1, { duration: 400, ...cfg });

    // 2. Badge entrance (after overlay starts)
    badgeScale.value = withDelay(200, withTiming(1, { duration: 600, ...cfg }));
    badgeOpacity.value = withDelay(200, withTiming(1, { duration: 400, ...cfg }));

    // 3. Glow ring expand + pulse
    glowScale.value = withDelay(300, withTiming(1, { duration: 800, ...cfg }));
    glowOpacity.value = withDelay(300, withRepeat(
      withSequence(
        withTiming(0.6, { duration: 400, ...cfg }),
        withTiming(0.2, { duration: 800, ...cfg }),
      ),
      -1,
      true,
    ));

    // 4. Text reveals with staggered delays
    titleOpacity.value = withDelay(500, withTiming(1, { duration: 400, ...cfg }));
    titleTranslateY.value = withDelay(500, withTiming(0, { duration: 400, ...cfg }));

    subtitleOpacity.value = withDelay(650, withTiming(1, { duration: 400, ...cfg }));
    subtitleTranslateY.value = withDelay(650, withTiming(0, { duration: 400, ...cfg }));

    perksOpacity.value = withDelay(800, withTiming(1, { duration: 400, ...cfg }));
    perksTranslateY.value = withDelay(800, withTiming(0, { duration: 400, ...cfg }));

    buttonOpacity.value = withDelay(950, withTiming(1, { duration: 400, ...cfg }, () => {
      // Fire sparkles once the button is fully visible (mirrors confetti timing)
      runOnJS(fireSparkles)();
    }));
    buttonTranslateY.value = withDelay(950, withTiming(0, { duration: 400, ...cfg }));

    return () => {
      if (sparkleTimerRef.current) clearTimeout(sparkleTimerRef.current);
    };
  }, [visible]);

  const handleDismiss = useCallback(() => {
    setSparkles([]);
    overlayOpacity.value = withTiming(0, { duration: 300, easing: SMOOTH }, () => {
      runOnJS(onDismiss)();
    });
  }, [onDismiss]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleDismiss}>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        {/* Emoji sparkles — web-only confetti replacement */}
        {sparkles.map((s) => (
          <Text
            key={s.id}
            style={[styles.sparkle, { left: s.x, top: s.y, fontSize: s.size }]}
            accessibilityElementsHidden
          >
            {s.emoji}
          </Text>
        ))}

        <View
          style={[
            styles.content,
            { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 },
          ]}
        >
          {/* Glow ring */}
          <Animated.View
            style={[
              styles.glowRing,
              { borderColor: GOLD.main + '40' },
              glowStyle,
            ]}
          />

          {/* Badge */}
          <Animated.View style={[styles.badgeContainer, Shadows.glow, badgeStyle]}>
            <LinearGradient
              colors={[GOLD.light, GOLD.main, GOLD.amber]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.badgeGradient}
            >
              <View style={styles.badgeInner}>
                <Text style={styles.badgeLevelNumber}>{newLevel}</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Title */}
          <Animated.View style={[styles.titleBlock, titleStyle]}>
            <Text style={styles.levelUpLabel}>NIVEL NOU</Text>
            <Text style={styles.levelTitle}>{title}</Text>
          </Animated.View>

          {/* Subtitle */}
          <Animated.View style={subtitleStyle}>
            <Text style={styles.subtitle}>
              Felicitari! Ai avansat la nivelul {newLevel}!
            </Text>
          </Animated.View>

          {/* Perks card */}
          <Animated.View style={[styles.perksCard, perksStyle]}>
            <Text style={styles.perksTitle}>Beneficii deblocate</Text>
            {perks.map((perk, idx) => (
              <View key={idx} style={styles.perkRow}>
                <View style={styles.perkDot} />
                <Text style={styles.perkText}>{perk}</Text>
              </View>
            ))}
          </Animated.View>

          {/* CTA */}
          <Animated.View style={[styles.ctaWrapper, buttonStyle]}>
            <Pressable
              onPress={handleDismiss}
              className="self-stretch overflow-hidden"
              style={Bubble.radii}
            >
              <LinearGradient
                colors={[GOLD.main, GOLD.amber]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.ctaButton, Shadows.glow]}
              >
                <Text style={styles.ctaText}>Continua</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Level dots */}
          <Animated.View style={[styles.dotsRow, { opacity: buttonOpacity }]}>
            {Array.from({ length: 10 }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.levelDot,
                  {
                    backgroundColor:
                      i < newLevel ? GOLD.main : 'rgba(255,255,255,0.15)',
                  },
                ]}
              />
            ))}
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 15, 0.95)',
  },
  sparkle: {
    position: 'absolute',
    userSelect: 'none',
  } as any,
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },

  // Glow ring
  glowRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    top: '22%',
    alignSelf: 'center',
  },

  // Badge
  badgeContainer: {
    marginBottom: Spacing['2xl'],
  },
  badgeGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInner: {
    width: 114,
    height: 114,
    borderRadius: 57,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLevelNumber: {
    fontFamily: FontFamily.bold,
    fontSize: 48,
    color: '#FFFFFF',
    lineHeight: 56,
  },

  // Title
  titleBlock: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  levelUpLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  levelTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 36,
    color: GOLD.main,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },

  // Subtitle
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },

  // Perks card
  perksCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.12)',
    ...Bubble.radii,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing['2xl'],
  },
  perksTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: Spacing.md,
  },
  perkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD.main,
  },
  perkText: {
    fontFamily: FontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.85)',
    flex: 1,
  },

  // CTA
  ctaWrapper: {
    width: '100%',
    paddingHorizontal: Spacing['2xl'],
  },
  ctaButton: {
    height: 52,
    ...Bubble.radii,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 17,
    color: '#000000',
    letterSpacing: 0.3,
  },

  // Level dots
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  levelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
