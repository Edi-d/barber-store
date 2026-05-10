/**
 * BadgePill — Small pill for badges (NOU, POPULAR, STOC LIMITAT, order status).
 *
 * Spec:
 *  - Product badge colors: 09-visual-spec.md §4.5 Badge Colors
 *  - Order status colors: 06-orders.md §2 Status Model
 *
 * Tone → color mapping (all defined as Tailwind named tokens in tailwind.config.js):
 *  success → green  (#2E7D32)  — paid, delivered, NOU badge
 *  warning → amber  (#F59E0B)  — placed, POPULAR badge
 *  danger  → red    (#E53935)  — cancelled, STOC LIMITAT, discount badge
 *  neutral → slate  (#94A3B8)  — returned, refunded
 *  info    → blue   (#0A66C2)  — shipped, cart count badge
 *  accent  → indigo (#6366F1)  — preparing, PRO badge
 *
 * The dot-style (status pill) uses a 6px colored dot + label.
 * The badge-style (product) uses a solid background + label text.
 *
 * Usage:
 *   // Status pill (dot style):
 *   <BadgePill tone="info" text="Expediata" dot />
 *
 *   // Product badge (solid style):
 *   <BadgePill tone="success" text="NOU" />
 *
 *   // With icon:
 *   <BadgePill tone="warning" text="POPULAR" icon={<Feather name="star" size={8} color="#fff" />} />
 */

import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import type { BadgePillTone } from '@/lib/marketplace-status';

// Re-export for consumers who import tone type from the component
export type { BadgePillTone };

type Tone = BadgePillTone;

type ToneConfig = {
  hex: string;
  bg: string;          // semi-transparent background (for dot-style pills)
  solidBg: string;     // fully opaque background (for solid badges)
  text: string;        // text color hex
  solidText: string;   // text color on solid bg (always white or high-contrast)
};

const TONE_CONFIG: Record<Tone, ToneConfig> = {
  success: {
    hex:       '#2E7D32',
    bg:        'rgba(46,125,50,0.10)',
    solidBg:   '#36A852',
    text:      '#2E7D32',
    solidText: '#FFFFFF',
  },
  warning: {
    hex:       '#F59E0B',
    bg:        'rgba(245,158,11,0.10)',
    solidBg:   '#F59E0B',
    text:      '#D97706',
    solidText: '#FFFFFF',
  },
  danger: {
    hex:       '#E53935',
    bg:        'rgba(229,57,53,0.10)',
    solidBg:   '#E53935',
    text:      '#E53935',
    solidText: '#FFFFFF',
  },
  neutral: {
    hex:       '#94A3B8',
    bg:        'rgba(148,163,184,0.10)',
    solidBg:   '#94A3B8',
    text:      '#64748B',
    solidText: '#FFFFFF',
  },
  info: {
    hex:       '#0A66C2',
    bg:        'rgba(10,102,194,0.10)',
    solidBg:   '#0A66C2',
    text:      '#0A66C2',
    solidText: '#FFFFFF',
  },
  accent: {
    hex:       '#6366F1',
    bg:        'rgba(99,102,241,0.10)',
    solidBg:   '#6366F1',
    text:      '#6366F1',
    solidText: '#FFFFFF',
  },
};

// ─── Props ───────────────────────────────────────────────────────────────────
type Props = {
  tone: Tone;
  text: string;
  /** Renders a small colored dot before the text (status pill style). */
  dot?: boolean;
  /**
   * Icon element rendered before the text.
   * Prefer 8–10px icon size for product badges, 10–12px for status pills.
   */
  icon?: React.ReactNode;
  /**
   * When true, uses fully opaque solidBg + white text (product badge style).
   * When false (default), uses semi-transparent bg + colored text (status pill style).
   */
  solid?: boolean;
  style?: ViewStyle;
};

// ─── Component ───────────────────────────────────────────────────────────────
export function BadgePill({ tone, text, dot = false, icon, solid = false, style }: Props) {
  const cfg = TONE_CONFIG[tone];

  const containerStyle: ViewStyle = {
    backgroundColor: solid ? cfg.solidBg : cfg.bg,
  };

  const textColor = solid ? cfg.solidText : cfg.text;

  return (
    <View style={[styles.pill, containerStyle, style]}>
      {/* Dot indicator (status pill pattern from 06-orders.md §2) */}
      {dot && !solid && (
        <View style={[styles.dot, { backgroundColor: cfg.hex }]} />
      )}

      {/* Icon slot */}
      {icon && <View style={styles.iconWrap}>{icon}</View>}

      <Text style={[styles.label, { color: textColor }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  iconWrap: {
    // Icon aligns with dot slot; no extra margin needed when gap is set
  },
  label: {
    fontSize: 11,
    fontFamily: 'EuclidCircularA-SemiBold',
    letterSpacing: 0.2,
  },
});
