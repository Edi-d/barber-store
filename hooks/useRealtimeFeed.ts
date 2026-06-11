import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import { getOrCreateChannel, removeChannel } from '@/lib/realtime';
import { Content, ContentWithAuthor } from '@/types/database';

const CHANNEL_NAME = 'feed:content';
const DEBOUNCE_MS = 100;
// Only treat an uncached updated row as a newly published post if it was
// created recently — prevents a like on an old post (not yet in any cached
// page) from falsely triggering the "N postări noi" banner.
const RECENT_POST_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Subscribes to content table UPDATE/INSERT/DELETE events via Supabase Realtime.
 * - UPDATE: surgically updates likes_count / comments_count in the ["feed"] cache.
 *   If the updated row is not in any cached page (draft→published transition),
 *   it is treated as a new post and increments the banner counter.
 * - INSERT: accumulates new post IDs for the banner.
 * - DELETE: removes the post from all pages in the feed cache.
 *
 * Uses a 100ms debounce for UPDATE events to batch rapid-fire likes on viral posts.
 */
export function useRealtimeFeed() {
  const queryClient = useQueryClient();
  const newPostIds = useRef<string[]>([]);
  // Tracks IDs already counted in the banner to prevent double-increment
  // from multiple UPDATE events for the same unpaged post.
  const countedNewIds = useRef(new Set<string>());
  const [newPostCount, setNewPostCount] = useState(0);

  useEffect(() => {
    // Debounce state for UPDATE events
    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingUpdates = new Map<string, { likes_count: number; comments_count: number; created_at: string }>();

    function flushUpdates() {
      if (pendingUpdates.size === 0) return;

      const snapshot = new Map(pendingUpdates);
      pendingUpdates.clear();
      updateTimer = null;

      // Collect all post IDs currently present in any ["feed"] cache page
      const cachedIds = new Set<string>();
      const allCaches = queryClient.getQueriesData<InfiniteData<ContentWithAuthor[]>>(
        { queryKey: ['feed'], exact: false }
      );
      for (const [, data] of allCaches) {
        if (!data) continue;
        for (const page of data.pages) {
          for (const item of page) {
            cachedIds.add(item.id);
          }
        }
      }

      // Surgically apply count updates for posts already in a page
      queryClient.setQueriesData<InfiniteData<ContentWithAuthor[]>>(
        { queryKey: ['feed'], exact: false },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((item) => {
                const update = snapshot.get(item.id);
                return update
                  ? { ...item, likes_count: update.likes_count, comments_count: update.comments_count }
                  : item;
              })
            ),
          };
        }
      );

      // For any updated row that was NOT in a cached page (draft→published),
      // treat it as a newly published post — but only if it was created
      // recently. A like on an old post that simply isn't in the current
      // cached pages (e.g. page 5 not yet fetched) would otherwise produce
      // a false-positive banner.
      for (const [id, update] of snapshot) {
        if (!cachedIds.has(id) && !countedNewIds.current.has(id)) {
          const age = Date.now() - new Date(update.created_at).getTime();
          if (age < RECENT_POST_THRESHOLD_MS) {
            countedNewIds.current.add(id);
            newPostIds.current.push(id);
            setNewPostCount((c) => c + 1);
          }
        }
      }
    }

    const channel = getOrCreateChannel(CHANNEL_NAME)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'content',
          filter: 'status=eq.published',
        },
        (payload) => {
          const updated = payload.new as Content;
          pendingUpdates.set(updated.id, {
            likes_count: updated.likes_count,
            comments_count: updated.comments_count,
            created_at: updated.created_at,
          });

          if (updateTimer) clearTimeout(updateTimer);
          updateTimer = setTimeout(flushUpdates, DEBOUNCE_MS);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'content',
          filter: 'status=eq.published',
        },
        (payload) => {
          const newPost = payload.new as Content;
          // Guard against double-counting if both INSERT and UPDATE fire for the same post
          if (!countedNewIds.current.has(newPost.id)) {
            countedNewIds.current.add(newPost.id);
            newPostIds.current.push(newPost.id);
            setNewPostCount((c) => c + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'content',
        },
        (payload) => {
          if (!payload.old || !('id' in payload.old)) return;
          const deletedId = (payload.old as { id: string }).id;
          queryClient.setQueriesData<InfiniteData<ContentWithAuthor[]>>(
            { queryKey: ['feed'], exact: false },
            (old) => {
              if (!old) return old;
              return {
                ...old,
                pages: old.pages.map((page) =>
                  page.filter((item) => item.id !== deletedId)
                ),
              };
            }
          );
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          queryClient.invalidateQueries({ queryKey: ['feed'] });
        }
        if (__DEV__) {
          console.log('[Realtime] feed:content status:', status, err);
        }
      });

    return () => {
      if (updateTimer) clearTimeout(updateTimer);
      pendingUpdates.clear();
      removeChannel(CHANNEL_NAME);
    };
  }, [queryClient]);

  const showNewPosts = useCallback(() => {
    // Invalidate first. In TanStack Query v5 the invalidateQueries promise
    // resolves even when the triggered refetch is cancelled (cancellation is
    // not an error). Only clear the banner counters once we confirm no ['feed']
    // query is still in an invalidated state — if the refetch was aborted the
    // banner stays tappable so the user can retry.
    queryClient.invalidateQueries({ queryKey: ['feed'] }).then(() => {
      const stillInvalidated = queryClient
        .getQueryCache()
        .findAll({ queryKey: ['feed'] })
        .some((q) => q.state.isInvalidated);
      if (stillInvalidated) return; // refetch was aborted — keep banner tappable
      setNewPostCount(0);
      newPostIds.current = [];
      countedNewIds.current.clear();
    });
  }, [queryClient]);

  return { newPostCount, newPostIds, showNewPosts };
}
