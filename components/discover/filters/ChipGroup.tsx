// components/discover/filters/ChipGroup.tsx
import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
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
    const next = exists ? props.selected.filter((s) => !eq(s, v)) : [...props.selected, v];
    props.onChange(next);
  };

  return (
    <View style={styles.row}>
      {props.items.map((item, idx) => {
        const active = isActive(item.value);
        const disabled = item.disabled === true;
        return (
          <Pressable
            key={idx}
            onPress={() => !disabled && handlePress(item.value)}
            disabled={disabled}
            className="px-3 py-1.5 border"
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              !active && styles.chipInactive,
              disabled && styles.chipDisabled,
              pressed && !disabled && styles.chipPressed,
            ]}
          >
            <Text
              style={[
                styles.label,
                active ? styles.labelActive : styles.labelInactive,
                disabled && styles.labelDisabled,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    ...Bubble.radiiSm,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipInactive: {
    backgroundColor: Colors.white,
    borderColor: Colors.inputBorder,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipPressed: {
    opacity: 0.8,
  },
  label: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
  },
  labelActive: {
    color: Colors.white,
    fontFamily: FontFamily.semiBold,
  },
  labelInactive: {
    color: Colors.text,
  },
  labelDisabled: {
    color: Colors.textTertiary,
  },
});
