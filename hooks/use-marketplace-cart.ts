/**
 * useMarketplaceCart — thin compatibility shim over useMarketplaceCartStore.
 *
 * Tapzi-ported components (MarketplaceProductCard, MarketplaceCartDrawer,
 * MarketplaceSearchModal) call `useMarketplaceCart()` and expect a return
 * shape with `totalItems` as a plain number (not a function).
 *
 * This shim reads from the Zustand persist store and re-exports the same
 * API surface so ported files compile without modification.
 *
 * DO NOT import useMarketplaceCart in NEW barber-store code — use
 * useMarketplaceCartStore directly for type safety and correct Zustand patterns.
 */

import { useMarketplaceCartStore, type MarketplaceCartItem } from '@/hooks/use-marketplace-cart-store';

export type { MarketplaceCartItem };

export type UseMarketplaceCartReturn = {
  items: MarketplaceCartItem[];
  totalItems: number;
  totalCents: number;
  addItem: (item: MarketplaceCartItem) => void;
  addItems: (items: MarketplaceCartItem[]) => void;
  replaceItems: (items: MarketplaceCartItem[]) => void;
  removeItem: (product_id: string) => void;
  setQty: (product_id: string, qty: number) => void;
  clear: () => void;
  isInCart: (product_id: string) => boolean;
  getQty: (product_id: string) => number;
};

export function useMarketplaceCart(): UseMarketplaceCartReturn {
  const store = useMarketplaceCartStore();
  return {
    items:        store.items,
    // Zustand store exposes these as functions; shim resolves them to numbers
    // so Tapzi code accessing `cart.totalItems` (property, not call) works.
    totalItems:   store.totalItems(),
    totalCents:   store.totalCents(),
    addItem:      store.addItem,
    addItems:     store.addItems,
    replaceItems: store.replaceItems,
    removeItem:   store.removeItem,
    setQty:       store.setQty,
    clear:        store.clear,
    isInCart:     store.isInCart,
    getQty:       store.getQty,
  };
}
