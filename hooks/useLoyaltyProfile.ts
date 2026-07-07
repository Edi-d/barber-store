import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { fetchXpBalance, type XpBalanceInfo } from '@/lib/loyalty';
import { useXpRealtime, XP_BALANCE_QK } from '@/hooks/useXpRealtime';

/**
 * Returns the user's current platform XP balance + level progress.
 * Auto-refreshes via Supabase Realtime on any platform_xp_transactions change
 * (see useXpRealtime), which also refreshes the transaction-history lists.
 *
 * Name kept as `useLoyaltyProfile` so existing import sites don't break.
 * Return shape is a React Query result wrapping XpBalanceInfo.
 */
export function useLoyaltyProfile() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  // Live points: invalidates balance + history on any XP transaction change.
  useXpRealtime(userId);

  return useQuery<XpBalanceInfo | null>({
    queryKey: userId ? XP_BALANCE_QK(userId) : ['xp-balance', 'anonymous'],
    queryFn: () => (userId ? fetchXpBalance(userId) : Promise.resolve(null)),
    enabled: !!userId,
  });
}
