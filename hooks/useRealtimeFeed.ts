import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import { getOrCreateChannel, removeChannel } from '@/lib/realtime';
import { Content, ContentWithAuthor } from '@/types/database';

const CHANNEL_NAME = 'feed:content';
const DEBOUNCE_MS = 100;

/**
 * Subscribes to content table UPDATE/INSERT/DELETE events via Supabase Realtime.
 * - UPDATE: surgically updates likes_count / comments_count in the ["feed"] cache
 * - INSERT: accumulates new post IDs for the banner (Plan 03)
 * - DELETE: removes the post from all pages in the feed cache
 *
 * Uses a 100ms debounce for UPDATE events to batch rapid-fire likes on viral posts.
 */
export function useRealtimeFeed() {
  const queryClient = useQueryClient();
  const newPostIds = useRef<string[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);

  useEffect(() => {
    // Debounce state for UPDATE events
    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingUpdates = new Map<string, { likes_count: number; comments_count: number }>();

    function flushUpdates() {
      if (pendingUpdates.size === 0) return;

      const snapshot = new Map(pendingUpdates);
      pendingUpdates.clear();
      updateTimer = null;

      queryClient.setQueryData<InfiniteData<ContentWithAuthor[]>>(
        ['feed'],
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
          newPostIds.current.push(newPost.id);
          setNewPostCount((c) => c + 1);
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
          const deletedId = (payload.old as { id: string }).id;
          queryClient.setQueryData<InfiniteData<ContentWithAuthor[]>>(
            ['feed'],
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
    queryClient.invalidateQueries({ queryKey: ['feed'] });
    setNewPostCount(0);
    newPostIds.current = [];
  }, [queryClient]);

  return { newPostCount, newPostIds, showNewPosts };
}
