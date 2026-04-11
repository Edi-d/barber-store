import { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BarberService } from "@/types/database";
import { formatPrice } from "@/lib/utils";
import { Bubble, Shadows } from "@/constants/theme";

interface BarberProfileServicesProps {
  salonId: string;
  barberId: string;
  services: Record<string, BarberService[]>;
  categories: string[];
}

export default function BarberProfileServices({
  salonId,
  barberId,
  services,
  categories,
}: BarberProfileServicesProps) {
  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0] || ""
  );

  const activeServices = services[activeCategory] || [];

  const handleBook = (service: BarberService) => {
    router.push(
      `/book-appointment?salonId=${salonId}&serviceId=${service.id}&barberId=${barberId}`
    );
  };

  if (categories.length === 0) return null;

  return (
    <View className="mt-6">
      {/* Section title */}
      <Text
        className="mx-4 mb-3 font-bold text-[#191919]"
        style={{ fontSize: 16 }}
      >
        Serviciile mele
      </Text>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        className="mb-3"
      >
        {categories.map((category) => {
          const isActive = category === activeCategory;
          return (
            <Pressable
              key={category}
              onPress={() => setActiveCategory(category)}
              className={`px-4 py-2 ${isActive ? "bg-[#4481EB]" : "bg-[#F0F4F8]"}`}
              style={Bubble.radiiSm}
            >
              <Text
                className={`font-semibold text-sm ${isActive ? "text-white" : "text-[#65676B]"}`}
              >
                {category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Service cards */}
      <View className="mx-4 gap-[10px]">
        {activeServices.map((service) => (
          <Pressable
            key={service.id}
            onPress={() => handleBook(service)}
            className="bg-white p-4 overflow-hidden"
            style={[Bubble.radii, Shadows.sm]}
          >
            <View className="flex-row items-start justify-between">
              {/* Left: name + description + duration */}
              <View className="flex-1 mr-3">
                <Text
                  className="font-bold text-[#191919]"
                  style={{ fontSize: 14 }}
                >
                  {service.name}
                </Text>

                {service.description ? (
                  <Text
                    className="text-xs text-[#65676B] mt-1"
                    numberOfLines={2}
                  >
                    {service.description}
                  </Text>
                ) : null}

                <View className="flex-row items-center mt-2 gap-1">
                  <Ionicons name="time-outline" size={12} color="#65676B" />
                  <Text className="text-xs text-[#65676B]">
                    {service.duration_min} min
                  </Text>
                </View>
              </View>

              {/* Right: price + book button */}
              <View className="items-end">
                <Text className="font-bold text-base text-[#191919]">
                  {formatPrice(service.price_cents, service.currency)}
                </Text>

                <Pressable
                  onPress={() => handleBook(service)}
                  className="bg-[#4481EB] px-4 py-2 mt-2"
                  style={Bubble.radiiSm}
                >
                  <Text className="font-semibold text-sm text-white">
                    Rezervă
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
