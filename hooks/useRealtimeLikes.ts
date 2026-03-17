import { useEffect } from 'react';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import { getOrCreateChannel, removeChannel } from '@/lib/realtime';
import { ContentWithAuthor } from '@/types/database';

const CHANNEL_NAME = 'feed:likes';

/**
 * Subscribes to likes table INSERT/DELETE for the current user.
 * Updates is_liked state in the ["feed"] React Query cache.
 *
 * The filter `user_id=eq.${userId}` means we only receive events for
 * the CURRENT user's likes -- this confirms/corrects the optimistic
 * update already done by the like mutation in feed.tsx.
 */
export function useRealtimeLikes(userId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = getOrCreateChannel(CHANNEL_NAME)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'likes',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const contentId = (payload.new as { content_id: string }).content_id;
          queryClient.setQueryData<InfiniteData<ContentWithAuthor[]>>(
            ['feed'],
            (old) => {
              if (!old) return old;
              return {
                ...old,
                pages: old.pages.map((page) =>
                  page.map((item) =>
                    item.id === contentId
                      ? { ...item, is_liked: true }
                      : item
                  )
                ),
              };
            }
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'likes',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const contentId = (payload.old as { content_id: string }).content_id;
          queryClient.setQueryData<InfiniteData<ContentWithAuthor[]>>(
            ['feed'],
            (old) => {
              if (!old) return old;
              return {
                ...old,
                pages: old.pages.map((page) =>
                  page.map((item) =>
                    item.id === contentId
                      ? { ...item, is_liked: false }
                      : item
                  )
                ),
              };
            }
          );
        }
      )
      .subscribe((status, err) => {
        if (__DEV__) {
          console.log('[Realtime] feed:likes status:', status, err);
        }
      });

    return () => {
      removeChannel(CHANNEL_NAME);
    };
  }, [userId, queryClient]);
}
