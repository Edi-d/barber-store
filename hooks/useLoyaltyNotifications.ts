import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { getOrCreateChannel, removeChannel, subscribeChannel } from '@/lib/realtime';
import { levelForLifetime } from '@/constants/loyalty';

export interface EarnedNotice {
  id: string;              // transaction id — dedupe
  points: number;          // positive amount awarded
  source: string;          // source_type from DB ('appointment' | 'order' | ...)
}

export interface LevelChangeNotice {
  from: number;            // old level number (1..5)
  to: number;              // new level number (1..5)
}

/**
 * Global Realtime subscription for platform XP events.
 * Mount ONCE at the root layout, inside the auth gate.
 * Name kept as `useLoyaltyNotifications` so existing imports still work.
 */
export function useLoyaltyNotifications() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const [lastEarned, setLastEarned] = useState<EarnedNotice | null>(null);
  const [tierChanged, setTierChanged] = useState<LevelChangeNotice | null>(null);
  const lifetimeRef = useRef<number | null>(null);
  const seenTxIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Reset on every userId change (covers token-refresh A → B transitions).
    setLastEarned(null);
    setTierChanged(null);
    lifetimeRef.current = null;
    seenTxIdsRef.current.clear();

    if (!userId) return;

    // Seed current lifetime (sum of positive amounts). Stale-closure safe:
    // only apply if userId still matches and no realtime event has already
    // written to the ref.
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
        };
        if (!tx?.id || typeof tx.amount !== 'number') return;
        if (seenTxIdsRef.current.has(tx.id)) return;
        seenTxIdsRef.current.add(tx.id);

        // Earn toast — only positive (reverses/redemptions suppressed).
        if (tx.amount > 0) {
          setLastEarned({
            id: tx.id,
            points: tx.amount,
            source: tx.source_type ?? 'bonus',
          });

          // Level-up detection: lifetime before vs after this earn.
          const prevLifetime = lifetimeRef.current ?? 0;
          const newLifetime = prevLifetime + tx.amount;
          lifetimeRef.current = newLifetime;

          const prevLevel = levelForLifetime(prevLifetime).level;
          const newLevel = levelForLifetime(newLifetime).level;
          if (newLevel > prevLevel && prevLifetime > 0) {
            // Suppress level-up on first-ever earn when seed hasn't landed yet
            // (prevLifetime === 0 could be legit-first-earn OR seed-not-yet-loaded).
            // We only fire when we've observed activity before (prevLifetime > 0).
            setTierChanged({ from: prevLevel, to: newLevel });
          }
        }
      },
    );
    subscribeChannel(channelName, channel);

    return () => removeChannel(channelName);
  }, [userId]);

  const dismissEarned = useCallback(() => setLastEarned(null), []);
  const dismissTierChanged = useCallback(() => setTierChanged(null), []);

  return { lastEarned, dismissEarned, tierChanged, dismissTierChanged };
}
