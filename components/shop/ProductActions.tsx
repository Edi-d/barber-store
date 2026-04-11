import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Brand, Colors, Shadows, Bubble, FontFamily, Typography } from '@/constants/theme';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const formatPrice = (n: number) =>
  n % 1 === 0
    ? n.toLocaleString('ro-RO') + ' RON'
    : n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RON';

interface ProductActionsProps {
  price: number;
  quantity: number;
  onQuantityChange: (delta: number) => void;
  onAddToCart: () => void;
  bottomInset: number;
}

export default function ProductActions({
  price,
  quantity,
  onQuantityChange,
  onAddToCart,
  bottomInset,
}: ProductActionsProps) {
  const total = price * quantity;

  // Quantity pop animation
  const quantityScale = useSharedValue(1);

  useEffect(() => {
    quantityScale.value = withSequence(
      withTiming(1.25, { duration: 120, easing: SMOOTH }),
      withTiming(1, { duration: 120, easing: SMOOTH }),
    );
  }, [quantity]);

  const quantityAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: quantityScale.value }],
  }));

  // Add to cart press animation
  const buttonScale = useSharedValue(1);

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handlePressIn = () => {
    buttonScale.value = withTiming(0.97, { duration: 150, easing: SMOOTH });
  };

  const handlePressOut = () => {
    buttonScale.value = withTiming(1, { duration: 150, easing: SMOOTH });
  };

  return (
    <Animated.View
      entering={FadeInUp.delay(300).duration(400).easing(SMOOTH)}
      style={[styles.container, { paddingBottom: bottomInset + 8 }]}
    >
      <BlurView intensity={65} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.bgOverlay]} />

      <View style={styles.content}>
        {/* ── Price row ── */}
        <View style={styles.priceRow}>
          <Text style={styles.totalPrice}>{formatPrice(total)}</Text>
          {quantity > 1 && (
            <Text style={styles.unitPrice}>
              {formatPrice(price)} × {quantity}
            </Text>
          )}
        </View>

        {/* ── Actions row ── */}
        <View style={styles.actionsRow}>
          {/* Quantity pill */}
          <View style={styles.quantityPill}>
            <Pressable
              onPress={() => onQuantityChange(-1)}
              style={styles.quantityBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              {quantity <= 1 ? (
                <Feather name="trash-2" size={16} color={Colors.error} />
              ) : (
                <Feather name="minus" size={16} color={Brand.primary} />
              )}
            </Pressable>

            <Animated.Text style={[styles.quantityText, quantityAnimStyle]}>
              {quantity}
            </Animated.Text>

            <Pressable
              onPress={() => onQuantityChange(1)}
              style={styles.quantityBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Feather name="plus" size={16} color={Brand.primary} />
            </Pressable>
          </View>

          {/* Add to cart button — takes remaining space */}
          <AnimatedPressable
            onPress={onAddToCart}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[styles.addBtn, buttonAnimStyle, Shadows.glow]}
          >
            <LinearGradient
              colors={[Brand.gradientStart, Brand.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.addBtnGradient, Bubble.radiiSm]}
            >
              <Feather name="shopping-bag" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Adauga in cos</Text>
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(10,102,194,0.18)',
    overflow: 'hidden',
  },
  bgOverlay: {
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  content: {
    gap: 10,
  },

  /* ── Price row ── */
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  totalPrice: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    lineHeight: 26,
    color: Brand.primary,
  },
  unitPrice: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 16,
    color: Colors.textSecondary,
  },

  /* ── Actions row ── */
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.primaryMuted,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(10,102,194,0.12)',
    padding: 3,
    gap: 2,
  },
  quantityBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: Colors.text,
    minWidth: 26,
    textAlign: 'center',
  },
  addBtn: {
    flex: 1,
  },
  addBtnGradient: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addBtnText: {
    ...Typography.button,
    color: '#fff',
  },
});
