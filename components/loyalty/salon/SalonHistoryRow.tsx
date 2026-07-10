import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Spacing } from '@/constants/theme';
import {
  txnMeta,
  relativeTimeLabel,
  formatPoints,
  type PointHistoryItem,
} from '@/lib/salon-loyalty';

const TONE = {
  earn: { color: '#15803D', bg: '#DCFCE7', icon: 'add' as const },
  spend: { color: Colors.primary, bg: Colors.primaryMuted, icon: 'gift' as const },
  neutral: { color: '#64748B', bg: '#F1F5F9', icon: 'sync' as const },
};

export function SalonHistoryRow({ item }: { item: PointHistoryItem }) {
  const meta = txnMeta(item.type);
  const tone = TONE[meta.tone];
  const sign = item.amount > 0 ? '+' : item.amount < 0 ? '−' : '';
  const amount = `${sign}${formatPoints(Math.abs(item.amount))}`;

  return (
    <View style={styles.row}>
      <View style={[styles.iconChip, { backgroundColor: tone.bg }]}>
        <Ionicons name={tone.icon} size={16} color={tone.color} />
      </View>
      <View style={styles.mid}>
        <Text style={styles.label} numberOfLines={1}>
          {item.description || meta.label}
        </Text>
        <Text style={styles.time}>{relativeTimeLabel(item.createdAt)}</Text>
      </View>
      <Text style={[styles.amount, { color: item.amount >= 0 ? '#15803D' : Colors.text }]}>
        {amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 10,
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1, gap: 2 },
  label: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: Colors.text,
  },
  time: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textTertiary,
  },
  amount: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
  },
});
