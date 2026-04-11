import { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

import { Brand, Spacing, Typography, Colors, Shadows, Bubble } from '@/constants/theme';
import { formatPrice } from '@/lib/utils';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const TIMING_CONFIG = { duration: 400, easing: SMOOTH };

type Props = {
  totalItems: number;
  /** Total price in cents */
  totalPrice: number;
  onPress: () => void;
  bottomInset: number;
};

export function CartBar({ totalItems, totalPrice, onPress, bottomInset }: Props) {
  const translateY = useSharedValue(100);
  const pulseScale = useSharedValue(1);
  const prevItemsRef = useRef(totalItems);

  useEffect(() => {
    translateY.value = withTiming(totalItems > 0 ? 0 : 100, TIMING_CONFIG);
  }, [totalItems > 0]);

  // Pulse animation when items increase
  useEffect(() => {
    if (totalItems > prevItemsRef.current && totalItems > 0) {
      pulseScale.value = withSequence(
        withTiming(1.04, { duration: 140, easing: SMOOTH }),
        withTiming(1, { duration: 200, easing: SMOOTH }),
      );
    }
    prevItemsRef.current = totalItems;
  }, [totalItems]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: pulseScale.value },
    ],
  }));

  return (
    <Animated.View
      style={[styles.container, { bottom: bottomInset + Spacing.sm }, animStyle]}
      pointerEvents={totalItems > 0 ? 'auto' : 'none'}
    >
      <View style={[styles.shadow, Shadows.glass]}>
        <BlurView intensity={80} tint="light" style={styles.bar}>
          {/* Left — bag icon with count badge */}
          <View style={styles.iconWrapper}>
            <Feather name="shopping-bag" size={22} color={Colors.text} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{totalItems}</Text>
            </View>
          </View>

          {/* Center — total price + item count */}
          <View style={styles.priceWrapper}>
            <Text style={[styles.total, { color: Colors.text }]}>
              {formatPrice(totalPrice)}
            </Text>
            <Text style={[styles.label, { color: Colors.textSecondary }]}>
              {totalItems === 1 ? '1 produs' : `${totalItems} produse`}
            </Text>
          </View>

          {/* Right — CTA button */}
          <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
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
