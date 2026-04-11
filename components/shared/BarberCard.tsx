import { useEffect } from "react";
import { View, Text, Image, Pressable, StyleSheet, Platform } from "react-native";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Barber } from "@/types/database";
import { Colors, Bubble, Shadows, Typography } from "@/constants/theme";

// ─── Spring configs ────────────────────────────────────────────────────────────

/** Press-in/out spring: snappy tactile response */
const PRESS_SPRING = { damping: 14, stiffness: 300, mass: 0.8 };

/** Selection spring: slightly softer so the card "settles" visibly */
const SELECT_SPRING = { damping: 16, stiffness: 260, mass: 0.9 };

/** Checkmark entrance spring */
const CHECK_SPRING = { damping: 12, stiffness: 320, mass: 0.6 };

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BarberCardProps {
  barber: Barber;
  isSelected: boolean;
  onSelect: () => void;
  /** Zero-based index used to stagger the entrance animation */
  index: number;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function BarberCard({ barber, isSelected, onSelect, index }: BarberCardProps) {
  // 0 = idle/deselected, 1 = selected
  const selection = useSharedValue(isSelected ? 1 : 0);
  // 0 = resting, goes to 1 then snaps back; drives the press-down pulse
  const press = useSharedValue(0);
  // drives the checkmark scale-in independently so it can overshoot
  const checkScale = useSharedValue(isSelected ? 1 : 0);

  // Keep animation in sync when parent drives isSelected externally
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

  /** Card container: background tint + border color + press scale */
  const cardStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      selection.value,
      [0, 1],
      ["#E2E8F0", Colors.gradientStart]
    );
    const backgroundColor = interpolateColor(
      selection.value,
      [0, 1],
      [Colors.white, "#EFF6FF"]
    );
    // press.value drives a quick scale-down then spring-back
    const scaleFromPress = 1 - press.value * 0.04;

    return { borderColor, backgroundColor, transform: [{ scale: scaleFromPress }] };
  });

  /** Avatar glow: only visible when selected */
  const avatarGlowStyle = useAnimatedStyle(() => {
    // Read the already-animated selection value directly — do NOT call
    // withTiming/withSpring inside a worklet body, that spawns a new
    // animation driver on every frame evaluation.
    return {
      opacity: selection.value,
    };
  });

  /** Checkmark: scale spring-in from 0 to 1 on selection */
  const checkmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  /**
   * Arrow: inverse of checkmark — fades out as checkmark fades in.
   * MUST be declared here at the component top level, never inline inside JSX.
   * An inline useAnimatedStyle call violates React's Rules of Hooks and causes
   * Reanimated to crash because the worklet handle changes identity each render.
   */
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: 1 - checkScale.value,
  }));

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handlePressIn = () => {
    press.value = withSpring(1, PRESS_SPRING);
  };

  const handlePressOut = () => {
    press.value = withSpring(0, PRESS_SPRING);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Selection spring: 0 → 0.96 → 1 ripple via spring
    selection.value = withSpring(isSelected ? 0 : 1, SELECT_SPRING);
    checkScale.value = isSelected
      ? withTiming(0, { duration: 140 })
      : withSpring(1, CHECK_SPRING);

    onSelect();
  };

  // ── Derived display values ───────────────────────────────────────────────────

  const roleLabel = barber.role === "owner" ? "Proprietar" : "Frizer";
  const specialties = barber.specialties?.slice(0, 3) ?? [];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80)
        .springify()
        .damping(18)
        .stiffness(200)
        .withInitialValues({ opacity: 0, transform: [{ translateY: 20 }, { scale: 0.96 }] })}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Frizer ${barber.name}, ${roleLabel}`}
        accessibilityState={{ selected: isSelected }}
      >
        <Animated.View style={[styles.card, cardStyle]}>

          {/* ── Avatar + glow ─────────────────────────────────────────────── */}
          <View style={styles.avatarContainer}>
            {/* Glow ring behind the avatar, fades in when selected */}
            <Animated.View
              style={[styles.avatarGlow, avatarGlowStyle]}
              pointerEvents="none"
            />

            <View style={styles.avatar}>
              {barber.avatar_url ? (
                <Image
                  source={{ uri: barber.avatar_url }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name="person" size={24} color={Colors.gradientStart} />
                </View>
              )}
            </View>
          </View>

          {/* ── Info ──────────────────────────────────────────────────────── */}
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {barber.name}
            </Text>

            <Text style={styles.role}>{roleLabel}</Text>

            {specialties.length > 0 && (
              <View style={styles.specialtiesRow}>
                {specialties.map((spec) => (
                  <View key={spec} style={styles.chip}>
                    <Text style={styles.chipText}>{spec}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── Checkmark / arrow ─────────────────────────────────────────── */}
          <View style={styles.trailingSlot}>
            {/* Checkmark — springs in when selected */}
            <Animated.View style={[styles.checkmark, checkmarkStyle]}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.gradientStart} />
            </Animated.View>

            {/* Arrow — fades out when selected (inverse of checkmark opacity) */}
            <Animated.View style={[styles.arrow, arrowStyle]}>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </Animated.View>
          </View>

        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 56;
const GLOW_SIZE = AVATAR_SIZE + 16; // 8px bleed on each side

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 2,
    borderColor: "#E2E8F0",        // overridden by animated style
    backgroundColor: Colors.white, // overridden by animated style
    ...Bubble.radii,
    ...Shadows.sm,
  },

  // ── Avatar ────────────────────────────────────────────────────────────────────
  avatarContainer: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    marginRight: 14,
    // extra room for the glow halo that bleeds outside the avatar circle
    alignItems: "center",
    justifyContent: "center",
  },

  avatarGlow: Platform.select({
    ios: {
      position: "absolute",
      width: GLOW_SIZE,
      height: GLOW_SIZE,
      borderRadius: GLOW_SIZE / 2,
      backgroundColor: "transparent",
      shadowColor: Colors.gradientStart,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 10,
    },
    android: {
      // Android elevation tinting is not colour-aware; skip the glow
      position: "absolute",
      width: GLOW_SIZE,
      height: GLOW_SIZE,
      borderRadius: GLOW_SIZE / 2,
    },
    default: {
      position: "absolute",
      width: GLOW_SIZE,
      height: GLOW_SIZE,
      borderRadius: GLOW_SIZE / 2,
    },
  })!,

  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden",
  },

  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },

  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primaryMuted,
  },

  // ── Info ──────────────────────────────────────────────────────────────────────
  info: {
    flex: 1,
    minWidth: 0, // allow text to truncate
  },

  name: {
    fontFamily: "EuclidCircularA-Bold",
    fontSize: 16,
    lineHeight: 20,
    color: Colors.text,
  },

  role: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  specialtiesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 8,
  },

  chip: {
    backgroundColor: Colors.primaryMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },

  chipText: {
    fontFamily: "EuclidCircularA-SemiBold",
    fontSize: 10,
    lineHeight: 14,
    color: Colors.gradientStart,
  },

  // ── Trailing slot ─────────────────────────────────────────────────────────────
  trailingSlot: {
    width: 24,
    height: 24,
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  checkmark: {
    position: "absolute",
  },

  arrow: {
    position: "absolute",
  },
});
