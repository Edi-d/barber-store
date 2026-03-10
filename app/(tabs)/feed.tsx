import { useState, useRef } from "react";
import { View, FlatList, RefreshControl, Text, Pressable, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { useAuthStore } from "@/stores/authStore";
import { StoriesRow } from "@/components/feed/StoriesRow";
import { LiveSection } from "@/components/feed/LiveSection";
import { FeedCard } from "@/components/feed/FeedCard";
import { ContentWithAuthor, LiveWithHost } from "@/types/database";
import { Ionicons, Feather } from "@expo/vector-icons";
import { CommentsModal } from "@/components/feed/CommentsModal";
import Animated, {
  FadeInDown,
  FadeInLeft,
} from "react-native-reanimated";

export default function FeedScreen() {
  const { session } = useAuthStore();
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

  // Placeholder stories for when no creators exist in DB
  const placeholderStories = [
    { id: "ps-1", username: "Alex P.", avatar_url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200", hasStory: true },
    { id: "ps-2", username: "Mihai I.", avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200", hasStory: true },
    { id: "ps-3", username: "Cristi B.", avatar_url: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200", hasStory: true },
    { id: "ps-4", username: "Andrei M.", avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200", hasStory: true },
    { id: "ps-5", username: "Razvan D.", avatar_url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200", hasStory: true },
    { id: "ps-6", username: "Stefan V.", avatar_url: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=200", hasStory: true },
    { id: "ps-7", username: "Dan C.", avatar_url: "https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?w=200", hasStory: true },
  ];

  const displayStories = (stories && stories.length > 0) ? stories : placeholderStories;

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

  const PAGE_SIZE = 10;

  // Fetch feed content with cursor-based infinite scroll
  const {
    data: feedData,
    isLoading,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("content")
        .select(`*, author:profiles!author_id(*)`)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) {
        query = query.lt("created_at", pageParam);
      }

      const { data, error } = await query;
      if (error) throw error;

      const contentIds = data.map((item) => item.id);

      // Fetch which items the current user has liked
      const userLikesResult = session && contentIds.length > 0
        ? await supabase
            .from("likes")
            .select("content_id")
            .eq("user_id", session.user.id)
            .in("content_id", contentIds)
        : { data: [] };

      const userLikedIds = new Set(
        userLikesResult.data?.map((l) => l.content_id) || []
      );

      return data.map((item) => ({
        ...item,
        is_liked: userLikedIds.has(item.id),
      })) as ContentWithAuthor[];
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].created_at;
    },
  });

  const feedItems = feedData?.pages.flatMap((page) => page) ?? [];

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
      const rateCheck = checkRateLimit('follow');
      if (!rateCheck.allowed) {
        throw new Error('Prea multe acțiuni. Încearcă din nou.');
      }
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

  // Track which contentIds have an in-flight like mutation
  const pendingLikeIds = useRef(new Set<string>());

  // Like mutation
  const likeMutation = useMutation({
    mutationKey: ["like"],
    mutationFn: async ({ contentId, isLiked }: { contentId: string; isLiked: boolean }) => {
      const rateCheck = checkRateLimit('like');
      if (!rateCheck.allowed) {
        throw new Error('Prea multe acțiuni. Încearcă din nou.');
      }
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
      const previousFeed = queryClient.getQueryData<InfiniteData<ContentWithAuthor[]>>(["feed"]);

      queryClient.setQueryData<InfiniteData<ContentWithAuthor[]>>(["feed"], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((item) =>
              item.id === contentId
                ? {
                    ...item,
                    is_liked: !isLiked,
                    likes_count: item.likes_count + (isLiked ? -1 : 1),
                  }
                : item
            )
          ),
        };
      });

      return { previousFeed };
    },
    onError: (err, variables, context) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(["feed"], context.previousFeed);
      }
    },
    onSettled: (_data, _error, variables) => {
      pendingLikeIds.current.delete(variables.contentId);
    },
  });

  const [commentsItem, setCommentsItem] = useState<ContentWithAuthor | null>(null);

  const handleLike = (contentId: string, isLiked: boolean) => {
    // Skip if a mutation is already in-flight for this content
    if (pendingLikeIds.current.has(contentId)) return;
    pendingLikeIds.current.add(contentId);
    likeMutation.mutate({ contentId, isLiked });
  };

  const handleComment = (contentId: string) => {
    const item = feedItems?.find((i) => i.id === contentId);
    if (item) setCommentsItem(item);
  };

  // Header Component
  const ListHeader = () => (
    <View>
      {/* Stories Row */}
      <Animated.View entering={FadeInLeft.duration(400).delay(80)}>
        <StoriesRow
          stories={displayStories}
          onAddStory={() => {
            // TODO: Add story
          }}
          onStoryPress={(story) => {
            // TODO: View story
          }}
        />
      </Animated.View>

      {/* Live Section */}
      <Animated.View entering={FadeInDown.duration(450).delay(500)}>
        <LiveSection lives={displayLives} onSeeAll={() => {}} />
      </Animated.View>

      {/* All Feeds Header */}
      <Animated.View
        entering={FadeInDown.duration(400).delay(650)}
        className="flex-row items-center justify-between px-4 py-3"
        style={{ backgroundColor: "#F0F4F8" }}
      >
        <Text className="text-dark-700 text-lg font-bold">All Feeds</Text>
        <Pressable className="flex-row items-center">
          <Ionicons name="options-outline" size={20} color="#64748b" />
        </Pressable>
      </Animated.View>
    </View>
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#F0F4F8" }}>
        <ActivityIndicator size="large" color="#0a66c2" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#F0F4F8" }} edges={["top"]}>
      {/* Header Bar */}
      <Animated.View entering={FadeInDown.duration(350)}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 12,
            backgroundColor: "#F0F4F8",
          }}
        >
          <Image
            source={require("@/assets/logo-text.png")}
            style={{ width: 100, height: 32 }}
            resizeMode="contain"
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              style={{
                width: 40,
                height: 40,
                borderTopLeftRadius: 18,
                borderTopRightRadius: 8,
                borderBottomRightRadius: 18,
                borderBottomLeftRadius: 18,
                backgroundColor: "rgba(255,255,255,0.65)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.9)",
                borderBottomWidth: 1.5,
                borderBottomColor: "rgba(10,102,194,0.18)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="search" size={20} color="#191919" />
            </Pressable>
            <Pressable
              style={{
                width: 40,
                height: 40,
                borderTopLeftRadius: 18,
                borderTopRightRadius: 8,
                borderBottomRightRadius: 18,
                borderBottomLeftRadius: 18,
                backgroundColor: "rgba(255,255,255,0.65)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.9)",
                borderBottomWidth: 1.5,
                borderBottomColor: "rgba(10,102,194,0.18)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="bell" size={20} color="#191919" />
              <View
                style={{
                  position: "absolute",
                  top: 4,
                  right: 2,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: "#0A66C2",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 4,
                  borderWidth: 2,
                  borderColor: "#fff",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>3</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Animated.View>

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
            onShare={() => {}}
            isFollowing={followingIds?.has(item.author_id) || false}
            onFollow={handleFollow}
            isLikePending={likeMutation.isPending}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#0a66c2"
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator size="small" color="#0a66c2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-12 px-6 bg-white rounded-xl mx-4">
            <Ionicons name="newspaper-outline" size={64} color="#64748b" />
            <Text className="text-dark-700 text-xl font-bold mt-4 text-center">
              Niciun conținut incă
            </Text>
            <Text className="text-dark-500 text-center mt-2">
              Urmărește creatori pentru a vedea postările lor aici
            </Text>
          </View>
        }
      />

      {/* Comments Modal */}
      <CommentsModal
        visible={!!commentsItem}
        item={commentsItem}
        onClose={() => setCommentsItem(null)}
      />
    </SafeAreaView>
  );
}
