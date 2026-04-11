/**
 * use-recently-viewed.ts
 *
 * Tracks the last MAX_ITEMS products the user viewed, persisted to AsyncStorage.
 * Uses the local JSON catalog Product type from @/data/types (sku-based) so it
 * stays consistent with RecentlyViewed.tsx and the shop tab's product catalog.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product } from '@/data/types';

const STORAGE_KEY = 'barber_store_recently_viewed';
const MAX_ITEMS = 20;

export type RecentlyViewedAPI = {
  recentlyViewed: Product[];
  addViewed: (product: Product) => void;
  clearHistory: () => void;
};

export function useRecentlyViewed(): RecentlyViewedAPI {
  const [items, setItems] = useState<Product[]>([]);
  const isHydrated = useRef(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: Product[] = JSON.parse(raw);
          setItems(parsed);
        }
      } catch {
        // Silently ignore read errors
      } finally {
        isHydrated.current = true;
      }
    })();
  }, []);

  // Persist whenever items change (after hydration)
  useEffect(() => {
    if (!isHydrated.current) return;
    try {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Silently ignore write errors
    }
  }, [items]);

  const addViewed = useCallback((product: Product) => {
    setItems((prev) => {
      // Remove duplicate by sku, then prepend
      const filtered = prev.filter((p) => p.sku !== product.sku);
      return [product, ...filtered].slice(0, MAX_ITEMS);
    });
  }, []);

  const clearHistory = useCallback(() => {
    setItems([]);
  }, []);

  return {
    recentlyViewed: items,
    addViewed,
    clearHistory,
  };
}
