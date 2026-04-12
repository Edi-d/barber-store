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
        {onSeeAll && lives.length > 0 && (
          <Pressable onPress={onSeeAll} className="flex-row items-center">
            <Text className="text-primary-500 text-sm font-medium">Vezi tot</Text>
            <Ionicons name="chevron-forward" size={16} color="#0a66c2" />
          </Pressable>
        )}
      </View>

      {lives.length > 0 ? (
        /* Live Cards Scroll */
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
      ) : (
        /* Empty State — premium minimal */
        <View style={{ paddingHorizontal: 16 }}>
          <View
            style={{
              height: 96,
              backgroundColor: "#fff",
              ...Bubble.radiiSm,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 16,
              paddingRight: 20,
              gap: 16,
              // soft iOS-style shadow instead of cheap border
              shadowColor: "#0A66C2",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 2,
            }}
          >
            {/* Badge with concentric ring — static, no animation */}
            <View
              style={{
                width: 52,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Outer ring */}
              <View
                style={{
                  position: "absolute",
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  borderWidth: 1,
                  borderColor: "rgba(10,102,194,0.08)",
                }}
              />
              {/* Inner ring */}
              <View
                style={{
                  position: "absolute",
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: "rgba(10,102,194,0.12)",
                }}
              />
              {/* Icon disc */}
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "#F0F7FF",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="videocam-outline" size={18} color="#0A66C2" />
              </View>
              {/* Offline dot top-right */}
              <View
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#94A3B8",
                  borderWidth: 1.5,
                  borderColor: "#fff",
                }}
              />
            </View>

            {/* Text block */}
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "EuclidCircularA-Bold",
                  fontSize: 15,
                  color: "#0F172A",
                  letterSpacing: -0.2,
                }}
              >
                Nimeni nu e live acum
              </Text>
              <Text
                style={{
                  fontFamily: "EuclidCircularA-Regular",
                  fontSize: 12.5,
                  color: "#64748B",
                  marginTop: 3,
                  lineHeight: 17,
                }}
              >
                Îți dăm de veste când începe un live
              </Text>
            </View>
          </View>
        </View>
      )}
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
