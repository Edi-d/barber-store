import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Image, Dimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  runOnJS,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

import { Brand, Spacing, Typography, Colors, Shadows, Bubble } from '@/constants/theme';
import type { Product } from '@/data/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2;
const IMAGE_HEIGHT = CARD_WIDTH * 0.9;

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

const PARTICLE_COUNT = 8;
const PARTICLE_COLORS = [
  Brand.primary,
  Brand.primaryLight,
  Brand.gradientStart,
  Brand.gradientEnd,
  Brand.indigo,
  '#38BDF8', // sky blue
  '#818CF8', // indigo light
  Brand.primary,
];

/** Categories considered "popular" for badge display */
const POPULAR_CATEGORIES = new Set(['clippers', 'wax', 'gel']);

/**
 * Deterministic pseudo-random check for "limited stock" badge.
 * Uses SKU hash so the same product always shows/hides the badge consistently.
 */
function isLimitedStock(sku: string): boolean {
  let hash = 0;
  for (let i = 0; i < sku.length; i++) {
    hash = ((hash << 5) - hash + sku.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100 < 15; // ~15% of products
}

type Props = {
  product: Product;
  inCart: boolean;
  cartQuantity?: number;
  onAddToCart: () => void;
  onRemoveFromCart?: () => void;
  onSetQuantity?: (quantity: number) => void;
  onPress?: () => void;
};

/** A single animated particle dot */
function Particle({ index, trigger }: { index: number; trigger: SharedValue<number> }) {
  const angle = (index / PARTICLE_COUNT) * 2 * Math.PI;
  const distance = 22 + (index % 3) * 6;

  const animStyle = useAnimatedStyle(() => {
    const progress = trigger.value;
    const tx = Math.cos(angle) * distance * progress;
    const ty = Math.sin(angle) * distance * progress;
    return {
      opacity: progress > 0 ? 1 - progress * 0.8 : 0,
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale: 1 - progress * 0.6 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        { backgroundColor: PARTICLE_COLORS[index % PARTICLE_COLORS.length] },
        animStyle,
      ]}
    />
  );
}

const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => i);

/** Subtle pulse on discount badge */
function DiscountBadge({ discountPercent }: { discountPercent: number }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1200, easing: SMOOTH }),
        withTiming(1, { duration: 1200, easing: SMOOTH }),
      ),
      -1,
      true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <Animated.View style={[styles.discountBadgeWrap, pulseStyle]}>
      <LinearGradient
        colors={[Brand.gradientStart, Brand.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.discountBadge}
      >
        <Text style={styles.discountText}>-{discountPercent}%</Text>
      </LinearGradient>
    </Animated.View>
  );
}

