import React, { memo, useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import { Marker } from "react-native-maps";
import { Bubble } from "@/constants/theme";
import type { SalonWithDistance } from "@/lib/discover";

interface Props {
  salon: SalonWithDistance;
  isSelected: boolean;
  onPress: (salon: SalonWithDistance) => void;
}

const SalonMarker = memo(function SalonMarker({ salon, isSelected, onPress }: Props) {
  const [tracksViewChanges, setTracksViewChanges] = useState(false);
  const isFirstRender = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
    }
    setTracksViewChanges(true);
    timerRef.current = setTimeout(() => {
      setTracksViewChanges(false);
      timerRef.current = null;
    }, 250);
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isSelected]);

  return (
    <Marker
      coordinate={{
        latitude: salon.latitude as number,
        longitude: salon.longitude as number,
      }}
      tracksViewChanges={tracksViewChanges}
      onPress={() => onPress(salon)}
    >
      <View className="items-center">
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
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
              elevation: 4,
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
      </View>
    </Marker>
  );
});

export default SalonMarker;
