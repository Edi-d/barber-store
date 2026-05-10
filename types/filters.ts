// types/filters.ts
import type { SalonType } from '@/types/database';

export type DistanceOption = 1 | 3 | 5 | 10 | null; // km, null = orice

export type RatingOption = null | 4.0 | 4.5; // null = orice

export type AvailabilityOption =
  | { kind: 'any' }
  | { kind: 'now' }
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'date'; date: string }; // ISO yyyy-mm-dd — disabled în MVP

export type SortOption = 'recommended' | 'nearest' | 'cheapest' | 'rating';

export interface DiscoverFilters {
  distanceKm: DistanceOption;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  minRating: RatingOption;
  availability: AvailabilityOption;
  services: string[];
  amenities: string[];
  salonType: SalonType | null;
  sort: SortOption;
}

export const DEFAULT_FILTERS: DiscoverFilters = {
  distanceKm: null,
  priceMinCents: null,
  priceMaxCents: null,
  minRating: null,
  availability: { kind: 'any' },
  services: [],
  amenities: [],
  salonType: null,
  sort: 'recommended',
};

export function countActiveFilters(f: DiscoverFilters): number {
  let n = 0;
  if (f.distanceKm != null) n += 1;
  if (f.priceMinCents != null || f.priceMaxCents != null) n += 1;
  if (f.minRating != null) n += 1;
  if (f.availability.kind !== 'any') n += 1;
  if (f.services.length > 0) n += 1;
  if (f.amenities.length > 0) n += 1;
  if (f.salonType != null) n += 1;
  if (f.sort !== 'recommended') n += 1;
  return n;
}

export function isDefaultFilters(f: DiscoverFilters): boolean {
  return countActiveFilters(f) === 0;
}
