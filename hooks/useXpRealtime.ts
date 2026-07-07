import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getOrCreateChannel, removeChannel, subscribeChannel } from '@/lib/realtime';

/** Shared query keys for everything derived from platform_xp_transactions,
 *  kept together so the queries and their realtime invalidation can't drift. */
export const XP_BALANCE_QK = (userId: string) => ['xp-balance', userId] as const;
export const XP_TX_PREVIEW_QK = (userId: string) => ['loyalty-transactions', userId] as const;
export const XP_TX_ALL_QK = (userId: string) => ['loyalty-transactions-all', userId] as const;

/**
 * Keeps the user's loyalty points live. Any new `platform_xp_transactions`
 * row (points earned after a finished appointment/order, points spent
 * converting a voucher, a reversal or an adjustment) invalidates the balance
 * hero and both transaction-history lists, so the numbers re-render instantly
 * instead of only on remount / window focus.
 *
 * We listen to every event ('*') so edits and reversals refresh too, not just
 * inserts.
 *
 * Requires `platform_xp_transactions` in the supabase_realtime publication
 * (migration 152); without it the subscription is a harmless no-op.
 */
export function useXpRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channelName = `xp:${userId}`;
    const channel = getOrCreateChannel(channelName).on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'platform_xp_transactions',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        queryClient.invalidateQueries({ queryKey: XP_BALANCE_QK(userId) });
        queryClient.invalidateQueries({ queryKey: XP_TX_PREVIEW_QK(userId) });
        queryClient.invalidateQueries({ queryKey: XP_TX_ALL_QK(userId) });
      },
    );
    subscribeChannel(channelName, channel);

    return () => removeChannel(channelName);
  }, [userId, queryClient]);
}
