import { View, Text, ScrollView, Pressable, ImageBackground, Dimensions, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, Badge } from "@/components/ui";
import { Live, Profile } from "@/types/database";
import { router } from "expo-router";

const CARD_WIDTH = (Dimensions.get("window").width - 48) / 2.3;

interface LiveWithHost extends Live {
  host: Profile;
  viewers_count?: number;
}

interface LiveSectionProps {
  lives: LiveWithHost[];
  onSeeAll?: () => void;
}

export function LiveSection({ lives, onSeeAll }: LiveSectionProps) {
  if (lives.length === 0) return null;

  return (
    <View className="py-4 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 mb-3">
        <View className="flex-row items-center">
          <Text className="text-dark-700 text-lg font-bold">Creator on Live</Text>
          <View className="ml-2 flex-row items-center">
            <View className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          </View>
        </View>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} className="flex-row items-center">
            <Text className="text-primary-600 text-sm font-medium">See all</Text>
            <Ionicons name="chevron-forward" size={16} color="#0a66c2" />
          </Pressable>
        )}
      </View>

      {/* Live Cards Scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {lives.map((live) => (
          <LiveCard key={live.id} live={live} />
        ))}
      </ScrollView>
    </View>
  );
}

function LiveCard({ live }: { live: LiveWithHost }) {
  return (
    <Pressable
      onPress={() => {
        // TODO: Navigate to live stream
      }}
      className="overflow-hidden rounded-2xl bg-dark-300"
      style={{ width: CARD_WIDTH }}
    >
      <View className="h-40 justify-between">
        {/* Background Image */}
        {live.cover_url ? (
          <Image
            source={{ uri: live.cover_url }}
            className="absolute inset-0 w-full h-full rounded-2xl"
            resizeMode="cover"
          />
        ) : (
          <View className="absolute inset-0 bg-primary-100 rounded-2xl items-center justify-center">
            <Ionicons name="radio" size={32} color="#0a66c2" />
          </View>
        )}
        
        {/* Gradient Overlay */}
        <View className="absolute inset-0 bg-black/40 rounded-2xl" />

        {/* Top - Live Badge */}
        <View className="flex-row items-center justify-between p-3 z-10">
          <Badge variant="live" size="sm">
            LIVE
          </Badge>
          {live.viewers_count !== undefined && (
            <View className="flex-row items-center bg-black/50 px-2 py-1 rounded-full">
              <Ionicons name="eye" size={12} color="white" />
              <Text className="text-white text-xs ml-1">
                {live.viewers_count}
              </Text>
            </View>
          )}
        </View>

        {/* Bottom - Title & Host */}
        <View className="p-3 z-10">
          <Text className="text-white font-semibold text-sm mb-2" numberOfLines={2}>
            {live.title}
          </Text>
          <View className="flex-row items-center">
            <Avatar
              source={live.host.avatar_url}
              name={live.host.display_name || live.host.username}
              size="xs"
              useDefaultAvatar={true}
            />
            <Text className="text-white/80 text-xs ml-2">
              {live.host.display_name || live.host.username}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
