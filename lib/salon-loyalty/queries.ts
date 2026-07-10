/**
 * Per-salon customer loyalty reads for the wallet-carousel screen. Ported from
 * the web app's `lib/loyalty/customer-rewards.ts`, adapted to the RN singleton
 * client and taking `userId` explicitly (there is no server `auth.getUser()`).
 *
 * All reads run as the signed-in user under RLS (own loyalty_profiles /
 * loyalty_vouchers / point_transactions; rewards_catalog exposes active rows).
 * Loyalty is per-salon and never aggregated — this module reads ONLY the
 * per-salon tables, never `platform_xp_transactions`.
 */

import { supabase } from '@/lib/supabase';
import { computeSalonTierProgress, thresholdsFromTiers } from './tiers';
import type {
  CatalogReward,
  PointHistoryItem,
  RedeemResult,
  RewardCategory,
  SalonLoyaltyCard,
  SalonLoyaltyDetail,
  SalonMeta,
  SalonRewardData,
  SalonRewardVoucher,
  TierSlug,
  TransactionType,
} from './types';

const TIERS: TierSlug[] = ['clipper', 'blade', 'sharp', 'maestru'];
const asTier = (v: unknown): TierSlug =>
  TIERS.includes(v as TierSlug) ? (v as TierSlug) : 'clipper';

/** PostgREST may return a to-one embed as an object or a 1-element array. */
function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Remaining stock from the inventory counters, falling back to legacy `stock`. */
function remainingStock(row: {
  total_inventory: number | null;
  redeemed_count: number | null;
  stock: number | null;
}): number | null {
  if (row.total_inventory != null) {
    return Math.max(row.total_inventory - (row.redeemed_count ?? 0), 0);
  }
  return row.stock ?? null;
}

// `cover_position` is intentionally omitted — it is a newer salons column not yet
// in the client's generated types. The card uses a centered cover crop instead.
const SALON_EMBED = 'id, name, city, avatar_url, cover_url';

type SalonRow = {
  id: string;
  name: string | null;
  city: string | null;
  avatar_url: string | null;
  cover_url: string | null;
};

const toMeta = (s: SalonRow): SalonMeta => ({
  id: s.id,
  name: s.name ?? 'Salon',
  city: s.city ?? null,
  avatarUrl: s.avatar_url ?? null,
  coverUrl: s.cover_url ?? null,
});

/**
 * The customer's loyalty standing + active reward catalogue at one salon. Reads
 * rewards_catalog directly so the tier gate (`required_tier`) is available for
 * the lock badge. Affordability is computed in the UI; the redeem RPC enforces
 * tier/stock server-side.
 */
export async function getSalonRewardData(
  userId: string,
  salonId: string,
): Promise<SalonRewardData> {
  const empty: SalonRewardData = {
    enrolled: false,
    currentPoints: 0,
    tier: null,
    rewards: [],
  };
  if (!userId) return empty;

  const [profileRes, rewardsRes] = await Promise.all([
    supabase
      .from('loyalty_profiles')
      .select('current_points, tier')
      .eq('user_id', userId)
      .eq('salon_id', salonId)
      .maybeSingle(),
    supabase
      .from('rewards_catalog')
      .select(
        'id, name, description, category, points_cost, real_value_cents, required_tier, discount_percent, stock, total_inventory, redeemed_count',
      )
      .eq('salon_id', salonId)
      .eq('active', true)
      .order('sort_order', { ascending: true }),
  ]);

  const rewards: CatalogReward[] = (rewardsRes.data ?? []).map((r: any) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    category: (r.category as RewardCategory) ?? 'custom',
    pointsCost: (r.points_cost as number | null) ?? 0,
    realValueCents: (r.real_value_cents as number | null) ?? null,
    requiredTier: asTier(r.required_tier),
    discountPercent: (r.discount_percent as number | null) ?? null,
    remainingStock: remainingStock(r),
  }));

  return {
    enrolled: !!profileRes.data,
    currentPoints: (profileRes.data?.current_points as number | null) ?? 0,
    tier: (profileRes.data?.tier as TierSlug | null) ?? null,
    rewards,
  };
}

/**
 * Reward vouchers the customer has claimed at one salon — the `loyalty_vouchers`
 * rows tied to a reward. Excludes platform-tier vouchers (reward_id NULL), which
 * live in the separate platform-XP wallet.
 */
