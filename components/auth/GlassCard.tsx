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
import { Bubble, Shadows, Colors } from '@/constants/theme';

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

  // Android fallback (BlurView may not work as well)
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
      <View style={[styles.accentBorder, { borderBottomLeftRadius: Bubble.radiiLg.borderBottomLeftRadius, borderBottomRightRadius: Bubble.radiiLg.borderBottomRightRadius }]} />
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
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
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
