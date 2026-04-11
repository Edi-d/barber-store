import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStoriesWithSeenState, StoryGroup } from '@/lib/stories';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { getOrCreateChannel, subscribeChannel, removeChannel } from '@/lib/realtime';

export type { StoryGroup } from '@/lib/stories';
export type { StoryItem } from '@/lib/stories';

const CHANNEL_NAME = 'stories-inserts';

export function useStories() {
  const { session } = useAuthStore();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  // Subscribe to new story inserts so the row refreshes immediately instead of
  // waiting for the 30-second staleTime window to expire.
  useEffect(() => {
    if (!userId) return;

    const channel = getOrCreateChannel(CHANNEL_NAME).on(
      'postgres_changes' as any,
      { event: 'INSERT', schema: 'public', table: 'stories' },
      () => {
        queryClient.invalidateQueries({ queryKey: ['stories', userId] });
      },
    );

    subscribeChannel(CHANNEL_NAME, channel);

    return () => {
      removeChannel(CHANNEL_NAME);
    };
  }, [userId, queryClient]);

  return useQuery<StoryGroup[]>({
    queryKey: ['stories', userId],
    queryFn: () => {
      if (!userId) return [];
      return fetchStoriesWithSeenState(userId);
    },
    enabled: !!userId,
    staleTime: 30_000, // 30s — new inserts bypass this via the realtime subscription above
  });
}

export function useMarkStoryViewed() {
  const queryClient = useQueryClient();
  const { session } = useAuthStore();

  return useMutation({
    mutationFn: async (storyId: string) => {
      const viewerId = session?.user?.id;
      if (!viewerId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from('story_views')
        .upsert(
          { story_id: storyId, viewer_id: viewerId },
          { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate to refresh seen/unseen state, scoped to current user
      const userId = session?.user?.id;
      queryClient.invalidateQueries({ queryKey: ['stories', userId] });
    },
  });
}
