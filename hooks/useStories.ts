import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStoriesWithSeenState, StoryGroup } from '@/lib/stories';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

export type { StoryGroup } from '@/lib/stories';
export type { StoryItem } from '@/lib/stories';

export function useStories() {
  const { session } = useAuthStore();
  const userId = session?.user?.id;

  return useQuery<StoryGroup[]>({
    queryKey: ['stories', userId],
    queryFn: () => {
      if (!userId) return [];
      return fetchStoriesWithSeenState(userId);
    },
    enabled: !!userId,
    staleTime: 30_000, // 30s -- stories change infrequently
  });
}

export function useMarkStoryViewed() {
  const queryClient = useQueryClient();
  const { session } = useAuthStore();

  return useMutation({
    mutationFn: async (storyId: string) => {
      const viewerId = session?.user?.id;
      if (!viewerId) return;
      await supabase
        .from('story_views')
        .upsert(
          { story_id: storyId, viewer_id: viewerId },
          { onConflict: 'story_id,viewer_id' }
        );
    },
    onSuccess: () => {
      // Invalidate to refresh seen/unseen state
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
  });
}
