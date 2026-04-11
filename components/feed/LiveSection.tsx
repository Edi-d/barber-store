import { useRef, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Image, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, Badge } from "@/components/ui";
import { LiveWithHost } from "@/types/database";
import { timeAgo } from "@/lib/utils";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Bubble } from "@/constants/theme";
import { useAuthStore } from "@/stores/authStore";
import { useTutorialContext } from "@/components/tutorial/TutorialProvider";

const CARD_WIDTH = (Dimensions.get("window").width - 48) / 2;
const CARD_HEIGHT = 220;

interface LiveSectionProps {
  lives: LiveWithHost[];
  onSeeAll?: () => void;
}

function formatViewers(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

export function LiveSection({ lives, onSeeAll }: LiveSectionProps) {
  const { registerRef, unregisterRef } = useTutorialContext();
  const sectionRef = useRef<View>(null);
  const firstCardRef = useRef<View>(null);

  useEffect(() => {
    registerRef("feed-live-section", sectionRef);
    registerRef("feed-live-card", firstCardRef);
    return () => {
      unregisterRef("feed-live-section");
      unregisterRef("feed-live-card");
    };
  }, [registerRef, unregisterRef]);

  if (!lives || lives.length === 0) return null;

  return (
    <View ref={sectionRef} className="pt-1 pb-4" style={{ backgroundColor: "#F0F4F8" }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 mb-3">
        <View className="flex-row items-center">
          <Text className="text-dark-700 text-lg font-bold">Creatori Live</Text>
          <View className="ml-2 bg-primary-500 px-2 py-0.5 min-w-[28px] items-center"
            style={{ ...Bubble.radiiSm }}>
            <Text className="text-white text-xs font-bold">{lives.length}</Text>
          </View>
        </View>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} className="flex-row items-center">
            <Text className="text-primary-500 text-sm font-medium">Vezi tot</Text>
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
        {lives.map((live, index) => (
          index === 0 ? (
            <View key={live.id} ref={firstCardRef}>
              <LiveCard live={live} />
            </View>
          ) : (
            <LiveCard key={live.id} live={live} />
          )
        ))}
      </ScrollView>
    </View>
  );
}

function LiveCard({ live }: { live: LiveWithHost }) {
  const currentUserId = useAuthStore((s) => s.profile?.id);

  return (
    <Pressable
      onPress={() => router.push(`/live/${live.id}` as any)}
      className="overflow-hidden"
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
        borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
        borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
        borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
      }}
    >
      {/* Background Image */}
      {live.cover_url ? (
        <Image
          source={{ uri: live.cover_url }}
          className="absolute inset-0 w-full h-full"
          resizeMode="cover"
        />
      ) : (
        <View className="absolute inset-0 bg-primary-100 items-center justify-center">
          <Ionicons name="radio" size={40} color="#0a66c2" />
        </View>
      )}

      {/* Gradient Overlay - stronger at bottom */}
      <LinearGradient
        colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.65)"]}
        locations={[0, 0.4, 1]}
        className="absolute inset-0"
      />

      {/* Top Row - LIVE badge + Viewer count */}
      <View className="flex-row items-center justify-between p-3 z-10">
        <View className="flex-row items-center bg-red-500 px-2 py-1"
          style={{ ...Bubble.radiiSm }}>
          <View className="w-1.5 h-1.5 rounded-full bg-white mr-1.5" />
          <Text className="text-white text-[10px] font-bold tracking-wide">LIVE</Text>
        </View>
        {live.viewers_count > 0 && (
          <View className="flex-row items-center bg-black/40 px-2 py-1 rounded-full">
            <Ionicons name="people" size={12} color="white" />
            <Text className="text-white text-xs font-medium ml-1">
              {formatViewers(live.viewers_count)}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom Content - Title + Host info */}
      <View className="absolute bottom-0 left-0 right-0 p-3 z-10">
        {/* Title */}
        <Text className="text-white font-semibold text-sm mb-2.5 leading-[18px]" numberOfLines={2}>
          {live.title}
        </Text>

        {/* Host Info */}
        <Pressable
          className="flex-row items-center"
          onPress={(e) => {
            e.stopPropagation();
            if (!live.host?.id) return;
            if (live.host.id === currentUserId) {
              router.push("/(tabs)/profile");
            } else {
              router.push(`/profile/${live.host.id}` as any);
            }
          }}
        >
          <Avatar
            source={live.host?.avatar_url}
            name={live.host?.display_name || live.host?.username}
            size="xs"
            useDefaultAvatar={true}
          />
          <Text className="text-white/90 text-xs font-medium ml-2" numberOfLines={1}>
            {live.host?.display_name || live.host?.username}
          </Text>
          {(live.host?.role === "creator" || live.host?.role === "admin") && (
            <View className="ml-1 w-3.5 h-3.5 bg-primary-500 rounded-full items-center justify-center">
              <Ionicons name="checkmark" size={8} color="white" />
            </View>
          )}
          {live.started_at && (
            <Text className="text-white/60 text-[10px] ml-1.5">
              • {timeAgo(live.started_at)}
            </Text>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}
