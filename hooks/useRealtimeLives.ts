import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getOrCreateChannel, removeChannel } from '@/lib/realtime';
import { Live, LiveWithHost } from '@/types/database';

const CHANNEL_NAME = 'realtime-lives';

/**
 * Subscribes to the lives table via Supabase Realtime.
 * Performs an initial fetch of all active streams (status = 'live' | 'starting'),
 * then keeps state in sync with INSERT/UPDATE/DELETE events:
 *
 * - INSERT or UPDATE where status becomes 'live'/'starting': fetch the full row
 *   with host join and add to state (if not already present).
 * - UPDATE where status becomes 'ended': remove that id from state.
 * - UPDATE viewers_count: update the count in-place without a network round-trip.
 *
 * Uses the global channel registry so React StrictMode double-mounts
 * do not create duplicate subscriptions.
 */
export function useRealtimeLives(): { lives: LiveWithHost[]; loading: boolean } {
  const [lives, setLives] = useState<LiveWithHost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // ── Initial fetch ──────────────────────────────────────────────────────────
    async function fetchActiveLives() {
      const { data, error } = await supabase
        .from('lives')
        .select('*, host:profiles!author_id(*)')
        .in('status', ['live', 'starting'])
        .order('viewers_count', { ascending: false })
        .limit(20);

      if (cancelled) return;

      if (error) {
        if (__DEV__) {
          console.warn('[useRealtimeLives] Initial fetch error:', error.message);
        }
      } else {
        setLives((data as LiveWithHost[]) ?? []);
      }

      setLoading(false);
    }

    fetchActiveLives();

    // ── Helper: fetch a single live row with host join ─────────────────────────
    async function fetchLiveWithHost(id: string): Promise<LiveWithHost | null> {
      const { data, error } = await supabase
        .from('lives')
        .select('*, host:profiles!author_id(*)')
        .eq('id', id)
        .single();

      if (error) {
        if (__DEV__) {
          console.warn('[useRealtimeLives] fetchLiveWithHost error:', error.message);
        }
        return null;
      }

      return data as LiveWithHost;
    }

    // ── Realtime subscription ──────────────────────────────────────────────────
    const channel = getOrCreateChannel(CHANNEL_NAME)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lives' },
        async (payload) => {
          const { eventType } = payload;

          if (eventType === 'INSERT') {
            const inserted = payload.new as Live;
            if (inserted.status !== 'live' && inserted.status !== 'starting') return;

            const full = await fetchLiveWithHost(inserted.id);
            if (!full || cancelled) return;

            setLives((prev) => {
              // Guard against duplicate — StrictMode or race condition
              if (prev.some((l) => l.id === full.id)) return prev;
              return [full, ...prev];
            });
          }

          if (eventType === 'UPDATE') {
            const updated = payload.new as Live;

            if (updated.status === 'ended') {
              // Stream finished — remove from list
              setLives((prev) => prev.filter((l) => l.id !== updated.id));
              return;
            }

            if (updated.status === 'live' || updated.status === 'starting') {
              // Read current state snapshot to decide what to do — no async work inside the updater
              setLives((prev) => {
                const exists = prev.some((l) => l.id === updated.id);

                if (exists) {
                  // In-place update for viewers_count (and any other scalar fields)
                  return prev.map((l) =>
                    l.id === updated.id
                      ? { ...l, ...updated }
                      : l
                  );
                }

                // Stream just became active but is not in state yet.
                // We cannot call async code inside a state updater, so schedule
                // the fetch outside via a microtask and leave state unchanged for now.
                return prev;
              });

              // After the synchronous updater runs, check if the stream is present.
              // If it wasn't found (the updater returned prev unchanged), fetch and add it.
              // We access `lives` via a separate setLives read to avoid a stale-closure issue.
              setLives((prev) => {
                if (prev.some((l) => l.id === updated.id)) return prev;

                // Kick off async fetch outside the updater
                fetchLiveWithHost(updated.id).then((full) => {
                  if (!full || cancelled) return;
                  setLives((current) => {
                    if (current.some((l) => l.id === full.id)) return current;
                    return [full, ...current];
                  });
                });

                return prev;
              });
            }
          }

          if (eventType === 'DELETE') {
            if (!payload.old || !('id' in payload.old)) return;
            const deleted = payload.old as { id: string };
            setLives((prev) => prev.filter((l) => l.id !== deleted.id));
          }
        }
      )
      .subscribe((status, err) => {
        if (__DEV__) {
          console.log('[Realtime] realtime-lives status:', status, err);
        }
      });

    return () => {
      cancelled = true;
      removeChannel(CHANNEL_NAME);
    };
  }, []);

  return { lives, loading };
}