export async function getSalonRewardVouchers(
  userId: string,
  salonId?: string,
): Promise<SalonRewardVoucher[]> {
  if (!userId) return [];

  let query = supabase
    .from('loyalty_vouchers')
    .select(
      'id, code, status, points_spent, expires_at, used_at, created_at, reward:reward_id(name, description, category), salon:salon_id(name)',
    )
    .eq('user_id', userId)
    .not('reward_id', 'is', null);
  if (salonId) query = query.eq('salon_id', salonId);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((r: any) => {
    const reward = firstOf(r.reward) as {
      name: string;
      description: string | null;
      category: RewardCategory | null;
    } | null;
    const salon = firstOf(r.salon) as { name: string | null } | null;
    return {
      id: r.id as string,
      code: r.code as string,
      status: r.status as SalonRewardVoucher['status'],
      pointsSpent: (r.points_spent as number | null) ?? 0,
      expiresAt: (r.expires_at as string | null) ?? null,
      usedAt: (r.used_at as string | null) ?? null,
      createdAt: r.created_at as string,
      salonName: salon?.name ?? 'Salon',
      reward: reward
        ? {
            name: reward.name,
            description: reward.description ?? null,
            category: reward.category ?? 'custom',
          }
        : null,
    };
  });
}

export const SALON_HISTORY_PAGE_SIZE = 25;

const mapHistoryRow = (r: any): PointHistoryItem => ({
  id: r.id as string,
  type: (r.type as TransactionType) ?? 'correction',
  amount: (r.amount as number | null) ?? 0,
  balanceAfter: (r.balance_after as number | null) ?? 0,
  description: (r.description as string | null) ?? null,
  createdAt: r.created_at as string,
});

/**
 * One page of the client's point history AT ONE SALON, newest first. `page` is
 * 0-based. `point_transactions` is RLS self-readable, scoped by salon_id.
 */
export async function getSalonPointHistory(
  userId: string,
  salonId: string,
  page = 0,
  pageSize = SALON_HISTORY_PAGE_SIZE,
): Promise<{ rows: PointHistoryItem[]; hasMore: boolean }> {
  if (!userId) return { rows: [], hasMore: false };

  const from = page * pageSize;
  const to = from + pageSize; // inclusive → fetches pageSize + 1

  const { data, error } = await supabase
    .from('point_transactions')
    .select('id, type, amount, balance_after, description, created_at')
    .eq('user_id', userId)
    .eq('salon_id', salonId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error || !data) return { rows: [], hasMore: false };
  const hasMore = data.length > pageSize;
  return { rows: data.slice(0, pageSize).map(mapHistoryRow), hasMore };
}

/**
 * The customer loyalty landing: one card per salon the client has an appointment
 * with. Enrolled salons (a `loyalty_profiles` row) carry points/rank/progress;
 * salons whose program is disabled/absent surface as muted "no program" cards.
 * Points are per-salon and never aggregated.
 */
export async function getLoyaltySalonCards(
  userId: string,
): Promise<SalonLoyaltyCard[]> {
  if (!userId) return [];

  const meta = new Map<string, SalonMeta>();
  const profileById = new Map<
    string,
    { currentPoints: number; lifetimePoints: number }
  >();

  // 1) Enrolled salons — points + salon meta (embed carries the cover image).
  const { data: profiles } = await supabase
    .from('loyalty_profiles')
    .select(`salon_id, current_points, lifetime_points, salons(${SALON_EMBED})`)
    .eq('user_id', userId);
  for (const p of (profiles ?? []) as any[]) {
    const salonId = p.salon_id as string;
    const s = firstOf(p.salons) as SalonRow | null;
    if (s) meta.set(salonId, toMeta(s));
    profileById.set(salonId, {
      currentPoints: (p.current_points as number | null) ?? 0,
      lifetimePoints: (p.lifetime_points as number | null) ?? 0,
    });
  }

  // 2) All salons the client has appointments with (reached via barbers — the
  // salons embed MUST be disambiguated with !barbers_salon_id_fkey).
  const { data: appts } = await supabase
    .from('appointments')
    .select(`barbers(salons!barbers_salon_id_fkey(${SALON_EMBED}))`)
    .eq('user_id', userId);
  for (const a of (appts ?? []) as any[]) {
    const b = firstOf(a.barbers) as { salons: SalonRow | SalonRow[] | null } | null;
    const s = firstOf(b?.salons ?? null) as SalonRow | null;
    if (s && !meta.has(s.id)) meta.set(s.id, toMeta(s));
  }

  const ids = [...meta.keys()];
  if (ids.length === 0) return [];

  // 3) Which of those salons run a loyalty program.
  const { data: settings } = await supabase
    .from('loyalty_settings')
    .select('salon_id, enabled')
    .in('salon_id', ids);
  const enabledById = new Map<string, boolean>();
  for (const s of (settings ?? []) as any[])
    enabledById.set(s.salon_id as string, Boolean(s.enabled));

  // 4) Assemble the cards.
  const cards: SalonLoyaltyCard[] = ids.map((id) => {
    const m = meta.get(id)!;
    const prof = profileById.get(id) ?? null;
    const enrolled = !!prof;
    const lifetime = prof?.lifetimePoints ?? 0;
    return {
      salonId: id,
      name: m.name,
      city: m.city,
      avatarUrl: m.avatarUrl,
      coverUrl: m.coverUrl,
      hasProgram: enrolled || (enabledById.get(id) ?? false),
      enrolled,
      currentPoints: prof?.currentPoints ?? 0,
      lifetimePoints: lifetime,
      progress: enrolled ? computeSalonTierProgress(lifetime) : null,
    };
  });

  // Enrolled first (richest cards, by balance), then programs without points,
  // then no-program salons; alphabetical within each band.
  const band = (c: SalonLoyaltyCard) => (c.enrolled ? 0 : c.hasProgram ? 1 : 2);
  cards.sort(
    (a, b) =>
      band(a) - band(b) ||
      b.currentPoints - a.currentPoints ||
      a.name.localeCompare(b.name, 'ro'),
  );
  return cards;
}

