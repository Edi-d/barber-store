import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Bubble, Colors, Spacing, Typography } from "@/constants/theme";

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function ScreenHeader({ title, onBack, right }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={[
          styles.backButton,
          {
            backgroundColor: "rgba(255,255,255,0.65)",
            borderColor: "rgba(255,255,255,0.9)",
          },
        ]}
        onPress={onBack ?? (() => router.back())}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="arrow-left" size={20} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.navTitle} numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    ...Bubble.radiiSm,
  },
  navTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  spacer: {
    width: 40,
    height: 40,
  },
});
