import { View, Text, Pressable, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { Barber } from "@/types/database";

interface BookingHeroCardProps {
  barbers: Barber[];
  onBookPress: () => void;
}

function openInMaps(address: string, city: string) {
  const query = encodeURIComponent(`${address}, ${city}`);
  const url = Platform.select({
    ios: `maps:0,0?q=${query}`,
    android: `geo:0,0?q=${query}`,
    default: `https://maps.google.com/?q=${query}`,
  });
  if (url) Linking.openURL(url);
}

export function BookingHeroCard({ barbers, onBookPress }: BookingHeroCardProps) {
  const barbersWithLocation = barbers.filter((b) => b.city || b.address);

  return (
    <View className="mx-4 mt-3 mb-2 bg-white rounded-2xl border border-dark-300 overflow-hidden">
      {/* Top row: icon + text + CTA button */}
      <View className="flex-row items-center p-4">
        <View className="w-11 h-11 rounded-full bg-primary-50 items-center justify-center mr-3">
          <Ionicons name="cut-outline" size={20} color="#0a85f4" />
        </View>
        <View className="flex-1 mr-3">
          <Text className="text-dark-700 font-bold text-[15px]">Rezervă o programare</Text>
          <Text className="text-dark-400 text-xs mt-0.5">
            {barbersWithLocation.length > 0
              ? `${barbersWithLocation.length} ${barbersWithLocation.length === 1 ? "locație" : "locații"} disponibile`
              : "Alege frizerul preferat"}
          </Text>
        </View>
        <Pressable
          onPress={onBookPress}
          className="bg-primary-500 px-5 py-2.5 rounded-full active:bg-primary-600"
        >
          <Text className="text-white font-bold text-sm">Rezervă</Text>
        </Pressable>
      </View>

      {/* Location chips - horizontal scroll */}
      {barbersWithLocation.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}
        >
          {barbersWithLocation.map((barber) => (
            <Pressable
              key={barber.id}
              onPress={() => {
                const addr = barber.address || barber.city || "";
                const city = barber.city || "";
                openInMaps(addr, city);
              }}
              className="flex-row items-center bg-dark-100 rounded-full px-3 py-2 active:bg-dark-200"
            >
              <Ionicons name="location-outline" size={13} color="#0a85f4" />
              <Text className="text-dark-600 text-xs font-medium ml-1.5" numberOfLines={1}>
                {barber.name}
              </Text>
              <Ionicons name="open-outline" size={11} color="#94a3b8" style={{ marginLeft: 4 }} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
