import { useState, useCallback, useRef } from "react";
import { View, FlatList, RefreshControl, Text, Pressable, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { StoriesRow } from "@/components/feed/StoriesRow";
import { QuickActions } from "@/components/feed/QuickActions";
import { LiveSection } from "@/components/feed/LiveSection";
import { FeedCard } from "@/components/feed/FeedCard";
import { ContentWithAuthor, Live, Profile, LiveWithHost } from "@/types/database";
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

  // Placeholder lives for when no active lives exist
  const placeholderLives: LiveWithHost[] = [
    {
      id: "placeholder-1", host_id: "", title: "Join me, paint the arts 🎨",
      cover_url: "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600",
      is_public: true, status: "live", provider: null, ingest_url: null,
      stream_key: null, playback_url: null, viewers_count: 41600,
      started_at: new Date(Date.now() - 5 * 60000).toISOString(),
      ended_at: null, created_at: new Date().toISOString(),
      host: { id: "", username: "dianne", display_name: "Dianne", avatar_url: null, bio: null, role: "creator", created_at: "" },
    },
    {
      id: "placeholder-2", host_id: "", title: "Live Session, Let's learn together 🔥",
      cover_url: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=600",
      is_public: true, status: "live", provider: null, ingest_url: null,
      stream_key: null, playback_url: null, viewers_count: 21200,
      started_at: new Date(Date.now() - 6 * 60000).toISOString(),
      ended_at: null, created_at: new Date().toISOString(),
      host: { id: "", username: "robert", display_name: "Robert", avatar_url: null, bio: null, role: "creator", created_at: "" },
    },
    {
      id: "placeholder-3", host_id: "", title: "Fade Masterclass - Live Demo ✂️",
      cover_url: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600",
      is_public: true, status: "live", provider: null, ingest_url: null,
      stream_key: null, playback_url: null, viewers_count: 15800,
      started_at: new Date(Date.now() - 12 * 60000).toISOString(),
      ended_at: null, created_at: new Date().toISOString(),
      host: { id: "", username: "alex", display_name: "Alex", avatar_url: null, bio: null, role: "creator", created_at: "" },
    },
    {
      id: "placeholder-4", host_id: "", title: "Beard Styling Session 💈",
      cover_url: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600",
      is_public: true, status: "live", provider: null, ingest_url: null,
      stream_key: null, playback_url: null, viewers_count: 8900,
      started_at: new Date(Date.now() - 18 * 60000).toISOString(),
      ended_at: null, created_at: new Date().toISOString(),
      host: { id: "", username: "cristi", display_name: "Cristi", avatar_url: null, bio: null, role: "creator", created_at: "" },
    },
  ];

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
      return data as LiveWithHost[];
    },
  });

  // Always show lives - use DB data or fallback to placeholders
  const displayLives = (lives && lives.length > 0) ? lives : placeholderLives;

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

  // Fetch user's follows
  const { data: followingIds } = useQuery({
    queryKey: ["following", session?.user.id],
    queryFn: async () => {
      if (!session) return new Set<string>();
      const { data, error } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", session.user.id);
      if (error) throw error;
      return new Set(data.map((f) => f.following_id));
    },
    enabled: !!session,
  });

  // Follow/unfollow mutation
  const followMutation = useMutation({
    mutationFn: async ({ authorId, isFollowing }: { authorId: string; isFollowing: boolean }) => {
      if (!session) throw new Error("Not authenticated");

      if (isFollowing) {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", session.user.id)
          .eq("following_id", authorId);
      } else {
        await supabase.from("follows").insert({
          follower_id: session.user.id,
          following_id: authorId,
        });
      }
    },
    onMutate: async ({ authorId, isFollowing }) => {
      await queryClient.cancelQueries({ queryKey: ["following", session?.user.id] });
      const previous = queryClient.getQueryData<Set<string>>(["following", session?.user.id]);

      queryClient.setQueryData<Set<string>>(["following", session?.user.id], (old) => {
        const next = new Set(old);
        if (isFollowing) {
          next.delete(authorId);
        } else {
          next.add(authorId);
        }
        return next;
      });

      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["following", session?.user.id], context.previous);
      }
    },
  });

  const handleFollow = (authorId: string) => {
    const isFollowing = followingIds?.has(authorId) || false;
    followMutation.mutate({ authorId, isFollowing });
  };

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
    { id: "book", label: "Programare", icon: "calendar-outline" as const, variant: "primary" as const },
    { id: "courses", label: "Cursuri", icon: "school-outline" as const, variant: "outline" as const },
    { id: "shop", label: "Shop", icon: "bag-outline" as const, variant: "outline" as const },
    { id: "live", label: "Lives", icon: "radio-outline" as const, variant: "outline" as const },
  ];

  const handleQuickAction = (action: { id: string }) => {
    switch (action.id) {
      case "book":
        router.push("/book-appointment" as any);
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

      {/* Live Section - always visible */}
      <LiveSection lives={displayLives} onSeeAll={() => {}} />

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
        <Image
          source={require("@/assets/image-removebg-preview.png")}
          style={{ width: 100, height: 36 }}
          resizeMode="contain"
        />
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
            isFollowing={followingIds?.has(item.author_id) || false}
            onFollow={handleFollow}
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
