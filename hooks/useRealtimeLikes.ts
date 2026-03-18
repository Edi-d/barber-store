import { useEffect } from 'react';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import { getOrCreateChannel, removeChannel } from '@/lib/realtime';
import { ContentWithAuthor } from '@/types/database';

/**
 * Subscribes to likes table INSERT/DELETE for the current user.
 * Updates is_liked state in the ["feed"] React Query cache.
 *
 * The filter `user_id=eq.${userId}` means we only receive events for
 * the CURRENT user's likes -- this confirms/corrects the optimistic
 * update already done by the like mutation in feed.tsx.
 *
 * The channel name includes userId so that logging out and back in as
 * a different user always creates a fresh channel with the correct filter
 * rather than reusing a stale one.
 */
export function useRealtimeLikes(userId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channelName = `feed:likes:${userId}`;
    const channel = getOrCreateChannel(channelName)
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
          if (!payload.old || !('content_id' in payload.old)) return;
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
          console.log(`[Realtime] ${channelName} status:`, status, err);
        }
      });

    return () => {
      removeChannel(channelName);
    };
  }, [userId, queryClient]);
}
