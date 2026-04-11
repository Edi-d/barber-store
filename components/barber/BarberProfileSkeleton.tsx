import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";
import { Bubble, Shadows } from "@/constants/theme";

function usePulse() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 700 }),
        withTiming(1, { duration: 700 })
      ),
      -1,
      false
    );
  }, [opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

function Bone({ className, style }: { className?: string; style?: object }) {
  const animStyle = usePulse();
  return (
    <Animated.View
      className={className}
      style={[animStyle, style]}
    />
  );
}

function ServiceCardSkeleton() {
  return (
    <View
      className="bg-white p-4"
      style={[Bubble.radii, Shadows.sm]}
    >
      {/* Row 1 — service name */}
      <Bone className="w-[150px] h-[14px] bg-[#D1D5DB] rounded-md" />

      {/* Row 2 — subtitle */}
      <Bone className="w-[100px] h-[12px] bg-[#D1D5DB] rounded-md mt-2" />

      {/* Row 3 — price + book button */}
      <View className="flex-row justify-between items-center mt-3">
        <Bone className="w-[60px] h-[12px] bg-[#D1D5DB] rounded-md" />
        <Bone className="w-[70px] h-[30px] bg-[#D1D5DB] rounded-md" />
      </View>
    </View>
  );
}

export function BarberProfileSkeleton() {
  return (
    <View className="flex-1 bg-[#F0F4F8] items-center pt-6">
      {/* Header */}
      <View className="items-center">
        {/* Avatar */}
        <Bone className="w-[100px] h-[100px] bg-[#D1D5DB] rounded-[30px]" />

        {/* Name */}
        <Bone className="w-[160px] h-[20px] bg-[#D1D5DB] rounded-md mt-3" />

        {/* Specialty */}
        <Bone className="w-[120px] h-[14px] bg-[#D1D5DB] rounded-md mt-2" />

        {/* Rating */}
        <Bone className="w-[140px] h-[14px] bg-[#D1D5DB] rounded-md mt-2" />
      </View>

      {/* Content */}
      <View className="w-full px-4 mt-6">
        {/* Section title */}
        <Bone className="w-[100px] h-[18px] bg-[#D1D5DB] rounded-md mb-3" />

        {/* Service cards */}
        <View className="gap-2.5">
          <ServiceCardSkeleton />
          <ServiceCardSkeleton />
          <ServiceCardSkeleton />
        </View>
      </View>
    </View>
  );
}
