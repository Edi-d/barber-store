import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TrendingTopic } from '@/types/database';

export function useTrendingTopics() {
  const { data, isLoading } = useQuery<TrendingTopic[]>({
    queryKey: ['trending-topics'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trending_topics')
        .select('*')
        .eq('is_active', true)
        .order('post_count', { ascending: false })
        .limit(12);

      if (error) throw error;
      return (data ?? []) as TrendingTopic[];
    },
  });

  return {
    topics: data ?? [],
    isLoading,
  };
}
