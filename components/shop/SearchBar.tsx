import { useState, useCallback } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';

import { Brand, Colors, Spacing, Typography, Bubble } from '@/constants/theme';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const TIMING_CONFIG = { duration: 250, easing: SMOOTH };

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onFocusChange?: (focused: boolean) => void;
};

export function SearchBar({ value, onChangeText, onFocusChange }: Props) {
  const [focused, setFocused] = useState(false);

  const focusProgress = useSharedValue(0);
  const clearOpacity = useSharedValue(value.length > 0 ? 1 : 0);

  const handleFocus = useCallback(() => {
    setFocused(true);
    focusProgress.value = withTiming(1, TIMING_CONFIG);
    onFocusChange?.(true);
  }, [onFocusChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    focusProgress.value = withTiming(0, TIMING_CONFIG);
    onFocusChange?.(false);
  }, [onFocusChange]);

  const handleChangeText = useCallback((text: string) => {
    onChangeText(text);
    clearOpacity.value = withTiming(text.length > 0 ? 1 : 0, TIMING_CONFIG);
  }, [onChangeText]);

  const borderColorUnfocused = 'rgba(10,102,194,0.18)';
  const borderColorFocused = Brand.primary;

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    borderBottomColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [borderColorUnfocused, borderColorFocused],
    ),
  }));

  const clearAnimatedStyle = useAnimatedStyle(() => ({
    opacity: clearOpacity.value,
  }));

  const blurIntensity = focused ? 65 : 50;

  return (
    <AnimatedBlurView
      intensity={blurIntensity}
      tint="light"
      style={[
        styles.container,
        { backgroundColor: 'rgba(255,255,255,0.6)' },
        containerAnimatedStyle,
      ]}
    >
      <Feather
        name="search"
        size={18}
        color={focused ? Brand.primary : Colors.textTertiary}
      />

      <TextInput
        style={[styles.input, { color: Colors.text }]}
        placeholder="Cauta dupa nume sau brand..."
        placeholderTextColor={Colors.textTertiary}
        value={value}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      <Animated.View style={clearAnimatedStyle}>
        <TouchableOpacity
          onPress={() => handleChangeText('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
        >
          <Feather name="x" size={16} color={Colors.textTertiary} />
        </TouchableOpacity>
      </Animated.View>
    </AnimatedBlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.base,
    height: 44,
    overflow: 'hidden',
    ...Bubble.radiiSm,
    ...Bubble.accent,
  },
  input: {
    flex: 1,
    ...Typography.body,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 0,
    margin: 0,
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
      default: {},
    }),
  },
});
