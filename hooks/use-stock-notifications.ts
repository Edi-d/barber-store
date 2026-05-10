/**
 * useStockNotifications — subscribe / unsubscribe the current user to
 * "notify when back in stock" alerts for a marketplace product.
 *
 * Trigger `trg_marketplace_products_notify_stock` (migration 114) wakes
 * subscribers up by writing into user_notifications.
 *
 * Adapter: useAuth() from @/providers/auth-provider (Wave A shim).
 */

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export type UseStockNotificationsReturn = {
  subscribed: boolean;
  loading: boolean;
  error: string | null;
  subscribe: (salonId?: string | null) => Promise<{ ok: boolean; error?: string }>;
  unsubscribe: () => Promise<{ ok: boolean; error?: string }>;
};

export function useStockNotifications(productId: string | null | undefined): UseStockNotificationsReturn {
  const { user } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!productId || !user?.id) {
      setSubscribed(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('marketplace_stock_notifications')
      .select('id, notified_at')
      .eq('product_id', productId)
      .eq('user_id', user.id)
      .is('notified_at', null)
      .maybeSingle();
    if (err) {
      console.warn('[useStockNotifications]', err.message);
      setError(err.message);
    }
    setSubscribed(!!data);
    setLoading(false);
  }, [productId, user?.id]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const subscribe = useCallback(
    async (salonId?: string | null) => {
      if (!productId || !user?.id) return { ok: false, error: 'not_authenticated' };
      const { error: err } = await supabase
        .from('marketplace_stock_notifications')
        .upsert(
          { product_id: productId, user_id: user.id, salon_id: salonId ?? null },
          { onConflict: 'product_id,user_id' },
        );
      if (err) return { ok: false, error: err.message };
      setSubscribed(true);
      return { ok: true };
    },
    [productId, user?.id],
  );

  const unsubscribe = useCallback(async () => {
    if (!productId || !user?.id) return { ok: false, error: 'not_authenticated' };
    const { error: err } = await supabase
      .from('marketplace_stock_notifications')
      .delete()
      .eq('product_id', productId)
      .eq('user_id', user.id);
    if (err) return { ok: false, error: err.message };
    setSubscribed(false);
    return { ok: true };
  }, [productId, user?.id]);

  return { subscribed, loading, error, subscribe, unsubscribe };
}
