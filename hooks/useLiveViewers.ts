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

  // ── Latest presence payload (kept in a ref) ──────────────────────────
  // Holding the payload in a ref keeps the subscription effect's deps to
  // just [liveId, userId]. If we instead depended on display name / avatar,
  // a change to either would tear down and recreate the channel mid-render,
  // racing the async untrack()/removeChannel() cleanup. supabase.channel()
  // returns the still-registered (already-subscribed) channel in that window,
  // and calling .on('presence') on it throws
  // "cannot add presence callbacks ... after subscribe()".

  const payloadRef = useRef<PresencePayload>({
    user_id: userId,
    display_name: displayName ?? 'Viewer',
    avatar_url: avatarUrl ?? null,
    joined_at: new Date().toISOString(),
  });

  payloadRef.current = {
    user_id: userId,
    display_name: displayName ?? 'Viewer',
    avatar_url: avatarUrl ?? null,
    joined_at: payloadRef.current.joined_at, // keep original join time stable
  };

  // ── Track (or re-track) the current user ─────────────────────────────

  const trackUser = useCallback(async (channel: RealtimeChannel) => {
    try {
      await channel.track(payloadRef.current);
    } catch {
      // Non-fatal; presence will sync on next successful connection
    }
  }, []);

  // ── Subscription ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!liveId || !userId) return;

    const topic = `live-viewers:${liveId}`;

    // Defensively drop any stale channel for this topic left behind by an
    // earlier mount whose async cleanup hasn't completed. Without this,
    // supabase.channel() below would return that already-subscribed channel
    // and .on('presence') would throw.
    const stale = supabase
      .getChannels()
      .find((c) => c.topic === `realtime:${topic}`);
    if (stale) {
      supabase.removeChannel(stale);
    }

    const channel = supabase.channel(topic, {
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
      channelRef.current = null;
      // untrack() resolves before we tear the channel down so the leave is
      // broadcast to other viewers; removeChannel() then unsubscribes and
      // deregisters it from the client's channel list.
      channel
        .untrack()
        .catch(() => {})
        .finally(() => {
          supabase.removeChannel(channel);
        });
    };
  }, [liveId, userId, trackUser]);

  return viewerCount;
}
