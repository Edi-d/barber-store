/**
 * MarketplaceProductCard — barber-store.ro–style product card.
 *
 * Layout matches the web shop 1:1 so customers familiar with
 * barber-store.ro have zero learning curve in the app:
 *
 *   ┌──────────────────────────┐
 *   │ [-40%] [NOU]             │  ← top-left badge stack
 *   │                          │
 *   │      product image       │
 *   │                          │
 *   ├──────────────────────────┤
 *   │ BRAND (small, uppercase) │
 *   │ Product title (2 lines)  │
 *   │ PRP: 1175,90 lei         │  ← struck-through PRP (if present)
 *   │ 1069,00 lei              │  ← struck-through list price
 *   │ 641,00 lei               │  ← current price, brand-blue, bold
 *   │ [Adauga in cos]          │  ← gradient CTA
 *   └──────────────────────────┘
 *
 * Ported from Tapzi-barber/components/marketplace/MarketplaceProductCard.tsx.
 * Adaptations for barber-store:
 *   1. useMarketplaceCart → useMarketplaceCartStore shim via @/hooks/use-marketplace-cart
 *   2. Colors[colorScheme] — already nested in target theme.ts (no extra shim needed)
 *   3. NativeWind className on Pressable for layout; style={} for shadows/gradients
 */

