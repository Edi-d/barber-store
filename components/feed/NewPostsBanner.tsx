import { Pressable, Text, View } from "react-native";
import Animated, { SlideInUp, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Bubble } from "@/constants/theme";
import React from "react";

interface NewPostsBannerProps {
  count: number;
  onPress: () => void;
  bannerRef?: React.RefObject<View>;
}

export function NewPostsBanner({ count, onPress, bannerRef }: NewPostsBannerProps) {
  const visible = count > 0;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: 200 }),
    height: visible ? undefined : withTiming(0, { duration: 200 }),
    marginVertical: visible ? 8 : withTiming(0, { duration: 200 }),
    overflow: "hidden" as const,
    pointerEvents: visible ? "auto" : "none",
  }));

  return (
    <Animated.View
      ref={bannerRef}
      entering={SlideInUp.springify().damping(14).stiffness(180)}
      style={[{ marginHorizontal: 16 }, animatedStyle]}
    >
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0A66C2",
          borderTopLeftRadius: Bubble.radii.borderTopLeftRadius,
          borderTopRightRadius: Bubble.radii.borderTopRightRadius,
          borderBottomRightRadius: Bubble.radii.borderBottomRightRadius,
          borderBottomLeftRadius: Bubble.radii.borderBottomLeftRadius,
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
