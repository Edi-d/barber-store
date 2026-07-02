import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, FontFamily, Radius, Shadows, Spacing } from '@/constants/theme';

interface Props {
  label: string;
  onPress: () => void;
}

/** Centered rounded-pill "see all" button used at the bottom of previewed lists.
 *  The visual pill lives on a plain View so it renders reliably; the Pressable
 *  is only the tap target + press feedback. */
export function SeeAllButton({ label, onPress }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
      >
        <View style={styles.btn}>
          <Text style={styles.label}>{label}</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: Radius.full,
    backgroundColor: '#E8F3FF',
    borderWidth: 1,
    borderColor: 'rgba(10,102,194,0.20)',
    ...Shadows.sm,
  },
  label: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: Colors.primary,
  },
});
