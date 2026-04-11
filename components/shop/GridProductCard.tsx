import { memo } from 'react';
import {
  Dimensions,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Brand, Bubble, Colors, Spacing, Typography } from '@/constants/theme';
import type { Product } from '@/data/types';

// ── Layout constants ─────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
const H_PAD = Spacing.lg; // 20
const GAP = Spacing.sm;   // 8

/** Exact pixel width for each grid column. Export so shop.tsx can use it. */
export const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - GAP) / 2;

// ── Popular categories set ────────────────────────────────────────────────────

const POPULAR_CATS = new Set(['clippers', 'wax', 'gel', 'trimmers', 'scissors']);

// ── Utility ──────────────────────────────────────────────────────────────────

/** Format a RON price: integer → no decimals, float → 2 decimals. */
export function formatRON(price: number): string {
  return price % 1 === 0 ? `${price}` : `${price.toFixed(2)}`;
}

// ── Card shadow (platform-specific) ──────────────────────────────────────────

const CARD_SHADOW = Platform.select({
  ios: {
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
  },
  android: { elevation: 3 },
}) as object;

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  product: Product;
  onPress: () => void;
};

function GridProductCardInner({ product, onPress }: Props) {
  const hasDiscount = product.partnerPrice < product.retailPrice;
  const discountPct = hasDiscount
    ? Math.round((1 - product.partnerPrice / product.retailPrice) * 100)
    : 0;

  return (
    <View style={[styles.cardOuter, CARD_SHADOW]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      >
        {/* ── Image area ── */}
        <View style={styles.imgWrap}>
          {product.images.length > 0 ? (
            <Image
              source={{ uri: product.images[0] }}
              style={styles.img}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.img, styles.imgPlaceholder]}>
              <Feather name="package" size={28} color={Colors.textTertiary} />
            </View>
          )}

          {/* Out of stock overlay */}
          {!product.inStock && (
            <View style={styles.oosOverlay}>
              <Text style={styles.oosOverlayTxt}>Stoc epuizat</Text>
            </View>
          )}

          {/* Discount badge — top-right */}
          {hasDiscount && product.inStock && (
            <View style={styles.discountBadgeWrap}>
              <LinearGradient
                colors={[Brand.gradientStart, Brand.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.discountBadge}
              >
                <Text style={styles.discountBadgeTxt}>-{discountPct}%</Text>
              </LinearGradient>
            </View>
          )}

          {/* Popular badge — top-left */}
          {product.inStock && POPULAR_CATS.has(product.category) && (
            <View style={styles.popularBadge}>
              <Feather name="trending-up" size={8} color="#fff" />
              <Text style={styles.popularBadgeTxt}>POPULAR</Text>
            </View>
          )}
        </View>

        {/* ── Info area ── */}
        <View style={styles.info}>
          {/* Brand row */}
          <View style={styles.brandRow}>
            <View style={styles.brandAccent} />
            <Text style={styles.brandTxt} numberOfLines={1}>
              {product.brand}
            </Text>
          </View>

          {/* Product name */}
          <Text style={styles.nameTxt} numberOfLines={2}>
            {product.name}
          </Text>

          {/* Price row */}
          <View style={styles.priceRow}>
            {/* Price block — flex-shrink so it never overlaps the add button */}
            <View style={styles.priceBlock}>
              <View style={styles.priceAmountRow}>
                <Text style={styles.priceTxt}>
                  {formatRON(product.partnerPrice)}
                </Text>
                <Text style={styles.priceSuffix}>RON</Text>
              </View>
              <Text style={styles.partnerLabel}>pret partener</Text>
              {hasDiscount && (
                <View style={styles.savingsRow}>
                  <Feather name="arrow-down" size={8} color={Colors.success} />
                  <Text style={styles.savingsTxt}>
                    Economisesti {formatRON(product.retailPrice - product.partnerPrice)} RON
                  </Text>
                </View>
              )}
            </View>

            {/* Add button */}
            <View style={styles.addBtn}>
              <Feather name="plus" size={16} color={Brand.white} />
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export const GridProductCard = memo(GridProductCardInner);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  /* Outer wrapper carries the shadow and explicit width */
  cardOuter: {
    width: CARD_WIDTH,
    ...Bubble.radii,
  },

  /* Inner card surface */
  card: {
    // Fix #7: 0.92 opacity solid white for better contrast (was 0.85)
    backgroundColor: 'rgba(255,255,255,0.92)',
    ...Bubble.radii,
    ...Bubble.accent,
    // Fix #8: subtle but visible border (was glassBorder rgba(255,255,255,0.6))
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },

  /* Image container */
  imgWrap: {
    width: '100%',
    // Fix #2: 1.1 aspect ratio (slightly wider than tall, was square 1:1)
    aspectRatio: 1.1,
    backgroundColor: '#F8F9FB',
    position: 'relative',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  imgPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,244,248,0.9)',
  },

  /* Out-of-stock overlay */
  oosOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oosOverlayTxt: {
    ...Typography.smallSemiBold,
    color: Colors.error,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  /* Discount badge */
  discountBadgeWrap: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
  },
  discountBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    // Fix #9: borderRadius 8 to match squircle design system (was 6)
    borderRadius: 8,
  },
  discountBadgeTxt: {
    ...Typography.smallSemiBold,
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },

  /* Popular badge */
  popularBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 3,
    // Consistent with discount badge
    borderRadius: 8,
  },
  popularBadgeTxt: {
    ...Typography.smallSemiBold,
    fontSize: 8,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  /* Info section */
  info: {
    // Fix #3: 12px padding (was 8px — too tight)
    padding: Spacing.md,
    gap: 2,
  },

  /* Brand row */
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  brandAccent: {
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: Brand.gradientStart,
    opacity: 0.6,
  },
  brandTxt: {
    ...Typography.small,
    // Fix #4: 10px (was 9px — illegible)
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.textTertiary,
    flex: 1,
  },

  /* Product name */
  nameTxt: {
    ...Typography.captionSemiBold,
    fontSize: 12,
    // Fix #5: lineHeight 17 and minHeight 34 (was lineHeight 16, minHeight 32)
    lineHeight: 17,
    color: Colors.text,
    minHeight: 34,
  },

  /* Price row */
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  // Fix #6: flexShrink + minWidth 0 prevents price block from expanding into add button
  priceBlock: {
    flexShrink: 1,
    minWidth: 0,
  },
  priceAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  priceTxt: {
    ...Typography.bodySemiBold,
    fontSize: 14,
    color: Brand.primary,
  },
  priceSuffix: {
    ...Typography.small,
    fontSize: 9,
    fontWeight: '600',
    color: Brand.primary,
  },
  partnerLabel: {
    ...Typography.small,
    fontSize: 7,
    color: Brand.primary,
    opacity: 0.7,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: -1,
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
    backgroundColor: 'rgba(46,125,50,0.08)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  savingsTxt: {
    ...Typography.small,
    fontSize: 9,
    color: Colors.success,
    fontWeight: '700',
  },

  /* Add button */
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Prevent button from shrinking
    flexShrink: 0,
  },
});
