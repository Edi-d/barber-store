/**
 * Shop XP / Gamification System — Type Definitions
 *
 * Ported verbatim from Tapzi-barber/types/shop-gamification.ts.
 * Renamed module to shop-xp.ts to avoid collision with the target's
 * existing loyalty/platform XP types.
 *
 * All types use camelCase; hooks handle snake_case conversion from Supabase.
 * ISO-8601 date strings are typed as `string`.
 *
 * DB tables: shop_xp_config, xp_level_thresholds, user_shop_xp,
 *            shop_xp_transactions, xp_reward_products, user_xp_orders
 */

// ─── XP Configuration ───────────────────────────────────

export type ShopXPConfig = {
  salonId: string;
  xpPerRon: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

// ─── XP Levels ──────────────────────────────────────────

export type XPLevel = {
  level: number;
  title: string;
  xpRequired: number;
  perks: string[];
};

// ─── User Shop XP ───────────────────────────────────────

export type UserShopXP = {
  id: string;
  userId: string;
  salonId: string;
  currentXP: number;
  totalXPEarned: number;
  level: number;
  createdAt: string;
  updatedAt: string;
};

// ─── XP Transactions ────────────────────────────────────

export type XPTransactionType = 'earned' | 'spent';
export type XPTransactionSource =
  | 'purchase'
  | 'product_redeem'
  | 'bonus'
  | 'admin_adjust'
  | 'level_up_bonus';

export type XPTransaction = {
  id: string;
  userId: string;
  salonId: string;
  amount: number;
  type: XPTransactionType;
  source: XPTransactionSource;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
};

// ─── XP Reward Products ────────────────────────────────

export type XPRewardCategory = 'ingrijire' | 'styling' | 'unelte' | 'accesorii';

export type XPRewardProduct = {
  id: string;
  salonId: string;
  name: string;
  description: string | null;
  brand: 'Glamm' | 'Rovra';
  category: XPRewardCategory;
  imageUrl: string | null;
  xpCost: number;
  retailValueCents: number | null;
  stock: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

// ─── User XP Orders ────────────────────────────────────

export type XPOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'ready'
  | 'collected'
  | 'cancelled';

export type UserXPOrder = {
  id: string;
  userId: string;
  salonId: string;
  productId: string;
  xpSpent: number;
  status: XPOrderStatus;
  collectedAt: string | null;
  createdAt: string;
  product?: Pick<
    XPRewardProduct,
    'name' | 'description' | 'brand' | 'category' | 'imageUrl' | 'xpCost' | 'retailValueCents'
  >;
};

// ─── XP Summary (composite) ────────────────────────────

export type XPSummary = {
  currentXP: number;
  totalXP: number;
  level: number;
  levelTitle: string;
  xpToNextLevel: number;
  progressPercentage: number;
};
