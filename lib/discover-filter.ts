// lib/discover-filter.ts
import type { SalonWithDistance } from '@/lib/discover';
import type { BarberService } from '@/types/database';
import type { DiscoverFilters, SortOption } from '@/types/filters';

export interface FilterContext {
  /** Services per salon_id — used for the "services" filter. */
  servicesBySalonId: Map<string, BarberService[]>;
  /** Availability entries per salon_id: day_of_week Set, any barber. */
  scheduleDaysBySalonId: Map<string, Set<number>>;
  /** Current JS Date — injected for determinism. */
  now: Date;
}

function matchesDistance(salon: SalonWithDistance, filters: DiscoverFilters): boolean {
  if (filters.distanceKm == null) return true;
  if (salon.distance_km == null) return false;
  return salon.distance_km <= filters.distanceKm;
}

function matchesPrice(salon: SalonWithDistance, filters: DiscoverFilters): boolean {
  const min = filters.priceMinCents;
  const max = filters.priceMaxCents;
  if (min == null && max == null) return true;
  if (salon.avg_price_cents == null) return false;
  if (min != null && salon.avg_price_cents < min) return false;
  if (max != null && salon.avg_price_cents > max) return false;
  return true;
}

function matchesRating(salon: SalonWithDistance, filters: DiscoverFilters): boolean {
  if (filters.minRating == null) return true;
  if (salon.rating_avg == null) return false;
  return salon.rating_avg >= filters.minRating;
}

function matchesAvailability(
  salon: SalonWithDistance,
  filters: DiscoverFilters,
  ctx: FilterContext
): boolean {
  const a = filters.availability;
  if (a.kind === 'any') return true;
  if (a.kind === 'now') return salon.is_available_now === true;

  const target = new Date(ctx.now);
  if (a.kind === 'today') {
    // already today
  } else if (a.kind === 'tomorrow') {
    target.setDate(target.getDate() + 1);
  } else if (a.kind === 'date') {
    const parsed = new Date(a.date);
    if (Number.isNaN(parsed.getTime())) return true; // invalid date → no-op
    target.setTime(parsed.getTime());
  }
  const dow = target.getDay();
  const days = ctx.scheduleDaysBySalonId.get(salon.id);
  if (!days) return false;
  return days.has(dow);
}

function matchesServices(
  salon: SalonWithDistance,
  filters: DiscoverFilters,
  ctx: FilterContext
): boolean {
  if (filters.services.length === 0) return true;
  const list = ctx.servicesBySalonId.get(salon.id);
  if (!list || list.length === 0) return false;
  const wanted = new Set(filters.services);
  return list.some((svc) => {
    const key = (svc.category ?? svc.name ?? '').toLowerCase();
    return wanted.has(key);
  });
}

function matchesAmenities(salon: SalonWithDistance, filters: DiscoverFilters): boolean {
  if (filters.amenities.length === 0) return true;
  const have = new Set((salon.amenities ?? []).map((a) => a.toLowerCase()));
  return filters.amenities.every((a) => have.has(a.toLowerCase()));
}

// ─── Sort comparators ────────────────────────────────────────────────────────

function cmpNullLast(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: 'asc' | 'desc'
): number {
  const av = a ?? null;
  const bv = b ?? null;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return dir === 'asc' ? av - bv : bv - av;
}

function sortSalons(list: SalonWithDistance[], sort: SortOption): SalonWithDistance[] {
  const arr = [...list];
  switch (sort) {
    case 'recommended':
      arr.sort((a, b) => {
        const p = Number(b.is_promoted) - Number(a.is_promoted);
        if (p !== 0) return p;
        const r = cmpNullLast(b.rating_avg, a.rating_avg, 'asc');
        if (r !== 0) return r;
        return cmpNullLast(a.distance_km, b.distance_km, 'asc');
      });
      break;
    case 'nearest':
      arr.sort((a, b) => cmpNullLast(a.distance_km, b.distance_km, 'asc'));
      break;
    case 'cheapest':
      arr.sort((a, b) => cmpNullLast(a.avg_price_cents, b.avg_price_cents, 'asc'));
      break;
    case 'rating':
      arr.sort((a, b) => {
        const r = cmpNullLast(b.rating_avg, a.rating_avg, 'asc');
        if (r !== 0) return r;
        return cmpNullLast(b.reviews_count, a.reviews_count, 'asc');
      });
      break;
  }
  return arr;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function applyFilters(
  salons: SalonWithDistance[],
  filters: DiscoverFilters,
  ctx: FilterContext
): SalonWithDistance[] {
  const filtered = salons.filter(
    (s) =>
      matchesDistance(s, filters) &&
      matchesPrice(s, filters) &&
      matchesRating(s, filters) &&
      matchesAvailability(s, filters, ctx) &&
      matchesServices(s, filters, ctx) &&
      matchesAmenities(s, filters)
  );
  return sortSalons(filtered, filters.sort);
}
