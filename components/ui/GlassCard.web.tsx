/**
 * GlassCard.web.tsx — Web-only platform override.
 *
 * Metro resolves `.web.tsx` before `.tsx` when bundling for web, so this file
 * replaces the native BlurView-based implementation. Native (iOS/Android) is
 * UNTOUCHED — they continue to use GlassCard.tsx with expo-blur.
 *
 * Instead of BlurView we use a plain View with CSS `backdropFilter` (supported
 * by all modern browsers and react-native-web 0.19+).
 *
 * The component API (props, prop names, children) is identical to GlassCard.tsx
 * so no consumer needs to change anything.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { Bubble, Shadows } from '@/constants/theme';

// ─── Variant config ─────────────────────────────────────────────────────────
type GlassCardVariant = 'card' | 'sheet' | 'bar' | 'search' | 'mini' | 'xp';

const VARIANT_CONFIG: Record<
  GlassCardVariant,
  { intensity: number; tint: 'light' | 'dark' | 'default'; bg: string; border: string; blur: string }
> = {
  card:   { intensity: 50, tint: 'light', bg: 'rgba(255,255,255,0.5)',   border: 'rgba(255,255,255,0.6)', blur: 'blur(20px)' },
  sheet:  { intensity: 85, tint: 'light', bg: 'rgba(245,247,250,0.88)', border: 'rgba(255,255,255,0.7)', blur: 'blur(34px)' },
  bar:    { intensity: 80, tint: 'light', bg: 'rgba(245,247,250,0.92)', border: 'rgba(255,255,255,0.7)', blur: 'blur(32px)' },
  search: { intensity: 50, tint: 'light', bg: 'rgba(255,255,255,0.6)',   border: 'transparent',           blur: 'blur(20px)' },
  mini:   { intensity: 40, tint: 'light', bg: 'rgba(255,255,255,0.5)',   border: 'rgba(255,255,255,0.6)', blur: 'blur(16px)' },
  xp:     { intensity: 40, tint: 'light', bg: 'rgba(255,255,255,0.75)', border: 'rgba(255,255,255,0.5)', blur: 'blur(16px)' },
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
  /** Override intensity from the variant default (ignored on web — blur string used instead) */
  intensity?: number;
  /** Override tint from the variant default (ignored on web — bg rgba used instead) */
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
  // intensity and tint are accepted to match the native API but not used on web
  intensity: _intensity,
  tint: _tint,
  className,
  style,
  children,
}: Props) {
  const cfg = VARIANT_CONFIG[variant];
  const radii = BUBBLE_RADII[bubble];

  const shadowStyle: ViewStyle = shadow ? SHADOW_MAP[shadow] : {};
  const accentStyle: ViewStyle = accent ? Bubble.accent : {};

  return (
    <View
      className={className}
      style={[styles.outerContainer, radii, shadowStyle, style]}
    >
      {/* On web, backdropFilter + WebkitBackdropFilter replaces BlurView */}
      <View
        style={[
          styles.blurSurface,
          radii,
          {
            backgroundColor: cfg.bg,
            borderColor: cfg.border,
            // @ts-expect-error — react-native-web passes these through to CSS
            backdropFilter: cfg.blur,
            WebkitBackdropFilter: cfg.blur,
          },
          accentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    overflow: 'hidden',
  },
  blurSurface: {
    overflow: 'hidden',
    borderWidth: 1,
  },
});
