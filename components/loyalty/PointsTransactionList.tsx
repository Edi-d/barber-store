import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PlatformXpTransaction } from '@/types/database';
import { transactionSourceLabel, relativeTimeLabel } from '@/lib/loyalty';
import { Colors, Typography, Spacing, Shadows, Bubble } from '@/constants/theme';

interface Props {
  transactions: PlatformXpTransaction[];
  emptyMessage?: string;
}

function iconNameForSource(source: string): keyof typeof Ionicons.glyphMap {
  if (source === 'order') return 'cart';
  if (source === 'appointment') return 'cut';
  if (source === 'voucher') return 'gift';
  if (source.startsWith('reverse')) return 'return-down-back';
  return 'star';
}

export function PointsTransactionList({
  transactions,
  emptyMessage = 'Încă nu ai tranzacții. Finalizează o programare sau plătește o comandă ca să primești puncte.',
}: Props) {
  if (transactions.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="sparkles-outline" size={26} color={Colors.primary} />
        </View>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
        <Text style={styles.emptyHint}>Cum castig puncte?</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={transactions}
      keyExtractor={(t) => t.id}
      scrollEnabled={false}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      renderItem={({ item }) => {
        const isPositive = item.amount >= 0;
        return (
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Ionicons
                name={iconNameForSource(item.source_type)}
                size={17}
                color={Colors.primary}
              />
            </View>
            <View style={styles.middle}>
              <Text style={styles.label}>{transactionSourceLabel(item.source_type)}</Text>
              <Text style={styles.time}>{relativeTimeLabel(item.created_at)}</Text>
            </View>
            <View style={[styles.amountChip, isPositive ? styles.chipPositive : styles.chipNegative]}>
              <Text style={[styles.amountText, isPositive ? styles.amountPositive : styles.amountNegative]}>
                {isPositive ? '+' : ''}
                {item.amount.toLocaleString('ro-RO')} p
              </Text>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 38,
    height: 38,
    ...Bubble.radiiSm,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1 },
  label: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  time: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  amountChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 10,
  },
  chipPositive: {
    backgroundColor: 'rgba(22,163,74,0.08)',
  },
  chipNegative: {
    backgroundColor: 'rgba(220,38,38,0.08)',
  },
  amountText: {
    ...Typography.captionSemiBold,
  },
  amountPositive: {
    color: '#16A34A',
  },
  amountNegative: {
    color: '#DC2626',
  },
  sep: {
    height: 1,
    backgroundColor: Colors.separator,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    ...Shadows.sm,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    ...Bubble.radiiSm,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  emptyText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyHint: {
    ...Typography.small,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
