import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Image } from '@/components/ui/Image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { fetchVoucherTiers, convertPointsToVoucher } from '@/lib/loyalty';
import { VOUCHER_TIER_CONFIG } from '@/constants/loyalty';
import { useAuthStore } from '@/stores/authStore';
import { Bubble, Shadows, FontFamily, Colors, Spacing, Radius } from '@/constants/theme';

// Per-tier accent colors: progressively more premium as tiers increase
const VOUCHER_ACCENTS: Record<number, string> = {
  1000:  '#0A66C2', // base brand blue
  3000:  '#6366F1', // indigo — premium
  6000:  '#7C3AED', // purple — exclusive
  10000: '#F5A623', // gold — legendary
};

const VOUCHER_ICONS: Record<number, any> = {
  1000: require('@/assets/vouchers/voucher-1k.webp'),
  3000: require('@/assets/vouchers/voucher-3k.webp'),
  6000: require('@/assets/vouchers/voucher-6k.webp'),
  10000: require('@/assets/vouchers/voucher-10k.webp'),
};

function getAccent(tierPoints: number): string {
  return VOUCHER_ACCENTS[tierPoints] ?? Colors.primary;
}

interface Props {
  currentBalance: number;
}

export function VoucherConversionSection({ currentBalance }: Props) {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const [converting, setConverting] = useState<number | null>(null);

  const { data: tiers = VOUCHER_TIER_CONFIG.map((v) => ({
    tier_points: v.tierPoints,
    voucher_value_cents: v.voucherValueCents,
    label_ro: v.labelRo,
    bonus_pct: v.bonusPct,
    is_active: true,
    sort_order: v.sortOrder,
  })) } = useQuery({
    queryKey: ['xp-voucher-tiers'],
    queryFn: fetchVoucherTiers,
    staleTime: 5 * 60 * 1000,
  });

  const onConvert = async (tierPoints: number) => {
    if (!session?.user.id) return;
    if (converting !== null) return;
    if (currentBalance < tierPoints) return;
    setConverting(tierPoints);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const result = await convertPointsToVoucher(session.user.id, tierPoints);
      // Result shape is RPC-defined; be lenient. Common fields: code, voucher_id, value_cents.
      const code = (result?.code ?? result?.voucher_code) as string | undefined;
      Alert.alert(
        'Voucher generat',
        code ? `Codul tau: ${code}` : 'Voucherul a fost creat cu succes.',
      );
      queryClient.invalidateQueries({ queryKey: ['xp-balance'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['my-vouchers'] });
    } catch (err: any) {
      Alert.alert('Eroare', err?.message ?? 'Nu am putut genera voucherul.');
    } finally {
      setConverting(null);
    }
  };

  return (
    <View>
      {tiers.map((t) => {
        const canAfford = currentBalance >= t.tier_points;
        const isBusy = converting === t.tier_points;
        const accent = getAccent(t.tier_points);
        const iconBg = accent + '1A'; // ~10% alpha

        return (
          <Pressable
            key={t.tier_points}
            onPress={() => onConvert(t.tier_points)}
            disabled={!canAfford || isBusy}
            style={({ pressed }) => ({ opacity: !canAfford ? 0.45 : pressed ? 0.82 : 1 })}
          >
            <View style={styles.card}>
              {/* Icon circle */}
              <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                <Image
                  source={VOUCHER_ICONS[t.tier_points] ?? VOUCHER_ICONS[1000]}
                  style={styles.iconImage}
                  contentFit="cover"
                />
              </View>

              {/* Text column */}
              <View style={styles.textCol}>
                <Text style={styles.pointsLabel}>
                  {t.tier_points.toLocaleString('ro-RO')} puncte
                </Text>
                <View style={styles.subRow}>
                  <Text style={styles.voucherLabel}>Voucher {t.label_ro}</Text>
                  {t.bonus_pct > 0 && (
                    <View style={[styles.bonusChip, { backgroundColor: iconBg }]}>
                      <Text style={[styles.bonusText, { color: accent }]}>
                        +{t.bonus_pct}% bonus
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Right CTA */}
              {isBusy ? (
                <ActivityIndicator size="small" color={accent} />
              ) : canAfford ? (
                <View style={[styles.ctaSolid, { backgroundColor: accent }]}>
                  <Text style={styles.ctaSolidText}>Genereaza</Text>
                </View>
              ) : (
                <View style={styles.ctaBlocked}>
                  <Text style={styles.ctaBlockedText}>Blocat</Text>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: Spacing.base,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    ...Bubble.radiiSm,
    ...Shadows.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    overflow: 'hidden',
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  pointsLabel: {
    ...{
      fontFamily: FontFamily.semiBold,
      fontSize: 15,
      lineHeight: 20,
    },
    color: Colors.text,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  voucherLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 17,
    color: Colors.textSecondary,
  },
  bonusChip: {
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bonusText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
  },
  ctaSolid: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: Spacing.sm,
  },
  ctaSolidText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: '#FFFFFF',
  },
  ctaBlocked: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E1E8F0',
    marginLeft: Spacing.sm,
  },
  ctaBlockedText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textTertiary,
  },
});
