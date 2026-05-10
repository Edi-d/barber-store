/**
 * useMarketplaceQuote — calls calc_marketplace_quote RPC for the current
 * cart contents to display the authoritative tier-discounted total +
 * shipping + free-shipping progress.
 *
 * Debounced 250ms to avoid hammering the RPC on every step-up.
 */

import { useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type QuoteItem = {
  product_id: string;
  qty: number;
  base_price_cents: number;
  unit_price_cents: number;
  line_total_cents: number;
  savings_cents: number;
};

export type MarketplaceQuote = {
  subtotal_cents: number;
  tier_savings_cents: number;
  shipping_cents: number;
  free_shipping_threshold_cents: number;
  missing_for_free_shipping_cents: number;
  total_cents: number;
  items: QuoteItem[];
};

export type QuoteInput = {
  product_id: string;
  qty: number;
};

export type UseMarketplaceQuoteReturn = {
  quote: MarketplaceQuote | null;
  loading: boolean;
  error: string | null;
};

const EMPTY_QUOTE: MarketplaceQuote = {
  subtotal_cents: 0,
  tier_savings_cents: 0,
  shipping_cents: 0,
  free_shipping_threshold_cents: 0,
  missing_for_free_shipping_cents: 0,
  total_cents: 0,
  items: [],
};

export function useMarketplaceQuote(
  items: QuoteInput[],
  buyerType: 'client' | 'salon',
): UseMarketplaceQuoteReturn {
  const [quote, setQuote] = useState<MarketplaceQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastKeyRef = useRef<string>('');

  const key = JSON.stringify({ items, buyerType });

  useEffect(() => {
    if (key === lastKeyRef.current) return;

    if (items.length === 0) {
      lastKeyRef.current = key;
      setQuote(EMPTY_QUOTE);
      setError(null);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      lastKeyRef.current = key;
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase.rpc('calc_marketplace_quote', {
        p_items: items,
        p_buyer_type: buyerType,
      });
      if (cancelled) return;
      if (err) {
        console.warn('[useMarketplaceQuote]', err.message);
        setError(err.message);
        setQuote(null);
      } else {
        setQuote(data as MarketplaceQuote);
      }
      setLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [key, items, buyerType]);

  return { quote, loading, error };
}
