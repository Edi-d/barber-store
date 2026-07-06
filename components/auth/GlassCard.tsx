/**
 * GlassCard — frosted-glass card used exclusively in auth screens.
 * Uses BlurView on both platforms; Android renders via expo-blur's bundled
 * dimezis/BlurView (experimentalBlurMethod), the only way to get a real
 * live blur on Android with expo-blur.
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

  return (
    <View
      style={[
        styles.container,
        // Android: elevation + overflow:'hidden' on a non-uniform border
        // radius makes the shadow draw as a hard rectangular box behind the
        // rounded card, so clipping happens inside the BlurView instead.
        Platform.OS === 'android' && styles.containerAndroid,
        borderRadii,
        Shadows.glass,
        style,
      ]}
    >
      <BlurView
        intensity={60}
        tint="light"
        experimentalBlurMethod={
          Platform.OS === 'android' ? 'dimezisBlurView' : undefined
        }
        style={[
          styles.blur,
          borderRadii,
          Platform.OS === 'android' && styles.androidBlurTint,
        ]}
      >
        <View style={styles.content}>{children}</View>
      </BlurView>
      <View
        style={[
          styles.accentBorder,
          {
            borderBottomLeftRadius: Bubble.radiiLg.borderBottomLeftRadius,
            borderBottomRightRadius: Bubble.radiiLg.borderBottomRightRadius,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  containerAndroid: {
    overflow: 'visible',
  },
  blur: {
    overflow: 'hidden',
  },
  androidBlurTint: {
    // dimezis' Android blur renders darker/greyer than iOS's; a light wash
    // on top keeps it reading as the same frosted-glass tint as iOS.
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  content: {
    padding: 24,
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
