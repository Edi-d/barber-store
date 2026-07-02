import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { fetchMyVouchers, type LoyaltyVoucher, type VoucherStatus } from '@/lib/loyalty';
import { formatPrice } from '@/lib/utils';
import { SeeAllButton } from '@/components/loyalty/SeeAllButton';
import { Bubble, Shadows, FontFamily, Colors, Spacing, Radius } from '@/constants/theme';

interface Props {
  userId: string | undefined;
  /** When set, only this many vouchers are shown, followed by a button that
   *  navigates to the full list screen. Omit to render every voucher. */
  previewCount?: number;
}

const RO_MONTHS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  // A null/invalid timestamp parses to the epoch (or Invalid Date); don't render
  // a misleading "1 ian. 1970".
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return '—';
  return `${d.getDate()} ${RO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// An 'active' voucher whose expiry has passed is effectively expired — the DB
// sweep that flips the status is lazy, so reconcile against the clock here.
function effectiveStatus(v: LoyaltyVoucher): VoucherStatus {
  if (v.status !== 'active') return v.status;
  const exp = new Date(v.expires_at).getTime();
  // Guard against null/invalid timestamps: new Date(null) is the Unix epoch (0),
  // which is always < now and would flip a brand-new voucher to "expired" on the
  // first render. Treat a missing/unparseable expiry as still active.
  if (Number.isNaN(exp) || exp === 0) return 'active';
  return exp < Date.now() ? 'expired' : v.status;
}

const STATUS_META: Record<VoucherStatus, { label: string; color: string; bg: string }> = {
  active:    { label: 'Activ',   color: '#15803D', bg: '#DCFCE7' },
  used:      { label: 'Folosit', color: '#475569', bg: '#F1F5F9' },
  expired:   { label: 'Expirat', color: '#B91C1C', bg: '#FEE2E2' },
  cancelled: { label: 'Anulat',  color: '#475569', bg: '#F1F5F9' },
};

const FOOTER_ICON: Record<VoucherStatus, keyof typeof Ionicons.glyphMap> = {
  active: 'time-outline',
  used: 'checkmark-circle-outline',
  expired: 'alert-circle-outline',
  cancelled: 'close-circle-outline',
};

async function copyToClipboard(code: string): Promise<boolean> {
  try {
    // Lazy require: expo-clipboard resolves its native module at module-load
    // time, which throws on a dev client that hasn't been rebuilt yet. Deferring
    // the require here keeps the screen loadable; we fall back to an Alert when
    // the native module is absent. Becomes one-tap copy after the next rebuild.
    const Clipboard = require('expo-clipboard');
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return true;
  } catch {
    // Native clipboard unavailable (e.g. dev client not yet rebuilt) — show
    // the code so it can still be read/copied manually.
    Alert.alert('Cod voucher', code);
    return false;
  }
}

function VoucherCard({ voucher }: { voucher: LoyaltyVoucher }) {
  const [copied, setCopied] = useState(false);

  const status = effectiveStatus(voucher);
  const meta = STATUS_META[status];
  const isActive = status === 'active';

  const valueText =
    voucher.value_cents != null ? formatPrice(voucher.value_cents) : `${voucher.points_spent} puncte`;

  const dateText =
    status === 'used' && voucher.used_at
      ? `Folosit pe ${formatDate(voucher.used_at)}`
      : status === 'active'
        ? `Expiră pe ${formatDate(voucher.expires_at)}`
        : status === 'expired'
          ? `A expirat pe ${formatDate(voucher.expires_at)}`
          : 'Voucher anulat';

  const onCopy = async () => {
    const ok = await copyToClipboard(voucher.code);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View style={[styles.card, !isActive && styles.cardInactive]}>
      {/* Header: icon + value + status */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: meta.bg }]}>
          <Ionicons name="gift" size={20} color={meta.color} />
        </View>
        <View style={styles.headerMid}>
          <Text style={styles.value} numberOfLines={1}>
            {valueText}
          </Text>
          <Text style={styles.scope}>Valabil în salon</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      {/* Coupon code chip */}
      <View style={[styles.codeChip, !isActive && styles.codeChipInactive]}>
        <View style={styles.codeChipLeft}>
          <Text style={styles.codeLabel}>COD VOUCHER</Text>
          <Text style={styles.code} selectable>
            {voucher.code}
          </Text>
        </View>
        {isActive && (
          <Pressable
            onPress={onCopy}
            hitSlop={8}
            style={({ pressed }) => [
              styles.copyBtn,
              copied && styles.copyBtnDone,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={14}
              color={copied ? '#15803D' : Colors.primary}
            />
            <Text style={[styles.copyBtnText, copied && styles.copyBtnTextDone]}>
              {copied ? 'Copiat' : 'Copiază'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Footer meta */}
      <View style={styles.footerRow}>
        <Ionicons name={FOOTER_ICON[status]} size={13} color={Colors.textTertiary} />
        <Text style={styles.footerText}>{dateText}</Text>
      </View>
    </View>
  );
}

export function MyVouchersSection({ userId, previewCount }: Props) {
  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ['my-vouchers', userId],
    queryFn: () => (userId ? fetchMyVouchers(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  // Usable vouchers first, then everything else; newest-first within each group.
  const sorted = React.useMemo(() => {
    return [...vouchers].sort((a, b) => {
      const aActive = effectiveStatus(a) === 'active' ? 0 : 1;
      const bActive = effectiveStatus(b) === 'active' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [vouchers]);

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
        <View style={styles.emptyIconCircle}>
          <Ionicons name="ticket-outline" size={26} color={Colors.primary} />
        </View>
        <Text style={styles.emptyText}>
          Nu ai vouchere încă. Convertește puncte pentru a genera unul.
        </Text>
      </View>
    );
  }

  const isPreview = previewCount != null;
  const visible = isPreview ? sorted.slice(0, previewCount) : sorted;
  const hiddenCount = sorted.length - visible.length;

  return (
    <View style={styles.list}>
      {visible.map((v) => (
        <VoucherCard key={v.id} voucher={v} />
      ))}

      {isPreview && hiddenCount > 0 && (
        <SeeAllButton
          label={`Vezi toate voucherele (${sorted.length})`}
          onPress={() => router.push('/loyalty/vouchers')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.md },
  loadingWrap: { paddingVertical: Spacing.lg, alignItems: 'center' },

  emptyWrap: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    ...Bubble.radiiSm,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },

  /* Card */
  card: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.base,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    ...Bubble.radiiSm,
    ...Shadows.sm,
  },
  cardInactive: { opacity: 0.7 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    ...Bubble.radiiSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMid: { flex: 1, gap: 2 },
  value: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    lineHeight: 21,
    color: Colors.text,
  },
  scope: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textTertiary,
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

  /* Coupon code chip */
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    backgroundColor: '#F3F7FC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(10,102,194,0.22)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  codeChipInactive: {
    backgroundColor: '#F5F6F8',
    borderColor: '#E2E8F0',
  },
  codeChipLeft: { flex: 1, gap: 2 },
  codeLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 1,
    color: Colors.textTertiary,
  },
  code: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: 2,
    color: Colors.text,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(10,102,194,0.30)',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  copyBtnDone: {
    backgroundColor: '#DCFCE7',
    borderColor: 'rgba(21,128,61,0.35)',
  },
  copyBtnText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.primary,
  },
  copyBtnTextDone: { color: '#15803D' },

  /* Footer */
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerText: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textTertiary,
  },
});
