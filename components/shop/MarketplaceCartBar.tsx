/**
 * MarketplaceCartBar — floating cart bar for the marketplace cart.
 *
 * Mirrors CartBar.tsx visually but reads from useMarketplaceCartStore.
 * Visible only when totalItems() > 0. onPress opens MarketplaceCartModal
 * via useUIStore.setMarketplaceCartOpen(true).
 *
 * Tab-aware visibility: only renders when the current pathname starts with /marketplace.
 * Mount in app/(tabs)/_layout.tsx after <CreateActionMenu>.
 */

import { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

import { Brand, Spacing, Typography, Colors, Shadows, Bubble } from '@/constants/theme';
import { formatPrice } from '@/lib/utils';
import { useMarketplaceCartStore } from '@/hooks/use-marketplace-cart-store';
import { useUIStore } from '@/stores/uiStore';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const TIMING_CONFIG = { duration: 400, easing: SMOOTH };

type Props = {
  bottomInset: number;
};

export function MarketplaceCartBar({ bottomInset }: Props) {
  const pathname = usePathname();
  const isMarketplace = pathname.startsWith('/marketplace');

  const { items, totalItems, totalCents } = useMarketplaceCartStore();
  const setCartOpen = useUIStore((s) => s.setMarketplaceCartOpen);

  const itemCount = totalItems();
  const totalPrice = totalCents();

  const translateY = useSharedValue(100);
  const pulseScale = useSharedValue(1);
  const prevItemsRef = useRef(itemCount);

  const shouldShow = isMarketplace && itemCount > 0;

  useEffect(() => {
    translateY.value = withTiming(shouldShow ? 0 : 100, TIMING_CONFIG);
  }, [shouldShow]);

  // Pulse when items increase
  useEffect(() => {
    if (itemCount > prevItemsRef.current && itemCount > 0) {
      pulseScale.value = withSequence(
        withTiming(1.04, { duration: 140, easing: SMOOTH }),
        withTiming(1, { duration: 200, easing: SMOOTH }),
      );
    }
    prevItemsRef.current = itemCount;
  }, [itemCount]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: pulseScale.value },
    ] as any,
  }));

  // Early-return null avoids the translateY=100 hide trick (which under-shoots
  // off-screen on devices with large bottom insets, leaving the bar visible).
  if (!shouldShow) return null;

  return (
    <Animated.View
      style={[styles.container, { bottom: bottomInset + Spacing.sm }, animStyle]}
      pointerEvents="auto"
    >
      <View style={[styles.shadow, Shadows.glass]}>
        <BlurView intensity={80} tint="light" style={styles.bar}>
          {/* Left — bag icon with count badge */}
          <View style={styles.iconWrapper}>
            <Feather name="shopping-bag" size={22} color={Colors.text} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{itemCount}</Text>
            </View>
          </View>

          {/* Center — total price + item count */}
          <View style={styles.priceWrapper}>
            <Text style={[styles.total, { color: Colors.text }]}>
              {formatPrice(totalPrice)}
            </Text>
            <Text style={[styles.label, { color: Colors.textSecondary }]}>
              {itemCount === 1 ? '1 produs' : `${itemCount} produse`}
            </Text>
          </View>

          {/* Right — CTA */}
          <TouchableOpacity onPress={() => setCartOpen(true)} activeOpacity={0.8}>
            <LinearGradient
              colors={[Brand.gradientStart, Brand.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Vezi cosul</Text>
              <Feather name="arrow-right" size={16} color={Brand.white} />
            </LinearGradient>
          </TouchableOpacity>
        </BlurView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
  },
  shadow: {
    ...Bubble.radii,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(245,247,250,0.92)',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    overflow: 'hidden',
  },
  iconWrapper: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: Brand.primary,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: Brand.white,
  },
  badgeText: {
    color: Brand.white,
    fontWeight: '700',
    fontSize: 10,
  },
  priceWrapper: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  total: {
    ...Typography.bodySemiBold,
  },
  label: {
    ...Typography.small,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    ...Bubble.radiiSm,
  },
  buttonText: {
    ...Typography.captionSemiBold,
    color: Brand.white,
  },
});
