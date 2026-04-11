/**
 * useNotifications — thin selector over notificationStore.
 * Keeps the same public interface so existing callers (feed.tsx, etc.)
 * require no changes.
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore, NotificationData, NotificationType } from '@/stores/notificationStore';

export type { NotificationData, NotificationType };

export function useNotifications() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id ?? null;

  const {
    notifications,
    unreadCount,
    loading,
    isFetchingNextPage,
    hasNextPage,
    error,
    fetchInitial,
    fetchNextPage,
    markRead,
    markAllRead,
    subscribe,
    unsubscribe,
  } = useNotificationStore();

  // Bootstrap: fetch + subscribe when userId is known
  useEffect(() => {
    if (!userId) return;

    fetchInitial(userId);
    subscribe(userId);

    return () => {
      unsubscribe(userId);
    };
  }, [userId]);

  return {
    notifications,
    unreadCount,
    loading,
    isFetchingNextPage,
    hasNextPage,
    error,
    refetch: () => userId && fetchInitial(userId),
    fetchNextPage: () => userId && fetchNextPage(userId),
    markRead,
    markAllRead: () => userId && markAllRead(userId),
  };
}
