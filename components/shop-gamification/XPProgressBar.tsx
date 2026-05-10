/**
 * XPProgressBar
 *
 * Animated progress bar showing XP progress toward the next shop level.
 * Glassmorphism background, gold/amber gradient fill, level badges on each end.
 */

import { memo, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';

import {
  Colors,
  FontFamily,
  Spacing,
  Bubble,
  Shadows,
} from '@/constants/theme';

// ─── Constants ──────────────────────────────────────────

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

const XP_COLORS = {
  goldLight: '#FFD54F',
  gold: '#FFB300',
  goldDark: '#FF8F00',
  amber: '#F57C00',
  glassBg: 'rgba(255, 255, 255, 0.75)',
  glassBorder: 'rgba(255, 255, 255, 0.5)',
  trackBg: 'rgba(0, 0, 0, 0.06)',
  badgeBg: '#FFF8E1',
};

const LEVEL_TITLES: Record<number, string> = {
  1: 'Incepator',
  2: 'Explorator',
  3: 'Colectionar',
  4: 'Cunoscator',
  5: 'Expert',
  6: 'Maestru',
  7: 'Campion',
  8: 'Legenda',
  9: 'Erou',
  10: 'Titan',
};

export function getLevelTitle(level: number): string {
  if (level <= 0) return LEVEL_TITLES[1]!;
  if (level >= 10) return LEVEL_TITLES[10]!;
  return LEVEL_TITLES[level] ?? `Nivel ${level}`;
}

// ─── Props ──────────────────────────────────────────────

interface XPProgressBarProps {
  level: number;
  currentXP: number;
  requiredXP: number;
  showCard?: boolean;
  height?: number;
}

// ─── Component ──────────────────────────────────────────

function XPProgressBarInner({
  level,
  currentXP,
  requiredXP,
  showCard = true,
  height = 10,
}: XPProgressBarProps) {
  const colors = Colors.light;
  const progress = requiredXP > 0 ? Math.min((currentXP / requiredXP) * 100, 100) : 100;

  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withTiming(progress, {
      duration: 900,
      easing: SMOOTH,
    });
  }, [progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(fillWidth.value, 1)}%`,
  }));

  const currentTitle = getLevelTitle(level);
  const nextTitle = getLevelTitle(level + 1);
  const isMaxLevel = level >= 10;

  const content = (
    <View style={styles.inner}>
      <View style={styles.headerRow}>
        <View style={styles.levelBadge}>
          <Feather name="star" size={14} color={XP_COLORS.gold} />
          <Text style={styles.levelText}>Nivel {level}</Text>
          <Text style={styles.levelTitle}>{currentTitle}</Text>
        </View>

        <Text style={[styles.xpCounter, { color: colors.textSecondary }]}>
          <Text style={styles.xpCurrent}>
            {currentXP.toLocaleString('ro-RO')}
          </Text>
          {' / '}
          {requiredXP.toLocaleString('ro-RO')} XP
        </Text>
      </View>

      <View
        style={[
          styles.track,
          {
            height,
            borderRadius: height / 2,
            backgroundColor: XP_COLORS.trackBg,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.fillOuter,
            { height, borderRadius: height / 2 },
            fillStyle,
          ]}
        >
          <LinearGradient
            colors={[XP_COLORS.goldLight, XP_COLORS.gold, XP_COLORS.amber]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.fillGradient, { borderRadius: height / 2 }]}
          />
        </Animated.View>
      </View>

      <View style={styles.labelsRow}>
        <Text style={[styles.labelCurrent, { color: XP_COLORS.goldDark }]}>
          {currentTitle}
        </Text>
        {isMaxLevel ? (
          <Text style={[styles.labelNext, { color: XP_COLORS.gold }]}>
            Nivel maxim
          </Text>
        ) : (
          <Text style={[styles.labelNext, { color: colors.textTertiary }]}>
            {nextTitle} — {(requiredXP - currentXP).toLocaleString('ro-RO')} XP
          </Text>
        )}
      </View>
    </View>
  );

  if (!showCard) return content;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).easing(SMOOTH).withInitialValues({
        transform: [{ translateY: 12 }],
      })}
      style={[Shadows.md, Bubble.radii]}
    >
      <BlurView
        intensity={40}
        tint="light"
        style={[
          styles.card,
          {
            backgroundColor: XP_COLORS.glassBg,
            borderColor: XP_COLORS.glassBorder,
          },
        ]}
      >
        {content}
      </BlurView>
    </Animated.View>
  );
}

export const XPProgressBar = memo(XPProgressBarInner);

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.base,
  },
  inner: {
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    ...Bubble.radiiSm,
  },
  levelText: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    lineHeight: 17,
    color: '#FF8F00',
  },
  levelTitle: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    color: '#FFB300',
  },
  xpCounter: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  xpCurrent: {
    fontFamily: FontFamily.semiBold,
    color: '#FF8F00',
  },
  track: {
    overflow: 'hidden',
  },
  fillOuter: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
  },
  fillGradient: {
    flex: 1,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  labelCurrent: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  labelNext: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
  },
});
