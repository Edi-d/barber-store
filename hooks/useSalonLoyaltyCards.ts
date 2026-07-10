import { useQuery } from '@tanstack/react-query';
import { getLoyaltySalonCards } from '@/lib/salon-loyalty';

/** Query key for the wallet-carousel card list. */
export const SALON_LOYALTY_CARDS_QK = (userId: string) =>
  ['salon-loyalty-cards', userId] as const;

/** One card per salon the user has visited (drives the wallet carousel). */
export function useSalonLoyaltyCards(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? SALON_LOYALTY_CARDS_QK(userId) : ['salon-loyalty-cards', 'anon'],
    queryFn: () => (userId ? getLoyaltySalonCards(userId) : Promise.resolve([])),
    enabled: !!userId,
    staleTime: 30_000,
  });
}
