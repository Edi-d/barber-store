/**
 * Presentation helpers for per-salon loyalty: transaction labels/tones, reward
 * category labels, voucher status pills. Ported from the web `lib/loyalty/
 * format.ts`, adapted to native (hex colours instead of CSS pill classes).
 * `relativeTimeLabel` is reused from the global loyalty lib.
 */

import type {
  LoyaltyVoucherStatus,
  RewardCategory,
  SalonRewardVoucher,
  TransactionType,
} from './types';

export { relativeTimeLabel } from '@/lib/loyalty';

/** Group point amounts with the ro-RO locale (thousands separators). */
export function formatPoints(n: number): string {
  return n.toLocaleString('ro-RO');
}

export function formatRon(cents: number): string {
  return `${(cents / 100).toLocaleString('ro-RO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} lei`;
}

export type TxnTone = 'earn' | 'spend' | 'neutral';

const TXN_META: Record<TransactionType, { label: string; tone: TxnTone }> = {
  earn_appointment: { label: 'Vizită finalizată', tone: 'earn' },
  earn_referral: { label: 'Recomandare', tone: 'earn' },
  earn_bonus: { label: 'Bonus', tone: 'earn' },
  earn_action: { label: 'Acțiune', tone: 'earn' },
  redeem_discount: { label: 'Discount aplicat', tone: 'spend' },
  redeem_reward: { label: 'Recompensă revendicată', tone: 'spend' },
  expiry: { label: 'Puncte expirate', tone: 'neutral' },
  correction: { label: 'Corecție', tone: 'neutral' },
  admin_grant: { label: 'Bonus de la salon', tone: 'earn' },
  admin_revoke: { label: 'Ajustare salon', tone: 'neutral' },
};

export function txnMeta(type: TransactionType): { label: string; tone: TxnTone } {
  return TXN_META[type] ?? { label: type, tone: 'neutral' };
}

export const REWARD_CATEGORY_LABELS: Record<RewardCategory, string> = {
  discount: 'Reducere',
  free_service: 'Serviciu gratuit',
  product: 'Produs',
  experience: 'Experiență',
  custom: 'Special',
};

/** Status pill colours (matches the global voucher wallet look). */
export const VOUCHER_STATUS_META: Record<
  LoyaltyVoucherStatus,
  { label: string; color: string; bg: string }
> = {
  active: { label: 'Activ', color: '#15803D', bg: '#DCFCE7' },
  used: { label: 'Folosit', color: '#475569', bg: '#F1F5F9' },
  expired: { label: 'Expirat', color: '#B91C1C', bg: '#FEE2E2' },
  cancelled: { label: 'Anulat', color: '#475569', bg: '#F1F5F9' },
};

/**
 * An 'active' voucher whose expiry has passed is effectively expired — the DB
 * sweep that flips the status is lazy, so reconcile against the clock here. A
 * missing/unparseable expiry is treated as still active (guards `new Date(null)`
 * → epoch 0, which would otherwise kill a brand-new voucher on first render).
 */
export function effectiveVoucherStatus(v: SalonRewardVoucher): LoyaltyVoucherStatus {
  if (v.status !== 'active') return v.status;
  if (!v.expiresAt) return 'active';
  const exp = new Date(v.expiresAt).getTime();
  if (Number.isNaN(exp) || exp === 0) return 'active';
  return exp < Date.now() ? 'expired' : v.status;
}
