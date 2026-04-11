import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { Brand, Bubble, Shadows, Colors, Typography, Spacing } from '@/constants/theme';
import type { Product, ProductCatalog } from '@/data/types';

const catalog: ProductCatalog = require('@/data/products.json');

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

const POPULAR_CATEGORIES = ['clippers', 'wax', 'gel', 'trimmers', 'scissors'];

interface DealsForYouProps {
  onProductPress: (product: Product) => void;
  onViewAll?: () => void;
}

function getTopDeals(): Product[] {
  return catalog.products
    .filter((p) => p.inStock && p.retailPrice > p.partnerPrice)
    .sort((a, b) => {
      const discA = ((a.retailPrice - a.partnerPrice) / a.retailPrice) * 100;
      const discB = ((b.retailPrice - b.partnerPrice) / b.retailPrice) * 100;
      if (Math.abs(discA - discB) < 0.01) {
        const popA = POPULAR_CATEGORIES.includes(a.category) ? 1 : 0;
        const popB = POPULAR_CATEGORIES.includes(b.category) ? 1 : 0;
        return popB - popA;
      }
      return discB - discA;
    })
    .slice(0, 8);
}

// ─── Deal Card ──────────────────────────────────────────

function DealCard({
  product,
  onPress,
}: {
  product: Product;
  onPress: (product: Product) => void;
}) {
  const scale = useSharedValue(1);

  const discountPct = Math.round(
    ((product.retailPrice - product.partnerPrice) / product.retailPrice) * 100
  );
  const savings = (product.retailPrice - product.partnerPrice).toFixed(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.97, { duration: 150, easing: SMOOTH });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: 200, easing: SMOOTH });
  }, [scale]);

  const handlePress = useCallback(() => {
    onPress(product);
  }, [product, onPress]);

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
    >
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: '#FFFFFF' },
          Shadows.sm,
          animatedStyle,
        ]}
      >
        {/* Image */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: product.images[0] }}
            style={styles.image}
            resizeMode="contain"
          />
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discountPct}%</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.brand}>{product.brand}</Text>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.partnerPrice}>
              {product.partnerPrice.toFixed(0)} RON
            </Text>
            <Text style={styles.retailPrice}>
              {product.retailPrice.toFixed(0)} RON
            </Text>
          </View>
          <View style={styles.savingsPill}>
            <Text style={styles.savingsText}>
              Economisesti {savings} RON
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── DealsForYou ────────────────────────────────────────

function DealsForYou({ onProductPress, onViewAll }: DealsForYouProps) {
  const deals = useMemo(() => getTopDeals(), []);

  if (deals.length === 0) return null;

  return (
    <View>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Feather name="zap" size={16} color="#FF6B35" />
          </View>
          <Text style={styles.title}>Oferte pentru tine</Text>
        </View>
        {onViewAll && (
          <Pressable
            style={styles.seeAll}
            onPress={onViewAll}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.seeAllText}>Vezi toate</Text>
            <Feather name="chevron-right" size={14} color={Brand.primary} />
          </Pressable>
        )}
      </View>

      {/* Carousel */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
      >
        {deals.map((product) => (
          <DealCard
            key={product.sku}
            product={product}
            onPress={onProductPress}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF6B3520',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    ...Typography.captionSemiBold,
    color: Brand.primary,
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: 12,
  },

  // Card
  card: {
    width: 160,
    ...Bubble.radiiSm,
    ...Bubble.accent,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },

  // Image
  imageContainer: {
    width: 160,
    height: 130,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.error,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  discountText: {
    ...Typography.small,
    fontFamily: 'EuclidCircularA-Bold',
    color: '#FFFFFF',
  },

  // Info
  info: {
    padding: Spacing.md,
    gap: 4,
  },
  brand: {
    ...Typography.small,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    ...Typography.captionSemiBold,
    color: Colors.text,
    lineHeight: 17,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  partnerPrice: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 15,
    color: Brand.primary,
  },
  retailPrice: {
    ...Typography.small,
    color: Colors.textTertiary,
    textDecorationLine: 'line-through',
    marginLeft: 6,
  },
  savingsPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 4,
    backgroundColor: Colors.successMuted,
  },
  savingsText: {
    ...Typography.small,
    color: Colors.success,
  },
});

export default DealsForYou;
