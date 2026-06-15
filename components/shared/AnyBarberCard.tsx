import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Bubble, Shadows, Typography } from "@/constants/theme";

interface AnyBarberCardProps {
  /** Tapped → resolve & auto-select the soonest-available barber. */
  onSelect: () => void;
  /** True while the soonest-available barber is being resolved. */
  isResolving?: boolean;
}

/**
 * "Oricine este disponibil" — the auto-pick option that sits at the top of the
 * barber list. Selecting it resolves whichever specialist can be booked the
 * soonest (see findSoonestAvailableBarber) and advances the flow with that
 * concrete barber, mirroring the web "best availability" shortcut.
 */
export function AnyBarberCard({ onSelect, isResolving = false }: AnyBarberCardProps) {
  const handlePress = () => {
    if (isResolving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelect();
  };

  return (
    <Animated.View
      entering={FadeInDown.springify()
        .damping(18)
        .stiffness(200)
        .withInitialValues({ opacity: 0, transform: [{ translateY: 20 }, { scale: 0.96 }] })}
    >
      <Pressable
        onPress={handlePress}
        disabled={isResolving}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Oricine este disponibil, cea mai bună disponibilitate"
        accessibilityState={{ disabled: isResolving }}
      >
        <View style={styles.card}>
          {/* ── Gradient icon ──────────────────────────────────────────── */}
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.icon}
          >
            <Ionicons name="sparkles" size={22} color={Colors.white} />
          </LinearGradient>

          {/* ── Info ───────────────────────────────────────────────────── */}
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>
              Oricine este disponibil
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              Cea mai bună disponibilitate
            </Text>
          </View>

          {/* ── Trailing: spinner while resolving, else chevron ────────── */}
          <View style={styles.trailingSlot}>
            {isResolving ? (
              <ActivityIndicator size="small" color={Colors.gradientStart} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const ICON_SIZE = 48;

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.gradientStart,
    backgroundColor: "#EFF6FF",
    ...Bubble.radii,
    ...Shadows.sm,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 14,
    marginRight: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: "EuclidCircularA-Bold",
    fontSize: 16,
    lineHeight: 20,
    color: Colors.text,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  trailingSlot: {
    width: 24,
    height: 24,
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
