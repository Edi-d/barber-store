/**
 * useClientOrders — a client's own marketplace order history (buyer_type
 * 'client'), shaped identically to useSalonOrders so the orders screen can use
 * either interchangeably. Reorder rebuilds the cart from the stored snapshots
 * because nop products don't live in marketplace_products.
 */

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { SalonOrderSummary, ReorderItem, UseSalonOrdersReturn } from './use-salon-orders';

export function useClientOrders(userId: string | null | undefined): UseSalonOrdersReturn {
  const [orders, setOrders] = useState<SalonOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!userId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('marketplace_orders')
      .select(
        'id, order_number, status, placed_at, total_cents, subtotal_cents, shipping_cents, voucher_discount_cents, payment_method, invoice_number, invoice_issued_at, items:marketplace_order_items(qty)',
      )
      .eq('buyer_type', 'client')
      .eq('buyer_user_id', userId)
      .order('placed_at', { ascending: false })
      .limit(100);
    if (err) {
      console.warn('[useClientOrders]', err.message);
      setError(err.message);
    }
    const mapped = (data ?? []).map((o: any) => {
      const items = (o.items ?? []) as { qty: number }[];
      return {
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        placed_at: o.placed_at,
        total_cents: o.total_cents,
        subtotal_cents: o.subtotal_cents,
        shipping_cents: o.shipping_cents,
        voucher_discount_cents: o.voucher_discount_cents,
        payment_method: o.payment_method,
        invoice_number: o.invoice_number ?? null,
        invoice_issued_at: o.invoice_issued_at ?? null,
        item_count: items.reduce((s, it) => s + (it.qty ?? 0), 0),
        line_count: items.length,
      } as SalonOrderSummary;
    });
    setOrders(mapped);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const loadOrderItems = useCallback(async (orderId: string) => {
    const { data, error: err } = await supabase
      .from('marketplace_order_items')
      .select('product_id, nop_product_id, sku_snapshot, title_snapshot, qty, unit_price_cents, line_total_cents')
      .eq('order_id', orderId);
    if (err) {
      console.warn('[useClientOrders] loadOrderItems', err.message);
      return [];
    }
    return (data ?? []) as any[];
  }, []);

  // Rebuild straight from snapshots — the nop id (or legacy UUID) becomes the
  // cart product_id, matching how the catalogue adds items.
  const buildReorderItems = useCallback(
    async (orderId: string): Promise<ReorderItem[]> => {
      const items = await loadOrderItems(orderId);
      return items.map((it: any): ReorderItem => {
        const pid = it.nop_product_id ?? it.product_id ?? '';
        return {
          product_id: pid,
          qty: Math.max(1, it.qty),
          unit_price_cents: it.unit_price_cents,
          title_snapshot: it.title_snapshot,
          image_url: null,
          brand: null,
          available: !!pid,
          stock_qty: 0,
        };
      });
    },
    [loadOrderItems],
  );

  return {
    orders,
    loading,
    error,
    refetch: fetchOrders,
    loadOrderItems: loadOrderItems as unknown as UseSalonOrdersReturn['loadOrderItems'],
    buildReorderItems,
  };
}
