import { useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';

import { Brand, Spacing, Typography, Colors, Shadows, Bubble } from '@/constants/theme';
import type { Product } from '@/data/types';

// NOTE: RecentlyViewed works with the local JSON Product catalog (sku-based).
// Cart integration is handled at the parent (shop screen) level via the onPress callback,
// which opens the product bottom sheet — keeping cart logic in a single place.

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const CARD_WIDTH = 120;

type Props = {
  products: Product[];
  delay?: number;
  onPress?: (product: Product) => void;
};

export function RecentlyViewed({ products, delay = 0, onPress }: Props) {
  const formatPrice = useCallback(
    (price: number) => (price % 1 === 0 ? `${price} RON` : `${price.toFixed(2)} RON`),
    [],
  );

  if (products.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(400).easing(SMOOTH).withInitialValues({ transform: [{ translateY: 12 }] })}
      style={styles.container}
    >
      <View style={styles.headerRow}>
        <Feather name="clock" size={14} color={Colors.textTertiary} />
        <Text style={[styles.headerText, { color: Colors.text }]}>
          Vizualizate recent
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {products.map((product) => (
          <Pressable
            key={product.sku}
            style={[styles.card, Shadows.sm]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPress?.(product);
            }}
          >
            <BlurView intensity={50} tint="light" style={styles.cardBlur}>
              {/* Image */}
              {product.images.length > 0 ? (
                <Image
                  source={{ uri: product.images[0] }}
                  style={styles.image}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.image, styles.imagePlaceholder]}>
                  <Feather name="package" size={20} color={Colors.textTertiary} />
                </View>
              )}

              {/* Info */}
              <View style={styles.info}>
                <Text
                  style={[styles.name, { color: Colors.text }]}
                  numberOfLines={2}
                >
                  {product.name}
                </Text>
                <View style={styles.bottomRow}>
                  <Text style={[styles.price, { color: Brand.primary }]}>
                    {formatPrice(product.partnerPrice)}
                  </Text>
                  <View style={[styles.arrowBtn, { backgroundColor: Brand.primaryMuted }]}>
                    <Feather name="chevron-right" size={12} color={Brand.primary} />
                  </View>
                </View>
              </View>
            </BlurView>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  headerText: {
    ...Typography.captionSemiBold,
  },
  scrollContent: {
    gap: Spacing.sm,
  },
  card: {
    width: CARD_WIDTH,
    ...Bubble.radiiSm,
    overflow: 'hidden',
  },
  cardBlur: {
    ...Bubble.radiiSm,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
  },
  image: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 0.85,
    backgroundColor: '#fff',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,244,248,0.9)',
  },
  info: {
    padding: Spacing.xs + 2,
    gap: 2,
  },
  name: {
    ...Typography.captionSemiBold,
    fontSize: 11,
    lineHeight: 14,
    minHeight: 28,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  price: {
    ...Typography.smallSemiBold,
    fontSize: 11,
  },
  arrowBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
