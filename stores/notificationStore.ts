import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { getOrCreateChannel, removeChannel } from '@/lib/realtime';
import { timeAgo } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'like'
  | 'comment'
  | 'reply'
  | 'follow'
  | 'mention'
  | 'live'
  | 'appointment_reminder';

export type NotificationData = {
  id: string;
  type: NotificationType;
  actor_id: string;
  actor_name: string;
  actor_avatar: string | null;
  body: string | null;
  target_type: string | null;
  target_id: string | null;
  read: boolean;
  created_at: string;
  time_ago: string;
};

type RawNotification = {
  id: string;
  type: NotificationType;
  actor_id: string;
  body: string | null;
  target_type: string | null;
  target_id: string | null;
  read: boolean;
  created_at: string;
  actor: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

// ─── Live event emitter (for LiveToastBanner) ─────────────────────────────────

type LiveEventListener = (notif: NotificationData) => void;
const liveListeners = new Set<LiveEventListener>();

export function onLiveNotification(fn: LiveEventListener) {
  liveListeners.add(fn);
  return () => liveListeners.delete(fn);
}

function emitLive(notif: NotificationData) {
  liveListeners.forEach((fn) => fn(notif));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function toNotificationData(raw: RawNotification): NotificationData {
  return {
    id: raw.id,
    type: raw.type,
    actor_id: raw.actor_id,
    actor_name:
      raw.actor?.display_name ?? raw.actor?.username ?? 'Utilizator',
    actor_avatar: raw.actor?.avatar_url ?? null,
    body: raw.body,
    target_type: raw.target_type,
    target_id: raw.target_id,
    read: raw.read,
    created_at: raw.created_at,
    time_ago: timeAgo(raw.created_at),
  };
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface NotificationState {
  notifications: NotificationData[];
  unreadCount: number;
  loading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  error: string | null;

  // Actions
  fetchInitial: (userId: string) => Promise<void>;
  fetchNextPage: (userId: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  appendFromRealtime: (raw: RawNotification) => void;
  updateFromRealtime: (raw: RawNotification) => void;

  // Subscription lifecycle
  subscribe: (userId: string) => void;
  unsubscribe: (userId: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  isFetchingNextPage: false,
  hasNextPage: true,
  error: null,

  fetchInitial: async (userId: string) => {
    set({ loading: true, error: null, hasNextPage: true });
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(
          `id, type, actor_id, body, target_type, target_id, read, created_at,
           actor:profiles!actor_id(display_name, username, avatar_url)`
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw error;

      const notifs = ((data ?? []) as unknown as RawNotification[]).map(
        toNotificationData
      );

      set({
        notifications: notifs,
        unreadCount: notifs.filter((n) => !n.read).length,
        hasNextPage: notifs.length === PAGE_SIZE,
        loading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Eroare necunoscuta';
      set({ error: msg, loading: false });
      if (__DEV__) console.error('[notificationStore] fetchInitial error:', err);
    }
  },

  fetchNextPage: async (userId: string) => {
    const { notifications, isFetchingNextPage, hasNextPage } = get();
    if (isFetchingNextPage || !hasNextPage) return;

    const oldest =
      notifications.length > 0
        ? notifications[notifications.length - 1].created_at
        : undefined;

    set({ isFetchingNextPage: true });
    try {
      let query = supabase
        .from('notifications')
        .select(
          `id, type, actor_id, body, target_type, target_id, read, created_at,
           actor:profiles!actor_id(display_name, username, avatar_url)`
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (oldest) {
        query = query.lt('created_at', oldest);
      }

      const { data, error } = await query;
      if (error) throw error;

      const newNotifs = ((data ?? []) as unknown as RawNotification[]).map(
        toNotificationData
      );

      set((state) => ({
        notifications: [...state.notifications, ...newNotifs],
        hasNextPage: newNotifs.length === PAGE_SIZE,
        isFetchingNextPage: false,
      }));
    } catch (err) {
      set({ isFetchingNextPage: false });
      if (__DEV__) console.error('[notificationStore] fetchNextPage error:', err);
    }
  },

  markRead: async (id: string) => {
    // Optimistic update
    set((state) => {
      const updated = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    });

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);

    if (error && __DEV__) {
      console.error('[notificationStore] markRead error:', error);
    }
  },

  markAllRead: async (userId: string) => {
    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error && __DEV__) {
      console.error('[notificationStore] markAllRead error:', error);
    }
  },

  appendFromRealtime: (raw: RawNotification) => {
    // When a realtime INSERT arrives the actor join is not embedded —
    // we store what we have and refresh the actor name from existing data.
    const notif = toNotificationData(raw);

    set((state) => {
      // Avoid duplicates
      if (state.notifications.some((n) => n.id === notif.id)) return state;
      const updated = [notif, ...state.notifications];
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    });

    if (notif.type === 'live') {
      emitLive(notif);
    }
  },

  updateFromRealtime: (raw: RawNotification) => {
    const notif = toNotificationData(raw);
    set((state) => {
      const updated = state.notifications.map((n) =>
        n.id === notif.id ? { ...n, read: notif.read } : n
      );
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    });
  },

  subscribe: (userId: string) => {
    const channelName = `notifications-store-${userId}`;

    getOrCreateChannel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          get().appendFromRealtime(payload.new as unknown as RawNotification);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          get().updateFromRealtime(payload.new as unknown as RawNotification);
        }
      )
      .subscribe((status, err) => {
        if (__DEV__) {
          console.log(`[Realtime] ${channelName} status:`, status, err);
        }
      });
  },

  unsubscribe: (userId: string) => {
    removeChannel(`notifications-store-${userId}`);
  },
}));
