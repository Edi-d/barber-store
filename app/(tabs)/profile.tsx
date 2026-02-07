import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";
import { Avatar, Badge, Button, Card } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";

export default function ProfileScreen() {
  const { profile, session } = useAuthStore();

  // Fetch user stats
  const { data: stats, refetch, isRefetching } = useQuery({
    queryKey: ["profile-stats", session?.user.id],
    queryFn: async () => {
      if (!session) return null;

      const [ordersResult, progressResult, contentResult] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", session.user.id),
        supabase
          .from("lesson_progress")
          .select("lesson_id", { count: "exact", head: true })
          .eq("user_id", session.user.id)
          .eq("completed", true),
        supabase
          .from("content")
          .select("id", { count: "exact", head: true })
          .eq("author_id", session.user.id),
      ]);

      return {
        orders: ordersResult.count || 0,
        lessonsCompleted: progressResult.count || 0,
        posts: contentResult.count || 0,
      };
    },
    enabled: !!session,
  });

  if (!profile) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-dark-700">Loading...</Text>
      </View>
    );
  }

  const isCreator = profile.role === "creator" || profile.role === "admin";

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#0a66c2"
          />
        }
      >
        {/* Header with Settings */}
        <View className="flex-row justify-end px-4 py-2 bg-white">
          <Pressable
            onPress={() => router.push("/settings")}
            className="w-10 h-10 bg-dark-200 rounded-full items-center justify-center"
          >
            <Ionicons name="settings-outline" size={22} color="#64748b" />
          </Pressable>
        </View>

        {/* Profile Info */}
        <View className="items-center px-6 pb-6 bg-white">
          <Avatar
            source={profile.avatar_url}
            name={profile.display_name || profile.username}
            size="xl"
            className="mb-4"
          />
          <View className="flex-row items-center gap-2">
            <Text className="text-dark-700 text-2xl font-bold">
              {profile.display_name || profile.username}
            </Text>
            {isCreator && (
              <Badge variant="primary" size="sm">
                <Ionicons name="checkmark-circle" size={12} color="white" /> Creator
              </Badge>
            )}
          </View>
          <Text className="text-dark-500 text-base mt-1">
            @{profile.username}
          </Text>
          {profile.bio && (
            <Text className="text-dark-600 text-center mt-3 px-4">
              {profile.bio}
            </Text>
          )}
        </View>

        {/* Stats */}
        <View className="flex-row justify-around px-6 py-4 border-y border-dark-300 bg-white">
          <StatItem value={stats?.posts || 0} label="Postări" />
          <StatItem value={stats?.lessonsCompleted || 0} label="Lecții" />
          <StatItem value={stats?.orders || 0} label="Comenzi" />
        </View>

        {/* Actions */}
        <View className="px-6 py-6 gap-4">
          {/* Go Live Button (Creator only) */}
          {isCreator && (
            <Button
              onPress={() => router.push("/go-live")}
              size="lg"
              className="w-full"
              icon={<Ionicons name="radio" size={20} color="white" />}
            >
              Go Live
            </Button>
          )}

          {/* Quick Links */}
          <Card className="gap-0 p-0 overflow-hidden">
            <ProfileMenuItem
              icon="cart"
              label="Comenzile mele"
              onPress={() => router.push("/orders")}
            />
            <ProfileMenuItem
              icon="bookmark"
              label="Salvate"
              onPress={() => {}}
            />
            <ProfileMenuItem
              icon="school"
              label="Cursurile mele"
              onPress={() => router.push("/(tabs)/courses")}
            />
            <ProfileMenuItem
              icon="heart"
              label="Apreciate"
              onPress={() => {}}
              hideBorder
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center">
      <Text className="text-dark-700 text-xl font-bold">{value}</Text>
      <Text className="text-dark-500 text-sm">{label}</Text>
    </View>
  );
}

function ProfileMenuItem({
  icon,
  label,
  onPress,
  hideBorder = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  hideBorder?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center px-4 py-4 ${!hideBorder && "border-b border-dark-300"}`}
    >
      <Ionicons name={icon} size={22} color="#64748b" />
      <Text className="text-dark-700 flex-1 ml-3 text-base">{label}</Text>
      <Ionicons name="chevron-forward" size={20} color="#64748b" />
    </Pressable>
  );
}
