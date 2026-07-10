import { useMutation, useQueryClient } from '@tanstack/react-query';
import { redeemSalonReward, type RedeemResult } from '@/lib/salon-loyalty';
import { SALON_LOYALTY_CARDS_QK } from './useSalonLoyaltyCards';
import { SALON_LOYALTY_DETAIL_QK } from './useSalonLoyaltyDetail';

type Vars = { userId: string; salonId: string; rewardId: string };

/**
 * Redeem a salon reward → mint a voucher. On success we refetch the salon detail
 * (balance, rewards stock, voucher wallet) and the carousel cards (per-salon
 * points). The caller shows the returned voucher code in the QR modal.
 */
export function useRedeemSalonReward() {
  const qc = useQueryClient();

  return useMutation<RedeemResult, Error, Vars>({
    mutationFn: ({ userId, salonId, rewardId }) =>
      redeemSalonReward(userId, salonId, rewardId),
    onSuccess: (res, { userId, salonId }) => {
      if (!res.ok) return;
      qc.invalidateQueries({ queryKey: SALON_LOYALTY_DETAIL_QK(userId, salonId) });
      qc.invalidateQueries({ queryKey: SALON_LOYALTY_CARDS_QK(userId) });
    },
  });
}
