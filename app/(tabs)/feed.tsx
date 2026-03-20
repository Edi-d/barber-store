import { useState, useRef, useCallback, useMemo } from "react";
import { View, FlatList, RefreshControl, Text, Pressable, ActivityIndicator, Image, Modal, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery, InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { useAuthStore } from "@/stores/authStore";
import { StoriesRow } from "@/components/feed/StoriesRow";
import { LiveSection } from "@/components/feed/LiveSection";
import { FeedCard } from "@/components/feed/FeedCard";
import { NewPostsBanner } from "@/components/feed/NewPostsBanner";
import { useRealtimeFeed } from "@/hooks/useRealtimeFeed";
import { useRealtimeLikes } from "@/hooks/useRealtimeLikes";
import { useRealtimeComments } from "@/hooks/useRealtimeComments";
import { useRealtimeLives } from "@/hooks/useRealtimeLives";
import { useStories, useMarkStoryViewed } from "@/hooks/useStories";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { ContentWithAuthor, LiveWithHost } from "@/types/database";
import { Ionicons, Feather } from "@expo/vector-icons";
import { CommentsModal } from "@/components/feed/CommentsModal";
import { Avatar } from "@/components/ui";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { timeAgo } from "@/lib/utils";
import { Bubble } from "@/constants/theme";
import Animated, {
  FadeInDown,
  FadeInLeft,
} from "react-native-reanimated";

const EMPTY_STORIES: any[] = [];

const PLACEHOLDER_LIVES: LiveWithHost[] = [
  {
    id: "placeholder-1", author_id: "", title: "Join me, paint the arts",
    cover_url: "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600",
    room_name: "placeholder-1", status: "live", playback_url: null, viewers_count: 41600,
    started_at: "2026-01-01T00:00:00Z", ended_at: null, created_at: "2026-01-01T00:00:00Z",
    host: { id: "", username: "dianne", display_name: "Dianne", avatar_url: null, bio: null, role: "creator", created_at: "" },
  },
  {
    id: "placeholder-2", author_id: "", title: "Live Session, Let's learn together",
    cover_url: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=600",
    room_name: "placeholder-2", status: "live", playback_url: null, viewers_count: 21200,
    started_at: "2026-01-01T00:00:00Z", ended_at: null, created_at: "2026-01-01T00:00:00Z",
    host: { id: "", username: "robert", display_name: "Robert", avatar_url: null, bio: null, role: "creator", created_at: "" },
  },
  {
    id: "placeholder-3", author_id: "", title: "Fade Masterclass - Live Demo",
    cover_url: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600",
    room_name: "placeholder-3", status: "live", playback_url: null, viewers_count: 15800,
    started_at: "2026-01-01T00:00:00Z", ended_at: null, created_at: "2026-01-01T00:00:00Z",
    host: { id: "", username: "alex", display_name: "Alex", avatar_url: null, bio: null, role: "creator", created_at: "" },
  },
  {
    id: "placeholder-4", author_id: "", title: "Beard Styling Session",
    cover_url: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600",
    room_name: "placeholder-4", status: "live", playback_url: null, viewers_count: 8900,
    started_at: "2026-01-01T00:00:00Z", ended_at: null, created_at: "2026-01-01T00:00:00Z",
    host: { id: "", username: "cristi", display_name: "Cristi", avatar_url: null, bio: null, role: "creator", created_at: "" },
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const MODAL_CARD_GAP = 12;
const MODAL_PADDING = 16;
const SCREEN_WIDTH = Dimensions.get("window").width;
const MODAL_CARD_WIDTH = (SCREEN_WIDTH - MODAL_PADDING * 2 - MODAL_CARD_GAP) / 2;
const MODAL_CARD_HEIGHT = 200;

function formatViewersModal(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

function ModalLiveCard({ live }: { live: LiveWithHost }) {
  const isPlaceholder = live.id.startsWith("placeholder");

  return (
    <Pressable
      onPress={isPlaceholder ? undefined : () => router.push(`/live/${live.id}` as any)}
      style={{
        width: MODAL_CARD_WIDTH,
        height: MODAL_CARD_HEIGHT,
        overflow: "hidden",
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
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      ) : (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#E8F3FF", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="radio" size={40} color="#0a66c2" />
        </View>
      )}

      {/* Gradient Overlay */}
      <LinearGradient
        colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.65)"]}
        locations={[0, 0.4, 1]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Top Row - LIVE badge + viewer count */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, zIndex: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#ef4444", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff", marginRight: 5 }} />
          <Text style={{ color: "#fff", fontSize: 10, fontFamily: "EuclidCircularA-Bold", letterSpacing: 0.5 }}>LIVE</Text>
        </View>
        {live.viewers_count > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99 }}>
            <Ionicons name="people" size={11} color="white" />
            <Text style={{ color: "#fff", fontSize: 11, fontFamily: "EuclidCircularA-Medium", marginLeft: 4 }}>
              {formatViewersModal(live.viewers_count)}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom Content */}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, zIndex: 10 }}>
        <Text
          style={{ color: "#fff", fontFamily: "EuclidCircularA-SemiBold", fontSize: 13, marginBottom: 8, lineHeight: 17 }}
          numberOfLines={2}
        >
          {live.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Avatar
            source={live.host?.avatar_url}
            name={live.host?.display_name || live.host?.username}
            size="xs"
            useDefaultAvatar={true}
          />
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 11, fontFamily: "EuclidCircularA-Medium", marginLeft: 6, flex: 1 }} numberOfLines={1}>
            {live.host?.display_name || live.host?.username}
          </Text>
          {(live.host?.role === "creator" || live.host?.role === "admin") && (
            <View style={{ marginLeft: 4, width: 14, height: 14, backgroundColor: "#0a66c2", borderRadius: 7, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="checkmark" size={8} color="white" />
            </View>
          )}
        </View>
        {live.started_at && (
          <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, fontFamily: "EuclidCircularA-Regular", marginTop: 3 }}>
            {timeAgo(live.started_at)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

interface AllLivesModalProps {
  visible: boolean;
  lives: LiveWithHost[];
  onClose: () => void;
}

function AllLivesModal({ visible, lives, onClose }: AllLivesModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F4F8" }} edges={["top", "bottom"]}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 14,
            backgroundColor: "#F0F4F8",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              style={{
                fontFamily: "EuclidCircularA-Bold",
                fontSize: 20,
                color: "#191919",
              }}
            >
              Creatori Live
            </Text>
            <View
              style={{
                marginLeft: 8,
                backgroundColor: "#0A66C2",
                borderTopLeftRadius: 10,
                borderTopRightRadius: 5,
                borderBottomRightRadius: 10,
                borderBottomLeftRadius: 10,
                paddingHorizontal: 8,
                paddingVertical: 2,
                minWidth: 28,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontFamily: "EuclidCircularA-Bold" }}>
                {lives.length}
              </Text>
            </View>
          </View>

          {/* Close button */}
          <Pressable
            onPress={onClose}
            style={{
              width: 38,
              height: 38,
              borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
              borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
              borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
              borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.9)",
              borderBottomWidth: 1.5,
              borderBottomColor: "rgba(10,102,194,0.18)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={20} color="#191919" />
          </Pressable>
        </View>

        {/* Grid */}
        <FlatList
          data={lives}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: MODAL_PADDING, paddingTop: 4, paddingBottom: 32, gap: MODAL_CARD_GAP }}
          columnWrapperStyle={{ gap: MODAL_CARD_GAP }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <ModalLiveCard live={item} />}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const { newPostCount, showNewPosts } = useRealtimeFeed();
  useRealtimeLikes(session?.user.id);
  useRealtimeComments();
  const flatListRef = useRef<FlatList>(null);

  const handleShowNewPosts = useCallback(() => {
    showNewPosts();
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [showNewPosts]);

  // Stories via real Supabase data with seen/unseen state
  const { data: storyGroups = EMPTY_STORIES } = useStories();
  const markViewed = useMarkStoryViewed();
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [livesModalVisible, setLivesModalVisible] = useState(false);

  // Realtime lives — subscribes to Supabase and keeps list in sync.
  // When no one is streaming, fall back to placeholder cards so the section
  // is always visible and the feed doesn't look empty.
  const { lives: realtimeLives } = useRealtimeLives();

  const displayLives = realtimeLives.length > 0 ? realtimeLives : PLACEHOLDER_LIVES;

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

  // Header memoized to prevent remounting on every render (which would re-trigger entering animations)
  const listHeader = useMemo(() => (
    <View>
      {/* Stories Row */}
      <Animated.View entering={FadeInLeft.duration(400).delay(80)}>
        <StoriesRow
          groups={storyGroups}
          onGroupPress={(_group, index) => {
            setViewerStartIndex(index);
            setViewerVisible(true);
          }}
        />
      </Animated.View>

      {/* Live Section */}
      <Animated.View entering={FadeInDown.duration(450).delay(500)}>
        <LiveSection lives={displayLives} onSeeAll={() => setLivesModalVisible(true)} />
      </Animated.View>

      {/* All Feeds Header */}
      <Animated.View
        entering={FadeInDown.duration(400).delay(650)}
        className="flex-row items-center justify-between px-4 pt-3 pb-2"
        style={{ backgroundColor: "#F0F4F8" }}
      >
        <Text className="text-dark-700 text-lg font-bold">Toate postarile</Text>
        <Pressable className="flex-row items-center">
          <Ionicons name="options-outline" size={20} color="#64748b" />
        </Pressable>
      </Animated.View>

      {/* New Posts Banner */}
      <NewPostsBanner count={newPostCount} onPress={handleShowNewPosts} />
    </View>
  ), [storyGroups, displayLives, newPostCount, handleShowNewPosts]);

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
        ref={flatListRef}
        data={feedItems}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
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

      {/* Story Viewer */}
      <StoryViewer
        visible={viewerVisible}
        groups={storyGroups}
        initialGroupIndex={viewerStartIndex}
        onClose={() => setViewerVisible(false)}
        onStoryViewed={(storyId) => markViewed.mutate(storyId)}
      />

      {/* All Lives Modal */}
      <AllLivesModal
        visible={livesModalVisible}
        lives={displayLives}
        onClose={() => setLivesModalVisible(false)}
      />
    </SafeAreaView>
  );
}
