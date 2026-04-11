import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────

interface PresencePayload {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
}

// ─── Hook ─────────────────────────────────────────────────────

export function useLiveViewers(
  liveId: string,
  userId: string,
  displayName?: string,
  avatarUrl?: string | null
): number {
  // Initialise to 1 so the viewer always sees at least themselves
  const [viewerCount, setViewerCount] = useState(1);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastKnownCountRef = useRef<number>(1);

  // ── Stable presence payload ───────────────────────────────────────────

  const buildPayload = useCallback(
    (): PresencePayload => ({
      user_id: userId,
      display_name: displayName ?? 'Viewer',
      avatar_url: avatarUrl ?? null,
      joined_at: new Date().toISOString(),
    }),
    [userId, displayName, avatarUrl]
  );

  // ── Track (or re-track) the current user ─────────────────────────────

  const trackUser = useCallback(async (channel: RealtimeChannel) => {
    try {
      await channel.track(buildPayload());
    } catch {
      // Non-fatal; presence will sync on next successful connection
    }
  }, [buildPayload]);

  // ── Subscription ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!liveId || !userId) return;

    const channel = supabase.channel(`live-viewers:${liveId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        // Never drop to 0 if we had a valid count — return last known
        const next = count > 0 ? count : lastKnownCountRef.current;
        lastKnownCountRef.current = next;
        setViewerCount(next);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await trackUser(channel);
        }

        // On reconnect the channel re-fires SUBSCRIBED — re-track the user
        // so they appear in presence again after a network hiccup
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Supabase will attempt to reconnect; we'll re-track on next SUBSCRIBED
          // Keep last known count visible in the UI
          setViewerCount(lastKnownCountRef.current);
        }
      });

    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [liveId, userId, trackUser]);

  return viewerCount;
}
