import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { getOrCreateChannel, removeChannel, subscribeChannel } from '@/lib/realtime';
import { levelForLifetime, LEVEL_CONFIG } from '@/constants/loyalty';
import { useLoyaltyQueueStore } from '@/stores/loyaltyQueueStore';

export function useLoyaltyNotifications() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const enqueueToast = useLoyaltyQueueStore((s) => s.enqueueToast);
  const enqueueLevelUp = useLoyaltyQueueStore((s) => s.enqueueLevelUp);

  const lifetimeRef = useRef<number | null>(null);
  const seenTxIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    lifetimeRef.current = null;
    seenTxIdsRef.current.clear();

    if (!userId) return;

    const seedForUserId = userId;
    supabase
      .from('platform_xp_transactions')
      .select('amount')
      .eq('user_id', userId)
      .gt('amount', 0)
      .then(({ data }) => {
        if (!data) return;
        if (seedForUserId !== userId) return;
        if (lifetimeRef.current !== null) return;
        lifetimeRef.current = data.reduce((s, r) => s + (r.amount ?? 0), 0);
      });

    const channelName = `xp_notifications:${userId}`;
    const channel = getOrCreateChannel(channelName).on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'platform_xp_transactions',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const tx = payload.new as {
          id?: string;
          amount?: number;
          source_type?: string;
          balance_after?: number;
        };
        if (!tx?.id || typeof tx.amount !== 'number') return;
        if (seenTxIdsRef.current.has(tx.id)) return;
        seenTxIdsRef.current.add(tx.id);

        if (tx.amount > 0) {
          enqueueToast({
            id: tx.id,
            points: tx.amount,
            source: tx.source_type ?? 'bonus',
            balanceAfter: tx.balance_after,
          });

          const prevLifetime = lifetimeRef.current ?? 0;
          const newLifetime = prevLifetime + tx.amount;
          lifetimeRef.current = newLifetime;

          const prevLevel = levelForLifetime(prevLifetime).level;
          const newLevel = levelForLifetime(newLifetime).level;
          if (newLevel > prevLevel && prevLifetime > 0) {
            const fromCfg = LEVEL_CONFIG[prevLevel];
            const toCfg = LEVEL_CONFIG[newLevel];
            if (fromCfg && toCfg) {
              enqueueLevelUp({
                id: `${tx.id}:levelup`,
                from: fromCfg,
                to: toCfg,
              });
            }
          }
        }
      },
    );
    subscribeChannel(channelName, channel);

    return () => removeChannel(channelName);
  }, [userId, enqueueToast, enqueueLevelUp]);
}
