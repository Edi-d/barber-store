import { View, Text, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { Bubble, Shadows } from "@/constants/theme";

interface BarberProfileCTAProps {
  barberName: string;
  salonId: string;
  barberId: string;
}

export default function BarberProfileCTA({
  barberName,
  salonId,
  barberId,
}: BarberProfileCTAProps) {
  const firstName = barberName.split(" ")[0];

  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-[#F0F4F8] border-t border-dark-200 px-5 pt-3"
      style={{ paddingBottom: Platform.OS === "ios" ? 34 : 16 }}
    >
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/book-appointment",
            params: { salonId, barberId },
          })
        }
        className="bg-[#4481EB] py-4 items-center active:opacity-90"
        style={[Bubble.radii, Shadows.glow]}
      >
        <Text
          className="text-white text-[15px] font-bold"
          numberOfLines={1}
        >
          Programează cu {firstName}
        </Text>
      </Pressable>
    </View>
  );
}
