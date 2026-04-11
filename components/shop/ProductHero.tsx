import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  View,
  ViewToken,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { Brand, Spacing, Typography, Colors } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const IMAGE_HEIGHT = SCREEN_WIDTH * 0.85;
const DOT_STRIP_HEIGHT = 6 + 12 * 2; // dot height + vertical padding
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

interface ProductHeroProps {
  images: string[];
  discountPercent: number;
  inStock: boolean;
  headerHeight: number; // insets.top + 56
}

/* Animated dot component */
function Dot({ isActive }: { isActive: boolean }) {
  const animatedStyle = useAnimatedStyle(() => ({
    width: withTiming(isActive ? 20 : 6, { duration: 250, easing: SMOOTH }),
    backgroundColor: withTiming(
      isActive ? Brand.primary : Colors.handleBar,
      { duration: 250, easing: SMOOTH },
    ),
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

/* Main component */
function ProductHero({
  images,
  discountPercent,
  inStock,
  headerHeight,
}: ProductHeroProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const hasImages = images.length > 0;
  const hasMultiple = images.length > 1;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const renderImage = useCallback(
    ({ item }: { item: string }) => (
      <View style={styles.imageWrapper}>
        <Image
          source={{ uri: item }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>
    ),
    [],
  );

  const keyExtractor = useCallback(
    (_: string, index: number) => `hero-image-${index}`,
    [],
  );

  const totalHeight = headerHeight + IMAGE_HEIGHT + DOT_STRIP_HEIGHT;

  return (
    <Animated.View
      entering={FadeIn.duration(400).easing(SMOOTH)}
      style={[styles.container, { paddingTop: headerHeight, height: totalHeight }]}
    >
      {/* Background gradient */}
      <LinearGradient
        colors={['#F5F7FA', Colors.white]}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Main image carousel */}
      {hasImages ? (
        <FlatList
          ref={flatListRef}
          data={images}
          renderItem={renderImage}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          bounces={false}
          style={styles.carousel}
        />
      ) : (
        <View style={styles.placeholder}>
          <Feather name="package" size={64} color={Brand.primary} />
        </View>
      )}

      {/* Page indicator dots */}
      {hasMultiple && (
        <View style={styles.dotStrip}>
          {images.map((_, index) => (
            <Dot key={`dot-${index}`} isActive={index === activeIndex} />
          ))}
        </View>
      )}

      {/* Image counter badge — top-left frosted dark pill */}
      {hasMultiple && (
        <View style={[styles.counterBadge, { top: headerHeight + 12 }]}>
          <BlurView intensity={60} tint="dark" style={styles.counterBlur}>
            <Animated.Text style={styles.counterText}>
              {activeIndex + 1} / {images.length}
            </Animated.Text>
          </BlurView>
        </View>
      )}

      {/* Discount badge — top-right solid red pill */}
      {discountPercent > 0 && (
        <View style={[styles.discountBadge, { top: headerHeight + 12 }]}>
          <Animated.Text style={styles.discountText}>
            -{discountPercent}%
          </Animated.Text>
        </View>
      )}

      {/* Out of stock overlay */}
      {!inStock && (
        <View style={[styles.outOfStockOverlay, { top: headerHeight }]}>
          <View style={styles.outOfStockContent}>
            <Feather
              name="x-circle"
              size={32}
              color={Brand.white}
              style={{ marginBottom: Spacing.sm }}
            />
            <Animated.Text style={styles.outOfStockText}>
              Stoc epuizat
            </Animated.Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    overflow: 'hidden',
  },
  carousel: {
    height: IMAGE_HEIGHT,
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
  },
  placeholder: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Page indicator dots
  dotStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    height: DOT_STRIP_HEIGHT,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },

  // Image counter pill
  counterBadge: {
    position: 'absolute',
    left: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  counterBlur: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 1,
    overflow: 'hidden',
    borderRadius: 20,
  },
  counterText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 12,
    lineHeight: 16,
    color: Brand.white,
    letterSpacing: 0.5,
  },

  // Discount badge
  discountBadge: {
    position: 'absolute',
    right: 16,
    backgroundColor: Colors.error,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 1,
  },
  discountText: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 12,
    lineHeight: 16,
    color: Brand.white,
  },

  // Out of stock overlay
  outOfStockOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: IMAGE_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockContent: {
    alignItems: 'center',
  },
  outOfStockText: {
    ...Typography.h3,
    color: Brand.white,
  },
});

export default ProductHero;
