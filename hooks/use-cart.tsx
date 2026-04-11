/**
 * use-cart.tsx
 *
 * Thin wrapper around barber-store's Zustand cartStore.
 * Exposes a stable CartAPI interface that shop components can consume
 * without knowing the underlying store shape.
 *
 * Key mapping vs. the management-app source:
 *   - Items are keyed by product.id (UUID) instead of product.sku
 *   - Prices are in cents (price_cents) instead of separate partnerPrice/retailPrice
 *   - Cart is persisted in Supabase cart_items, not AsyncStorage
 */

import { useCartStore } from '@/stores/cartStore';
import type { Product, CartItemWithProduct } from '@/types/database';

export type { CartItemWithProduct };

export type CartAPI = {
  items: CartItemWithProduct[];
  totalItems: number;
  totalPrice: number;
  /** Price in cents */
  totalPriceCents: number;
  isLoading: boolean;
  addItem: (product: Product, quantity?: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  setQuantity: (productId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  fetchCart: () => Promise<void>;
  isInCart: (productId: string) => boolean;
  getQuantity: (productId: string) => number;
};

export function useCart(): CartAPI {
  const store = useCartStore();

  const totalPriceCents = store.totalPrice();
  const totalPrice = totalPriceCents / 100;
  const totalItems = store.totalItems();

  const isInCart = (productId: string): boolean =>
    store.items.some((item) => item.product_id === productId);

  const getQuantity = (productId: string): number =>
    store.items.find((item) => item.product_id === productId)?.qty ?? 0;

  const setQuantity = async (productId: string, quantity: number): Promise<void> => {
    if (quantity <= 0) {
      await store.removeItem(productId);
    } else {
      await store.updateQty(productId, quantity);
    }
  };

  return {
    items: store.items,
    totalItems,
    totalPrice,
    totalPriceCents,
    isLoading: store.isLoading,
    addItem: store.addItem,
    removeItem: store.removeItem,
    setQuantity,
    clearCart: store.clearCart,
    fetchCart: store.fetchCart,
    isInCart,
    getQuantity,
  };
}
