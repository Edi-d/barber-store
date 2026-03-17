import { Pressable, Text } from "react-native";
import Animated, { SlideInUp, SlideOutUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

interface NewPostsBannerProps {
  count: number;
  onPress: () => void;
}

export function NewPostsBanner({ count, onPress }: NewPostsBannerProps) {
  if (count === 0) return null;

  return (
    <Animated.View
      entering={SlideInUp.springify().damping(14).stiffness(180)}
      exiting={SlideOutUp.duration(200)}
      style={{ marginHorizontal: 16, marginVertical: 8 }}
    >
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0A66C2",
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          elevation: 3,
          gap: 6,
        }}
      >
        <Ionicons name="arrow-up" size={16} color="#fff" />
        <Text className="text-white font-semibold text-sm">
          {count} {count === 1 ? "postare noua" : "postari noi"} — apasa pentru a vedea
        </Text>
      </Pressable>
    </Animated.View>
  );
}
