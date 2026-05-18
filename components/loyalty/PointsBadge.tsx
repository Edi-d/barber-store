import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Colors, FontFamily, Spacing, Bubble, Shadows } from '@/constants/theme';
import { LEVEL_CONFIG, type LevelConfig } from '@/constants/loyalty';
import { TierBadge } from '@/components/loyalty/TierBadge';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const COUNT_DURATION = 800;
const COUNT_STEPS = 16;

interface PointsBadgeProps {
  points: number;
  level: LevelConfig;
  size?: 'sm' | 'md';
}

function PointsBadgeInner({ points, level, size = 'md' }: PointsBadgeProps) {
  const colors = Colors.light;
  const isSm = size === 'sm';

  const [displayPoints, setDisplayPoints] = useState(points);
  const prevPointsRef = useRef(points);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const scale = useSharedValue(1);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    if (prevPointsRef.current === points) return;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const startVal = prevPointsRef.current;
    const diff = points - startVal;

    for (let i = 1; i <= COUNT_STEPS; i++) {
      const timer = setTimeout(() => {
        const progress = i / COUNT_STEPS;
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayPoints(Math.round(startVal + diff * eased));
      }, (COUNT_DURATION / COUNT_STEPS) * i);
      timersRef.current.push(timer);
    }

    scale.value = withSequence(
      withTiming(1.08, { duration: 200, easing: SMOOTH }),
      withTiming(1, { duration: 300, easing: SMOOTH }),
    );

    prevPointsRef.current = points;

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [points]);

  return (
    <Animated.View
      entering={FadeInDown.duration(400).easing(SMOOTH).withInitialValues({ transform: [{ translateY: 12 }] })}
      style={[
        styles.container,
        Shadows.sm,
        isSm && styles.containerSm,
        { borderColor: level.color + '26' },
        pulseStyle,
      ]}
    >
      <View style={[styles.xpSection, isSm && styles.xpSectionSm]}>
        <View style={[styles.coinIcon, isSm && styles.coinIconSm, { backgroundColor: level.color + '1F' }]}>
          <TierBadge level={level.level} size="sm" />
        </View>
        <Text
          style={[
            styles.xpText,
            { color: level.color },
            isSm && styles.xpTextSm,
          ]}
        >
          {displayPoints.toLocaleString('ro-RO')}
        </Text>
        <Text
          style={[
            styles.xpLabel,
            { color: colors.textTertiary },
            isSm && styles.xpLabelSm,
          ]}
        >
          pts
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.separator }]} />

      <View style={[styles.levelSection, isSm && styles.levelSectionSm]}>
        <Text
          style={[
            styles.levelText,
            { color: level.color },
            isSm && styles.levelTextSm,
          ]}
        >
          {level.title}
        </Text>
      </View>
    </Animated.View>
  );
}

export const PointsBadge = memo(PointsBadgeInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
  divider: {
    width: 1,
    height: 18,
    borderRadius: 0.5,
  },
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
    fontSize: 13,
    lineHeight: 18,
  },
  levelTextSm: {
    fontSize: 11,
    lineHeight: 15,
  },
});
