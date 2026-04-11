import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { ContentWithAuthor } from '@/types/database';

const PAGE_SIZE = 10;

export type FeedFilter = 'all' | 'following' | 'images' | 'videos';
export type FeedSort = 'recent' | 'popular';

/**
 * Extracted infinite query hook for the feed.
 * Handles cursor-based pagination, filter/sort modifiers, and parallel
 * like-status fetching so FeedCard always knows whether the current user
 * has liked each post.
 *
 * @param filter  - Content filter: 'all' | 'following' | 'images' | 'videos'
 * @param sort    - Sort order: 'recent' (default) | 'popular'
 * @param followingIds - Set of profile IDs the current user follows (used for
 *                       'following' filter). Pass an empty Set when unavailable.
 */
export function useFeedQuery(
  filter: FeedFilter = 'all',
  sort: FeedSort = 'recent',
  followingIds: Set<string> = new Set(),
) {
  const { session } = useAuthStore();

  const result = useInfiniteQuery({
    queryKey: ['feed', filter, sort, session?.user.id],
    queryFn: async ({ pageParam }) => {
      // ── Base query ──
      let query = supabase
        .from('content')
        .select('*, author:profiles!author_id(*)')
        .eq('status', 'published')
        .limit(PAGE_SIZE);

      // ── Sort ──
      if (sort === 'popular') {
        query = query.order('likes_count', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // ── Cursor (only meaningful with time-based sort) ──
      if (pageParam) {
        if (sort === 'recent') {
          query = query.lt('created_at', pageParam as string);
        } else {
          // For popular sort use likes_count + created_at as composite cursor
          // pageParam encodes "likes_count:created_at"
          const [likesStr, cursorDate] = (pageParam as string).split(':');
          const likesCount = parseInt(likesStr, 10);
          if (!isNaN(likesCount) && cursorDate) {
            query = query
              .lt('likes_count', likesCount)
              .lt('created_at', cursorDate);
          }
        }
      }

      // ── Filter: content type ──
      if (filter === 'images') {
        query = query.eq('type', 'image');
      } else if (filter === 'videos') {
        query = query.eq('type', 'video');
      }

      const { data, error } = await query;
      if (error) throw error;

      // ── Filter: following (client-side because it requires the Set) ──
      const filtered =
        filter === 'following' && followingIds.size > 0
          ? data.filter((item) => followingIds.has(item.author_id))
          : data;

      // ── Parallel: fetch which items current user has liked ──
      const contentIds = filtered.map((item) => item.id);
      const userLikedIds = new Set<string>();

      if (session && contentIds.length > 0) {
        const { data: likeData, error: likeError } = await supabase
          .from('likes')
          .select('content_id')
          .eq('user_id', session.user.id)
          .in('content_id', contentIds);

        if (likeError) {
          console.warn('[useFeedQuery] Failed to fetch user likes:', likeError.message);
        } else {
          likeData?.forEach((l) => userLikedIds.add(l.content_id));
        }
      }

      return filtered.map((item) => ({
        ...item,
        is_liked: userLikedIds.has(item.id),
      })) as ContentWithAuthor[];
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage): string | undefined => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const last = lastPage[lastPage.length - 1];
      if (sort === 'popular') {
        return `${last.likes_count}:${last.created_at}`;
      }
      return last.created_at;
    },
  });

  const feedItems = result.data?.pages.flatMap((page) => page) ?? [];

  return {
    feedItems,
    isLoading: result.isLoading,
    isRefetching: result.isRefetching,
    refetch: result.refetch,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
  };
}
