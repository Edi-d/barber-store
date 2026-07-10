import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Brand, Bubble, Colors, FontFamily, Radius, Shadows, Spacing } from '@/constants/theme';
import {
  REWARD_CATEGORY_LABELS,
  TIER_LABELS,
  TIER_RANK,
  formatPoints,
  formatRon,
  type CatalogReward,
  type TierSlug,
} from '@/lib/salon-loyalty';

interface Props {
  reward: CatalogReward;
  currentPoints: number;
  userTier: TierSlug | null;
  enrolled: boolean;
  redeeming: boolean;
  onRedeem: (reward: CatalogReward) => void;
}

export function SalonRewardCard({
  reward,
  currentPoints,
  userTier,
  enrolled,
  redeeming,
  onRedeem,
}: Props) {
  const userRank = TIER_RANK[userTier ?? 'clipper'];
  const tierOk = userRank >= TIER_RANK[reward.requiredTier];
  const inStock = reward.remainingStock == null || reward.remainingStock > 0;
  const affordable = currentPoints >= reward.pointsCost;
  const canRedeem = enrolled && tierOk && inStock && affordable;

  const statusText = !inStock
    ? 'Stoc epuizat'
    : !tierOk
      ? `Disponibil de la nivelul ${TIER_LABELS[reward.requiredTier]}`
      : !affordable
        ? `Îți mai trebuie ${formatPoints(reward.pointsCost - currentPoints)} p`
        : null;

  return (
    <View style={[styles.card, canRedeem && styles.cardActive]}>
      {/* Top row: category chip + tier lock */}
      <View style={styles.topRow}>
        <View style={styles.categoryChip}>
          <Text style={styles.categoryText}>{REWARD_CATEGORY_LABELS[reward.category]}</Text>
        </View>
        {!tierOk && (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={11} color={Colors.textTertiary} />
            <Text style={styles.lockText}>{TIER_LABELS[reward.requiredTier]}</Text>
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={2}>
        {reward.name}
      </Text>
      {reward.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {reward.description}
        </Text>
      ) : null}

      {/* Meta row: cost + value + stock */}
      <View style={styles.metaRow}>
        <Text style={styles.cost}>{formatPoints(reward.pointsCost)} p</Text>
        {reward.realValueCents != null && (
          <Text style={styles.metaMuted}>valoare {formatRon(reward.realValueCents)}</Text>
        )}
        {reward.remainingStock != null && (
          <Text style={styles.metaMuted}>{reward.remainingStock} disp.</Text>
        )}
      </View>

      {/* CTA */}
      {canRedeem ? (
        <Pressable
          onPress={() => onRedeem(reward)}
          disabled={redeeming}
          style={({ pressed }) => [pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={[Brand.gradientStart, Brand.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cta}
          >
            {redeeming ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="gift" size={16} color="#FFFFFF" />
                <Text style={styles.ctaText}>Revendică</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      ) : (
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.base,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    ...Bubble.radiiSm,
    ...Shadows.sm,
  },
  cardActive: {
    borderColor: 'rgba(10,102,194,0.30)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryChip: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  categoryText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: Colors.primary,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lockText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 10,
    lineHeight: 14,
    color: Colors.textTertiary,
  },
  name: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    lineHeight: 21,
    color: Colors.text,
  },
  description: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  cost: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
    color: Colors.primary,
  },
  metaMuted: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textTertiary,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    ...Bubble.radiiSm,
    marginTop: Spacing.xs,
  },
  ctaText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: '#FFFFFF',
  },
  statusRow: {
    marginTop: Spacing.xs,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    ...Bubble.radiiSm,
  },
  statusText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    lineHeight: 17,
    color: Colors.textSecondary,
  },
});
