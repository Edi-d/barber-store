import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'barber_search_recent';
const MAX_ITEMS = 8;

export function useRecentSearches() {
  const [items, setItems] = useState<string[]>([]);

  // Load from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setItems(parsed);
          } catch {
            // ignore corrupt data
          }
        }
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((next: string[]) => {
    setItems(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // Add a search term — deduplicates case-insensitively, newest first
  const add = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) return;

      const filtered = items.filter(
        (existing) => existing.toLowerCase() !== trimmed.toLowerCase()
      );

      const next = [trimmed, ...filtered].slice(0, MAX_ITEMS);
      persist(next);
    },
    [items, persist]
  );

  // Remove one item
  const remove = useCallback(
    (term: string) => {
      const next = items.filter(
        (existing) => existing.toLowerCase() !== term.toLowerCase()
      );
      persist(next);
    },
    [items, persist]
  );

  // Clear all
  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  return { items, add, remove, clear };
}
