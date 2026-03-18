import { useEffect } from 'react';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import { getOrCreateChannel, removeChannel } from '@/lib/realtime';
import { ContentWithAuthor } from '@/types/database';

const CHANNEL_NAME = 'feed:comments';

/**
 * Subscribes to comments table INSERT events via Supabase Realtime.
 * Increments comments_count in the ["feed"] cache for the matching post.
 * Also invalidates the ['comments', contentId] query so the comments
 * modal refreshes if currently open.
 *
 * We subscribe to INSERT only (not UPDATE/DELETE) since comments_count
 * on the content row is already tracked by the useRealtimeFeed UPDATE handler.
 * This hook provides faster comments_count updates by reacting to the comment
 * INSERT directly rather than waiting for the content row UPDATE trigger.
 */
export function useRealtimeComments(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = getOrCreateChannel(CHANNEL_NAME)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
        },
        (payload) => {
          if (!payload.new || !('content_id' in payload.new)) return;
          const contentId = (payload.new as { content_id: string }).content_id;

          // Increment comments_count in feed cache
          queryClient.setQueryData<InfiniteData<ContentWithAuthor[]>>(
            ['feed'],
            (old) => {
              if (!old) return old;
              return {
                ...old,
                pages: old.pages.map((page) =>
                  page.map((item) =>
                    item.id === contentId
                      ? { ...item, comments_count: item.comments_count + 1 }
                      : item
                  )
                ),
              };
            }
          );

          // Invalidate the comments query so the modal refreshes if open
          queryClient.invalidateQueries({ queryKey: ['comments', contentId] });
        }
      )
      .subscribe((status, err) => {
        if (__DEV__) {
          console.log('[Realtime] feed:comments status:', status, err);
        }
      });

    return () => {
      removeChannel(CHANNEL_NAME);
    };
  }, [queryClient]);
}
