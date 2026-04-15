// components/discover/filters/AccordionRow.tsx
import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Colors, FontFamily, Spacing } from '@/constants/theme';

interface Props {
  label: string;
  value: string;
  isSet: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const SPRING = { damping: 22, stiffness: 220, mass: 0.8 };

export function AccordionRow({ label, value, isSet, expanded, onToggle, children }: Props) {
  const caretRot = useSharedValue(expanded ? 90 : 0);

  React.useEffect(() => {
    caretRot.value = withSpring(expanded ? 90 : 0, SPRING);
  }, [expanded, caretRot]);

  const caretStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${caretRot.value}deg` }],
  }));

  return (
    <View>
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between active:bg-dark-100"
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <Text style={styles.label}>{label}</Text>
        <View className="flex-row items-center" style={styles.valueRow}>
          <Text style={[styles.value, isSet && styles.valueSet]}>{value}</Text>
          <Animated.View style={caretStyle}>
            <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
          </Animated.View>
        </View>
      </Pressable>
      {expanded && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  headerPressed: {
    backgroundColor: Colors.background,
  },
  label: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: Colors.text,
  },
  valueRow: {
    gap: 4,
  },
  value: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: Colors.textTertiary,
  },
  valueSet: {
    color: Colors.primary,
    fontFamily: FontFamily.semiBold,
  },
  body: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
});
