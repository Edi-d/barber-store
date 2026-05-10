/**
 * GlassCard — Reusable BlurView + rgba bg + soft border pattern.
 *
 * Spec: 09-visual-spec.md §8 "Glass Morphism Recipe"
 *
 * Usage:
 *   <GlassCard variant="card" bubble="default" shadow="sm">…</GlassCard>
 *   <GlassCard variant="sheet" bubble="lg" accent>…</GlassCard>
 *
 * Notes:
 *  - BlurView rgba backgrounds cannot be expressed in NativeWind — they stay in StyleSheet.
 *  - Bubble radii are applied via the `Bubble` theme token (not className) because per-corner
 *    values must be spread into a single style object to stack correctly with the border.
 *  - `overflow: 'hidden'` is mandatory on BlurView to prevent blur bleeding past border-radius on iOS.
 *  - Shadows cannot go in className — spread `Shadows.X` via `style={}`.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { Bubble, Shadows } from '@/constants/theme';

// ─── Variant config ─────────────────────────────────────────────────────────
type GlassCardVariant = 'card' | 'sheet' | 'bar' | 'search' | 'mini' | 'xp';

const VARIANT_CONFIG: Record<
  GlassCardVariant,
  { intensity: number; tint: 'light' | 'dark' | 'default'; bg: string; border: string }
> = {
  card:   { intensity: 50, tint: 'light', bg: 'rgba(255,255,255,0.5)',   border: 'rgba(255,255,255,0.6)' },
  sheet:  { intensity: 85, tint: 'light', bg: 'rgba(245,247,250,0.88)', border: 'rgba(255,255,255,0.7)' },
  bar:    { intensity: 80, tint: 'light', bg: 'rgba(245,247,250,0.92)', border: 'rgba(255,255,255,0.7)' },
  search: { intensity: 50, tint: 'light', bg: 'rgba(255,255,255,0.6)',   border: 'transparent' },
  mini:   { intensity: 40, tint: 'light', bg: 'rgba(255,255,255,0.5)',   border: 'rgba(255,255,255,0.6)' },
  xp:     { intensity: 40, tint: 'light', bg: 'rgba(255,255,255,0.75)', border: 'rgba(255,255,255,0.5)' },
};

// ─── Bubble radii lookup ────────────────────────────────────────────────────
type BubbleVariant = 'default' | 'sm' | 'lg';

const BUBBLE_RADII: Record<BubbleVariant, ViewStyle> = {
  default: Bubble.radii,
  sm:      Bubble.radiiSm,
  lg:      Bubble.radiiLg,
};

// ─── Shadow lookup ──────────────────────────────────────────────────────────
type ShadowVariant = 'sm' | 'md' | 'lg' | 'glass' | 'glow';

const SHADOW_MAP: Record<ShadowVariant, ViewStyle> = {
  sm:    Shadows.sm,
  md:    Shadows.md,
  lg:    Shadows.lg,
  glass: Shadows.glass,
  glow:  Shadows.glow,
};

// ─── Props ──────────────────────────────────────────────────────────────────
type Props = {
  variant?: GlassCardVariant;
  /** Bubble corner-radii variant */
  bubble?: BubbleVariant;
  /** Adds the subtle blue bottom-border accent (Bubble.accent) */
  accent?: boolean;
  /** Shadow token to apply on the outer container */
  shadow?: ShadowVariant;
  /** Override intensity from the variant default */
  intensity?: number;
  /** Override tint from the variant default */
  tint?: 'light' | 'dark' | 'default';
  /** Additional className forwarded to the outer container (layout only) */
  className?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

// ─── Component ──────────────────────────────────────────────────────────────
export function GlassCard({
  variant = 'card',
  bubble = 'default',
  accent = false,
  shadow,
  intensity,
  tint,
  className,
  style,
  children,
}: Props) {
  const cfg = VARIANT_CONFIG[variant];
  const radii = BUBBLE_RADII[bubble];
  const resolvedIntensity = intensity ?? cfg.intensity;
  const resolvedTint = tint ?? cfg.tint;

  const shadowStyle: ViewStyle = shadow ? SHADOW_MAP[shadow] : {};
  const accentStyle: ViewStyle = accent ? Bubble.accent : {};

  return (
    <View
      className={className}
      style={[styles.outerContainer, radii, shadowStyle, style]}
    >
      <BlurView
        intensity={resolvedIntensity}
        tint={resolvedTint}
        style={[
          styles.blur,
          radii,
          {
            backgroundColor: cfg.bg,
            borderColor: cfg.border,
          },
          accentStyle,
        ]}
      >
        {children}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    // Outer container clips the BlurView to the bubble shape
    overflow: 'hidden',
  },
  blur: {
    // overflow hidden prevents blur bleeding past border-radius on iOS
    overflow: 'hidden',
    borderWidth: 1,
  },
});
