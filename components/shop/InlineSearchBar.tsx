import { memo, useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';

import { Brand, Bubble, Colors, Shadows, Spacing, Typography } from '@/constants/theme';

// ─── Constants ───────────────────────────────────────────────────────────────

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const TIMING = { duration: 220, easing: SMOOTH };

const BORDER_IDLE    = 'rgba(0,0,0,0.06)';
const BORDER_FOCUSED = Brand.primary;

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onFocusChange?: (focused: boolean) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

function InlineSearchBarInner({ value, onChangeText, onFocusChange }: Props) {
  const [focused, setFocused] = useState(false);

  const focusProgress  = useSharedValue(0);
  const clearOpacity   = useSharedValue(value.length > 0 ? 1 : 0);
  const clearScale     = useSharedValue(value.length > 0 ? 1 : 0.7);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFocus = useCallback(() => {
    setFocused(true);
    focusProgress.value = withTiming(1, TIMING);
    onFocusChange?.(true);
  }, [onFocusChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    focusProgress.value = withTiming(0, TIMING);
    onFocusChange?.(false);
  }, [onFocusChange]);

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText(text);
      const hasText = text.length > 0;
      clearOpacity.value = withTiming(hasText ? 1 : 0, TIMING);
      clearScale.value   = withTiming(hasText ? 1 : 0.7, TIMING);
    },
    [onChangeText],
  );

  const handleClear = useCallback(() => {
    handleChangeText('');
  }, [handleChangeText]);

  // ── Animated styles ───────────────────────────────────────────────────────

  const containerAnimStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [BORDER_IDLE, BORDER_FOCUSED],
    ),
    // Subtle lift on focus — iOS only (elevation on Android would fight the bg)
    ...(Platform.OS === 'ios'
      ? {
          shadowOpacity: withTiming(focusProgress.value * 0.1, TIMING),
        }
      : {}),
  }));

  const clearAnimStyle = useAnimatedStyle(() => ({
    opacity: clearOpacity.value,
    transform: [{ scale: clearScale.value }],
  }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Animated.View style={[styles.container, containerAnimStyle]}>
      <Feather
        name="search"
        size={20}
        color={focused ? Brand.primary : Colors.textTertiary}
      />

      <TextInput
        style={styles.input}
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

      <Animated.View style={clearAnimStyle} pointerEvents={value.length > 0 ? 'auto' : 'none'}>
        <Pressable
          onPress={handleClear}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.clearButton,
            pressed && styles.clearButtonPressed,
          ]}
        >
          <Feather name="x" size={14} color={Colors.textTertiary} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

export const InlineSearchBar = memo(InlineSearchBarInner);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.base,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1.5,
    borderColor: BORDER_IDLE,
    ...Bubble.radiiSm,
    // Base shadow — always visible, subtle
    ...Shadows.sm,
  },
  input: {
    flex: 1,
    ...Typography.body,
    color: Colors.text,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    ...Platform.select({
      web: { outlineStyle: 'none' } as object,
      default: {},
    }),
  },
  clearButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  clearButtonPressed: {
    backgroundColor: 'rgba(0,0,0,0.07)',
  },
});
