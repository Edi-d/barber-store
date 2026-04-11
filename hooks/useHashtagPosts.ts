import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { ContentWithAuthor } from '@/types/database';

const PAGE_SIZE = 10;

/**
 * Infinite query that returns posts tagged with a given hashtag name.
 * Cursor-based on created_at, same shape as the main feed.
 */
export function useHashtagPosts(hashtagName: string) {
  const session = useAuthStore((s) => s.session);

  return useInfiniteQuery({
    queryKey: ['hashtag-posts', hashtagName],
    queryFn: async ({ pageParam }) => {
      // First resolve the hashtag id from its name (case-insensitive via ILIKE)
      const { data: hashtagRow, error: hashtagError } = await supabase
        .from('hashtags')
        .select('id')
        .ilike('name', hashtagName)
        .single();

      if (hashtagError || !hashtagRow) {
        // Hashtag doesn't exist yet — return empty page
        return [] as ContentWithAuthor[];
      }

      // Fetch content ids linked to this hashtag
      let chtQuery = supabase
        .from('content_hashtags')
        .select('content_id')
        .eq('hashtag_id', hashtagRow.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) {
        chtQuery = chtQuery.lt('created_at', pageParam as string);
      }

      const { data: chtRows, error: chtError } = await chtQuery;
      if (chtError) throw chtError;
      if (!chtRows || chtRows.length === 0) return [] as ContentWithAuthor[];

      const contentIds = chtRows.map((r) => r.content_id);

      // Fetch the actual content with author profiles
      const { data: posts, error: postsError } = await supabase
        .from('content')
        .select('*, author:profiles!author_id(*)')
        .in('id', contentIds)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (postsError) throw postsError;
      if (!posts || posts.length === 0) return [] as ContentWithAuthor[];

      // Determine which posts the current user has liked
      const userLikesResult =
        session && posts.length > 0
          ? await supabase
              .from('likes')
              .select('content_id')
              .eq('user_id', session.user.id)
              .in(
                'content_id',
                posts.map((p) => p.id)
              )
          : { data: [] };

      const likedIds = new Set(
        (userLikesResult.data ?? []).map((l) => l.content_id)
      );

      return posts.map((p) => ({
        ...p,
        is_liked: likedIds.has(p.id),
      })) as ContentWithAuthor[];
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].created_at;
    },
    enabled: !!hashtagName,
  });
}
