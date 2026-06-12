import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────

export interface LiveReaction {
  id: string;
  emoji: string;
  userId: string;
}

// ─── Constants ────────────────────────────────────────────────

// Cap outbound sends so a rapid tapper can't flood the channel. Each viewer
// still sees their own taps instantly (spawned locally), this only throttles
// what we broadcast to everyone else.
const SEND_THROTTLE_MS = 150;

// ─── Hook ─────────────────────────────────────────────────────

/**
 * Ephemeral heart/emoji reactions over Supabase Realtime broadcast.
 *
 * Channel `live-reactions:{liveId}`, event `reaction`. Mirrors useLiveChat:
 * purely ephemeral (no DB), de-duplication is unnecessary because Supabase
 * broadcast does not echo a message back to its sender by default — the sender
 * animates its own tap locally, remote viewers (and the host app) receive it
 * here.
 *
 * `onReaction` is invoked for every reaction received from another client.
 * It is held in a ref so changing the callback identity does not re-subscribe.
 */
export function useLiveReactions(
  liveId: string,
  onReaction: (reaction: LiveReaction) => void
): { sendReaction: (reaction: LiveReaction) => void } {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef<number>(0);

  const onReactionRef = useRef(onReaction);
  onReactionRef.current = onReaction;

  useEffect(() => {
    if (!liveId) return;

    const channel = supabase
      .channel(`live-reactions:${liveId}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        onReactionRef.current(payload as LiveReaction);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [liveId]);

  const sendReaction = useCallback((reaction: LiveReaction) => {
    const now = Date.now();
    if (now - lastSentRef.current < SEND_THROTTLE_MS) return;
    lastSentRef.current = now;

    const channel = channelRef.current;
    if (!channel) return;

    channel.send({
      type: 'broadcast',
      event: 'reaction',
      payload: reaction,
    });
  }, []);

  return { sendReaction };
}
