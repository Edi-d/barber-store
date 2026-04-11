import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  text: string;
  sent_at: string;
}

// ─── Constants ────────────────────────────────────────────────

const MAX_MESSAGES = 150;
const DROP_COUNT = 50;        // drop oldest 50 when buffer is full
const RATE_LIMIT_MS = 1000;   // 1 send per second

// ─── Hook ─────────────────────────────────────────────────────

export function useLiveChat(liveId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef<number>(0);

  // ── Append helper: caps at MAX_MESSAGES ───────────────────────────────

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const next = prev.length >= MAX_MESSAGES
        ? prev.slice(DROP_COUNT).concat(msg)
        : prev.concat(msg);
      return next;
    });
  }, []);

  // ── Supabase Realtime subscription ────────────────────────────────────

  useEffect(() => {
    if (!liveId) return;

    const channel = supabase.channel(`live-chat:${liveId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        const msg = payload as ChatMessage;
        // De-duplicate: ignore if we already have this id (optimistic push)
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const next = prev.length >= MAX_MESSAGES
            ? prev.slice(DROP_COUNT).concat(msg)
            : prev.concat(msg);
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [liveId]);

  // ── sendMessage: rate-limited + optimistic ────────────────────────────

  const sendMessage = useCallback(
    (msg: ChatMessage) => {
      const now = Date.now();
      if (now - lastSentRef.current < RATE_LIMIT_MS) return;
      lastSentRef.current = now;

      const channel = channelRef.current;
      if (!channel) return;

      // Optimistic local push first
      appendMessage(msg);

      channel.send({
        type: 'broadcast',
        event: 'message',
        payload: msg,
      });
    },
    [appendMessage]
  );

  return { messages, sendMessage };
}
