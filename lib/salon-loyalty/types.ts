/**
 * Types for the per-salon customer loyalty (the "wallet" carousel screen).
 * Ported from the web app's `lib/loyalty/types.ts`. Loyalty is per-salon: a user
 * has a separate points balance, tier, reward catalogue and voucher wallet at
 * every salon they've visited — nothing here aggregates across salons.
 *
 * This is DISTINCT from the global platform-XP system in `@/lib/loyalty.ts`.
 */

/** DB tier enum, lowest → highest. */
export type TierSlug = 'clipper' | 'blade' | 'sharp' | 'maestru';

/** Display names for the tier ladder (slugs stay as the DB enum values). */
export const TIER_LABELS: Record<TierSlug, string> = {
  clipper: 'Rookie',
  blade: 'Pro',
  sharp: 'Elite',
  maestru: 'Icon',
};

/** Tier ordering / rank (1-4). Doubles as the `level` for <TierBadge />. */
export const TIER_RANK: Record<TierSlug, number> = {
  clipper: 1,
  blade: 2,
  sharp: 3,
  maestru: 4,
};

/** Brand-tinted accent per tier: Rookie turquoise / Pro blue / Elite violet / Icon gold. */
export const TIER_ACCENT: Record<TierSlug, string> = {
  clipper: '#20C9C2',
  blade: '#4C7DF0',
  sharp: '#8B5CF6',
  maestru: '#E9A82C',
};

export type RewardCategory =
  | 'discount'
  | 'free_service'
  | 'product'
  | 'experience'
  | 'custom';

export type LoyaltyVoucherStatus = 'active' | 'used' | 'expired' | 'cancelled';

export type TransactionType =
  | 'earn_appointment'
  | 'earn_referral'
  | 'earn_bonus'
  | 'earn_action'
  | 'redeem_discount'
  | 'redeem_reward'
  | 'expiry'
  | 'correction'
  | 'admin_grant'
  | 'admin_revoke';

/** Band-relative progress toward the next tier, shown on cards + the hero. */
export type TierProgressBar = {
  currentTier: TierSlug;
  currentLabel: string;
  nextLabel: string | null;
  /** 0–100, progress within current → next tier. */
  pct: number;
  /** Lifetime points still needed to reach the next tier (null at max tier). */
  pointsToNext: number | null;
};

/** A reward from a salon's `rewards_catalog`, as the customer browses it. */
export type CatalogReward = {
  id: string;
  name: string;
  description: string | null;
  category: RewardCategory;
  pointsCost: number;
  realValueCents: number | null;
  requiredTier: TierSlug;
  discountPercent: number | null;
  /** Remaining stock (null = unlimited). 0 = out of stock. */
  remainingStock: number | null;
};

/** The customer's loyalty standing + reward catalogue at one salon. */
export type SalonRewardData = {
  enrolled: boolean;
  currentPoints: number;
  tier: TierSlug | null;
  rewards: CatalogReward[];
};

/** A reward voucher the customer has claimed (`loyalty_vouchers`, reward_id set). */
export type SalonRewardVoucher = {
  id: string;
  code: string;
  status: LoyaltyVoucherStatus;
  pointsSpent: number;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
  salonName: string;
  reward: {
    name: string;
    description: string | null;
    category: RewardCategory;
  } | null;
};

/** One point-history row at a salon. */
export type PointHistoryItem = {
  id: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
};

/** Salon meta carried on cards + the detail header. */
export type SalonMeta = {
  id: string;
  name: string;
  city: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
};

/** One card in the wallet carousel (one salon the client has visited). */
export type SalonLoyaltyCard = {
  salonId: string;
  name: string;
  city: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  /** Salon runs a loyalty program (enrolled OR settings.enabled). */
  hasProgram: boolean;
  /** Client has a loyalty_profiles row here. */
  enrolled: boolean;
  currentPoints: number;
  lifetimePoints: number;
  progress: TierProgressBar | null;
};

/** Everything the per-salon detail (below the carousel) needs. */
export type SalonLoyaltyDetail = {
  salon: SalonMeta;
  hasProgram: boolean;
  enrolled: boolean;
  currentPoints: number;
  lifetimePoints: number;
  totalVisits: number;
  lastVisitAt: string | null;
  progress: TierProgressBar | null;
  rewards: CatalogReward[];
  vouchers: SalonRewardVoucher[];
  history: PointHistoryItem[];
  historyHasMore: boolean;
};

/**
 * Result of redeeming a reward (mirrors the web server action). Flat (not a
 * discriminated union) on purpose: this project compiles with `strict: false`,
 * where union narrowing via `if (res.ok)` does not work — so every field is
 * always accessible and gated on `ok` at runtime.
 */
export type RedeemResult = {
  ok: boolean;
  /** Set when ok === false. */
  error?: string;
  /** The following are set when ok === true. */
  code?: string;
  rewardName?: string;
  pointsSpent?: number;
  newBalance?: number;
  expiresAt?: string | null;
};
