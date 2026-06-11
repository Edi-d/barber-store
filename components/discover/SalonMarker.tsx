import React, { memo, useEffect } from "react";
import { Text, Pressable, Platform } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Mapbox from "@/lib/mapbox";
import { Bubble } from "@/constants/theme";
import type { SalonWithDistance } from "@/lib/discover";

// Exact colors sourced from tailwind.config.js and constants/theme.ts
const COLOR_WHITE = "#ffffff";
const COLOR_PRIMARY_500 = "#0a85f4"; // primary-500 / selected fill + unselected text
const COLOR_PRIMARY_300 = "#7cc4ff"; // primary-300 / available border
const COLOR_DARK_300 = "#e2e8f0";    // dark-300   / default border

interface Props {
  salon: SalonWithDistance;
  isSelected: boolean;
  onPress: (salon: SalonWithDistance) => void;
}

const SalonMarker = memo(function SalonMarker({ salon, isSelected, onPress }: Props) {
  // Drive a 0→1 progress value from isSelected
  const progress = useSharedValue(isSelected ? 1 : 0);
  const scale = useSharedValue(isSelected ? 1.18 : 1);

  useEffect(() => {
    progress.value = withTiming(isSelected ? 1 : 0, { duration: 200 });
    scale.value = withSpring(isSelected ? 1.18 : 1, { damping: 15, stiffness: 200 });
  }, [isSelected]);

  // Determine the unselected border color (available vs default)
  const unselectedBorder = salon.is_available_now ? COLOR_PRIMARY_300 : COLOR_DARK_300;

  const animatedBubbleStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(progress.value, [0, 1], [COLOR_WHITE, COLOR_PRIMARY_500]);
    const border = interpolateColor(progress.value, [0, 1], [unselectedBorder, COLOR_PRIMARY_500]);
    return {
      backgroundColor: bg,
      borderColor: border,
      transform: [{ scale: scale.value }],
    };
  });

  const iosShadow = Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
    },
    // Android `elevation` can't render a rounded shadow for asymmetric corner radii
    // (it falls back to a square bounding box), so it's omitted — the border gives
    // enough visual separation.
    default: {},
  });

  return (
    <Mapbox.MarkerView
      coordinate={[salon.longitude as number, salon.latitude as number]}
      anchor={{ x: 0.5, y: 0.5 }}
      allowOverlap
    >
      {/* Fixed 60×60 outer container — keeps the native annotation from
          re-measuring when the inner bubble scales, preventing flicker. */}
      <Pressable
        onPress={() => onPress(salon)}
        hitSlop={8}
        className="w-[60px] h-[60px] items-center justify-center"
      >
        <Animated.View
          style={[
            {
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              ...Bubble.radiiSm,
              ...iosShadow,
            },
            animatedBubbleStyle,
          ]}
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: "EuclidCircularA-Bold",
              fontSize: 13,
              color: isSelected ? COLOR_WHITE : COLOR_PRIMARY_500,
            }}
          >
            {salon.rating_avg != null &&
            salon.reviews_count != null &&
            salon.reviews_count > 0
              ? salon.rating_avg.toFixed(1)
              : "Nou"}
          </Text>

          {/* Availability dot — inside the animated bubble so it scales together */}
          {salon.is_available_now && (
            <Animated.View
              style={{
                position: "absolute",
                top: -2,
                right: -2,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: "#10b981", // emerald-500
                borderWidth: 2,
                borderColor: "#ffffff",
              }}
            />
          )}
        </Animated.View>
      </Pressable>
    </Mapbox.MarkerView>
  );
});

export default SalonMarker;
