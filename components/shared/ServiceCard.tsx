import { useEffect } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { BarberService } from '@/types/database';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';

// ─── Spring configs ────────────────────────────────────────────────────────────

/** Tactile press-down: snappy, lightweight */
const PRESS_SPRING = { damping: 14, stiffness: 300, mass: 0.8 };

/** Card state transition: slightly softer so the card "settles" */
const SELECT_SPRING = { damping: 16, stiffness: 260, mass: 0.9 };

/** Checkmark entrance: overshoot is intentional — premium feel */
const CHECK_SPRING = { damping: 12, stiffness: 340, mass: 0.6 };

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ServiceCardProps {
  service: BarberService;
  isSelected: boolean;
  onToggle: () => void;
  /** Zero-based index — drives staggered FadeInDown entrance */
  index: number;
  formatPrice: (cents: number, currency: string) => string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ServiceCard({
  service,
  isSelected,
  onToggle,
  index,
  formatPrice,
}: ServiceCardProps) {
  // 0 = idle/deselected  |  1 = selected
  const selection = useSharedValue(isSelected ? 1 : 0);
  // Drives the press-down scale pulse (0 = resting, 1 = depressed)
  const press = useSharedValue(0);
  // Independent shared value so the checkmark can overshoot without dragging
  // the rest of the card's timing along with it
  const checkScale = useSharedValue(isSelected ? 1 : 0);

  // Sync when parent drives isSelected externally (e.g., pre-fill, clear-all)
  useEffect(() => {
    selection.value = withTiming(isSelected ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    checkScale.value = isSelected
      ? withSpring(1, CHECK_SPRING)
      : withTiming(0, { duration: 140 });
  }, [isSelected]);

  // ── Animated styles ──────────────────────────────────────────────────────────

  /** Card shell: border color, background tint, press scale */
  const cardStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      selection.value,
      [0, 1],
      ['#E2E8F0', Colors.gradientStart],
    );
    const backgroundColor = interpolateColor(
      selection.value,
      [0, 1],
      [Colors.white, '#EFF6FF'],
    );
    const scale = 1 - press.value * 0.03;

    return { borderColor, backgroundColor, transform: [{ scale }] };
  });

  /** Checkbox ring — transitions from outline-only to filled+hidden (gradient covers it) */
  const checkRingStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      selection.value,
      [0, 1],
      ['#CBD5E1', Colors.gradientStart],
    );
    return { borderColor };
  });

  /** Gradient fill behind checkmark: fades in with selection */
  const checkFillStyle = useAnimatedStyle(() => ({
    opacity: selection.value,
  }));

  /** Checkmark icon: springs in from scale 0 on selection */
  const checkmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  /** Price text: shifts to brand blue when selected */
  const priceStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      selection.value,
      [0, 1],
      [Colors.text, Colors.gradientStart],
    );
    return { color };
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handlePressIn = () => {
    press.value = withSpring(1, PRESS_SPRING);
  };

  const handlePressOut = () => {
    press.value = withSpring(0, PRESS_SPRING);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Read the authoritative animation state from the shared value rather than
    // the closed-over `isSelected` prop. The prop can be stale if a parent
    // re-render races with the press gesture (e.g., another card toggled
    // simultaneously), which would cause the animation to fire in the wrong
    // direction and produce a visual glitch or doubled-toggle bug.
    const currentlySelected = selection.value > 0.5;
    const next = currentlySelected ? 0 : 1;
    selection.value = withSpring(next, SELECT_SPRING);
    checkScale.value = currentlySelected
      ? withTiming(0, { duration: 140 })
      : withSpring(1, CHECK_SPRING);

    onToggle();
  };

  // ── Derived display values ───────────────────────────────────────────────────

  const durationLabel = `${service.duration_min} min`;
  const priceLabel = formatPrice(service.price_cents, service.currency);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60)
        .springify()
        .damping(18)
        .stiffness(200)
        .withInitialValues({
          opacity: 0,
          transform: [{ translateY: 16 }, { scale: 0.97 }],
        })}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessible
        accessibilityRole="checkbox"
        accessibilityLabel={`${service.name}, ${durationLabel}, ${priceLabel}`}
        accessibilityState={{ checked: isSelected }}
      >
        <Animated.View style={[styles.card, cardStyle]}>

          {/* ── Top-right: animated checkbox circle ───────────────────────── */}
          <View style={styles.checkboxSlot}>
            {/* Outer ring — border animates from slate to brand blue */}
            <Animated.View style={[styles.checkRing, checkRingStyle]}>
              {/* Gradient fill — opacity-fades in behind the checkmark */}
              <Animated.View style={[StyleSheet.absoluteFillObject, styles.checkFillWrapper, checkFillStyle]}>
                <LinearGradient
                  colors={[Colors.gradientStart, Colors.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </Animated.View>

              {/* Checkmark icon — springs in from scale 0 */}
              <Animated.View style={checkmarkStyle} pointerEvents="none">
                <Ionicons name="checkmark" size={13} color={Colors.white} />
              </Animated.View>
            </Animated.View>
          </View>

          {/* ── Service name ────────────────────────────────────────────────── */}
          <Text style={styles.name} numberOfLines={1}>
            {service.name}
          </Text>

          {/* ── Description (optional) ──────────────────────────────────────── */}
          {service.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {service.description}
            </Text>
          ) : null}

          {/* ── Bottom row: duration + price ────────────────────────────────── */}
          <View style={styles.footer}>
            {/* Duration */}
            <View style={styles.durationRow}>
              <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.durationText}>{durationLabel}</Text>
            </View>

            {/* Price — color animates to brand blue when selected */}
            <Animated.Text style={[styles.price, priceStyle]}>
              {priceLabel}
            </Animated.Text>
          </View>

        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const CHECKBOX_SIZE = 24;

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',        // overridden by animated style
    backgroundColor: Colors.white, // overridden by animated style
    ...Bubble.radii,
    ...Shadows.sm,
  },

  // ── Checkbox ──────────────────────────────────────────────────────────────────
  checkboxSlot: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 1,
  },

  checkRing: {
    width: CHECKBOX_SIZE,
    height: CHECKBOX_SIZE,
    borderRadius: CHECKBOX_SIZE / 2,
    borderWidth: 2,
    borderColor: '#CBD5E1', // overridden by animated style
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  checkFillWrapper: {
    borderRadius: CHECKBOX_SIZE / 2,
    overflow: 'hidden',
  },

  // ── Text ──────────────────────────────────────────────────────────────────────
  name: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 16,
    lineHeight: 20,
    color: Colors.text,
    // leave room on the right so text never slides under the checkbox
    paddingRight: CHECKBOX_SIZE + 10,
    marginBottom: 4,
  },

  description: {
    ...Typography.caption,
    color: Colors.textSecondary,
    paddingRight: CHECKBOX_SIZE + 10,
    marginBottom: 12,
  },

  // ── Footer ────────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },

  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  durationText: {
    ...Typography.captionSemiBold,
    color: Colors.textSecondary,
  },

  price: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 17,
    lineHeight: 21,
    color: Colors.text, // overridden by animated style
  },
});
