import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { Product } from '@/data/types';

export type SortBy = 'relevance' | 'price_asc' | 'price_desc' | 'discount' | 'name';

export const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'relevance', label: 'Relevanta' },
  { value: 'price_asc', label: 'Pret crescator' },
  { value: 'price_desc', label: 'Pret descrescator' },
  { value: 'discount', label: 'Reducere' },
  { value: 'name', label: 'Alfabetic' },
];

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer.current);
  }, [value, delay]);

  return debounced;
}

export function useProductFilters(products: Product[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('relevance');

  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory(null);
    setSelectedBrand(null);
    setSortBy('relevance');
  }, []);

  const hasActiveFilters = selectedCategory !== null || selectedBrand !== null || debouncedQuery.length >= 2;

  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedCategory) {
      result = result.filter((p) => p.category === selectedCategory);
    }
    if (selectedBrand) {
      result = result.filter((p) => p.brand === selectedBrand);
    }
    if (debouncedQuery.length >= 2) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q),
      );
    }

    // Sort based on selected mode (in-stock always first)
    return [...result].sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;

      switch (sortBy) {
        case 'price_asc':
          return a.partnerPrice - b.partnerPrice;
        case 'price_desc':
          return b.partnerPrice - a.partnerPrice;
        case 'discount': {
          const discA = a.retailPrice > 0 ? (a.retailPrice - a.partnerPrice) / a.retailPrice : 0;
          const discB = b.retailPrice > 0 ? (b.retailPrice - b.partnerPrice) / b.retailPrice : 0;
          return discB - discA;
        }
        case 'name':
          return a.name.localeCompare(b.name);
        case 'relevance':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [products, selectedCategory, selectedBrand, debouncedQuery, sortBy]);

  return {
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedBrand,
    setSelectedBrand,
    sortBy,
    setSortBy,
    resetFilters,
    hasActiveFilters,
    filteredProducts,
    resultCount: filteredProducts.length,
  };
}
