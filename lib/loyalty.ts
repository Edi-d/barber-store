import { supabase } from '@/lib/supabase';
import type {
  PlatformXpTransaction,
  XpLevelThreshold,
  XpVoucherTier,
} from '@/types/database';
import { computeLevelProgress, levelForLifetime, type LevelConfig } from '@/constants/loyalty';

export interface XpBalanceInfo {
  balance: number;               // current spendable XP (from latest balance_after)
  lifetime: number;              // total earned (sum of positive amounts)
  currentLevel: LevelConfig;
  nextLevel: LevelConfig | null;
  progress: number;              // 0..1 toward next level
  pointsToNext: number | null;   // null if at max level
}

/**
 * Fetch the authoritative XP balance + derived level info for a user.
 * Balance reads the most recent `balance_after` from platform_xp_transactions.
 * Lifetime sums positive amounts (earns only, excludes reverses and redemptions).
 */
export async function fetchXpBalance(userId: string): Promise<XpBalanceInfo> {
  // Latest transaction → current balance
  const { data: lastTx, error: lastErr } = await supabase
    .from('platform_xp_transactions')
    .select('balance_after')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) throw lastErr;

  // Sum of positive amounts → lifetime earned
  const { data: earns, error: earnErr } = await supabase
    .from('platform_xp_transactions')
    .select('amount')
    .eq('user_id', userId)
    .gt('amount', 0);
  if (earnErr) throw earnErr;

  const balance = lastTx?.balance_after ?? 0;
  const lifetime = (earns ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0);

  const currentLevel = levelForLifetime(lifetime);
  const { progress, pointsToNext, nextLevelConfig } = computeLevelProgress(
    lifetime,
    currentLevel.level,
  );

  return {
    balance,
    lifetime,
    currentLevel,
    nextLevel: nextLevelConfig,
    progress,
    pointsToNext,
  };
}

/** Recent transactions, newest first. */
export async function fetchRecentXpTransactions(
  userId: string,
  limit = 20,
): Promise<PlatformXpTransaction[]> {
  const { data, error } = await supabase
    .from('platform_xp_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PlatformXpTransaction[];
}

/** Static-ish config tables. Safe to cache for the session. */
export async function fetchLevelThresholds(): Promise<XpLevelThreshold[]> {
  const { data, error } = await supabase
    .from('xp_level_thresholds')
    .select('*')
    .order('level', { ascending: true });
  if (error) throw error;
  return (data ?? []) as XpLevelThreshold[];
}

export async function fetchVoucherTiers(): Promise<XpVoucherTier[]> {
  const { data, error } = await supabase
    .from('xp_voucher_tiers')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as XpVoucherTier[];
}

/**
 * Convert user points to a voucher. RPC: convert_points_to_voucher(p_user_id, p_tier_points).
 * Return value shape is determined by the RPC; caller must be lenient.
 */
export async function convertPointsToVoucher(
  userId: string,
  tierPoints: number,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('convert_points_to_voucher', {
    p_user_id: userId,
    p_tier_points: tierPoints,
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

/** Human-readable label for a transaction source type (Romanian, no diacritics). */
export function transactionSourceLabel(sourceType: string): string {
  switch (sourceType) {
    case 'appointment':         return 'Programare finalizata';
    case 'order':               return 'Comanda shop';
    case 'voucher':             return 'Voucher generat';
    case 'reverse':
    case 'reverse_appointment':
    case 'reverse_order':       return 'Stornare';
    case 'bonus':               return 'Bonus';
    case 'adjustment':          return 'Ajustare';
    default:                    return sourceType;
  }
}

export function relativeTimeLabel(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Acum';
  if (diffMin < 60) return `Acum ${diffMin} min`;
  if (diffHr < 24) return diffHr === 1 ? 'Acum o ora' : `Acum ${diffHr} ore`;
  if (diffDay === 1) return 'Ieri';
  if (diffDay < 7) return `Acum ${diffDay} zile`;
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}
