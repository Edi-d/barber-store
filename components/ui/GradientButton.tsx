/**
 * GradientButton — Pressable + LinearGradient CTA button.
 *
 * Spec: 09-visual-spec.md §8, matching Tapzi's default CTA visual.
 *
 * Features:
 *  - Default gradient: [Brand.gradientStart → Brand.gradientEnd] (#4481EB → #0A66C2)
 *  - Press scale animation: 0.97 via Reanimated withTiming
 *  - Haptic feedback on press (iOS only, ImpactFeedbackStyle.Medium)
 *  - Loading state: replaces children with ActivityIndicator
 *  - Disabled state: 60% opacity, no interaction
 *  - Bubble.radii asymmetric corners by default
 *  - Shadows.glow (blue glow) by default
 *  - className: NativeWind layout classes (width, margin, etc.) on outer container
 *  - style: inline style on outer container
 *  - children: rendered inside the gradient (replaces Tapzi's `title: string` API)
 *
 * Note: LinearGradient and shadow cannot be expressed in NativeWind —
 * they are applied via StyleSheet. className is for layout only.
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Brand, Bubble, Shadows } from '@/constants/theme';
import { SMOOTH, DURATION } from '@/lib/animations';

type Props = {
  /** Custom gradient colors. Defaults to [Brand.gradientStart, Brand.gradientEnd]. */
  colors?: [string, string, ...string[]];
  onPress?: () => void;
  /** Renders inside the gradient. Use a <Text> or icon+text row. */
  children?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  /** NativeWind layout className applied to the outer Pressable container. */
  className?: string;
  /** Inline style applied to the outer Pressable container. */
  style?: StyleProp<ViewStyle>;
  /** Height of the gradient fill. Defaults to 54. */
  height?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GradientButton({
  colors = [Brand.gradientStart, Brand.gradientEnd],
  onPress,
  children,
  disabled = false,
  loading = false,
  className,
  style,
  height = 54,
}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.97, { duration: DURATION.instant, easing: SMOOTH });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: DURATION.fast, easing: SMOOTH });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress?.();
  }, [disabled, loading, onPress]);

  return (
    <AnimatedPressable
      className={className}
      style={[styles.outer, Shadows.glow, (disabled || loading) && styles.disabled, animatedStyle, style]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled || loading}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { height }]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          children
        )}
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    ...Bubble.radii,
    overflow: 'hidden',
  } as ViewStyle,
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    ...Bubble.radii,
  } as ViewStyle,
  disabled: {
    opacity: 0.6,
  },
});
