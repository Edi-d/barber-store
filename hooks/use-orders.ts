/**
 * use-orders.ts
 *
 * Fetches and manages orders for the authenticated user using Supabase.
 * Adapted from the management-app's AsyncStorage-only implementation to
 * work with barber-store's Supabase backend (orders + order_items tables).
 *
 * Key differences from the source:
 *   - Persistence via Supabase, not AsyncStorage
 *   - Auth via useAuthStore session, not manual user lookup
 *   - Order creation writes to Supabase and clears the cart atomically
 *   - OrderStatus aligns with the DB enum: 'pending' | 'paid' | 'shipped' | 'cancelled'
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Order, OrderWithItems, OrderStatus, CartItemWithProduct } from '@/types/database';

export type { Order, OrderWithItems, OrderStatus };

// ─── Status display helpers ───────────────────────────────────────────────────

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: '#F59E0B',
  paid: '#3B82F6',
  shipped: '#8B5CF6',
  cancelled: '#EF4444',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'In asteptare',
  paid: 'Platita',
  shipped: 'Expediata',
  cancelled: 'Anulata',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateOrderInput = {
  shippingAddress?: string;
  currency?: string;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOrders() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();

  // ── Fetch all orders with their items ──
  const {
    data: orders = [],
    isLoading,
    error,
    refetch,
  } = useQuery<OrderWithItems[]>({
    queryKey: ['orders', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          *,
          items:order_items(
            *,
            product:products(*)
          )
        `,
        )
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as OrderWithItems[];
    },
  });

  // ── Create order from cart items ──
  const createOrderMutation = useMutation({
    mutationFn: async ({
      cartItems,
      input,
    }: {
      cartItems: CartItemWithProduct[];
      input?: CreateOrderInput;
    }): Promise<OrderWithItems> => {
      if (!userId) throw new Error('Not authenticated');

      const totalCents = cartItems.reduce(
        (sum, item) => sum + item.product.price_cents * item.qty,
        0,
      );
      const currency = input?.currency ?? cartItems[0]?.product.currency ?? 'RON';

      // Insert the order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          status: 'pending' as OrderStatus,
          total_cents: totalCents,
          currency,
          shipping_address: input?.shippingAddress ?? null,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Insert order items
      const orderItems = cartItems.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        qty: item.qty,
        price_cents: item.product.price_cents,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      // Clear the cart
      await supabase.from('cart_items').delete().eq('user_id', userId);

      return {
        ...order,
        items: cartItems.map((item) => ({
          order_id: order.id,
          product_id: item.product_id,
          qty: item.qty,
          price_cents: item.product.price_cents,
          product: item.product,
        })),
      } as OrderWithItems;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', userId] });
      queryClient.invalidateQueries({ queryKey: ['cart', userId] });
    },
  });

  // ── Convenience selectors ──
  const getOrder = useCallback(
    (id: string): OrderWithItems | null => orders.find((o) => o.id === id) ?? null,
    [orders],
  );

  const createOrder = useCallback(
    (cartItems: CartItemWithProduct[], input?: CreateOrderInput) =>
      createOrderMutation.mutateAsync({ cartItems, input }),
    [createOrderMutation],
  );

  return {
    orders,
    isLoading,
    isCreating: createOrderMutation.isPending,
    error: error ?? createOrderMutation.error,
    createOrder,
    getOrder,
    refetch,
  };
}
