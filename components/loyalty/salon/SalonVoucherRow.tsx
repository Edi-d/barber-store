import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Bubble, Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import {
  effectiveVoucherStatus,
  VOUCHER_STATUS_META,
  type SalonRewardVoucher,
} from '@/lib/salon-loyalty';
import { RewardCodeModal } from './RewardCodeModal';

const RO_MONTHS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return '—';
  return `${d.getDate()} ${RO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function SalonVoucherRow({ voucher }: { voucher: SalonRewardVoucher }) {
  const [open, setOpen] = useState(false);
  const status = effectiveVoucherStatus(voucher);
  const meta = VOUCHER_STATUS_META[status];
  const isActive = status === 'active';
  const name = voucher.reward?.name ?? 'Recompensă';

  const dateText =
    status === 'used' && voucher.usedAt
      ? `Folosit pe ${formatDate(voucher.usedAt)}`
      : status === 'active'
        ? `Expiră pe ${formatDate(voucher.expiresAt)}`
        : status === 'expired'
          ? `A expirat pe ${formatDate(voucher.expiresAt)}`
          : 'Voucher anulat';

  return (
    <Pressable
      style={[styles.row, !isActive && styles.rowInactive]}
      onPress={() => isActive && setOpen(true)}
      disabled={!isActive}
    >
      <View style={[styles.iconChip, { backgroundColor: meta.bg }]}>
        <Ionicons name="gift" size={20} color={meta.color} />
      </View>
      <View style={styles.mid}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {voucher.pointsSpent} p · {dateText}
        </Text>
      </View>
      {isActive ? (
        <View style={styles.qrHint}>
          <Ionicons name="qr-code-outline" size={18} color={Colors.primary} />
        </View>
      ) : (
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      )}

      <RewardCodeModal
        visible={open}
        onClose={() => setOpen(false)}
        title={name}
        code={voucher.code}
        subtitle={`Expiră pe ${formatDate(voucher.expiresAt)}`}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEF2F6',
    ...Bubble.radiiSm,
  },
  rowInactive: { opacity: 0.7 },
  iconChip: {
    width: 44,
    height: 44,
    ...Bubble.radiiSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1, gap: 2 },
  name: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: Colors.text,
  },
  sub: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textTertiary,
  },
  qrHint: {
    width: 36,
    height: 34,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,102,194,0.30)',
  },
  statusPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
  },
});
