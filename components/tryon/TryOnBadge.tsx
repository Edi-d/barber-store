import { Pressable, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Brand, Typography, Shadows, Radius } from "@/constants/theme";

interface TryOnBadgeProps {
  serviceName: string;
  salonId?: string;
}

export function TryOnBadge({ serviceName, salonId }: TryOnBadgeProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/tryon" as any,
      params: { serviceName, salonId },
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={[Brand.gradientStart, Brand.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Ionicons name="sparkles" size={11} color={Colors.white} />
        <Text style={styles.text}>Probează</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.full,
    ...Shadows.sm,
    alignSelf: "flex-start",
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
  },
  text: {
    ...Typography.smallSemiBold,
    color: Colors.white,
    letterSpacing: 0.1,
  },
});
