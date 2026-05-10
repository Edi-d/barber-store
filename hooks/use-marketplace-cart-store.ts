/**
 * useMarketplaceCartStore — Zustand + AsyncStorage persist store for the
 * marketplace B2B/B2C cart. Completely separate from the legacy Supabase-backed
 * useCartStore (stores/cartStore.ts) which powers app/cart.tsx.
 *
 * Hydration check: useMarketplaceCartStore.persist.hasHydrated()
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'barber_marketplace_cart_items';

// ── Item type (matches Tapzi MarketplaceCartItem exactly) ──
export type MarketplaceCartItem = {
  product_id: string;
  qty: number;
  unit_price_cents: number;
  title_snapshot: string;
  image_url: string | null;
  brand?: string | null;
};

// ── Merge helper ──
// When adding an item whose product_id already exists: increments qty,
// refreshes snapshot fields (price, title, image, brand) from the new item.
function mergeIntoList(
  existing: MarketplaceCartItem[],
  incoming: MarketplaceCartItem,
): MarketplaceCartItem[] {
  const idx = existing.findIndex((i) => i.product_id === incoming.product_id);
  if (idx >= 0) {
    const updated = [...existing];
    updated[idx] = {
      ...updated[idx],
      qty: updated[idx].qty + incoming.qty,
      unit_price_cents: incoming.unit_price_cents,
      title_snapshot: incoming.title_snapshot,
      image_url: incoming.image_url,
      brand: incoming.brand ?? updated[idx].brand ?? null,
    };
    return updated;
  }
  return [...existing, incoming];
}

// ── Store shape ──
interface MarketplaceCartState {
  // Persisted
  items: MarketplaceCartItem[];

  // Derived (computed inline, not persisted)
  totalItems: () => number;
  totalCents: () => number;

  // Actions — match Tapzi MarketplaceCartAPI surface 1-to-1
  addItem: (item: MarketplaceCartItem) => void;
  addItems: (items: MarketplaceCartItem[]) => void; // bulk (quick-order)
  replaceItems: (items: MarketplaceCartItem[]) => void; // reorder flow
  removeItem: (product_id: string) => void;
  setQty: (product_id: string, qty: number) => void; // qty <= 0 removes
  clear: () => void;

  // Lookup helpers
  isInCart: (product_id: string) => boolean;
  getQty: (product_id: string) => number;
}

export const useMarketplaceCartStore = create<MarketplaceCartState>()(
  persist(
    (set, get) => ({
      items: [],

      // Computed — called as functions to match existing useCartStore pattern
      totalItems: () => get().items.reduce((sum, i) => sum + i.qty, 0),
      totalCents: () =>
        get().items.reduce((sum, i) => sum + i.unit_price_cents * i.qty, 0),

      addItem: (item) =>
        set((s) => ({ items: mergeIntoList(s.items, item) })),

      addItems: (incoming) =>
        set((s) => ({
          items: incoming.reduce(
            (acc, item) => mergeIntoList(acc, item),
            s.items,
          ),
        })),

      replaceItems: (items) => set({ items }),

      removeItem: (product_id) =>
        set((s) => ({
          items: s.items.filter((i) => i.product_id !== product_id),
        })),

      setQty: (product_id, qty) =>
        set((s) => ({
          items:
            qty <= 0
              ? s.items.filter((i) => i.product_id !== product_id)
              : s.items.map((i) =>
                  i.product_id === product_id ? { ...i, qty } : i,
                ),
        })),

      clear: () => set({ items: [] }),

      isInCart: (product_id) =>
        get().items.some((i) => i.product_id === product_id),

      getQty: (product_id) =>
        get().items.find((i) => i.product_id === product_id)?.qty ?? 0,
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist items array; computed functions are not serializable
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
