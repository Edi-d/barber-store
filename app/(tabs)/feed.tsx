import { useState, useCallback, useRef } from "react";
import { View, FlatList, RefreshControl, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { StoriesRow } from "@/components/feed/StoriesRow";
import { QuickActions } from "@/components/feed/QuickActions";
import { LiveSection } from "@/components/feed/LiveSection";
import { FeedCard } from "@/components/feed/FeedCard";
import { ContentWithAuthor, Live, Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";

export default function FeedScreen() {
  const { session, profile } = useAuthStore();
  const queryClient = useQueryClient();

  // Fetch stories (recent creators)
  const { data: stories } = useQuery({
    queryKey: ["stories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("role", ["creator", "admin"])
        .limit(10);

      if (error) throw error;
      return data.map((p) => ({
        id: p.id,
        username: p.display_name || p.username,
        avatar_url: p.avatar_url,
        hasStory: true,
      }));
    },
  });

  // Fetch active lives
  const { data: lives } = useQuery({
    queryKey: ["lives-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lives")
        .select(`*, host:profiles!host_id(*)`)
        .in("status", ["starting", "live"])
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) throw error;
      return data as (Live & { host: Profile })[];
    },
  });

  // Fetch feed content
  const { data: feedItems, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["feed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content")
        .select(`*, author:profiles!author_id(*)`)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      const contentIds = data.map((item) => item.id);

      const [likesResult, userLikesResult, commentsResult] = await Promise.all([
        supabase
          .from("likes")
          .select("content_id")
          .in("content_id", contentIds),
        session
          ? supabase
              .from("likes")
              .select("content_id")
              .eq("user_id", session.user.id)
              .in("content_id", contentIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("comments")
          .select("content_id")
          .in("content_id", contentIds),
      ]);

      // Count likes per content
      const likesCountMap = new Map<string, number>();
      likesResult.data?.forEach((like) => {
        const count = likesCountMap.get(like.content_id) || 0;
        likesCountMap.set(like.content_id, count + 1);
      });

      // Count comments per content
      const commentsCountMap = new Map<string, number>();
      commentsResult.data?.forEach((comment) => {
        const count = commentsCountMap.get(comment.content_id) || 0;
        commentsCountMap.set(comment.content_id, count + 1);
      });

      // User's liked content
      const userLikedIds = new Set(
        userLikesResult.data?.map((l) => l.content_id) || []
      );

      return data.map((item) => ({
        ...item,
        likes_count: likesCountMap.get(item.id) || 0,
        comments_count: commentsCountMap.get(item.id) || 0,
        is_liked: userLikedIds.has(item.id),
      })) as ContentWithAuthor[];
    },
  });

  // Like mutation
  const likeMutation = useMutation({
    mutationFn: async ({ contentId, isLiked }: { contentId: string; isLiked: boolean }) => {
      if (!session) throw new Error("Not authenticated");

      if (isLiked) {
        await supabase
          .from("likes")
          .delete()
          .eq("user_id", session.user.id)
          .eq("content_id", contentId);
      } else {
        await supabase.from("likes").insert({
          user_id: session.user.id,
          content_id: contentId,
        });
      }
    },
    onMutate: async ({ contentId, isLiked }) => {
      await queryClient.cancelQueries({ queryKey: ["feed"] });
      const previousFeed = queryClient.getQueryData<ContentWithAuthor[]>(["feed"]);

      queryClient.setQueryData<ContentWithAuthor[]>(["feed"], (old) =>
        old?.map((item) =>
          item.id === contentId
            ? {
                ...item,
                is_liked: !isLiked,
                likes_count: item.likes_count + (isLiked ? -1 : 1),
              }
            : item
        )
      );

      return { previousFeed };
    },
    onError: (err, variables, context) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(["feed"], context.previousFeed);
      }
    },
  });

  const quickActions = [
    { id: "post", label: "Post", icon: "add-circle" as const, variant: "primary" as const },
    { id: "courses", label: "Cursuri", icon: "school-outline" as const, variant: "outline" as const },
    { id: "shop", label: "Shop", icon: "bag-outline" as const, variant: "outline" as const },
    { id: "live", label: "Lives", icon: "radio-outline" as const, variant: "outline" as const },
  ];

  const handleQuickAction = (action: { id: string }) => {
    switch (action.id) {
      case "post":
        // TODO: Create post
        break;
      case "courses":
        router.push("/(tabs)/courses");
        break;
      case "shop":
        router.push("/(tabs)/shop");
        break;
      case "live":
        if (profile?.role === "creator" || profile?.role === "admin") {
          router.push("/go-live");
        }
        break;
    }
  };

  const handleLike = (contentId: string, isLiked: boolean) => {
    likeMutation.mutate({ contentId, isLiked });
  };

  const handleComment = (contentId: string) => {
    // TODO: Open comments modal
    console.log("Open comments for:", contentId);
  };

  // Header Component
  const ListHeader = () => (
    <View>
      {/* Stories Row - 82px */}
      <StoriesRow
        stories={stories || []}
        onAddStory={() => {
          // TODO: Add story
        }}
        onStoryPress={(story) => {
          // TODO: View story
        }}
      />

      {/* Quick Actions - 44px */}
      <QuickActions actions={quickActions} onActionPress={handleQuickAction} />

      {/* Live Section - ~144px */}
      {lives && lives.length > 0 && (
        <LiveSection lives={lives} onSeeAll={() => {}} />
      )}

      {/* All Feeds Header - 16px */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-white">
        <Text className="text-dark-700 text-lg font-bold">All Feeds</Text>
        <Pressable className="flex-row items-center">
          <Ionicons name="options-outline" size={20} color="#64748b" />
        </Pressable>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#0a66c2" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      {/* Header Bar - 45px */}
      <View className="h-[50px] flex-row items-center justify-between px-4 border-b border-dark-300 bg-white">
        <View className="flex-row items-center">
          <Ionicons name="cut" size={28} color="#0a66c2" />
          <Text className="text-dark-700 text-xl font-bold ml-2">BarberApp</Text>
        </View>
        <View className="flex-row items-center gap-4">
          <Pressable className="relative">
            <Ionicons name="search-outline" size={24} color="#64748b" />
          </Pressable>
          <Pressable className="relative">
            <Ionicons name="notifications-outline" size={24} color="#64748b" />
            <View className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
          </Pressable>
        </View>
      </View>

      {/* Feed Content */}
      <FlatList
        data={feedItems}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <FeedCard
            item={item}
            onLike={() => handleLike(item.id, item.is_liked || false)}
            onComment={() => handleComment(item.id)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#0a66c2"
          />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="items-center justify-center py-12 px-6 bg-white rounded-xl mx-4">
            <Ionicons name="newspaper-outline" size={64} color="#64748b" />
            <Text className="text-dark-700 text-xl font-bold mt-4 text-center">
              Niciun conținut încă
            </Text>
            <Text className="text-dark-500 text-center mt-2">
              Urmărește creatori pentru a vedea postările lor aici
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
