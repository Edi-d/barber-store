import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SalonWithDistance } from "@/lib/discover";
import { SkeletonPulse } from "@/components/ui/SkeletonPulse";

interface SalonCardProps {
  salon: SalonWithDistance;
  onPress: () => void;
  variant?: "default" | "compact" | "promoted";
}

export function SalonCard({ salon, onPress, variant = "default" }: SalonCardProps) {
  const isPromoted = variant === "promoted" || salon.is_promoted;
  const isCompact = variant === "compact";

  if (isCompact) {
    return (
      <Pressable
        onPress={onPress}
        className="bg-white rounded-2xl border border-dark-200 p-3 w-[200px] mr-3 active:bg-dark-100"
      >
        {/* Cover */}
        <View className="h-24 rounded-xl bg-dark-200 overflow-hidden mb-2">
          {salon.avatar_url ? (
            <Image source={{ uri: salon.avatar_url }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <View className="w-full h-full items-center justify-center bg-primary-100">
              <Ionicons name="cut" size={28} color="#0a85f4" />
            </View>
          )}
          {salon.is_promoted && (
            <View className="absolute top-2 left-2 bg-amber-500 px-2 py-0.5 rounded-full">
              <Text className="text-white text-[9px] font-bold">PROMOVAT</Text>
            </View>
          )}
        </View>
        <Text className="text-dark-700 font-bold text-sm" numberOfLines={1}>{salon.name}</Text>
        <View className="flex-row items-center mt-1 gap-2">
          {salon.rating_avg && (
            <View className="flex-row items-center">
              <Ionicons name="star" size={12} color="#f59e0b" />
              <Text className="text-dark-600 text-xs font-semibold ml-0.5">{salon.rating_avg.toFixed(1)}</Text>
            </View>
          )}
          {salon.distance_km != null && (
            <Text className="text-dark-400 text-xs">
              {salon.distance_km < 1
                ? `${Math.round(salon.distance_km * 1000)}m`
                : `${salon.distance_km.toFixed(1)}km`}
            </Text>
          )}
        </View>
        {salon.price_range_label && (
          <Text className="text-primary-500 text-xs font-semibold mt-1">{salon.price_range_label}</Text>
        )}
        {salon.is_available_now && (
          <View className="flex-row items-center mt-1">
            <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
            <Text className="text-[11px] text-emerald-600 font-semibold">Liber acum</Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      className={`bg-white rounded-2xl border p-4 active:bg-dark-100 ${
        isPromoted ? "border-amber-300 bg-amber-50/30" : "border-dark-200"
      }`}
    >
      <View className="flex-row items-center">
        {/* Avatar */}
        <View className="w-16 h-16 rounded-2xl overflow-hidden bg-dark-200 mr-4">
          {salon.avatar_url ? (
            <Image source={{ uri: salon.avatar_url }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <View className="w-full h-full items-center justify-center bg-primary-100">
              <Ionicons name="cut" size={26} color="#0a85f4" />
            </View>
          )}
        </View>

        {/* Info */}
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-dark-700 font-bold text-[15px] flex-1" numberOfLines={1}>
              {salon.name}
            </Text>
            {isPromoted && (
              <View className="bg-amber-500 px-2 py-0.5 rounded-full ml-2">
                <Text className="text-white text-[9px] font-bold">PROMOVAT</Text>
              </View>
            )}
          </View>

          {/* Rating + Distance */}
          <View className="flex-row items-center mt-1 gap-3">
            {salon.rating_avg && (
              <View className="flex-row items-center">
                <Ionicons name="star" size={13} color="#f59e0b" />
                <Text className="text-dark-600 text-xs font-semibold ml-0.5">
                  {salon.rating_avg.toFixed(1)}
                </Text>
                {salon.reviews_count && (
                  <Text className="text-dark-400 text-xs ml-0.5">({salon.reviews_count})</Text>
                )}
              </View>
            )}
            {salon.distance_km != null && (
              <View className="flex-row items-center">
                <Ionicons name="location-outline" size={12} color="#64748b" />
                <Text className="text-dark-500 text-xs ml-0.5">
                  {salon.distance_km < 1
                    ? `${Math.round(salon.distance_km * 1000)}m`
                    : `${salon.distance_km.toFixed(1)}km`}
                </Text>
              </View>
            )}
            {salon.travel_time_min != null && (
              <View className="flex-row items-center">
                <Ionicons name="car-outline" size={12} color="#64748b" />
                <Text className="text-dark-500 text-xs ml-0.5">{salon.travel_time_min} min</Text>
              </View>
            )}
          </View>

          {/* Available now */}
          {salon.is_available_now && (
            <View className="flex-row items-center mt-1">
              <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
              <Text className="text-[11px] text-emerald-600 font-semibold">Liber acum</Text>
            </View>
          )}

          {/* Location */}
          {(salon.city || salon.address) && (
            <Text className="text-dark-400 text-xs mt-1" numberOfLines={1}>
              {salon.address ? `${salon.address}, ${salon.city}` : salon.city}
            </Text>
          )}

          {/* Specialties */}
          {salon.specialties && salon.specialties.length > 0 && (
            <View className="flex-row flex-wrap gap-1 mt-1.5">
              {salon.specialties.slice(0, 3).map((spec) => (
                <View key={spec} className="bg-primary-50 px-2 py-0.5 rounded-full">
                  <Text className="text-primary-600 text-[10px] font-medium">{spec}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Price + Arrow */}
        <View className="items-end ml-2">
          {salon.price_range_label && (
            <Text className="text-primary-500 text-sm font-bold">{salon.price_range_label}</Text>
          )}
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" className="mt-1" />
        </View>
      </View>
    </Pressable>
  );
}

export function DiscoverSalonCardSkeleton() {
  return (
    <SkeletonPulse>
      <View style={skeletonStyles.card}>
        {/* Photo placeholder */}
        <View style={skeletonStyles.photo} />
        {/* Content */}
        <View style={skeletonStyles.content}>
          {/* Name bar */}
          <View style={skeletonStyles.namebar} />
          {/* Meta row */}
          <View style={skeletonStyles.metaRow}>
            <View style={skeletonStyles.metaLong} />
            <View style={skeletonStyles.metaShort} />
          </View>
          {/* Price row */}
          <View style={skeletonStyles.pricebar} />
        </View>
      </View>
    </SkeletonPulse>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    width: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginRight: 12,
  },
  photo: {
    width: '100%',
    height: 120,
    backgroundColor: '#E8EDF2',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  content: {
    padding: 12,
    gap: 0,
  },
  namebar: {
    width: 140,
    height: 14,
    borderRadius: 4,
    backgroundColor: '#E8EDF2',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  metaLong: {
    width: 80,
    height: 12,
    borderRadius: 4,
    backgroundColor: '#E8EDF2',
  },
  metaShort: {
    width: 50,
    height: 12,
    borderRadius: 4,
    backgroundColor: '#E8EDF2',
  },
  pricebar: {
    width: 70,
    height: 12,
    borderRadius: 4,
    backgroundColor: '#E8EDF2',
    marginTop: 8,
  },
});