function ProductCardInner({
  product,
  inCart,
  cartQuantity = 0,
  onAddToCart,
  onRemoveFromCart,
  onSetQuantity,
  onPress,
}: Props) {
  const [imageLoading, setImageLoading] = useState(true);

  const btnScale = useSharedValue(1);
  const particleProgress = useSharedValue(0);
  const checkScale = useSharedValue(inCart ? 1 : 0);
  const isAnimating = useRef(false);

  const hasDiscount = product.retailPrice > product.partnerPrice;
  const discountPercent = hasDiscount
    ? Math.round((1 - product.partnerPrice / product.retailPrice) * 100)
    : 0;
  const savings = hasDiscount
    ? Math.round((product.retailPrice - product.partnerPrice) * 100) / 100
    : 0;

  const showPopular = POPULAR_CATEGORIES.has(product.category) && product.inStock;
  const showLimitedStock = product.inStock && isLimitedStock(product.sku) && !showPopular;

  const formatPrice = (price: number) =>
    price % 1 === 0 ? `${price}` : `${price.toFixed(2)}`;

  const fireHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const fireLight = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleAdd = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;

    runOnJS(fireHaptic)();

    btnScale.value = withSequence(
      withTiming(0.7, { duration: 80, easing: SMOOTH }),
      withTiming(1.1, { duration: 120, easing: SMOOTH }),
      withTiming(1, { duration: 100, easing: SMOOTH }),
    );

    particleProgress.value = 0;
    particleProgress.value = withTiming(1, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });

    checkScale.value = withDelay(
      150,
      withTiming(1, { duration: 250, easing: SMOOTH }),
    );

    onAddToCart();

    setTimeout(() => {
      isAnimating.current = false;
    }, 500);
  }, [onAddToCart, btnScale, particleProgress, checkScale, fireHaptic]);

  const handleIncrement = useCallback(() => {
    runOnJS(fireLight)();
    onAddToCart();
  }, [onAddToCart, fireLight]);

  const handleDecrement = useCallback(() => {
    runOnJS(fireLight)();
    if (cartQuantity <= 1) {
      onRemoveFromCart?.();
    } else {
      onSetQuantity?.(cartQuantity - 1);
    }
  }, [cartQuantity, onRemoveFromCart, onSetQuantity, fireLight]);

  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const checkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  return (
    <Pressable style={[styles.shadow, Shadows.sm]} onPress={onPress}>
      <View style={styles.card}>
        {/* Image area */}
        <View style={styles.imageContainer}>
          {product.images.length > 0 ? (
            <>
              {imageLoading && (
                <View style={[styles.image, styles.imagePlaceholder]}>
                  <Feather name="package" size={28} color={Colors.textTertiary} />
                </View>
              )}
              <Image
                source={{ uri: product.images[0] }}
                style={[styles.image, imageLoading && styles.imageHidden]}
                resizeMode="contain"
                onLoad={() => setImageLoading(false)}
              />
            </>
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Feather name="package" size={28} color={Colors.textTertiary} />
            </View>
          )}

          {/* Discount badge — top-right corner with pulse */}
          {hasDiscount && <DiscountBadge discountPercent={discountPercent} />}

          {/* POPULAR badge — top-left */}
          {showPopular && (
            <View style={styles.popularBadge}>
              <Feather name="trending-up" size={8} color="#fff" />
              <Text style={styles.popularText}>POPULAR</Text>
            </View>
          )}

          {/* STOC LIMITAT badge — top-left */}
          {showLimitedStock && (
            <View style={styles.limitedBadge}>
              <Feather name="clock" size={8} color="#fff" />
              <Text style={styles.limitedText}>STOC LIMITAT</Text>
            </View>
          )}

          {/* Cart quantity badge — bottom-right of image */}
          {inCart && cartQuantity > 0 && (
            <View style={styles.cartQtyBadge}>
              <Text style={styles.cartQtyText}>{cartQuantity}</Text>
            </View>
          )}

          {/* Out of stock overlay */}
          {!product.inStock && (
            <View style={styles.outOfStockOverlay}>
              <Text style={styles.outOfStockText}>Stoc epuizat</Text>
            </View>
          )}
        </View>

        {/* Product info */}
        <View style={styles.info}>
          {/* Brand with accent line */}
          <View style={styles.brandRow}>
            <View style={styles.brandAccent} />
            <Text style={[styles.brand, { color: Colors.textTertiary }]} numberOfLines={1}>
              {product.brand}
            </Text>
          </View>

          <Text style={[styles.name, { color: Colors.text }]} numberOfLines={2}>
            {product.name}
          </Text>

          {/* Price section */}
          <View style={styles.priceRow}>
            <View style={styles.prices}>
              <View style={styles.partnerPriceRow}>
                <Text style={[styles.partnerPrice, { color: Brand.primary }]}>
                  {formatPrice(product.partnerPrice)}
                </Text>
                <Text style={[styles.priceSuffix, { color: Brand.primary }]}>
                  RON
                </Text>
              </View>
              <Text style={styles.partnerLabel}>pret partener</Text>
              {hasDiscount && (
                <>
                  <View style={styles.retailPriceRow}>
                    <Text style={[styles.retailPrice, { color: Colors.textTertiary }]}>
                      {formatPrice(product.retailPrice)}
                    </Text>
                    <Text style={[styles.retailPriceSuffix, { color: Colors.textTertiary }]}>
                      RON
                    </Text>
                  </View>
                  <View style={styles.savingsRow}>
                    <Feather name="arrow-down" size={8} color={Colors.success} />
                    <Text style={styles.savingsText}>
                      Economisesti {formatPrice(savings)} RON
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Add-to-cart / Quantity controls */}
            <View style={styles.addBtnContainer}>
              {inCart && cartQuantity > 0 && onSetQuantity ? (
                /* Quantity +/- controls */
                <View style={styles.qtyControls}>
                  <Pressable onPress={handleDecrement} style={styles.qtyBtn} hitSlop={6}>
                    <Feather
                      name={cartQuantity <= 1 ? 'trash-2' : 'minus'}
                      size={12}
                      color={cartQuantity <= 1 ? Colors.error : Brand.primary}
                    />
                  </Pressable>
                  <Text style={[styles.qtyValue, { color: Colors.text }]}>{cartQuantity}</Text>
                  <Pressable onPress={handleIncrement} style={styles.qtyBtn} hitSlop={6}>
                    <Feather name="plus" size={12} color={Brand.primary} />
                  </Pressable>
                </View>
              ) : (
                /* Add to cart button with particles */
                <>
                  <View style={styles.particlesContainer}>
                    {particles.map((i) => (
                      <Particle key={i} index={i} trigger={particleProgress} />
                    ))}
                  </View>

                  <Pressable onPress={handleAdd} disabled={!product.inStock}>
                    <Animated.View style={btnAnimStyle}>
                      {inCart ? (
                        <Animated.View style={[styles.addBtnCheck, checkAnimStyle]}>
                          <Feather name="check" size={16} color="#fff" />
                        </Animated.View>
                      ) : (
                        <LinearGradient
                          colors={[Brand.gradientStart, Brand.gradientEnd]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.addBtnGradient}
                        >
                          <Feather name="plus" size={16} color="#fff" />
                        </LinearGradient>
                      )}
                    </Animated.View>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export const ProductCard = memo(ProductCardInner);

const styles = StyleSheet.create({
  shadow: {
    width: CARD_WIDTH,
    marginBottom: Spacing.sm,
    ...Bubble.radii,
  },
  card: {
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
  },
  imageContainer: {
    width: '100%',
    height: IMAGE_HEIGHT,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: Colors.white,
  },
  imageHidden: {
    position: 'absolute',
    opacity: 0,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,244,248,0.9)',
  },
  discountBadgeWrap: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
  },
  discountBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 8,
  },
  discountText: {
    ...Typography.smallSemiBold,
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },
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
    borderRadius: 8,
  },
  popularText: {
    ...Typography.smallSemiBold,
    fontSize: 8,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  limitedBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.error,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  limitedText: {
    ...Typography.smallSemiBold,
    fontSize: 8,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cartQtyBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Brand.primary,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  cartQtyText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 10,
  },
  outOfStockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockText: {
    ...Typography.smallSemiBold,
    color: Colors.error,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  info: {
    padding: Spacing.md,
    gap: 2,
  },
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
  brand: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
  },
  name: {
    ...Typography.captionSemiBold,
    fontSize: 13,
    lineHeight: 17,
    minHeight: 34,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  prices: {
    flex: 1,
    gap: 1,
  },
  partnerPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  partnerPrice: {
    ...Typography.bodySemiBold,
    fontSize: 15,
  },
  priceSuffix: {
    ...Typography.small,
    fontSize: 9,
    fontWeight: '600',
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
  retailPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  retailPrice: {
    ...Typography.small,
    fontSize: 10,
    textDecorationLine: 'line-through',
  },
  retailPriceSuffix: {
    ...Typography.small,
    fontSize: 8,
    textDecorationLine: 'line-through',
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
    backgroundColor: Colors.successMuted,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  savingsText: {
    ...Typography.small,
    fontSize: 9,
    color: Colors.success,
    fontWeight: '700',
  },
  addBtnContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particlesContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  addBtnGradient: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primary,
  },
  /* Quantity controls */
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10,102,194,0.06)',
    borderRadius: 14,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  qtyBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  qtyValue: {
    ...Typography.smallSemiBold,
    fontSize: 11,
    minWidth: 14,
    textAlign: 'center',
  },
});
