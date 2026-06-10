import React, { memo } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import Mapbox from "@/lib/mapbox";
import { Bubble } from "@/constants/theme";
import type { SalonWithDistance } from "@/lib/discover";

interface Props {
  salon: SalonWithDistance;
  isSelected: boolean;
  onPress: (salon: SalonWithDistance) => void;
}

const SalonMarker = memo(function SalonMarker({ salon, isSelected, onPress }: Props) {
  return (
    <Mapbox.MarkerView
      coordinate={[salon.longitude as number, salon.latitude as number]}
      anchor={{ x: 0.5, y: 0.5 }}
      allowOverlap
    >
      <Pressable onPress={() => onPress(salon)} className="items-center">
        <View className="relative">
          <View
            className={`w-11 h-11 items-center justify-center ${
              isSelected
                ? "bg-primary-500"
                : salon.is_available_now
                ? "bg-white border-2 border-primary-300"
                : "bg-white border-2 border-dark-300"
            }`}
            style={{
              ...Bubble.radiiSm,
              transform: isSelected ? [{ scale: 1.15 }] : [],
              // iOS shadow follows the rounded shape. Android `elevation` can't
              // render a rounded shadow for asymmetric corner radii (it falls
              // back to a square bounding box), so it's omitted there — the
              // border already gives the marker enough separation.
              ...Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                },
                default: {},
              }),
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: "EuclidCircularA-Bold",
                fontSize: 13,
                color: isSelected ? "white" : "#0a85f4",
              }}
            >
              {salon.rating_avg != null &&
              salon.reviews_count != null &&
              salon.reviews_count > 0
                ? salon.rating_avg.toFixed(1)
                : "Nou"}
            </Text>
          </View>
          {salon.is_available_now && (
            <View className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
          )}
        </View>
      </Pressable>
    </Mapbox.MarkerView>
  );
});

export default SalonMarker;