/**
 * Everything the salon detail view needs, in one round-trip: salon meta, the
 * client's standing + band-relative rank progress, the redeemable catalogue,
 * this salon's voucher wallet and the first page of point history. Returns null
 * only if the salon id is unknown.
 */
export async function getSalonLoyaltyDetail(
  userId: string,
  salonId: string,
): Promise<SalonLoyaltyDetail | null> {
  if (!userId) return null;

  const [rewardData, salonRes, profileRes, tiersRes, settingsRes, vouchers, history] =
    await Promise.all([
      getSalonRewardData(userId, salonId),
      supabase.from('salons').select(SALON_EMBED).eq('id', salonId).maybeSingle(),
      supabase
        .from('loyalty_profiles')
        .select('lifetime_points, total_visits, last_visit_at')
        .eq('user_id', userId)
        .eq('salon_id', salonId)
        .maybeSingle(),
      supabase
        .from('loyalty_tiers')
        .select('slug, min_lifetime_points')
        .eq('salon_id', salonId)
        .eq('active', true),
      supabase
        .from('loyalty_settings')
        .select('enabled')
        .eq('salon_id', salonId)
        .maybeSingle(),
      getSalonRewardVouchers(userId, salonId),
      getSalonPointHistory(userId, salonId, 0),
    ]);

  const salonRow = salonRes.data as SalonRow | null;
  if (!salonRow) return null;

  const enrolled = rewardData.enrolled;
  const lifetime = (profileRes.data?.lifetime_points as number | null) ?? 0;
  const thresholds = thresholdsFromTiers(
    (tiersRes.data as { slug: string | null; min_lifetime_points: number | null }[]) ??
      null,
  );

  return {
    salon: toMeta(salonRow),
    hasProgram: enrolled || Boolean(settingsRes.data?.enabled),
    enrolled,
    currentPoints: rewardData.currentPoints,
    lifetimePoints: lifetime,
    totalVisits: (profileRes.data?.total_visits as number | null) ?? 0,
    lastVisitAt: (profileRes.data?.last_visit_at as string | null) ?? null,
    progress: enrolled ? computeSalonTierProgress(lifetime, thresholds) : null,
    rewards: rewardData.rewards,
    vouchers,
    history: history.rows,
    historyHasMore: history.hasMore,
  };
}

/**
 * Redeem a salon reward: spend points and mint a voucher. Wraps the SECURITY
 * DEFINER `redeem_reward_voucher(p_user_id, p_salon_id, p_reward_id)`, which
 * atomically validates tier/balance/stock/per-user limits, debits points and
 * returns the voucher code. Points are per-salon, so a redemption only ever
 * touches this salon's balance.
 *
 * NOTE: the plain `redeem_reward(user, reward)` name is hijacked in a later
 * migration onto an orphaned table — always call `redeem_reward_voucher`.
 */
export async function redeemSalonReward(
  userId: string,
  salonId: string,
  rewardId: string,
): Promise<RedeemResult> {
  if (!userId) return { ok: false, error: 'Trebuie să fii autentificat.' };

  const { data, error } = await supabase.rpc('redeem_reward_voucher', {
    p_user_id: userId,
    p_salon_id: salonId,
    p_reward_id: rewardId,
  });
  if (error) return { ok: false, error: error.message };

  const r = (data ?? {}) as Record<string, unknown>;
  if (!r.success) {
    return { ok: false, error: (r.message as string) ?? 'Revendicarea nu a reușit.' };
  }

  return {
    ok: true,
    code: String(r.voucher_code ?? ''),
    rewardName: String(r.reward_name ?? 'Recompensă'),
    pointsSpent: Number(r.points_spent ?? 0),
    newBalance: Number(r.new_balance ?? 0),
    expiresAt: (r.expires_at as string | null) ?? null,
  };
}
