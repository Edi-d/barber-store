/**
 * useShopStories — shop-section promo stories from the nop CMS.
 *
 * One react-query entry (`['nop','shop-stories']`) feeds BOTH consumers — the
 * ShopStoriesRail tiles and the ShopStoriesViewer modal — so they share a
 * single network call (react-query dedupes by queryKey; no module-level cache
 * needed). Stories are decorative/promotional: on failure we fail silent and
 * render nothing rather than surfacing an error state.
 */
import { useQuery } from '@tanstack/react-query';

import { fetchShopStories, type ShopStorySlide } from '@/lib/nop-catalog';

export type { ShopStorySlide } from '@/lib/nop-catalog';

export function useShopStories() {
  const { data, isLoading } = useQuery<ShopStorySlide[]>({
    queryKey: ['nop', 'shop-stories'],
    queryFn: fetchShopStories,
    // Promo content changes rarely within a session; keep it warm for 5 min so
    // re-entering the shop doesn't refetch.
    staleTime: 5 * 60_000,
  });

  return { stories: data ?? [], loading: isLoading };
}
