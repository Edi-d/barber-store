import { useState } from "react";
import { View, Text, Pressable } from "react-native";

interface BarberProfileBioProps {
  bio: string;
}

export default function BarberProfileBio({ bio }: BarberProfileBioProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = bio.length > 120;

  return (
    <View className="mx-4 mt-4">
      <Text style={{ fontSize: 16, color: "#191919" }} className="font-bold">
        Despre mine
      </Text>
      <Text
        numberOfLines={isLong && !expanded ? 3 : undefined}
        style={{ color: "#65676B" }}
        className="text-sm leading-5 mt-2"
      >
        {bio}
      </Text>
      {isLong && (
        <Pressable onPress={() => setExpanded((prev) => !prev)} className="mt-1">
          <Text className="text-primary-500 font-semibold text-sm">
            {expanded ? "Mai puțin" : "Citește mai mult"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
