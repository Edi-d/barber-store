/**
 * Per-salon rank ladder for the customer loyalty cards + detail. A salon's rank
 * is derived from `loyalty_profiles.lifetime_points` against
 * `loyalty_tiers.min_lifetime_points`. Real salons rarely seed custom tiers, so
 * we fall back to the loyalty engine's default thresholds (the same values
 * hardcoded in `earn_appointment_points`): Rookie 0 / Pro 5000 / Elite 15000 /
 * Icon 35000.
 *
 * NOTE: band-relative progress (current → next tier), NOT absolute-from-zero.
 * Points are per-salon and non-transferable — nothing here aggregates salons.
 *
 * Ported from the web app's `lib/loyalty/salon-tiers.ts`.
 */

import { TIER_LABELS, type TierSlug, type TierProgressBar } from './types';

/** Tier order, lowest → highest. Mirrors the DB slug enum. */
export const TIER_ORDER: TierSlug[] = ['clipper', 'blade', 'sharp', 'maestru'];

/** Default lifetime-point thresholds to reach each tier. */
export const TIER_THRESHOLDS: Record<TierSlug, number> = {
  clipper: 0,
  blade: 5000,
  sharp: 15000,
  maestru: 35000,
};

/**
 * Build a canonical-slug threshold map from a salon's `loyalty_tiers` rows,
 * falling back to the default for any tier the salon hasn't customised.
 */
export function thresholdsFromTiers(
  rows: { slug: string | null; min_lifetime_points: number | null }[] | null,
): Record<TierSlug, number> {
  if (!rows || rows.length === 0) return TIER_THRESHOLDS;
  const map = { ...TIER_THRESHOLDS };
  for (const r of rows) {
    if (r.slug && (r.slug as TierSlug) in map && r.min_lifetime_points != null) {
      map[r.slug as TierSlug] = r.min_lifetime_points;
    }
  }
  return map;
}

/** The highest tier whose threshold `lifetime` has reached. */
export function tierForLifetime(
  lifetime: number,
  thresholds: Record<TierSlug, number> = TIER_THRESHOLDS,
): TierSlug {
  let current: TierSlug = 'clipper';
  for (const slug of TIER_ORDER) {
    if (lifetime >= thresholds[slug]) current = slug;
    else break;
  }
  return current;
}

/**
 * Band-relative progress from the current tier toward the next one, computed
 * from lifetime points. At the top tier `pct` is 100 and `nextLabel` is null.
 */
export function computeSalonTierProgress(
  lifetime: number,
  thresholds: Record<TierSlug, number> = TIER_THRESHOLDS,
): TierProgressBar {
  const currentTier = tierForLifetime(lifetime, thresholds);
  const idx = TIER_ORDER.indexOf(currentTier);
  const nextTier = idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;

  if (!nextTier) {
    return {
      currentTier,
      currentLabel: TIER_LABELS[currentTier],
      nextLabel: null,
      pct: 100,
      pointsToNext: null,
    };
  }

  const base = thresholds[currentTier];
  const target = thresholds[nextTier];
  const span = target - base;
  const into = lifetime - base;
  const pct =
    span > 0 ? Math.min(100, Math.max(0, Math.round((into / span) * 100))) : 0;

  return {
    currentTier,
    currentLabel: TIER_LABELS[currentTier],
    nextLabel: TIER_LABELS[nextTier],
    pct,
    pointsToNext: Math.max(0, target - lifetime),
  };
}
