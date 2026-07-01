import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LEVEL_CONFIG } from '@/constants/loyalty';
import { FontFamily, Shadows, Bubble } from '@/constants/theme';
import { TierArt, LEVEL_TIER_KEY } from './TierArt';

type Size = 'sm' | 'md' | 'lg';

interface Props {
  level: number;              // 1..4, matches LEVEL_CONFIG keys
  size?: Size;
  showLabel?: boolean;
}

const DIM: Record<Size, { circle: number; art: number; label: number }> = {
  sm: { circle: 32, art: 22, label: 11 },
  md: { circle: 52, art: 38, label: 13 },
  lg: { circle: 80, art: 58, label: 18 },
};

export function TierBadge({ level, size = 'md', showLabel = false }: Props) {
  const cfg = LEVEL_CONFIG[level];
  const tierKey = LEVEL_TIER_KEY[level];
  const dim = DIM[size];

  if (!cfg || !tierKey) return null;

  const shadow = size === 'lg' ? Shadows.glow : Shadows.md;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.outer,
          { width: dim.circle, height: dim.circle },
          Bubble.radiiSm,
          shadow,
        ]}
      >
        <TierArt tier={tierKey} size={dim.art} />
      </View>
      {showLabel && (
        <Text style={[styles.label, { fontSize: dim.label, color: cfg.color }]}>
          {cfg.title}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  label: {
    marginTop: 6,
    fontFamily: FontFamily.semiBold,
    letterSpacing: 0.2,
  },
});