import { memo, useCallback, useMemo } from 'react';
import {
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  Brand,
  Bubble,
  Colors,
  FontFamily,
  Shadows,
  Spacing,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { MarketplaceProduct } from '@/hooks/use-marketplace-catalog';
import { useMarketplaceCart } from '@/hooks/use-marketplace-cart';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Default: 2-column grid with Spacing.lg gutters and a Spacing.sm middle gap.
// When a `width` prop is supplied (carousel, grid), that value takes precedence.
const DEFAULT_CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2;

// "NOU" if the product was created within this many days.
const NEW_BADGE_DAYS = 30;

// barber-store badge palette — kept identical to the web shop on purpose.
const BADGE_DISCOUNT_BG = '#B51F29';
const BADGE_NEW_BG = '#36A852';

// Spring config — snappy but not jarring.
const SPRING_CFG = { mass: 0.6, damping: 18, stiffness: 280 };

type Props = {
  product: MarketplaceProduct & {
    prp_cents?: number | null;
    compare_at_price_cents?: number | null;
  };
  onPress: () => void;
  /** Override card width (for carousels or grids that know their column width). */
  width?: number;
};

function formatLei(cents: number): string {
  // Romanian convention: comma as decimal, two decimals always shown.
  return `${(cents / 100).toFixed(2).replace('.', ',')} lei`;
}

function discountPct(from: number, to: number): number {
  if (from <= 0 || to >= from) return 0;
  return Math.round(((from - to) / from) * 100);
}

function isNewProduct(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const ageDays = (Date.now() - created) / 86_400_000;
  return ageDays >= 0 && ageDays <= NEW_BADGE_DAYS;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function MarketplaceProductCardBase({ product, onPress, width }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const cart = useMarketplaceCart();

  const cardWidth = width ?? DEFAULT_CARD_WIDTH;
  // Image is always a 1:1 square relative to card width.
  const imageHeight = cardWidth;

  const imageUrl = useMemo(() => {
    const imgs = product.images ?? [];
    return imgs.length > 0 ? imgs[0] : null;
  }, [product.images]);

  const outOfStock = product.stock_qty <= 0;

  const finalCents = product.price_cents;
  const compareCents = product.compare_at_price_cents ?? null;
  const prpCents = product.prp_cents ?? null;
  const showCompareTier = compareCents != null && compareCents > finalCents;
  const showPrpTier = prpCents != null && prpCents > finalCents;
  const discountFrom = prpCents ?? compareCents ?? 0;
  const pct = showPrpTier || showCompareTier ? discountPct(discountFrom, finalCents) : 0;
  const showNew = isNewProduct(product.created_at);

  // ── Reanimated scale for the whole card ─────────────────
  const cardScale = useSharedValue(1);
  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  // ── Reanimated scale for the CTA button ─────────────────
  const ctaScale = useSharedValue(1);
  const ctaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  const handleQuickAdd = useCallback(() => {
    if (outOfStock) return;
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    cart.addItem({
      product_id: product.id,
      qty: 1,
      unit_price_cents: product.price_cents,
      title_snapshot: product.name,
      image_url: imageUrl,
      brand: product.brand,
    });
  }, [cart, product, imageUrl, outOfStock]);

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { cardScale.value = withSpring(0.98, SPRING_CFG); }}
      onPressOut={() => { cardScale.value = withSpring(1, SPRING_CFG); }}
      style={[
        styles.card,
        Shadows.sm,
        { width: cardWidth, backgroundColor: colors.background },
        cardAnimStyle,
      ]}
      accessibilityRole="button"
      accessibilityLabel={product.name}
    >
      {/* Image area */}
      <View style={[styles.imageWrap, { height: imageHeight }]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Feather name="image" size={28} color={colors.textTertiary} />
          </View>
        )}

        {/* Badges — top-left stack */}
        <View style={styles.badgeStack} pointerEvents="none">
          {pct > 0 && (
            <View style={[styles.badge, { backgroundColor: BADGE_DISCOUNT_BG }]}>
              <Text style={styles.badgeText}>-{pct}%</Text>
            </View>
          )}
          {showNew && (
            <View style={[styles.badge, { backgroundColor: BADGE_NEW_BG }]}>
              <Text style={styles.badgeText}>NOU</Text>
            </View>
          )}
        </View>

        {/* Out-of-stock overlay */}
        {outOfStock && (
          <View style={styles.oosOverlay} pointerEvents="none">
            <View style={styles.oosPill}>
              <Text style={styles.oosText}>INDISPONIBIL</Text>
            </View>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        {product.brand ? (
          <Text style={[styles.brand, { color: colors.textSecondary }]} numberOfLines={1}>
            {product.brand.toUpperCase()}
          </Text>
        ) : null}

        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {product.name}
        </Text>

        {/* 3-tier price column */}
        <View style={styles.priceCol}>
          {showPrpTier && (
            <Text style={[styles.priceTierStrike, { color: colors.textTertiary }]}>
              PRP: {formatLei(prpCents!)}
            </Text>
          )}
          {showCompareTier && (
            <Text style={[styles.priceTierStrike, { color: colors.textTertiary }]}>
              {formatLei(compareCents!)}
            </Text>
          )}
          <Text style={styles.priceFinal}>
            {formatLei(finalCents)}
          </Text>
        </View>

        {/* CTA */}
        <Animated.View
          style={[
            styles.ctaShadow,
            outOfStock && styles.ctaDisabled,
            ctaAnimStyle,
          ]}
        >
          <Pressable
            onPress={handleQuickAdd}
            onPressIn={() => {
              if (!outOfStock) ctaScale.value = withSpring(0.97, SPRING_CFG);
            }}
            onPressOut={() => { ctaScale.value = withSpring(1, SPRING_CFG); }}
            disabled={outOfStock}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Adauga in cos"
          >
            <LinearGradient
              colors={[Brand.gradientStart, Brand.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              <Feather name="shopping-bag" size={13} color={Brand.white} />
              <Text style={styles.ctaText}>Adauga in cos</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </AnimatedPressable>
  );
}

export const MarketplaceProductCard = memo(MarketplaceProductCardBase);

const styles = StyleSheet.create({
  card: {
    // width is set dynamically via inline style — do NOT set it here.
    ...Bubble.radii,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },

  imageWrap: {
    // height is set dynamically (1:1 square relative to card width).
    width: '100%',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
  },

  badgeStack: {
    position: 'absolute',
    top: Spacing.xs,
    left: Spacing.xs,
    gap: 4,
    alignItems: 'flex-start',
  },
  badge: {
    minWidth: 50,
    paddingHorizontal: 6,
    paddingVertical: 3,
    ...Bubble.radiiSm,
    alignItems: 'center',
  },
  badgeText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  oosOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oosPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    ...Bubble.radiiSm,
    overflow: 'hidden',
  },
  oosText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: '#1B1F27',
    letterSpacing: 0.4,
  },

  info: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: 4,
  },
  brand: {
    fontFamily: FontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    lineHeight: 17,
    minHeight: 34,
  },

  priceCol: {
    marginTop: Spacing.xs,
    gap: 1,
  },
  priceTierStrike: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    textDecorationLine: 'line-through',
  },
  priceFinal: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: Brand.primary,
    letterSpacing: 0.2,
    marginTop: 2,
  },

  ctaShadow: {
    marginTop: Spacing.sm,
    ...Bubble.radiiSm,
    overflow: 'hidden',
    ...Shadows.glow,
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    ...Bubble.radiiSm,
  },
  ctaText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
