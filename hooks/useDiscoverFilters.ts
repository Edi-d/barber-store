// hooks/useDiscoverFilters.ts
import { useCallback, useState } from 'react';
import {
  DEFAULT_FILTERS,
  type DiscoverFilters,
  countActiveFilters,
} from '@/types/filters';

export interface UseDiscoverFiltersResult {
  filters: DiscoverFilters;
  apply: (next: DiscoverFilters) => void;
  reset: () => void;
  count: number;
}

export function useDiscoverFilters(): UseDiscoverFiltersResult {
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);

  const apply = useCallback((next: DiscoverFilters) => {
    setFilters(next);
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return {
    filters,
    apply,
    reset,
    count: countActiveFilters(filters),
  };
}
