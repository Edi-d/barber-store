/**
 * useShippingMethods — fetches the nopCommerce courier list
 * (/api/ShippingMethodInfo/GetShippingMethodInfos) for the checkout shipping-method
 * picker. Cart-independent, so it only needs the guest token. Results are sorted by
 * display_order and cached for a few minutes (the courier list rarely changes).
 */

import { useQuery } from '@tanstack/react-query';

import { getShippingMethodInfos } from '@/lib/nop-client';
import type { NopShippingMethodInfo } from '@/types/nop';

export function useShippingMethods(opts?: {
  /** Courier-logo edge in px. */
  pictureSize?: number;
  enabled?: boolean;
}) {
  const pictureSize = opts?.pictureSize ?? 200;
  return useQuery<NopShippingMethodInfo[]>({
    queryKey: ['nop-shipping-methods', pictureSize],
    queryFn: async () => {
      const res = await getShippingMethodInfos(pictureSize);
      return [...(res.shipping_method_infos ?? [])].sort(
        (a, b) => a.display_order - b.display_order,
      );
    },
    enabled: opts?.enabled ?? true,
    staleTime: 5 * 60_000,
  });
}
