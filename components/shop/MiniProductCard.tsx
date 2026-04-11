import { memo } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Brand, Bubble, Colors, Spacing, Typography } from '@/constants/theme';
import type { Product } from '@/data/types';

// ─── Layout constants ────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
export const MINI_CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2;

// ─── Utility ─────────────────────────────────────────────────────────────────

export function formatRON(price: number): string {
  return price % 1 === 0 ? `${price}` : `${price.toFixed(2)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  product: Product;
};

function MiniProductCardInner({ product }: Props) {
  const hasDiscount = product.partnerPrice < product.retailPrice;
  const discountPct = hasDiscount
    ? Math.round((1 - product.partnerPrice / product.retailPrice) * 100)
    : 0;

  return (
    <View style={styles.card}>
      {/* Image area */}
      <View style={styles.imgWrap}>
        {product.images.length > 0 ? (
          <Image
            source={{ uri: product.images[0] }}
            style={styles.img}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.imgPlaceholder}>
            <Feather name="package" size={22} color={Colors.textTertiary} />
          </View>
        )}

        {hasDiscount && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountTxt}>-{discountPct}%</Text>
          </View>
        )}
      </View>

      {/* Info area */}
      <View style={styles.info}>
        <Text style={styles.brand} numberOfLines={1}>
          {product.brand}
        </Text>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.price}>
          {formatRON(product.partnerPrice)} RON
        </Text>
      </View>
    </View>
  );
}

export const MiniProductCard = memo(MiniProductCardInner);

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    ...Bubble.radii,
    ...Bubble.accent,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },

  // Image
  imgWrap: {
    width: '100%',
    height: MINI_CARD_WIDTH * 0.75,
    backgroundColor: '#F8F9FB',
    position: 'relative',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  imgPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8F9FB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Discount badge
  discountBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: Brand.gradientStart,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  discountTxt: {
    ...Typography.small,
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },

  // Text info
  info: {
    padding: Spacing.md,
    gap: 2,
  },
  brand: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.textTertiary,
  },
  name: {
    ...Typography.small,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.text,
    minHeight: 32,
  },
  price: {
    ...Typography.smallSemiBold,
    fontSize: 13,
    fontWeight: '700',
    color: Brand.primary,
  },
});
