import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { LEVEL_CONFIG } from '@/constants/loyalty';
import { FontFamily, Shadows, Bubble } from '@/constants/theme';

type Size = 'sm' | 'md' | 'lg';

interface Props {
  level: number;              // 1..5, matches LEVEL_CONFIG keys
  size?: Size;
  showLabel?: boolean;
}

const DIM: Record<Size, { circle: number; icon: number; label: number; inset: number }> = {
  sm: { circle: 32, icon: 16, label: 11, inset: 6 },
  md: { circle: 52, icon: 26, label: 13, inset: 9 },
  lg: { circle: 80, icon: 38, label: 18, inset: 14 },
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function TierBadge({ level, size = 'md', showLabel = false }: Props) {
  const cfg = LEVEL_CONFIG[level];
  const dim = DIM[size];

  if (!cfg) return null;

  const shadow = size === 'lg' ? Shadows.glow : Shadows.md;
  const glossTop = hexToRgba(cfg.color, 1);
  const glossBottom = hexToRgba(cfg.color, 0.8);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.outer,
          {
            width: dim.circle,
            height: dim.circle,
            backgroundColor: cfg.color,
          },
          Bubble.radiiSm,
          shadow,
        ]}
      >
        {/* Depth gradient fill */}
        <LinearGradient
          colors={[glossTop, glossBottom]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFillObject, Bubble.radiiSm]}
        />
        {/* Inner gloss highlight ring */}
        <View
          style={[
            styles.glossRing,
            Bubble.radiiSm,
            {
              width: dim.circle - dim.inset,
              height: dim.circle - dim.inset,
            },
          ]}
        />
        <Ionicons name={cfg.iconName as any} size={dim.icon} color={cfg.textColor} />
      </View>
      {showLabel && (
        <Text
          style={[
            styles.label,
            { fontSize: dim.label, color: cfg.color },
          ]}
        >
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
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  glossRing: {
    position: 'absolute',
    top: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'transparent',
  },
  label: {
    marginTop: 6,
    fontFamily: FontFamily.semiBold,
    letterSpacing: 0.2,
  },
});
