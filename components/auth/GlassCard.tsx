/**
 * GlassCard — frosted-glass card used exclusively in auth screens.
 * Uses BlurView on iOS and a semi-transparent white fallback on Android.
 *
 * For general content cards (appointments, orders, courses, etc.) use
 * `Card` from `@/components/ui` instead.
 */
import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Bubble, Shadows } from '@/constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: object;
}

export function GlassCard({ children, style }: GlassCardProps) {
  const borderRadii = { ...Bubble.radiiLg };

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.container, borderRadii, Shadows.glass, style]}>
        <BlurView
          intensity={60}
          tint="light"
          style={[styles.blur, borderRadii]}
        >
          <View style={styles.content}>{children}</View>
        </BlurView>
        <View style={[styles.accentBorder, { borderBottomLeftRadius: Bubble.radiiLg.borderBottomLeftRadius, borderBottomRightRadius: Bubble.radiiLg.borderBottomRightRadius }]} />
      </View>
    );
  }

  // Android fallback — faux frosted glass (no BlurView).
  // A real blur (expo-blur's dimezisBlurView) is GPU-expensive and janky on
  // lower-end devices, so instead we let the gradient bleed through a
  // translucent fill and fake the "light catching the edge" with brighter
  // top/left borders. Visually close to the iOS blur, but free and consistent.
  return (
    <View
      style={[
        styles.container,
        styles.androidCard,
        borderRadii,
        Shadows.glass,
        style,
      ]}
    >
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  blur: {
    overflow: 'hidden',
  },
  content: {
    padding: 24,
  },
  androidCard: {
    // overflow stays 'visible': pairing overflow:'hidden' with elevation makes
    // Android draw the elevation backing as a hard square white box behind the
    // rounded card. borderRadius alone still clips the fill and the shadow.
    overflow: 'visible',
    // Translucent fill so the gradient behind shows through (the glass effect).
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    // Brighter top/left edges read as light hitting a frosted pane; the base
    // border keeps the bottom/right grounded.
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    borderLeftColor: 'rgba(255, 255, 255, 0.7)',
  },
  accentBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(10,102,194,0.18)',
  },
});
