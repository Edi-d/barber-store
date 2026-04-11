import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { Brand, Colors, FontFamily, Shadows } from '@/constants/theme';
import { formatPrice } from '@/lib/utils';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

export interface RelatedProduct {
  id: string;
  title: string;
  image: string | null;
  priceCents: number;
  originalPriceCents?: number;
  brand?: string;
}

interface ProductRelatedProps {
  products: RelatedProduct[];
  onProductPress: (productId: string) => void;
  onAddToCart?: (product: RelatedProduct) => void;
  isInCart?: (productId: string) => boolean;
}

function AddButton({
  inCart,
  onPress,
}: {
  inCart: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withTiming(0.8, { duration: 100 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 200 });
      }}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.addButton,
          inCart
            ? { backgroundColor: Brand.primary }
            : {
                backgroundColor: '#FFFFFF',
                borderWidth: 1.5,
                borderColor: Brand.primary,
              },
          animatedStyle,
        ]}
      >
        <Feather
          name={inCart ? 'check' : 'plus'}
          size={14}
          color={inCart ? '#FFFFFF' : Brand.primary}
        />
      </Animated.View>
    </Pressable>
  );
}

function RelatedCard({
  product,
  onPress,
  onAddToCart,
  inCart,
}: {
  product: RelatedProduct;
  onPress: () => void;
  onAddToCart: () => void;
  inCart: boolean;
}) {
  const hasDiscount =
    product.originalPriceCents !== undefined &&
    product.originalPriceCents > product.priceCents;

  const discountPct = hasDiscount
    ? Math.round(
        ((product.originalPriceCents! - product.priceCents) /
          product.originalPriceCents!) *
          100,
      )
    : 0;

  return (
    <Pressable onPress={onPress} style={[styles.card, Shadows.sm]}>
      <View style={styles.imageArea}>
        {product.image ? (
          <Image
            source={{ uri: product.image }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : null}
        {hasDiscount && discountPct > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discountPct}%</Text>
          </View>
        )}
      </View>

      <View style={styles.infoArea}>
        {product.brand ? (
          <Text style={[styles.brand, { color: Colors.textTertiary }]}>
            {product.brand}
          </Text>
        ) : null}
        <Text
          style={[styles.name, { color: Colors.text }]}
          numberOfLines={2}
        >
          {product.title}
        </Text>
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.partnerPrice}>
              {formatPrice(product.priceCents)}
            </Text>
            {hasDiscount && (
              <Text style={[styles.retailPrice, { color: Colors.textTertiary }]}>
                {formatPrice(product.originalPriceCents!)}
              </Text>
            )}
          </View>
          <AddButton inCart={inCart} onPress={onAddToCart} />
        </View>
      </View>
    </Pressable>
  );
}

export default function ProductRelated({
  products,
  onProductPress,
  onAddToCart,
  isInCart,
}: ProductRelatedProps) {
  if (products.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(400)
        .delay(500)
        .easing(SMOOTH)
        .withInitialValues({ transform: [{ translateY: 12 }], opacity: 0 })}
      style={styles.container}
    >
      <View style={styles.headerRow}>
        <View style={styles.iconCircle}>
          <Feather name="grid" size={14} color={Brand.primary} />
        </View>
        <Text style={[styles.title, { color: Colors.text }]}>
          Produse similare
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {products.map((product) => (
          <RelatedCard
            key={product.id}
            product={product}
            onPress={() => onProductPress(product.id)}
            onAddToCart={() => onAddToCart?.(product)}
            inCart={isInCart?.(product.id) ?? false}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Brand.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    width: 150,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  imageArea: {
    width: 150,
    height: 130,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  discountBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#E53935',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountText: {
    fontFamily: FontFamily.bold,
    fontSize: 10,
    color: '#FFFFFF',
  },
  infoArea: {
    padding: 10,
    gap: 3,
  },
  brand: {
    fontFamily: FontFamily.semiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    lineHeight: 15,
    minHeight: 30,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  partnerPrice: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    color: Brand.primary,
  },
  retailPrice: {
    fontFamily: FontFamily.regular,
    fontSize: 10,
    textDecorationLine: 'line-through',
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
