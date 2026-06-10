import { View, Text, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Barber } from "@/types/database";
import { getInitials, barberRoleLabel } from "@/lib/utils";
import { Bubble, Shadows, FontFamily } from "@/constants/theme";

interface BarberProfileHeaderProps {
  /** Barber row, optionally joined with its profile for the avatar fallback. */
  barber: Barber & { profile?: { avatar_url: string | null } | null };
  /** Authoritative role from salon_members.role; falls back to barber.role. */
  role?: string;
}

export function BarberProfileHeader({ barber, role }: BarberProfileHeaderProps) {
  const rating = barber.rating_avg ?? 0;
  const reviewCount = barber.reviews_count ?? 0;
  const specialties = barber.specialties ?? [];
  const effectiveRole = role ?? barber.role;
  const isOwner = effectiveRole === "owner";
  const avatarUrl = barber.avatar_url ?? barber.profile?.avatar_url;

  // Build an array of 5 star fill states
  const stars = Array.from({ length: 5 }, (_, i) => {
    const filled = i + 1 <= Math.round(rating);
    return filled;
  });

  return (
    <View className="items-center px-4 pt-2 pb-4">
      {/* Avatar */}
      <View
        style={[
          Bubble.radiiLg,
          Shadows.md,
          {
            width: 100,
            height: 100,
            borderWidth: 3,
            borderColor: "#FFFFFF",
            overflow: "hidden",
          },
        ]}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{ width: "100%", height: "100%", backgroundColor: "#E8F3FF" }}
            className="items-center justify-center"
          >
            <Text
              style={{
                fontFamily: FontFamily.bold,
                fontSize: 30,
                color: "#4481EB",
              }}
            >
              {getInitials(barber.name)}
            </Text>
          </View>
        )}
      </View>

      {/* Name */}
      <Text
        style={{ fontFamily: FontFamily.bold, color: "#191919" }}
        className="text-xl mt-3 text-center"
      >
        {barber.name}
      </Text>

      {/* Role badge */}
      <View
        className={`px-2 py-0.5 rounded-md mt-1 ${isOwner ? "bg-amber-50" : "bg-slate-100"}`}
      >
        <Text
          style={{
            fontFamily: FontFamily.semiBold,
            color: isOwner ? "#b45309" : "#475569",
            fontSize: 11,
          }}
        >
          {barberRoleLabel(effectiveRole)}
        </Text>
      </View>

      {/* Specialties */}
      {specialties.length > 0 && (
        <View className="flex-row flex-wrap justify-center gap-1.5 mt-2">
          {specialties.map((spec, index) => (
            <Text
              key={spec}
              style={{ fontFamily: FontFamily.medium, color: "#4481EB" }}
              className="text-xs"
            >
              {spec}
              {index < specialties.length - 1 ? " · " : ""}
            </Text>
          ))}
        </View>
      )}

      {/* Rating row */}
      <View className="flex-row items-center gap-1 mt-2">
        {stars.map((filled, i) => (
          <Ionicons
            key={i}
            name={filled ? "star" : "star-outline"}
            size={15}
            color="#f59e0b"
          />
        ))}
        <Text
          style={{ fontFamily: FontFamily.semiBold, color: "#191919" }}
          className="text-sm"
        >
          {rating > 0 ? rating.toFixed(1) : "—"}
        </Text>
        <Text
          style={{ fontFamily: FontFamily.regular, color: "#65676B" }}
          className="text-sm"
        >
          ({reviewCount} recenzii)
        </Text>
      </View>
    </View>
  );
}
