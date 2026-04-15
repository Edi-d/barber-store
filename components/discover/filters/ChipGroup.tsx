// components/discover/filters/ChipGroup.tsx
import React, { useEffect } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Colors, FontFamily, Bubble } from '@/constants/theme';

export interface ChipGroupItem<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SingleProps<T> {
  mode: 'single';
  items: ChipGroupItem<T>[];
  selected: T;
  onChange: (value: T) => void;
  isEqual?: (a: T, b: T) => boolean;
}

interface MultiProps<T> {
  mode: 'multi';
  items: ChipGroupItem<T>[];
  selected: T[];
  onChange: (value: T[]) => void;
  isEqual?: (a: T, b: T) => boolean;
}

type Props<T> = SingleProps<T> | MultiProps<T>;

function defaultEq<T>(a: T, b: T): boolean {
  return a === b;
}

// ─── Single chip with press animation ────────────────────────────────────────

interface ChipItemProps {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}

function ChipItem({ label, active, disabled, onPress }: ChipItemProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onPressIn={() => {
        if (!disabled) {
          scale.value = withSpring(0.96, { damping: 20, stiffness: 400 });
        }
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 20, stiffness: 400 });
      }}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            animatedStyle,
            styles.chip,
            active ? styles.chipActive : styles.chipInactive,
            disabled && styles.chipDisabled,
            pressed && !disabled && styles.chipPressed,
          ]}
        >
          <Text
            style={[
              styles.label,
              active ? styles.labelActive : styles.labelInactive,
            ]}
          >
            {label}
          </Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

// ─── Group ────────────────────────────────────────────────────────────────────

export function ChipGroup<T>(props: Props<T>) {
  const eq = props.isEqual ?? defaultEq;

  const isActive = (v: T): boolean => {
    if (props.mode === 'single') return eq(props.selected, v);
    return props.selected.some((s) => eq(s, v));
  };

  const handlePress = (v: T) => {
    if (props.mode === 'single') {
      props.onChange(v);
      return;
    }
    const exists = props.selected.some((s) => eq(s, v));
    const next = exists
      ? props.selected.filter((s) => !eq(s, v))
      : [...props.selected, v];
    props.onChange(next);
  };

  return (
    <View style={styles.row}>
      {props.items.map((item, idx) => (
        <ChipItem
          key={idx}
          label={item.label}
          active={isActive(item.value)}
          disabled={item.disabled === true}
          onPress={() => handlePress(item.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    ...Bubble.radiiSm,
  },
  chipInactive: {
    backgroundColor: Colors.white,
    borderColor: 'rgba(15,23,42,0.08)',
    // neutral shadow
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    // primary-tinted shadow
    shadowColor: Colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chipDisabled: {
    opacity: 0.35,
    shadowOpacity: 0,
    elevation: 0,
  },
  chipPressed: {
    opacity: 0.9,
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.1,
  },
  labelInactive: {
    fontFamily: FontFamily.medium,
    color: Colors.text,
  },
  labelActive: {
    fontFamily: FontFamily.semiBold,
    color: Colors.white,
  },
});
