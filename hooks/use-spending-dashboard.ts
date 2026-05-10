/**
 * useSpendingDashboard — fetches salon marketplace spending summary and
 * reorder suggestions from Supabase RPCs. Extracted from the inline RPC
 * calls in Tapzi's spending.tsx into a reusable hook.
 *
 * RPCs required: salon_marketplace_spending, get_salon_reorder_suggestions
 * (migration 114_marketplace_b2b_rpcs.sql)
 *
 * Returns { spending, reorders, loading, refreshing, refresh }.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type TopProduct = {
  product_id: string;
  name: string;
  total_qty: number;
  total_cents: number;
};

export type SpendingData = {
  total_cents: number;
  order_count: number;
  avg_order_cents: number;
  top_products: TopProduct[];
  since: string;
};

export type ReorderSuggestion = {
  product_id: string;
  product_name: string;
  brand: string | null;
  image_url: string | null;
  last_ordered_at: string;
  days_since: number;
  times_ordered: number;
  avg_qty: number;
  due_now: boolean;
};

export type UseSpendingDashboardReturn = {
  spending: SpendingData | null;
  reorders: ReorderSuggestion[];
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

export function useSpendingDashboard(
  salonId: string | null | undefined,
): UseSpendingDashboardReturn {
  const [spending, setSpending] = useState<SpendingData | null>(null);
  const [reorders, setReorders] = useState<ReorderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!salonId) {
      setLoading(false);
      return;
    }
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [spendRes, reorderRes] = await Promise.all([
      supabase.rpc('salon_marketplace_spending', {
        p_salon_id: salonId,
        p_since: since.toISOString(),
      }),
      supabase.rpc('get_salon_reorder_suggestions', {
        p_salon_id: salonId,
        p_limit: 8,
      }),
    ]);

    if (!spendRes.error && spendRes.data) {
      setSpending(spendRes.data as SpendingData);
    }
    if (!reorderRes.error) {
      setReorders((reorderRes.data ?? []) as ReorderSuggestion[]);
    }
  }, [salonId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { spending, reorders, loading, refreshing, refresh };
}
