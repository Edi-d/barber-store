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

const DIVIDER_COLOR = 'rgba(15,23,42,0.06)';
const PRESSED_BG = 'rgba(15,23,42,0.02)';

export function AccordionRow({ label, value, isSet, expanded, onToggle, children }: Props) {
  const caretRot = useSharedValue(expanded ? 90 : 0);

  React.useEffect(() => {
    caretRot.value = withSpring(expanded ? 90 : 0, SPRING);
  }, [expanded, caretRot]);

  const caretStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${caretRot.value}deg` }],
  }));

  return (
    <View style={styles.row}>
      <Pressable onPress={onToggle}>
        {({ pressed }) => (
          <View style={[styles.header, pressed && styles.headerPressed]}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.valueRow}>
              <Text style={[styles.value, isSet && styles.valueSet]}>{value}</Text>
              <Animated.View style={caretStyle}>
                <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
              </Animated.View>
            </View>
          </View>
        )}
      </Pressable>
      {expanded && (
        <View style={styles.body}>{children}</View>
      )}
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    // no overflow hidden — just a logical grouping
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  headerPressed: {
    backgroundColor: PRESSED_BG,
  },
  label: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: Colors.text,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  valueSet: {
    color: Colors.primary,
    fontFamily: FontFamily.semiBold,
  },
  body: {
    backgroundColor: '#fafbfc',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
  },
});
