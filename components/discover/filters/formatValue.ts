// components/discover/filters/formatValue.ts
import type { DiscoverFilters } from '@/types/filters';
import type { AmenityItem } from '@/constants/filters';

export function formatDistance(v: DiscoverFilters['distanceKm']): string {
  return v == null ? 'Orice' : `${v} km`;
}

export function formatPrice(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'Orice';
  if (min != null && max != null) return `${Math.round(min / 100)}–${Math.round(max / 100)} lei`;
  if (min != null) return `de la ${Math.round(min / 100)} lei`;
  return `până la ${Math.round((max ?? 0) / 100)} lei`;
}

export function formatRating(v: DiscoverFilters['minRating']): string {
  return v == null ? 'Orice' : `${v.toFixed(1)}+`;
}

export function formatAvailability(v: DiscoverFilters['availability']): string {
  switch (v.kind) {
    case 'any': return 'Orice';
    case 'now': return 'Acum';
    case 'today': return 'Azi';
    case 'tomorrow': return 'Mâine';
    case 'date': return v.date || 'Dată';
  }
}

export function formatServices(
  selected: string[],
  allLabels: Map<string, string>
): string {
  if (selected.length === 0) return 'Orice';
  if (selected.length === 1) return allLabels.get(selected[0]) ?? selected[0];
  return `${selected.length} selectate`;
}

export function formatAmenities(selected: string[], options: AmenityItem[]): string {
  if (selected.length === 0) return 'Orice';
  if (selected.length === 1) {
    const found = options.find((o) => o.key === selected[0]);
    return found?.label ?? selected[0];
  }
  return `${selected.length} selectate`;
}

export function formatSort(v: DiscoverFilters['sort']): string {
  switch (v) {
    case 'recommended': return 'Recomandate';
    case 'nearest': return 'Cel mai apropiat';
    case 'cheapest': return 'Cel mai ieftin';
    case 'rating': return 'Rating';
  }
}
