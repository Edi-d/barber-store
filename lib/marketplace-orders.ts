/**
 * Client marketplace order placement + saved shipping addresses.
 *
 * Products come from nopCommerce (their IDs aren't UUIDs in marketplace_products),
 * so orders are written straight into Supabase via the place_marketplace_order
 * RPC using the cart's snapshot data. Stripe is mocked — 'card' maps to the
 * server's 'stripe' path which simply lands the order as 'paid'.
 */

import { supabase } from '@/lib/supabase';
import type { MarketplaceCartItem } from '@/hooks/use-marketplace-cart-store';

export type ClientPaymentMethod = 'cod' | 'card';

export type ShippingInput = {
  name: string;
  phone: string;
  email: string;
  address_line1: string;
  city: string;
  county: string;
  postal: string;
  notes?: string;
};

export type PlaceOrderResult = {
  order_id: string;
  order_number: string;
  total_cents: number;
};

/**
 * Place a client order. Throws with a friendly message on failure; returns the
 * new order's id/number on success.
 */
export async function placeMarketplaceClientOrder(params: {
  items: MarketplaceCartItem[];
  paymentMethod: ClientPaymentMethod;
  shipping: ShippingInput;
  voucherCode?: string | null;
}): Promise<PlaceOrderResult> {
  const { items, paymentMethod, shipping, voucherCode } = params;

  const rpcItems = items.map((i) => ({
    nop_product_id: i.product_id,
    title: i.title_snapshot,
    qty: i.qty,
    unit_price_cents: i.unit_price_cents,
  }));

  const { data, error } = await supabase.rpc('place_marketplace_order', {
    p_items: rpcItems,
    // 'card' is the mocked Stripe path on the server ('stripe' → paid).
    p_payment_method: paymentMethod === 'card' ? 'stripe' : 'cod',
    p_shipping: shipping,
    p_voucher_code: voucherCode ?? null,
  });

  if (error) throw new Error(error.message);

  const result = data as { status?: string; message?: string } & Partial<PlaceOrderResult>;
  if (!result || result.status !== 'success' || !result.order_id) {
    throw new Error(result?.message ?? 'Nu am putut plasa comanda.');
  }

  return {
    order_id: result.order_id,
    order_number: result.order_number ?? '',
    total_cents: result.total_cents ?? 0,
  };
}

// ─── Saved shipping addresses ──────────────────────────────
export type ShippingAddress = {
  id: string;
  user_id: string;
  label: string | null;
  name: string;
  phone: string;
  email: string | null;
  address_line1: string;
  city: string;
  county: string;
  postal_code: string;
  country: string;
  notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchShippingAddresses(userId: string): Promise<ShippingAddress[]> {
  const { data, error } = await supabase
    .from('marketplace_shipping_addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ShippingAddress[];
}

/**
 * Persist an address for the user. When makeDefault is true, all the user's
 * other addresses are demoted first (single default invariant).
 */
export async function saveShippingAddress(
  userId: string,
  addr: ShippingInput & { label?: string | null },
  makeDefault = true,
): Promise<void> {
  if (makeDefault) {
    await supabase
      .from('marketplace_shipping_addresses')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('is_default', true);
  }

  const { error } = await supabase.from('marketplace_shipping_addresses').insert({
    user_id: userId,
    label: addr.label ?? null,
    name: addr.name,
    phone: addr.phone,
    email: addr.email || null,
    address_line1: addr.address_line1,
    city: addr.city,
    county: addr.county,
    postal_code: addr.postal,
    notes: addr.notes || null,
    is_default: makeDefault,
  });
  if (error) throw error;
}

export async function deleteShippingAddress(id: string): Promise<void> {
  const { error } = await supabase.from('marketplace_shipping_addresses').delete().eq('id', id);
  if (error) throw error;
}
