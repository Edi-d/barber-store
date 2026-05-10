/**
 * useBuyerType — resolves whether the current user is acting as a salon
 * owner (B2B) or an end client (B2C) for marketplace pricing purposes.
 *
 * Logic: isOwner && !!salon?.id → 'salon', otherwise → 'client'.
 * Reads from useSalon() (providers/salon-provider.tsx).
 * Defaults to 'client' if the salon provider is unavailable or salon is null.
 *
 * NOTE: Must be called inside <SalonProvider> — the root layout mounts it.
 * The hook never throws; if isOwner is false or salon is missing it returns 'client'.
 */

import { useSalon } from '@/providers/salon-provider';

export type BuyerType = 'salon' | 'client';

export function useBuyerType(): BuyerType {
  const { isOwner, salon } = useSalon();
  return isOwner && !!salon?.id ? 'salon' : 'client';
}
