/**
 * useMarketplaceFavorites — Zustand + AsyncStorage persist store for the
 * marketplace product favourites (wishlist). Mirrors the persist setup in
 * useMarketplaceCartStore (hooks/use-marketplace-cart-store.ts).
 *
 * Only the `ids` array is persisted; lookup/mutation helpers are derived.
 *
 * Hydration check: useMarketplaceFavorites.persist.hasHydrated()
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'barber_marketplace_favorites';

// ── Store shape ──
interface FavoritesState {
  // Persisted
  ids: string[];

  // Actions
  toggle: (productId: string) => void;
  has: (productId: string) => boolean;
  clear: () => void;
}

export const useMarketplaceFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],

      toggle: (productId) =>
        set((s) => ({
          ids: s.ids.includes(productId)
            ? s.ids.filter((id) => id !== productId)
            : [...s.ids, productId],
        })),

      has: (productId) => get().ids.includes(productId),

      clear: () => set({ ids: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the ids array
      partialize: (state) => ({ ids: state.ids }),
    },
  ),
);
