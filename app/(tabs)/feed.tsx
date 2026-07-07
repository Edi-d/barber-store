import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useTutorialContext } from "@/components/tutorial/TutorialProvider";
import { View, FlatList, RefreshControl, Text, Pressable, ScrollView, Image, Modal, useWindowDimensions, ViewToken } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery, InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { useAuthStore } from "@/stores/authStore";
import { StoriesRow } from "@/components/feed/StoriesRow";
import { LiveSection } from "@/components/feed/LiveSection";
import { FeedCard } from "@/components/feed/FeedCard";
import { NewPostsBanner } from "@/components/feed/NewPostsBanner";
import { FilterChipBar } from "@/components/feed/FilterChipBar";
import { SortSheet } from "@/components/feed/SortSheet";
import { useRealtimeFeed } from "@/hooks/useRealtimeFeed";
import { useRealtimeLikes } from "@/hooks/useRealtimeLikes";
import { useRealtimeComments } from "@/hooks/useRealtimeComments";
import { useRealtimeLives } from "@/hooks/useRealtimeLives";
import { useStories, useMarkStoryViewed, type StoryGroup } from "@/hooks/useStories";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { ContentWithAuthor, LiveWithHost } from "@/types/database";
import type { FeedFilter, FeedSort } from "@/types/feed";
import { Ionicons, Feather } from "@expo/vector-icons";
import { CommentsModal } from "@/components/feed/CommentsModal";
import { NotificationsModal } from "@/components/feed/NotificationsModal";
import { useNotifications } from "@/hooks/useNotifications";
import { Avatar } from "@/components/ui";
import { EmptyState } from "@/components/shared/EmptyState";
import { PostCardSkeletonList } from "@/components/feed/PostCardSkeleton";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { timeAgo } from "@/lib/utils";
import { Bubble } from "@/constants/theme";
import Animated, {
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";
import { LiveToastBanner } from "@/components/feed/LiveToastBanner";

const EMPTY_STORIES: StoryGroup[] = [];


// ─── Helpers ────────────────────────────────────────────────────────────────

const MODAL_CARD_GAP = 12;
const MODAL_PADDING = 16;
const MODAL_CARD_HEIGHT = 200;

function formatViewersModal(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

function ModalLiveCard({ live, onClose }: { live: LiveWithHost; onClose: () => void }) {
  const { width: screenWidth } = useWindowDimensions();
  const modalCardWidth = (screenWidth - MODAL_PADDING * 2 - MODAL_CARD_GAP) / 2;
  return (
    <Pressable
      onPress={() => { onClose(); setTimeout(() => router.push(`/live/${live.id}` as any), 300); }}
      style={{
        width: modalCardWidth,
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
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#ef4444", paddingHorizontal: 7, paddingVertical: 4, borderTopLeftRadius: 8, borderTopRightRadius: 4, borderBottomRightRadius: 8, borderBottomLeftRadius: 8 }}>
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

        {/* Empty state */}
        {lives.length === 0 && (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 32,
              paddingBottom: 48,
            }}
          >
            <Ionicons name="radio-outline" size={52} color="#B0BEC5" />
            <Text
              style={{
                fontFamily: "EuclidCircularA-Bold",
                fontSize: 17,
                color: "#191919",
                marginTop: 16,
                textAlign: "center",
              }}
            >
              Nimeni nu e live acum
            </Text>
            <Text
              style={{
                fontFamily: "EuclidCircularA-Regular",
                fontSize: 14,
                color: "#6B7280",
                marginTop: 6,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              Revino mai târziu pentru sesiuni live
            </Text>
          </View>
        )}

        {/* Grid */}
        {lives.length > 0 && (
          <FlatList
            data={lives}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={{ paddingHorizontal: MODAL_PADDING, paddingTop: 4, paddingBottom: 32, gap: MODAL_CARD_GAP }}
            columnWrapperStyle={{ gap: MODAL_CARD_GAP }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => <ModalLiveCard live={item} onClose={onClose} />}
          />
        )}
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

  // ─── Tutorial refs ────────────────────────────────────────────────────────
  const { registerRef, unregisterRef } = useTutorialContext();

  const feedLikeRef     = useRef<View>(null);
  const feedCommentRef  = useRef<View>(null);
  const feedShareRef    = useRef<View>(null);
  const feedFollowRef   = useRef<View>(null);
  const feedStoriesRowRef  = useRef<View>(null);
  const feedStoryAvatarRef = useRef<View>(null);
  const feedFilterChipsRef = useRef<View>(null);
  const feedSortBtnRef     = useRef<View>(null);
  const feedNewPostsRef    = useRef<View>(null);

  useEffect(() => {
    registerRef('feed-like-btn',        feedLikeRef);
    registerRef('feed-comment-btn',     feedCommentRef);
    registerRef('feed-share-btn',       feedShareRef);
    registerRef('feed-follow-btn',      feedFollowRef);
    registerRef('feed-stories-row',     feedStoriesRowRef);
    registerRef('feed-story-avatar',    feedStoryAvatarRef);
    registerRef('feed-filter-chips',    feedFilterChipsRef);
    registerRef('feed-sort-btn',        feedSortBtnRef);
    registerRef('feed-new-posts-banner', feedNewPostsRef);

    return () => {
      unregisterRef('feed-like-btn');
      unregisterRef('feed-comment-btn');
      unregisterRef('feed-share-btn');
      unregisterRef('feed-follow-btn');
      unregisterRef('feed-stories-row');
      unregisterRef('feed-story-avatar');
      unregisterRef('feed-filter-chips');
      unregisterRef('feed-sort-btn');
      unregisterRef('feed-new-posts-banner');
    };
  }, [registerRef, unregisterRef]);

  const handleShowNewPosts = useCallback(() => {
    showNewPosts();
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [showNewPosts]);

  // ─── Filter / sort state ─────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('all');
  const [activeSort, setActiveSort] = useState<FeedSort>('newest');
  const [sortSheetVisible, setSortSheetVisible] = useState(false);

  const handleFilterChange = useCallback((filter: FeedFilter) => {
    setActiveFilter(filter);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const handleSortChange = useCallback((sort: FeedSort) => {
    setActiveSort(sort);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // ─── Video playback state ────────────────────────────────────────────────
  const activeVideoId = useRef<string | null>(null);
  const [activeVideoIdState, setActiveVideoIdState] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      // Find the first visible video-type item
      const firstVideo = viewableItems.find(
        (vt) => vt.isViewable && (vt.item as ContentWithAuthor).type === 'video',
      );
      const nextId = firstVideo ? (firstVideo.item as ContentWithAuthor).id : null;
      if (nextId !== activeVideoId.current) {
        activeVideoId.current = nextId;
        setActiveVideoIdState(nextId);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 40,
    minimumViewTime: 100,
  });

  const viewabilityConfigCallbackPairs = useRef([
    { viewabilityConfig: viewabilityConfig.current, onViewableItemsChanged },
  ]);

  // Stories via real Supabase data with seen/unseen state
  const { data: storyGroups = EMPTY_STORIES } = useStories();
  const markViewed = useMarkStoryViewed();
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [livesModalVisible, setLivesModalVisible] = useState(false);

  // Realtime lives — subscribes to Supabase and keeps list in sync.
  // When no one is streaming the section hides automatically.
  const { lives: realtimeLives } = useRealtimeLives();

  const PAGE_SIZE = 10;

  // Fetch user's follows — must be declared BEFORE the feed query so
  // followingIds is available inside the queryFn closure.
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

  // ─── Effective sort — chips take precedence over the sort sheet ──────────
  // 'popular' chip → likes-ordered; 'recent' chip → newest; else use sheet sort.
  // Treat 'trending' the same as 'most_liked' (likes + recency weighted).
  const effectiveSort = useMemo((): 'most_liked' | 'newest' => {
    if (activeFilter === 'popular') return 'most_liked';
    if (activeFilter === 'recent') return 'newest';
    if (activeSort === 'newest') return 'newest';
    // 'most_liked' and 'trending' both go likes-ordered
    return 'most_liked';
  }, [activeFilter, activeSort]);

  // ─── Stable membership token for the 'following' filter ─────────────────
  // Using size was lossy: unfollow A + follow B keeps size the same.
  // Sort the IDs so the token is order-independent.
  const followingToken = useMemo(() => {
    if (activeFilter !== 'following') return '';
    return [...(followingIds ?? [])].sort().join('|');
  }, [activeFilter, followingIds]);

  // Single source of truth for the query key — reused in the query,
  // likeMutation.onMutate, and likeMutation.onError.
  const feedQueryKey = useMemo(
    () => ["feed", activeFilter, effectiveSort, followingToken] as const,
    [activeFilter, effectiveSort, followingToken],
  );

  // pageParam type: number (offset) for likes-ordered, { createdAt, id } for newest
  type OffsetParam = number;
  type KeysetParam = { createdAt: string; id: string };
  type PageParam = OffsetParam | KeysetParam | undefined;

  // Fetch feed content — pagination strategy depends on effectiveSort:
  //   'most_liked' → OFFSET pagination. likes_count shifts between pages, so any
  //                  cursor strategy is also unstable. Duplicates are mitigated by
  //                  the in-memory dedupe in feedItems; occasional skipped rows are
  //                  an accepted trade-off.
  //   'newest'     → composite keyset (created_at, id) to handle timestamp ties
  const {
    data: feedData,
    isLoading,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: feedQueryKey,
    queryFn: async ({ pageParam }: { pageParam: PageParam }) => {
      // Base query
      let query = supabase
        .from("content")
        .select(`*, author:profiles!author_id(*)`)
        .eq("status", "published");

      // Filter modifiers
      if (activeFilter === 'following') {
        const ids = followingIds ? Array.from(followingIds) : [];
        if (ids.length === 0) return [] as ContentWithAuthor[];
        query = query.in('author_id', ids);
      } else if (activeFilter === 'images') {
        query = query.eq('type', 'image');
      } else if (activeFilter === 'videos') {
        query = query.eq('type', 'video');
      }

      if (effectiveSort === 'most_liked') {
        // Likes-ordered: OFFSET pagination (see strategy comment above)
        const offset = typeof pageParam === 'number' ? pageParam : 0;
        query = query
          .order('likes_count', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
      } else {
        // Newest: composite keyset (created_at, id) to survive timestamp ties
        query = query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(PAGE_SIZE);

        if (pageParam && typeof pageParam === 'object' && 'createdAt' in pageParam) {
          // PostgREST or-filter with QUOTED values (timestamps contain + and :)
          query = query.or(
            `created_at.lt."${pageParam.createdAt}",and(created_at.eq."${pageParam.createdAt}",id.lt."${pageParam.id}")`
          );
        }
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
    initialPageParam: undefined as PageParam,
    getNextPageParam: (lastPage, allPages): PageParam => {
      if (lastPage.length < PAGE_SIZE) return undefined;

      if (effectiveSort === 'most_liked') {
        // Next page offset = total rows fetched across all pages
        return allPages.reduce((sum, page) => sum + page.length, 0);
      } else {
        // Keyset cursor from the last item in the page
        const last = lastPage[lastPage.length - 1];
        return { createdAt: last.created_at, id: last.id };
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes — prevents refetch on tab switch
    placeholderData: (previousData) => previousData,
    // Don't fire while followingIds is still loading: the empty followingToken
    // would cause a fetch with no IDs, then a second fetch once IDs arrive,
    // churning the cache unnecessarily.
    enabled: activeFilter !== 'following' || followingIds !== undefined,
  });

  // Flatten pages and dedupe by id — defense against duplicate rows that
  // would collide in FlatList keyExtractor and cause React to silently drop cells.
  const feedItems = useMemo(() => {
    const pages = feedData?.pages ?? [];
    const seen = new Set<string>();
    const result: ContentWithAuthor[] = [];
    for (const page of pages) {
      for (const item of page) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          result.push(item);
        }
      }
    }
    return result;
  }, [feedData]);

  // Auto-activate the first video when feed data loads. Without this,
  // activeVideoIdState stays null until onViewableItemsChanged fires —
  // but the tall list header keeps video cards below the visibility
  // threshold on first render, so the callback never finds a video.
  useEffect(() => {
    const firstVideo = feedItems.find((it) => it.type === 'video');
    const currentStillValid =
      activeVideoIdState !== null &&
      feedItems.some((it) => it.id === activeVideoIdState);
    if (firstVideo && !currentStillValid) {
      activeVideoId.current = firstVideo.id;
      setActiveVideoIdState(firstVideo.id);
    } else if (!firstVideo && activeVideoIdState !== null) {
      activeVideoId.current = null;
      setActiveVideoIdState(null);
    }
  }, [feedItems, activeVideoIdState]);

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
      // Scope cancel to the exact feed query key — avoids aborting
      // any in-flight banner refetch triggered by showNewPosts().
      await queryClient.cancelQueries({ queryKey: feedQueryKey, exact: true });
      const previousFeed = queryClient.getQueryData<InfiniteData<ContentWithAuthor[]>>(feedQueryKey);

      queryClient.setQueryData<InfiniteData<ContentWithAuthor[]>>(feedQueryKey, (old) => {
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
    onError: (_err, _variables, context) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(feedQueryKey, context.previousFeed);
      }
    },
    onSettled: (_data, _error, variables) => {
      pendingLikeIds.current.delete(variables.contentId);

      // If a banner-triggered invalidation was aborted by the cancel above,
      // recover it now so new posts are not permanently lost.
      if (queryClient.getQueryState(feedQueryKey)?.isInvalidated) {
        queryClient.invalidateQueries({ queryKey: feedQueryKey });
      }
    },
  });

  const [commentsItem, setCommentsItem] = useState<ContentWithAuthor | null>(null);
  const [notifVisible, setNotifVisible] = useState(false);
  const { unreadCount } = useNotifications();

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

  // Dynamic section header label based on active filter
  const sectionHeaderLabel = useMemo(() => {
    switch (activeFilter) {
      case 'following': return 'Urmăriți';
      case 'popular':   return 'Populare';
      case 'recent':    return 'Recente';
      case 'images':    return 'Imagini';
      case 'videos':    return 'Videoclipuri';
      default:          return 'Toate postările';
    }
  }, [activeFilter]);

  // Header memoized to prevent remounting on every render (which would re-trigger entering animations)
  const listHeader = useMemo(() => (
    <View>
      {/* Stories Row */}
      <View>
        <StoriesRow
          groups={storyGroups}
          onGroupPress={(_group, index) => {
            setViewerStartIndex(index);
            setViewerVisible(true);
          }}
          containerRef={feedStoriesRowRef}
          firstAvatarRef={feedStoryAvatarRef}
        />
      </View>

      {/* Live Section */}
      <View>
        <LiveSection lives={realtimeLives} onSeeAll={realtimeLives.length > 0 ? () => setLivesModalVisible(true) : undefined} />
      </View>

      {/* Filter Chip Bar */}
      <View>
        <FilterChipBar activeFilter={activeFilter} onFilterChange={setActiveFilter} containerRef={feedFilterChipsRef} />
      </View>

      {/* All Feeds Header */}
      <View
        className="flex-row items-center justify-between px-4 pt-3 pb-2"
        style={{ backgroundColor: "#F0F4F8" }}
      >
        <Text className="text-dark-700 text-lg font-bold">{sectionHeaderLabel}</Text>
        <Pressable
          ref={feedSortBtnRef}
          collapsable={false}
          className="flex-row items-center"
          onPress={() => setSortSheetVisible(true)}
        >
          <Ionicons name="options-outline" size={20} color="#64748b" />
        </Pressable>
      </View>

      {/* New Posts Banner */}
      <NewPostsBanner count={newPostCount} onPress={handleShowNewPosts} bannerRef={feedNewPostsRef} />
    </View>
  ), [storyGroups, realtimeLives, newPostCount, handleShowNewPosts, activeFilter, activeSort, sectionHeaderLabel]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "#F0F4F8" }} edges={["top"]}>
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}>
          <Image
            source={require("@/assets/logo-text.webp")}
            style={{ width: 100, height: 32 }}
            resizeMode="contain"
          />
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <FeedSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#F0F4F8" }} edges={["top"]}>
      {/* Header Bar */}
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
          source={require("@/assets/logo-text.webp")}
          style={{ width: 100, height: 32 }}
          resizeMode="contain"
        />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Content search screen */}
            <Pressable
              onPress={() => router.push("/search" as any)}
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
              <Ionicons name="search-outline" size={20} color="#191919" />
            </Pressable>
            <Pressable
              onPress={() => setNotifVisible(true)}
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
              {unreadCount > 0 && (
                <Animated.View
                  key={unreadCount}
                  entering={ZoomIn.duration(220).springify()}
                  exiting={ZoomOut.duration(180)}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    minWidth: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: "#E53935",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 3,
                    borderWidth: 1.5,
                    borderColor: "#fff",
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 8,
                      fontFamily: "EuclidCircularA-SemiBold",
                      lineHeight: 11,
                    }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </Animated.View>
              )}
            </Pressable>
          </View>
      </View>

      {/* Feed Content */}
      <FlatList
        ref={flatListRef}
        data={feedItems}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item, index }) => (
          <FeedCard
            item={item}
            onLikeToggle={() => handleLike(item.id, item.is_liked || false)}
            onLikeAdd={() => {
              if (!(item.is_liked || false)) {
                handleLike(item.id, false);
              }
            }}
            onComment={() => handleComment(item.id)}
            isFollowing={followingIds?.has(item.author_id) || false}
            onFollow={handleFollow}
            isLikePending={likeMutation.isPending}
            isActiveVideo={item.id === activeVideoIdState}
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted((m) => !m)}
            likeRef={index === 0 ? feedLikeRef : undefined}
            commentRef={index === 0 ? feedCommentRef : undefined}
            shareRef={index === 0 ? feedShareRef : undefined}
            followRef={index === 0 ? feedFollowRef : undefined}
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
        contentContainerStyle={{ paddingBottom: 180 }}
        showsVerticalScrollIndicator={false}
        maxToRenderPerBatch={5}
        windowSize={7}
        removeClippedSubviews={false}
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ paddingVertical: 16 }}>
              <PostCardSkeletonList count={2} />
            </View>
          ) : null
        }
        ListEmptyComponent={(() => {
          if (activeFilter === 'following') {
            const hasFollows = followingIds && followingIds.size > 0;
            if (!hasFollows) {
              return (
                <EmptyState
                  icon="people-outline"
                  title="Nu urmărești pe nimeni"
                  subtitle="Urmărește creatori pentru a vedea postările lor"
                  className="mx-4"
                />
              );
            }
            return (
              <EmptyState
                icon="newspaper-outline"
                title="Nicio postare recentă"
                subtitle="Persoanele pe care le urmărești nu au postat încă"
                className="mx-4"
              />
            );
          }
          if (activeFilter === 'images') {
            return (
              <EmptyState
                icon="images-outline"
                title="Nicio imagine găsită"
                subtitle="Nu există postări cu imagini momentan"
                className="mx-4"
              />
            );
          }
          if (activeFilter === 'videos') {
            return (
              <EmptyState
                icon="videocam-outline"
                title="Niciun video găsit"
                subtitle="Nu există postări video momentan"
                className="mx-4"
              />
            );
          }
          if (activeFilter === 'popular') {
            return (
              <EmptyState
                icon="flame-outline"
                title="Niciun conținut popular"
                subtitle="Revino mai târziu"
                className="mx-4"
              />
            );
          }
          return (
            <EmptyState
              icon="newspaper-outline"
              title="Niciun conținut incă"
              subtitle="Urmărește creatori pentru a vedea postările lor aici"
              className="mx-4"
            />
          );
        })()}
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
        lives={realtimeLives}
        onClose={() => setLivesModalVisible(false)}
      />

      {/* Notifications Modal */}
      <NotificationsModal
        visible={notifVisible}
        onClose={() => setNotifVisible(false)}
      />

      {/* Sort Sheet */}
      <SortSheet
        visible={sortSheetVisible}
        activeSort={activeSort}
        onSortChange={setActiveSort}
        onClose={() => setSortSheetVisible(false)}
      />

      {/* Live toast — slides in from top when someone goes live */}
      <LiveToastBanner />
    </SafeAreaView>
  );
}
