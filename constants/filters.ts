// constants/filters.ts
import type {
  DistanceOption,
  RatingOption,
  AvailabilityOption,
  SortOption,
} from '@/types/filters';
import type { SalonType } from '@/types/database';

export interface OptionItem<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

// Single source of truth for salon type labels — matches the categories the
// barber (owner) app and web app let a salon be tagged with.
export const SALON_TYPE_LABELS: Record<SalonType, string> = {
  barbershop: 'Barbershop',
  coafor: 'Coafor',
  manichiura: 'Manichiură',
  masaj: 'Masaj',
  beauty: 'Beauty',
};

export const SALON_TYPE_OPTIONS: { value: SalonType | null; label: string }[] = [
  { value: null, label: 'Toate' },
  { value: 'barbershop', label: SALON_TYPE_LABELS.barbershop },
  { value: 'coafor', label: SALON_TYPE_LABELS.coafor },
  { value: 'manichiura', label: SALON_TYPE_LABELS.manichiura },
  { value: 'masaj', label: SALON_TYPE_LABELS.masaj },
  { value: 'beauty', label: SALON_TYPE_LABELS.beauty },
];

export const DISTANCE_OPTIONS: OptionItem<DistanceOption>[] = [
  { value: 1, label: '1 km' },
  { value: 3, label: '3 km' },
  { value: 5, label: '5 km' },
  { value: 10, label: '10 km' },
  { value: null, label: 'Orice' },
];

export const RATING_OPTIONS: OptionItem<RatingOption>[] = [
  { value: null, label: 'Orice' },
  { value: 4.0, label: '4.0+' },
  { value: 4.5, label: '4.5+' },
];

export const AVAILABILITY_OPTIONS: OptionItem<AvailabilityOption>[] = [
  { value: { kind: 'any' }, label: 'Orice' },
  { value: { kind: 'now' }, label: 'Acum' },
  { value: { kind: 'today' }, label: 'Azi' },
  { value: { kind: 'tomorrow' }, label: 'Mâine' },
  { value: { kind: 'date', date: '' }, label: 'Alege data', disabled: true },
];

export const SORT_OPTIONS: OptionItem<SortOption>[] = [
  { value: 'recommended', label: 'Recomandate' },
  { value: 'nearest', label: 'Apropiere' },
  { value: 'cheapest', label: 'Preț' },
  { value: 'rating', label: 'Rating' },
];

export interface AmenityItem {
  key: string;
  label: string;
}

export const AMENITY_OPTIONS: AmenityItem[] = [
  { key: 'wifi', label: 'WiFi' },
  { key: 'parcare', label: 'Parcare' },
  { key: 'cafea', label: 'Cafea' },
  { key: 'ac', label: 'Aer condiționat' },
  { key: 'muzica', label: 'Muzică' },
  { key: 'tv', label: 'TV' },
  { key: 'card_bancar', label: 'Card bancar' },
  { key: 'programare_online', label: 'Programare online' },
];

// Bounds pentru slider preț (în lei, nu cenți, pt display).
export const PRICE_RANGE_MIN_LEI = 30;
export const PRICE_RANGE_MAX_LEI = 300;
export const PRICE_RANGE_STEP_LEI = 10;

// Helpers
export function availabilityKey(a: AvailabilityOption): string {
  if (a.kind === 'date') return `date:${a.date}`;
  return a.kind;
}
