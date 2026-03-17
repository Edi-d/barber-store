import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface ChatMessage {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  text: string;
  sent_at: string;
}

export function useLiveChat(liveId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!liveId) return;

    const channel = supabase.channel(`live-chat:${liveId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        const msg = payload as ChatMessage;
        setMessages((prev) => prev.slice(-99).concat(msg));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [liveId]);

  const sendMessage = useCallback((msg: ChatMessage) => {
    const channel = channelRef.current;
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: 'message',
      payload: msg,
    });
    // Also add to local state immediately
    setMessages((prev) => prev.slice(-99).concat(msg));
  }, []);

  return { messages, sendMessage };
}
