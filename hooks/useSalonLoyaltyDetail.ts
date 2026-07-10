import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getSalonLoyaltyDetail } from '@/lib/salon-loyalty';

/** Query key for one salon's loyalty detail (rewards / vouchers / history). */
export const SALON_LOYALTY_DETAIL_QK = (userId: string, salonId: string) =>
  ['salon-loyalty-detail', userId, salonId] as const;

/**
 * The selected salon's detail below the carousel. `keepPreviousData` keeps the
 * old salon's content on screen while the next one loads, so swiping the
 * carousel doesn't flash a spinner between shops.
 */
export function useSalonLoyaltyDetail(
  userId: string | undefined,
  salonId: string | undefined,
) {
  return useQuery({
    queryKey:
      userId && salonId
        ? SALON_LOYALTY_DETAIL_QK(userId, salonId)
        : ['salon-loyalty-detail', 'anon'],
    queryFn: () =>
      userId && salonId ? getSalonLoyaltyDetail(userId, salonId) : Promise.resolve(null),
    enabled: !!userId && !!salonId,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
