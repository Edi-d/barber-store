import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getOrCreateChannel, removeChannel, subscribeChannel } from '@/lib/realtime';

/** Shared query key for the current user's vouchers — kept here so the query
 *  and its realtime invalidation can never drift apart. */
export const MY_VOUCHERS_QK = (userId: string) => ['my-vouchers', userId] as const;

/**
 * Keeps the user's voucher list live. When a barber redeems a voucher in the
 * barber app (scan QR / type code), the shared `loyalty_vouchers` row flips
 * status 'active' → 'used'. This subscription hears that change over Supabase
 * Realtime and invalidates the ['my-vouchers', userId] query, so the card
 * re-renders as "Folosit" without the customer refreshing.
 *
 * We listen to every event ('*'): UPDATE covers redemption/cancellation/expiry
 * flips, INSERT covers a freshly converted voucher, DELETE covers removals.
 *
 * Requires `loyalty_vouchers` in the supabase_realtime publication
 * (migration 151); without it the subscription is a harmless no-op and the
 * list still updates on the next refetch (mount / window focus).
 */
export function useMyVouchersRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channelName = `my_vouchers:${userId}`;
    const channel = getOrCreateChannel(channelName).on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'loyalty_vouchers',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        queryClient.invalidateQueries({ queryKey: MY_VOUCHERS_QK(userId) });
      },
    );
    subscribeChannel(channelName, channel);

    return () => removeChannel(channelName);
  }, [userId, queryClient]);
}
