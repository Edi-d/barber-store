import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from '@/components/ui/Image';
import { Ionicons } from '@expo/vector-icons';
import { Brand, Bubble, FontFamily, Shadows, Spacing } from '@/constants/theme';
import { TierBadge } from '@/components/loyalty/TierBadge';
import {
  TIER_RANK,
  formatPoints,
  type SalonLoyaltyCard,
} from '@/lib/salon-loyalty';

interface Props {
  card: SalonLoyaltyCard;
  width: number;
  height?: number;
}

export function SalonWalletCard({ card, width, height = 196 }: Props) {
  const { progress } = card;
  const tierLevel = progress ? TIER_RANK[progress.currentTier] : 1;

  return (
    <View style={[styles.card, { width, height }, Shadows.md]}>
      {/* Cover */}
      {card.coverUrl ? (
        <Image source={{ uri: card.coverUrl }} style={styles.cover} contentFit="cover" transition={150} />
      ) : (
        <LinearGradient
          colors={[Brand.gradientStart, Brand.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cover}
        />
      )}
      {/* Dark scrim for text legibility */}
      <LinearGradient
        colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.55)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.inner}>
        {/* Top: logo + name + city */}
        <View style={styles.topRow}>
          {card.avatarUrl ? (
            <Image source={{ uri: card.avatarUrl }} style={styles.logo} contentFit="cover" />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Text style={styles.logoInitial}>{(card.name || '?').trim().charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.nameCol}>
            <Text style={styles.name} numberOfLines={1}>
              {card.name}
            </Text>
            {card.city ? (
              <Text style={styles.city} numberOfLines={1}>
                {card.city}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Bottom: points + tier + progress */}
        {card.enrolled && progress ? (
          <View style={styles.bottom}>
            <View style={styles.pointsRow}>
              <View>
                <Text style={styles.points}>{formatPoints(card.currentPoints)}</Text>
                <Text style={styles.pointsLabel}>puncte</Text>
              </View>
              <View style={styles.tierPill}>
                <TierBadge level={tierLevel} size="sm" />
                <Text style={styles.tierLabel}>{progress.currentLabel}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress.pct}%` }]} />
            </View>
            <Text style={styles.progressCaption}>
              {progress.nextLabel && progress.pointsToNext != null
                ? `${formatPoints(progress.pointsToNext)} p până la ${progress.nextLabel}`
                : 'Nivel maxim atins 🎉'}
            </Text>
          </View>
        ) : (
          <View style={styles.bottom}>
            <View style={styles.mutedRow}>
              <Ionicons
                name={card.hasProgram ? 'sparkles-outline' : 'information-circle-outline'}
                size={16}
                color="rgba(255,255,255,0.9)"
              />
              <Text style={styles.mutedText}>
                {card.hasProgram
                  ? 'Fă o programare pentru a acumula puncte'
                  : 'Fără program de loialitate'}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...Bubble.radii,
    overflow: 'hidden',
    backgroundColor: Brand.navy,
  },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  inner: {
    flex: 1,
    padding: Spacing.base,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logo: {
    width: 40,
    height: 40,
    // Inline radii (not ...Bubble.radiiSm) — that token is cast as ViewStyle and,
    // spread into a style used on expo-image, breaks the ImageStyle inference.
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
  logoInitial: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  nameCol: { flex: 1 },
  name: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    lineHeight: 22,
    color: '#FFFFFF',
  },
  city: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.75)',
  },
  bottom: { gap: 8 },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  points: {
    fontFamily: FontFamily.bold,
    fontSize: 32,
    lineHeight: 36,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  pointsLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
  },
  tierLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    lineHeight: 17,
    color: '#FFFFFF',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  progressCaption: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.8)',
  },
  mutedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mutedText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.9)',
    flex: 1,
  },
});
