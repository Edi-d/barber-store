/**
 * Paginated nopCommerce browse hooks (React Query useInfiniteQuery).
 *
 *   useNopCategoryProducts(categoryId) → GetCategoryProducts (guide §4c)
 *   useNopBrandProducts(manufacturerId) → GetFilteredProducts, SINGULAR
 *                                         manufacturer_id (guide §6b gotcha)
 *
 * Both flatten pages into a single MarketplaceProduct[] and DE-DUPE on append —
 * nop paging can repeat an item across page boundaries (guide §6b). Pass a null
 * id (e.g. while a slug is still resolving) to keep the query disabled.
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import {
  fetchBrandProductsPage,
  fetchCategoryProductsPage,
  type ProductPage,
} from '@/lib/nop-catalog';
import type { MarketplaceProduct } from '@/hooks/use-marketplace-catalog';

const PAGE_SIZE = 24;

type UseNopProductsReturn = {
  products: MarketplaceProduct[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
};

/** De-dupe by product id while preserving first-seen order. */
function dedupe(products: MarketplaceProduct[]): MarketplaceProduct[] {
  const seen = new Set<string>();
  const out: MarketplaceProduct[] = [];
  for (const p of products) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

function useNopPagedProducts(
  queryKey: (string | number)[],
  id: number | null,
  fetchPage: (id: number, page: number, size: number) => Promise<ProductPage>,
): UseNopProductsReturn {
  const query = useInfiniteQuery({
    queryKey,
    enabled: id != null,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage(id as number, pageParam, PAGE_SIZE),
    getNextPageParam: (last) =>
      last.hasNextPage ? last.pageNumber + 1 : undefined,
  });

  const products = useMemo(
    () => dedupe((query.data?.pages ?? []).flatMap((p) => p.products)),
    [query.data],
  );

  return {
    products,
    loading: query.isLoading,
    loadingMore: query.isFetchingNextPage,
    error: query.error ? (query.error as Error).message : null,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
    refetch: () => query.refetch(),
  };
}

export function useNopCategoryProducts(
  categoryId: number | null,
  manufacturerId?: number | null,
): UseNopProductsReturn {
  return useNopPagedProducts(
    ['nop', 'category-products', categoryId ?? 'none', manufacturerId ?? 'all'],
    categoryId,
    (id, page, size) =>
      fetchCategoryProductsPage(id, page, size, manufacturerId ?? null),
  );
}

export function useNopBrandProducts(
  manufacturerId: number | null,
): UseNopProductsReturn {
  return useNopPagedProducts(
    ['nop', 'brand-products', manufacturerId ?? 'none'],
    manufacturerId,
    fetchBrandProductsPage,
  );
}
