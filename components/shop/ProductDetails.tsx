import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Typography, Colors } from '@/constants/theme';
import { formatPrice } from '@/lib/utils';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

interface ProductDetailsProps {
  title: string;
  priceCents: number;
  currency: string;
  stock: number | null;
  /** Whether the product is active/available for sale. Defaults to true. */
  active?: boolean;
  categoryLabel?: string;
}

export default function ProductDetails({
  title,
  priceCents,
  currency,
  stock,
  active = true,
  categoryLabel,
}: ProductDetailsProps) {
  const inStock = active && (stock === null || stock > 0);

  return (
    <Animated.View
      entering={FadeInDown.duration(400)
        .delay(100)
        .easing(SMOOTH)
        .withInitialValues({ transform: [{ translateY: 12 }] })}
      style={styles.container}
    >
      {/* Top row — Category pill + Stock badge */}
      <View style={styles.topRow}>
        {categoryLabel ? (
          <View style={[styles.categoryPill, { backgroundColor: Colors.primaryMuted }]}>
            <Text style={[styles.categoryText, { color: Colors.primary }]}>
              {categoryLabel}
            </Text>
          </View>
        ) : (
          <View />
        )}

        <View style={styles.stockBadge}>
          <View
            style={[
              styles.stockDot,
              { backgroundColor: inStock ? Colors.success : Colors.error },
            ]}
          />
          <Text style={[styles.stockText, { color: inStock ? Colors.success : Colors.error }]}>
            {inStock ? 'In stoc' : 'Stoc epuizat'}
          </Text>
        </View>
      </View>

      {/* Product name */}
      <Text style={[Typography.h2, styles.productName, { color: Colors.text }]}>
        {title}
      </Text>

      {/* Separator */}
      <View style={[styles.separator, { backgroundColor: Colors.separator }]} />

      {/* Price label */}
      <Text style={[styles.priceLabel, { color: Colors.textTertiary }]}>
        PRET
      </Text>

      {/* Price row */}
      <View style={styles.priceRow}>
        <Text style={[styles.mainPrice, { color: Colors.primary }]}>
          {formatPrice(priceCents, currency)}
        </Text>
      </View>

      {/* Low stock warning */}
      {stock !== null && stock > 0 && stock <= 5 && (
        <View style={[styles.savingsPill, { backgroundColor: '#FEF3C7' }]}>
          <Ionicons name="alert-circle-outline" size={13} color="#92400E" />
          <Text style={[styles.savingsText, { color: '#92400E' }]}>
            Doar {stock} in stoc
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },

  // Top row
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  categoryText: {
    ...Typography.smallSemiBold,
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stockText: {
    fontFamily: 'EuclidCircularA-Medium',
    fontSize: 12,
  },

  // Product name
  productName: {
    marginTop: 16,
  },

  // Separator
  separator: {
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    marginBottom: 16,
  },

  // Price label
  priceLabel: {
    fontFamily: 'EuclidCircularA-Medium',
    fontSize: 11,
    letterSpacing: 1.2,
  },

  // Price row
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 4,
  },
  mainPrice: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 32,
  },

  // Low stock pill (reuses savingsPill shape)
  savingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },
  savingsText: {
    ...Typography.smallSemiBold,
  },
});
