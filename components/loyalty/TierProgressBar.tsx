import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { computeLevelProgress, LEVEL_CONFIG } from '@/constants/loyalty';
import { FontFamily, Bubble } from '@/constants/theme';

interface Props {
  lifetimePoints: number;
  currentLevel: number;
  // Override for hero / dark-tier contexts. If provided, drives caption + fill + track
  // so the bar stays legible regardless of background. Defaults to a muted slate that
  // reads well on white cards.
  textColor?: string;
}

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function TierProgressBar({ lifetimePoints, currentLevel, textColor }: Props) {
  const { progress, pointsToNext, nextLevelConfig } = computeLevelProgress(
    lifetimePoints,
    currentLevel,
  );
  const cfg = LEVEL_CONFIG[currentLevel] ?? LEVEL_CONFIG[1];

  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(progress, { duration: 800, easing: SMOOTH });
  }, [progress, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  const resolvedColor = textColor ?? '#64748B';
  const isHexColor = resolvedColor.startsWith('#');
  const trackBg = isHexColor ? hexToRgba(resolvedColor, 0.15) : 'rgba(15,23,42,0.08)';
  const fillBg = resolvedColor;
  const captionColor = resolvedColor;

  const pct = Math.round(progress * 100);

  return (
    <View style={styles.wrap}>
      {/* Percentage + caption row */}
      <View style={styles.captionRow}>
        <Text style={[styles.pctLabel, { color: captionColor }]}>
          {pct}%
        </Text>
        <Text style={[styles.caption, { color: captionColor }]}>
          {nextLevelConfig
            ? ` · ${pointsToNext?.toLocaleString('ro-RO')} puncte pana la ${nextLevelConfig.title}`
            : ' · Nivel maxim atins'}
        </Text>
      </View>

      {/* Track */}
      <View style={[styles.track, { backgroundColor: trackBg }]}>
        <Animated.View
          style={[styles.fill, fillStyle, { backgroundColor: fillBg }]}
        >
          {/* Glowing end-dot */}
          <View
            style={[
              styles.glowDot,
              {
                backgroundColor: fillBg,
                shadowColor: fillBg,
              },
            ]}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 7,
  },
  pctLabel: {
    fontSize: 12,
    fontFamily: FontFamily.semiBold,
    letterSpacing: 0.1,
  },
  caption: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
  },
  track: {
    height: 10,
    ...Bubble.radiiSm,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    ...Bubble.radiiSm,
    alignItems: 'flex-end',
    justifyContent: 'center',
    overflow: 'visible',
  },
  glowDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
});
