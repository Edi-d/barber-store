import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { fetchMyVouchers, type LoyaltyVoucher, type VoucherStatus } from '@/lib/loyalty';
import { formatPrice } from '@/lib/utils';
import { Bubble, Shadows, FontFamily, Colors, Spacing, Radius } from '@/constants/theme';

interface Props {
  userId: string | undefined;
}

const RO_MONTHS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${RO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// An 'active' voucher whose expiry has passed is effectively expired — the DB
// sweep that flips the status is lazy, so reconcile against the clock here.
function effectiveStatus(v: LoyaltyVoucher): VoucherStatus {
  if (v.status === 'active' && new Date(v.expires_at).getTime() < Date.now()) {
    return 'expired';
  }
  return v.status;
}

const STATUS_META: Record<VoucherStatus, { label: string; color: string; bg: string }> = {
  active:    { label: 'Activ',   color: '#15803D', bg: '#DCFCE7' },
  used:      { label: 'Folosit', color: '#475569', bg: '#F1F5F9' },
  expired:   { label: 'Expirat', color: '#B91C1C', bg: '#FEE2E2' },
  cancelled: { label: 'Anulat',  color: '#475569', bg: '#F1F5F9' },
};

function scopeLabel(scope: LoyaltyVoucher['scope']): string {
  switch (scope) {
    case 'services':    return 'Doar salon';
    case 'marketplace': return 'Doar shop';
    default:            return 'Salon & shop';
  }
}

export function MyVouchersSection({ userId }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ['my-vouchers', userId],
    queryFn: () => (userId ? fetchMyVouchers(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  // Usable vouchers first, then everything else; newest-first within each group.
  const sorted = useMemo(() => {
    return [...vouchers].sort((a, b) => {
      const aActive = effectiveStatus(a) === 'active' ? 0 : 1;
      const bActive = effectiveStatus(b) === 'active' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [vouchers]);

  const onCopy = async (code: string) => {
    try {
      // Lazy require: expo-clipboard resolves its native module at module-load
      // time, which throws on a dev client that hasn't been rebuilt yet. Deferring
      // the require here keeps the screen loadable; we fall back to an Alert when
      // the native module is absent. Becomes one-tap copy after the next rebuild.
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1600);
    } catch {
      // Native clipboard unavailable (e.g. dev client not yet rebuilt) — show
      // the code so it can still be read/copied manually.
      Alert.alert('Cod voucher', code);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (sorted.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="ticket-outline" size={26} color={Colors.textTertiary} />
        <Text style={styles.emptyText}>
          Nu ai vouchere încă. Convertește puncte mai sus pentru a genera unul.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.md }}>
      {sorted.map((v) => {
        const status = effectiveStatus(v);
        const meta = STATUS_META[status];
        const isActive = status === 'active';
        const justCopied = copied === v.code;

        return (
          <Pressable
            key={v.id}
            onPress={isActive ? () => onCopy(v.code) : undefined}
            disabled={!isActive}
            style={({ pressed }) => [styles.card, { opacity: !isActive ? 0.6 : pressed ? 0.85 : 1 }]}
          >
            {/* Left icon */}
            <View style={[styles.iconCircle, { backgroundColor: meta.bg }]}>
              <Ionicons name="gift-outline" size={22} color={meta.color} />
            </View>

            {/* Middle: value + code + meta */}
            <View style={styles.textCol}>
              <Text style={styles.value}>
                {v.value_cents != null ? formatPrice(v.value_cents) : `${v.points_spent} puncte`}
              </Text>
              <Text style={styles.code} selectable>
                {v.code}
              </Text>
              <Text style={styles.metaLine}>
                {scopeLabel(v.scope)} · {status === 'used' && v.used_at
                  ? `Folosit ${formatDate(v.used_at)}`
                  : status === 'active'
                    ? `Expiră ${formatDate(v.expires_at)}`
                    : status === 'expired'
                      ? `Expirat ${formatDate(v.expires_at)}`
                      : 'Anulat'}
              </Text>
            </View>

            {/* Right: status pill + copy hint */}
            <View style={styles.rightCol}>
              <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              {isActive && (
                <View style={styles.copyRow}>
                  <Ionicons
                    name={justCopied ? 'checkmark' : 'copy-outline'}
                    size={13}
                    color={justCopied ? '#15803D' : Colors.textTertiary}
                  />
                  <Text style={[styles.copyText, justCopied && { color: '#15803D' }]}>
                    {justCopied ? 'Copiat' : 'Copiază'}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: Spacing.lg, alignItems: 'center' },
  emptyWrap: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  emptyText: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    ...Bubble.radiiSm,
    ...Shadows.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    ...Bubble.radiiSm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  textCol: { flex: 1, gap: 2 },
  value: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: Colors.text,
  },
  code: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1,
    color: Colors.primary,
  },
  metaLine: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: Colors.textTertiary,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: Spacing.sm,
  },
  statusPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  copyText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: Colors.textTertiary,
  },
});
