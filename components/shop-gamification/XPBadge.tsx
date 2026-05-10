/**
 * XPBadge
 *
 * Compact badge showing current XP and level. Designed to sit in headers or
 * inline with other elements. Animated XP count on value change.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Colors, FontFamily, Spacing, Bubble, Shadows } from '@/constants/theme';
import { getLevelTitle } from './XPProgressBar';

// ─── Constants ──────────────────────────────────────────

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const COUNT_DURATION = 800;
const COUNT_STEPS = 16;

const XP_BADGE_COLORS = {
  gold: '#FFB300',
  goldDark: '#FF8F00',
  badgeBg: '#FFF8E1',
  starBg: 'rgba(255, 179, 0, 0.12)',
  levelBg: 'rgba(255, 143, 0, 0.08)',
};

// ─── Props ──────────────────────────────────────────────

interface XPBadgeProps {
  /** Current XP points */
  xp: number;
  /** Current level */
  level: number;
  /** Size variant */
  size?: 'sm' | 'md';
}

// ─── Component ──────────────────────────────────────────

function XPBadgeInner({ xp, level, size = 'md' }: XPBadgeProps) {
  const colors = Colors.light;
  const isSm = size === 'sm';

  const [displayXP, setDisplayXP] = useState(xp);
  const prevXPRef = useRef(xp);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Pulse animation when XP changes
  const scale = useSharedValue(1);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    if (prevXPRef.current === xp) return;

    // Counting animation
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const startVal = prevXPRef.current;
    const diff = xp - startVal;

    for (let i = 1; i <= COUNT_STEPS; i++) {
      const timer = setTimeout(() => {
        const progress = i / COUNT_STEPS;
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayXP(Math.round(startVal + diff * eased));
      }, (COUNT_DURATION / COUNT_STEPS) * i);
      timersRef.current.push(timer);
    }

    // Subtle scale pulse
    scale.value = withSequence(
      withTiming(1.08, { duration: 200, easing: SMOOTH }),
      withTiming(1, { duration: 300, easing: SMOOTH }),
    );

    prevXPRef.current = xp;

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [xp]);

  return (
    <Animated.View
      entering={FadeInDown.duration(400).easing(SMOOTH).withInitialValues({ transform: [{ translateY: 12 }] })}
      style={[
        styles.container,
        Shadows.sm,
        isSm && styles.containerSm,
        pulseStyle,
      ]}
    >
      {/* XP section */}
      <View style={[styles.xpSection, isSm && styles.xpSectionSm]}>
        <View style={[styles.coinIcon, isSm && styles.coinIconSm]}>
          <Feather
            name="zap"
            size={isSm ? 10 : 13}
            color={XP_BADGE_COLORS.gold}
          />
        </View>
        <Text
          style={[
            styles.xpText,
            { color: XP_BADGE_COLORS.goldDark },
            isSm && styles.xpTextSm,
          ]}
        >
          {displayXP.toLocaleString('ro-RO')}
        </Text>
        <Text
          style={[
            styles.xpLabel,
            { color: colors.textTertiary },
            isSm && styles.xpLabelSm,
          ]}
        >
          XP
        </Text>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.separator }]} />

      {/* Level section */}
      <View style={[styles.levelSection, isSm && styles.levelSectionSm]}>
        <Feather
          name="star"
          size={isSm ? 10 : 12}
          color={XP_BADGE_COLORS.gold}
        />
        <Text
          style={[
            styles.levelText,
            { color: XP_BADGE_COLORS.goldDark },
            isSm && styles.levelTextSm,
          ]}
        >
          {level}
        </Text>
      </View>
    </Animated.View>
  );
}

export const XPBadge = memo(XPBadgeInner);

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: 'rgba(255, 179, 0, 0.15)',
    ...Bubble.radiiSm,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
  },
  containerSm: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs + 2,
    gap: Spacing.xs + 2,
  },

  // XP section
  xpSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  xpSectionSm: {
    gap: 2,
  },
  coinIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: XP_BADGE_COLORS.starBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinIconSm: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  xpText: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
  },
  xpTextSm: {
    fontSize: 12,
    lineHeight: 16,
  },
  xpLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    marginLeft: -2,
  },
  xpLabelSm: {
    fontSize: 10,
    lineHeight: 12,
  },

  // Divider
  divider: {
    width: 1,
    height: 18,
    borderRadius: 0.5,
  },

  // Level section
  levelSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  levelSectionSm: {
    gap: 2,
  },
  levelText: {
    fontFamily: FontFamily.bold,
    fontSize: 14,
    lineHeight: 18,
  },
  levelTextSm: {
    fontSize: 12,
    lineHeight: 15,
  },
});
