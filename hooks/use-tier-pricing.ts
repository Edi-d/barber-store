/**
 * useTierPricing — fetch volume-discount tiers for a single product +
 * pure helper to compute the effective unit price for any qty.
 *
 * Tiers are stored ascending by min_qty. The effective price for a
 * given qty is the price_cents of the highest tier whose min_qty <= qty
 * (capped at the product base price).
 */

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type PricingTier = {
  min_qty: number;
  price_cents: number;
};

export type UseTierPricingReturn = {
  tiers: PricingTier[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  unitPriceFor: (qty: number, basePriceCents: number) => number;
  savingsFor: (qty: number, basePriceCents: number) => number;
  hasTiers: boolean;
};

export function unitPriceFromTiers(
  tiers: PricingTier[],
  qty: number,
  basePriceCents: number,
): number {
  if (qty <= 0 || tiers.length === 0) return basePriceCents;
  let chosen = basePriceCents;
  for (const t of tiers) {
    if (qty >= t.min_qty && t.price_cents < chosen) {
      chosen = t.price_cents;
    }
  }
  return chosen;
}

export function useTierPricing(productId: string | null | undefined): UseTierPricingReturn {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTiers = useCallback(async () => {
    if (!productId) {
      setTiers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('marketplace_product_pricing_tiers')
      .select('min_qty, price_cents')
      .eq('product_id', productId)
      .order('min_qty', { ascending: true });
    if (err) {
      console.warn('[useTierPricing]', err.message);
      setError(err.message);
    }
    const normalized: PricingTier[] = (data ?? []).map((t: any) => ({
      min_qty: Number(t.min_qty),
      price_cents: Number(t.price_cents),
    }));
    setTiers(normalized);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  const unitPriceFor = useCallback(
    (qty: number, basePriceCents: number) =>
      unitPriceFromTiers(tiers, qty, basePriceCents),
    [tiers],
  );

  const savingsFor = useCallback(
    (qty: number, basePriceCents: number) => {
      const unit = unitPriceFromTiers(tiers, qty, basePriceCents);
      return Math.max(0, (basePriceCents - unit) * qty);
    },
    [tiers],
  );

  return {
    tiers,
    loading,
    error,
    refetch: fetchTiers,
    unitPriceFor,
    savingsFor,
    hasTiers: tiers.length > 0,
  };
}
