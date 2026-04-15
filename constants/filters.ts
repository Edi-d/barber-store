// constants/filters.ts
import type {
  DistanceOption,
  RatingOption,
  AvailabilityOption,
  SortOption,
} from '@/types/filters';

export interface OptionItem<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

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
  { value: { kind: 'date', date: '' }, label: 'Altă dată', disabled: true },
];

export const SORT_OPTIONS: OptionItem<SortOption>[] = [
  { value: 'recommended', label: 'Recomandate' },
  { value: 'nearest', label: 'Cel mai apropiat' },
  { value: 'cheapest', label: 'Cel mai ieftin' },
  { value: 'rating', label: 'Rating' },
];

export interface AmenityItem {
  key: string;
  label: string;
}

export const AMENITY_OPTIONS: AmenityItem[] = [
  { key: 'parcare', label: 'Parcare' },
  { key: 'wifi', label: 'Wifi' },
  { key: 'card', label: 'Plată card' },
  { key: 'accesibil', label: 'Accesibil' },
  { key: 'rezervare_online', label: 'Rezervare online' },
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
