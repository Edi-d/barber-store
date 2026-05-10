/**
 * useSalonOrders — order history for a salon (B2B), with helper to load
 * the items of a specific order so the UI can rebuild a cart for "Reorder".
 */

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type SalonOrderSummary = {
  id: string;
  order_number: string;
  status: string;
  placed_at: string;
  total_cents: number;
  subtotal_cents: number;
  shipping_cents: number;
  voucher_discount_cents: number;
  payment_method: string;
  invoice_number: string | null;
  invoice_issued_at: string | null;
  item_count: number;
  line_count: number;
};

export type SalonOrderItem = {
  product_id: string;
  sku_snapshot: string;
  title_snapshot: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
};

export type ReorderItem = {
  product_id: string;
  qty: number;
  unit_price_cents: number;
  title_snapshot: string;
  image_url: string | null;
  brand: string | null;
  available: boolean;
  stock_qty: number;
};

export type UseSalonOrdersReturn = {
  orders: SalonOrderSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadOrderItems: (orderId: string) => Promise<SalonOrderItem[]>;
  buildReorderItems: (orderId: string) => Promise<ReorderItem[]>;
};

export function useSalonOrders(salonId: string | null | undefined): UseSalonOrdersReturn {
  const [orders, setOrders] = useState<SalonOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!salonId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('marketplace_salon_order_summary')
      .select('*')
      .eq('salon_id', salonId)
      .order('placed_at', { ascending: false })
      .limit(100);
    if (err) {
      console.warn('[useSalonOrders]', err.message);
      setError(err.message);
    }
    setOrders((data ?? []) as SalonOrderSummary[]);
    setLoading(false);
  }, [salonId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const loadOrderItems = useCallback(async (orderId: string) => {
    const { data, error: err } = await supabase
      .from('marketplace_order_items')
      .select('product_id, sku_snapshot, title_snapshot, qty, unit_price_cents, line_total_cents')
      .eq('order_id', orderId);
    if (err) {
      console.warn('[useSalonOrders] loadOrderItems', err.message);
      return [];
    }
    return (data ?? []) as SalonOrderItem[];
  }, []);

  const buildReorderItems = useCallback(
    async (orderId: string): Promise<ReorderItem[]> => {
      const items = await loadOrderItems(orderId);
      if (items.length === 0) return [];
      const productIds = items.map((i) => i.product_id);
      const { data: products } = await supabase
        .from('marketplace_products')
        .select('id, name, brand, price_cents, stock_qty, images, is_active')
        .in('id', productIds);
      const byId = new Map<string, any>(
        (products ?? []).map((p: any) => [p.id, p]),
      );

      return items.map<ReorderItem>((it) => {
        const p = byId.get(it.product_id);
        const images = Array.isArray(p?.images)
          ? p?.images
          : (() => {
              try {
                return Array.isArray(JSON.parse(p?.images ?? '[]'))
                  ? JSON.parse(p?.images ?? '[]')
                  : [];
              } catch {
                return [];
              }
            })();
        const stock = Number(p?.stock_qty ?? 0);
        return {
          product_id: it.product_id,
          qty: Math.max(1, Math.min(it.qty, stock || it.qty)),
          unit_price_cents: Number(p?.price_cents ?? it.unit_price_cents),
          title_snapshot: p?.name ?? it.title_snapshot,
          image_url: images[0] ?? null,
          brand: p?.brand ?? null,
          available: !!p?.is_active && stock > 0,
          stock_qty: stock,
        };
      });
    },
    [loadOrderItems],
  );

  return { orders, loading, error, refetch: fetchOrders, loadOrderItems, buildReorderItems };
}
