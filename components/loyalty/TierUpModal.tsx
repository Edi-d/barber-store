import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';
import { LEVEL_CONFIG, levelColorWithAlpha } from '@/constants/loyalty';
import { TierBadge } from './TierBadge';
import {
  Typography,
  Spacing,
  Bubble,
  Shadows,
  Brand,
  Colors,
  FontFamily,
} from '@/constants/theme';

interface Props {
  visible: boolean;
  fromLevel: number;
  toLevel: number;
  onClose: () => void;
}

const { width: SCREEN_W } = Dimensions.get('window');
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

export function TierUpModal({ visible, fromLevel, toLevel, onClose }: Props) {
  const confettiRef = useRef<ConfettiCannon>(null);
  const toCfg = LEVEL_CONFIG[toLevel];
  const fromCfg = LEVEL_CONFIG[fromLevel];

  useEffect(() => {
    if (visible && toCfg && fromCfg && fromLevel !== toLevel) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const t = setTimeout(() => confettiRef.current?.start(), 100);
      return () => clearTimeout(t);
    }
  }, [visible, toCfg, fromCfg, fromLevel, toLevel]);

  if (!toCfg || !fromCfg || fromLevel === toLevel) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(250)}
        exiting={FadeOut.duration(200)}
        style={styles.overlay}
      >
        <View style={styles.card}>
          {/* NIVEL NOU label */}
          <Animated.View entering={FadeInDown.delay(200).duration(500).easing(SMOOTH)}>
            <Text style={styles.label}>NIVEL NOU</Text>
          </Animated.View>

          {/* Big tier badge */}
          <Animated.View entering={FadeInDown.delay(300).duration(600).easing(SMOOTH)} style={styles.badgeWrap}>
            <TierBadge level={toLevel} size="lg" />
          </Animated.View>

          {/* Tier name */}
          <Animated.Text
            entering={FadeInDown.delay(450).duration(500).easing(SMOOTH)}
            style={[styles.tierName, { color: toCfg.color }]}
          >
            {toCfg.title}
          </Animated.Text>

          {/* Subtitle */}
          <Animated.Text
            entering={FadeInDown.delay(550).duration(500).easing(SMOOTH)}
            style={styles.subtitle}
          >
            Felicitari! Ai avansat de la {fromCfg.title} la {toCfg.title}.
          </Animated.Text>

          {/* Benefits section */}
          <Animated.View
            entering={FadeInDown.delay(700).duration(500).easing(SMOOTH)}
            style={styles.benefitsWrap}
          >
            <Text style={styles.benefitsHeader}>Beneficii noi</Text>
            <View style={styles.chipsRow}>
              {toCfg.perks.map((p, i) => (
                <View
                  key={i}
                  style={[
                    styles.chip,
                    { backgroundColor: levelColorWithAlpha(toCfg.color, 0.08) },
                  ]}
                >
                  <Text style={styles.chipText}>{p}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Continue button — brand gradient, not tier color */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.buttonWrap, { opacity: pressed ? 0.88 : 1 }]}
          >
            <LinearGradient
              colors={[Brand.gradientStart, Brand.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonLabel}>Continua</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <ConfettiCannon
          ref={confettiRef}
          count={120}
          origin={{ x: SCREEN_W / 2, y: 0 }}
          autoStart={false}
          fadeOut
          explosionSpeed={550}
          fallSpeed={2800}
          colors={[toCfg.color, '#FFFFFF', '#0A66C2', '#FFD60A']}
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.white,
    ...Bubble.radiiLg,
    ...Shadows.glow,
    padding: 28,
    alignItems: 'center',
  },
  label: {
    ...Typography.smallSemiBold,
    letterSpacing: 3,
    color: Colors.textTertiary,
  },
  badgeWrap: {
    marginTop: Spacing.base,
  },
  tierName: {
    ...Typography.h1,
    marginTop: Spacing.md,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  benefitsWrap: {
    marginTop: Spacing.lg,
    alignSelf: 'stretch',
  },
  benefitsHeader: {
    ...Typography.captionSemiBold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    ...Bubble.radiiSm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    margin: 0,
  },
  chipText: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 13,
  },
  buttonWrap: {
    alignSelf: 'stretch',
    marginTop: Spacing.xl,
    height: 54,
    ...Bubble.radiiLg,
    overflow: 'hidden',
    ...Shadows.glow,
  },
  buttonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: Colors.white,
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
