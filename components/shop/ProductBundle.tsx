import React, { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { Brand, Spacing, Typography, Colors, Shadows, Bubble, FontFamily } from '@/constants/theme';
import { formatPrice } from '@/lib/utils';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

export interface BundleProduct {
  id: string;
  title: string;
  image: string | null;
  priceCents: number;
  originalPriceCents?: number;
  brand?: string;
}

interface ProductBundleProps {
  currentProduct: BundleProduct;
  bundleProducts: BundleProduct[];
  onAddBundle: (products: BundleProduct[]) => void;
  isInCart?: (productId: string) => boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ProductBundle({
  currentProduct,
  bundleProducts,
  onAddBundle,
  isInCart,
}: ProductBundleProps) {
  const [added, setAdded] = useState(false);
  const scale = useSharedValue(1);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const allProducts = [currentProduct, ...bundleProducts];

  const bundlePriceCents = allProducts.reduce((sum, p) => sum + p.priceCents, 0);
  const bundleOriginalCents = allProducts.reduce(
    (sum, p) => sum + (p.originalPriceCents ?? p.priceCents),
    0,
  );
  const savingsCents = bundleOriginalCents - bundlePriceCents;
  const showRetailRow = bundleOriginalCents > bundlePriceCents;

  const handlePress = useCallback(() => {
    onAddBundle(allProducts);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }, [onAddBundle, allProducts]);

  if (bundleProducts.length === 0 || savingsCents <= 0) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(400).easing(SMOOTH)}
      style={[styles.container, { transform: [{ translateY: 12 }] }]}
    >
      {/* Section Header */}
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: Colors.primaryMuted }]}>
          <Feather name="gift" size={18} color={Colors.primary} />
        </View>
        <View>
          <Text style={[styles.title, { color: Colors.text }]}>Pachet complet</Text>
          <Text style={[styles.subtitle, { color: Colors.textTertiary }]}>
            Cumpara impreuna si economisesti
          </Text>
        </View>
      </View>

      {/* Product Images Strip */}
      <View style={styles.strip}>
        {allProducts.map((product, index) => {
          const isCurrent = product.id === currentProduct.id;
          return (
            <React.Fragment key={product.id}>
              {index > 0 && (
                <View style={[styles.plusCircle, { backgroundColor: Colors.primaryMuted }]}>
                  <Feather name="plus" size={12} color={Colors.primary} />
                </View>
              )}
              <View
                style={[
                  styles.thumbnail,
                  isCurrent && { borderWidth: 2, borderColor: Brand.primary },
                ]}
              >
                {product.image ? (
                  <Image
                    source={{ uri: product.image }}
                    style={styles.thumbnailImage}
                    resizeMode="contain"
                  />
                ) : null}
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {/* Price Breakdown Card */}
      <View style={styles.priceCard}>
        {showRetailRow && (
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: Colors.textTertiary }]}>
              Pret individual:
            </Text>
            <Text
              style={[
                styles.priceLabel,
                { color: Colors.textTertiary, textDecorationLine: 'line-through' },
              ]}
            >
              {formatPrice(bundleOriginalCents)}
            </Text>
          </View>
        )}

        <View style={styles.priceRow}>
          <Text style={[styles.bundlePriceLabel, { color: Colors.text }]}>
            Pret pachet:
          </Text>
          <Text style={styles.bundlePrice}>{formatPrice(bundlePriceCents)}</Text>
        </View>

        <View style={[styles.savingsPill, { backgroundColor: Colors.successMuted }]}>
          <Feather name="trending-down" size={14} color={Colors.success} />
          <Text style={[Typography.smallSemiBold, { color: Colors.success, marginLeft: 4 }]}>
            Economisesti {formatPrice(savingsCents)}
          </Text>
        </View>
      </View>

      {/* CTA Button */}
      <AnimatedPressable
        onPressIn={() => {
          scale.value = withTiming(0.97, { duration: 150, easing: SMOOTH });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 150, easing: SMOOTH });
        }}
        onPress={handlePress}
        style={[animatedButtonStyle, styles.ctaWrapper]}
      >
        <LinearGradient
          colors={added ? ['#43A047', '#2E7D32'] : [Brand.gradientStart, Brand.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.ctaButton, Bubble.radiiSm, Shadows.glow]}
        >
          <Feather
            name={added ? 'check' : 'shopping-cart'}
            size={18}
            color={Brand.white}
            style={{ marginRight: 8 }}
          />
          <Text style={[Typography.button, { color: Brand.white }]}>
            {added ? 'Adaugat!' : 'Adauga tot in cos'}
          </Text>
        </LinearGradient>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: 56,
    height: 56,
  },
  plusCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  priceCard: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  priceLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  bundlePriceLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  bundlePrice: {
    fontFamily: FontFamily.bold,
    fontSize: 20,
    lineHeight: 26,
    color: Brand.primary,
  },
  savingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  ctaWrapper: {
    marginTop: 12,
  },
  ctaButton: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
