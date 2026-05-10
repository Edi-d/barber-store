/**
 * useRecurringList — manage the salon's "Lista mea" recurring shopping
 * list. Auto-creates the default list on first add via RPC.
 *
 * Tables: marketplace_recurring_lists, marketplace_recurring_list_items
 * RPC: add_to_recurring_list (migration 113)
 *
 * Ported verbatim from Tapzi-barber/hooks/use-recurring-list.ts.
 */

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type RecurringListItem = {
  id: string;
  list_id: string;
  product_id: string;
  qty: number;
  sort_order: number;
  // Joined product fields (denormalized for convenience)
  product_name: string;
  brand: string | null;
  price_cents: number;
  stock_qty: number;
  image_url: string | null;
  is_active: boolean;
};

export type UseRecurringListReturn = {
  listId: string | null;
  items: RecurringListItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  add: (productId: string, qty: number) => Promise<{ ok: boolean; error?: string }>;
  setItemQty: (itemId: string, qty: number) => Promise<{ ok: boolean; error?: string }>;
  remove: (itemId: string) => Promise<{ ok: boolean; error?: string }>;
};

function pickImage(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : null;
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && typeof arr[0] === 'string' ? arr[0] : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function useRecurringList(salonId: string | null | undefined): UseRecurringListReturn {
  const [listId, setListId] = useState<string | null>(null);
  const [items, setItems] = useState<RecurringListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!salonId) {
      setListId(null);
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data: lists, error: listErr } = await supabase
      .from('marketplace_recurring_lists')
      .select('id')
      .eq('salon_id', salonId)
      .eq('is_default', true)
      .maybeSingle();

    if (listErr) {
      console.warn('[useRecurringList]', listErr.message);
      setError(listErr.message);
      setLoading(false);
      return;
    }

    if (!lists) {
      setListId(null);
      setItems([]);
      setLoading(false);
      return;
    }

    setListId(lists.id);

    const { data: rows, error: itemsErr } = await supabase
      .from('marketplace_recurring_list_items')
      .select(
        'id, list_id, product_id, qty, sort_order, marketplace_products(name, brand, price_cents, stock_qty, images, is_active)',
      )
      .eq('list_id', lists.id)
      .order('sort_order', { ascending: true });

    if (itemsErr) {
      console.warn('[useRecurringList] items', itemsErr.message);
      setError(itemsErr.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const normalized: RecurringListItem[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      list_id: r.list_id,
      product_id: r.product_id,
      qty: Number(r.qty) || 1,
      sort_order: Number(r.sort_order) || 0,
      product_name: r.marketplace_products?.name ?? 'Produs',
      brand: r.marketplace_products?.brand ?? null,
      price_cents: Number(r.marketplace_products?.price_cents) || 0,
      stock_qty: Number(r.marketplace_products?.stock_qty) || 0,
      image_url: pickImage(r.marketplace_products?.images),
      is_active: !!r.marketplace_products?.is_active,
    }));

    setItems(normalized);
    setLoading(false);
  }, [salonId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const add = useCallback(
    async (productId: string, qty: number) => {
      if (!salonId) return { ok: false, error: 'missing_salon' };
      const { error: rpcErr } = await supabase.rpc('add_to_recurring_list', {
        p_salon_id: salonId,
        p_product_id: productId,
        p_qty: qty,
      });
      if (rpcErr) {
        return { ok: false, error: rpcErr.message };
      }
      await fetchList();
      return { ok: true };
    },
    [salonId, fetchList],
  );

  const remove = useCallback(async (itemId: string) => {
    const { error: err } = await supabase
      .from('marketplace_recurring_list_items')
      .delete()
      .eq('id', itemId);
    if (err) return { ok: false, error: err.message };
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    return { ok: true };
  }, []);

  const setItemQty = useCallback(
    async (itemId: string, qty: number) => {
      if (qty <= 0) {
        return remove(itemId);
      }
      const { error: err } = await supabase
        .from('marketplace_recurring_list_items')
        .update({ qty })
        .eq('id', itemId);
      if (err) return { ok: false, error: err.message };
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, qty } : i)));
      return { ok: true };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remove],
  );

  return { listId, items, loading, error, refetch: fetchList, add, setItemQty, remove };
}
