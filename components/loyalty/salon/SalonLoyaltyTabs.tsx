import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Bubble, Colors, FontFamily, Shadows, Typography } from '@/constants/theme';

export type SalonLoyaltyTab = 'recompense' | 'vouchere' | 'istoric';

interface Props {
  active: SalonLoyaltyTab;
  onChange: (tab: SalonLoyaltyTab) => void;
  counts?: Partial<Record<SalonLoyaltyTab, number>>;
}

const TABS: { key: SalonLoyaltyTab; label: string }[] = [
  { key: 'recompense', label: 'Recompense' },
  { key: 'vouchere', label: 'Vouchere' },
  { key: 'istoric', label: 'Istoric' },
];

export function SalonLoyaltyTabs({ active, onChange, counts }: Props) {
  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const isActive = active === t.key;
        const count = counts?.[t.key];
        return (
          <Pressable
            key={t.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(t.key);
            }}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {t.label}
              {count != null && count > 0 ? ` ${count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#E4EAF2',
    ...Bubble.radii,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    ...Bubble.radiiSm,
  },
  tabActive: {
    backgroundColor: Colors.gradientStart,
    ...Shadows.sm,
  },
  label: {
    ...Typography.captionSemiBold,
    color: Colors.textSecondary,
  },
  labelActive: {
    color: Colors.white,
    fontFamily: FontFamily.semiBold,
  },
});
