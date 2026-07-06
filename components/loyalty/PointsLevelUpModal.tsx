import { useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Bubble, Shadows } from '@/constants/theme';
import { levelColorWithAlpha, type LevelConfig } from '@/constants/loyalty';
import { TierBadge } from '@/components/loyalty/TierBadge';

const { width: SCREEN_W } = Dimensions.get('window');
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

interface PointsLevelUpModalProps {
  visible: boolean;
  from: LevelConfig;
  to: LevelConfig;
  onDismiss: () => void;
}

export function PointsLevelUpModal({ visible, from, to, onDismiss }: PointsLevelUpModalProps) {
  const insets = useSafeAreaInsets();
  const confettiRef = useRef<ConfettiCannon>(null);

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

  const fireConfetti = useCallback(() => {
    confettiRef.current?.start();
  }, []);

  useEffect(() => {
    if (!visible) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

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

    overlayOpacity.value = withTiming(1, { duration: 400, ...cfg });

    badgeScale.value = withDelay(200, withTiming(1, { duration: 600, ...cfg }));
    badgeOpacity.value = withDelay(200, withTiming(1, { duration: 400, ...cfg }));

    glowScale.value = withDelay(300, withTiming(1, { duration: 800, ...cfg }));
    glowOpacity.value = withDelay(300, withRepeat(
      withSequence(
        withTiming(0.6, { duration: 400, ...cfg }),
        withTiming(0.2, { duration: 800, ...cfg }),
      ),
      -1,
      true,
    ));

    titleOpacity.value = withDelay(500, withTiming(1, { duration: 400, ...cfg }));
    titleTranslateY.value = withDelay(500, withTiming(0, { duration: 400, ...cfg }));

    subtitleOpacity.value = withDelay(650, withTiming(1, { duration: 400, ...cfg }));
    subtitleTranslateY.value = withDelay(650, withTiming(0, { duration: 400, ...cfg }));

    perksOpacity.value = withDelay(800, withTiming(1, { duration: 400, ...cfg }));
    perksTranslateY.value = withDelay(800, withTiming(0, { duration: 400, ...cfg }));

    buttonOpacity.value = withDelay(950, withTiming(1, { duration: 400, ...cfg }, () => {
      runOnJS(fireConfetti)();
    }));
    buttonTranslateY.value = withDelay(950, withTiming(0, { duration: 400, ...cfg }));
  }, [visible]);

  const handleDismiss = useCallback(() => {
    overlayOpacity.value = withTiming(0, { duration: 300, easing: SMOOTH }, () => {
      runOnJS(onDismiss)();
    });
  }, [onDismiss]);

  if (from.level === to.level) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleDismiss}>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <ConfettiCannon
          ref={confettiRef}
          count={100}
          origin={{ x: SCREEN_W / 2, y: 0 }}
          autoStart={false}
          fadeOut
          colors={[to.color, '#FFFFFF', '#FFD60A', '#0A66C2']}
          fallSpeed={2500}
          explosionSpeed={450}
        />

        <View
          style={[
            styles.content,
            { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 },
          ]}
        >
          <Animated.View
            style={[
              styles.glowRing,
              { borderColor: to.color + '40' },
              glowStyle,
            ]}
          />

          <Animated.View style={[styles.badgeContainer, Shadows.glow, badgeStyle]}>
            <TierBadge level={to.level} size="lg" />
          </Animated.View>

          <Animated.View style={[styles.titleBlock, titleStyle]}>
            <Text style={styles.levelUpLabel}>NIVEL NOU</Text>
            <Text style={[styles.levelTitle, { color: to.color }]}>{to.title}</Text>
          </Animated.View>

          <Animated.View style={subtitleStyle}>
            <Text style={styles.subtitle}>
              Felicitari! Ai avansat de la {from.title} la {to.title}!
            </Text>
          </Animated.View>

          <Animated.View style={[styles.perksCard, { borderColor: levelColorWithAlpha(to.color, 0.12) }, perksStyle]}>
            <Text style={styles.perksTitle}>Beneficii deblocate</Text>
            {to.perks.map((perk, idx) => (
              <View key={idx} style={styles.perkRow}>
                <View style={[styles.perkDot, { backgroundColor: to.color }]} />
                <Text style={styles.perkText}>{perk}</Text>
              </View>
            ))}
          </Animated.View>

          <Animated.View style={[styles.ctaWrapper, buttonStyle]}>
            <Pressable
              onPress={handleDismiss}
              className="self-stretch overflow-hidden"
              style={Bubble.radii}
            >
              <LinearGradient
                colors={[to.color, levelColorWithAlpha(to.color, 0.75)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.ctaButton, Shadows.glow]}
              >
                <Text style={[styles.ctaText, { color: to.textColor }]}>Continuă</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <Animated.View style={[styles.dotsRow, { opacity: buttonOpacity }]}>
            {[1, 2, 3, 4, 5].map((lvl) => (
              <View
                key={lvl}
                style={[
                  styles.levelDot,
                  {
                    backgroundColor:
                      lvl <= to.level ? to.color : 'rgba(255,255,255,0.15)',
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 15, 0.95)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  glowRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    top: '22%',
    alignSelf: 'center',
  },
  badgeContainer: {
    marginBottom: Spacing['2xl'],
  },
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
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },
  perksCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
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
  },
  perkText: {
    fontFamily: FontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.85)',
    flex: 1,
  },
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
    letterSpacing: 0.3,
  },
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
