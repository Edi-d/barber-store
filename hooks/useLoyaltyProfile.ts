import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getOrCreateChannel, removeChannel, subscribeChannel } from '@/lib/realtime';
import { fetchXpBalance, type XpBalanceInfo } from '@/lib/loyalty';

const QK_BALANCE = (userId: string) => ['xp-balance', userId] as const;

/**
 * Returns the user's current platform XP balance + level progress.
 * Auto-refreshes via Supabase Realtime on any new platform_xp_transactions row.
 *
 * Name kept as `useLoyaltyProfile` so existing import sites don't break.
 * Return shape is a React Query result wrapping XpBalanceInfo.
 */
export function useLoyaltyProfile() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  const query = useQuery<XpBalanceInfo | null>({
    queryKey: userId ? QK_BALANCE(userId) : ['xp-balance', 'anonymous'],
    queryFn: () => (userId ? fetchXpBalance(userId) : Promise.resolve(null)),
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;

    const channelName = `xp_balance:${userId}`;
    const channel = getOrCreateChannel(channelName).on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'platform_xp_transactions',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        queryClient.invalidateQueries({ queryKey: QK_BALANCE(userId) });
      },
    );
    subscribeChannel(channelName, channel);

    return () => removeChannel(channelName);
  }, [userId, queryClient]);

  return query;
}
