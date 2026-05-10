/**
 * Bubble — Asymmetric corner-radii primitive.
 *
 * Spec: 09-visual-spec.md §6 "Bubble Asymmetric Corners" Option B
 *
 * Props:
 *  - radii: variant name → maps to Bubble theme token
 *  - accent: adds the 1.5px blue bottom-border (Bubble.accent)
 *  - glass:  adds rgba white bg + glass border (useful for standalone cards)
 *  - className: NativeWind layout classes (flex, padding, margin, gap, etc.)
 *  - style: inline style override (rgba colors, shadows, arbitrary values)
 *  - children
 *
 * The `rounded-bubble*` Tailwind classes (from the Wave A plugin) work for
 * className-only usage. This component is preferred when you also need the
 * accent border or glass background, avoiding repeated className boilerplate.
 *
 * Radii mapping:
 *  default → 25/12/25/25   (Bubble.radii)
 *  sm      → 18/8/18/18    (Bubble.radiiSm)
 *  lg      → 30/14/30/30   (Bubble.radiiLg)
 *  sheet   → 30/14/0/0     (Bubble.sheetRadii)
 *  float   → 24/24/24/24   (Bubble.floatingRadii)
 *  accent  → same as default + Bubble.accent (shorthand for accent=true)
 */

import React from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
import { Bubble as BubbleTheme } from '@/constants/theme';

type BubbleRadii = 'default' | 'sm' | 'lg' | 'sheet' | 'float' | 'accent';

// Map variant name to the corresponding theme radii object
const RADII_MAP: Record<BubbleRadii, ViewStyle> = {
  default: BubbleTheme.radii,
  sm:      BubbleTheme.radiiSm,
  lg:      BubbleTheme.radiiLg,
  sheet:   BubbleTheme.sheetRadii,
  float:   BubbleTheme.floatingRadii,
  accent:  BubbleTheme.radii,   // same shape as default; accent adds the border below
};

type Props = {
  /** Radii variant. Default: 'default' (25/12/25/25). */
  radii?: BubbleRadii;
  /** Adds the 1.5px rgba blue bottom border accent. Auto-on when radii='accent'. */
  accent?: boolean;
  /**
   * Adds a semi-transparent white background + glass border.
   * bg: rgba(255,255,255,0.5), border: rgba(255,255,255,0.6)
   */
  glass?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function Bubble({ radii = 'default', accent, glass, className, style, children }: Props) {
  const radiiStyle = RADII_MAP[radii];
  const isAccent = accent || radii === 'accent';

  const glassStyle: ViewStyle | null = glass
    ? {
        backgroundColor: 'rgba(255,255,255,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
      }
    : null;

  return (
    <View
      className={className}
      style={[
        radiiStyle,
        isAccent ? BubbleTheme.accent : null,
        glassStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}
