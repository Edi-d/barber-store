# Discover Filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Înlocuiește butonul placeholder "options" din tab-ul Programări cu un bottom sheet funcțional de filtre (7 dimensiuni, layout accordion, aplicare on-submit).

**Architecture:** `FiltersSheet` (Gorhom BottomSheet) afișează 7 `AccordionRow` care împachetează controale presentational (`ChipGroup`, `PriceRangeSlider`). State-ul sheet-ului e ținut local ca `draft` până la submit. Un hook `useDiscoverFilters` ține filtrele aplicate și le oferă towards `discover.tsx`, unde o funcție pură `applyFilters` produce lista finală de saloane.

**Tech Stack:** React Native + Expo, TypeScript, @gorhom/bottom-sheet v5, react-native-reanimated, @expo/vector-icons, NativeWind, @tanstack/react-query, Supabase.

**Implementation lead:** Agent principal coordonează. Execuția folosește volt specialized subagents (`voltagent-core-dev:frontend-developer` pentru UI, `voltagent-core-dev:fullstack-developer` pentru hook + integrare) și `superpowers:code-reviewer` la final.

**Testing note:** Proiectul nu are Jest/Vitest configurat — nu introducem setup de test framework în acest plan. În schimb, `applyFilters` e scrisă ca funcție pură într-un fișier separat și validată manual printr-un harness TypeScript (`lib/__manual__/discover-filter.manual.ts`) care se rulează cu `npx tsx` și printează rezultate așteptate vs obținute. Validarea UI se face manual pe simulator.

---

## File Structure

### Create
| Path | Responsibility |
|---|---|
| `types/filters.ts` | Toate tipurile `DiscoverFilters` și `DEFAULT_FILTERS`. |
| `constants/filters.ts` | Opțiuni statice (amenities, distance, rating, availability, sort labels). |
| `lib/discover-filter.ts` | Funcția pură `applyFilters(salons, filters, ctx)` + comparatori sort + `hasScheduleOnDay`. |
| `lib/__manual__/discover-filter.manual.ts` | Harness manual cu fixture-uri care printează PASS/FAIL pentru fiecare regulă. |
| `hooks/useDiscoverFilters.ts` | Hook cu `value`, `apply`, `reset`, `count`. |
| `components/discover/filters/ChipGroup.tsx` | Presentational chips squircle, single/multi select. |
| `components/discover/filters/PriceRangeSlider.tsx` | Dual-thumb slider pentru preț min/max. |
| `components/discover/filters/AccordionRow.tsx` | Rând pliabil controlled (label + value + expanded body). |
| `components/discover/FiltersSheet.tsx` | BottomSheet complet cu 7 rânduri + footer CTA. |

### Modify
| Path | Change |
|---|---|
| `app/(tabs)/discover.tsx` | Integrare: hook + sheet + re-cablare buton options + înlocuire `filterAvailableNow` ca shortcut. |

---

## Task 0: Branch setup

- [ ] **Step 1: Verify clean working state**

Run: `git status`
Expected: no unrelated uncommitted changes (aside from docs/plans folder already committed).

- [ ] **Step 2: Create feature branch**

Run: `git checkout -b feat/discover-filters-sheet`
Expected: `Switched to a new branch 'feat/discover-filters-sheet'`

---

## Task 1: Types — `types/filters.ts`

**Files:**
- Create: `types/filters.ts`

- [ ] **Step 1: Write the file**

```ts
// types/filters.ts

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
  if (f.sort !== 'recommended') n += 1;
  return n;
}

export function isDefaultFilters(f: DiscoverFilters): boolean {
  return countActiveFilters(f) === 0;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit types/filters.ts`
Expected: no errors (or only missing lib errors — types/filters.ts should be self-contained).

- [ ] **Step 3: Commit**

```bash
git add types/filters.ts
git commit -m "feat(filters): add DiscoverFilters types and defaults"
```

---

## Task 2: Constants — `constants/filters.ts`

**Files:**
- Create: `constants/filters.ts`

- [ ] **Step 1: Write the file**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add constants/filters.ts
git commit -m "feat(filters): add filter option constants and helpers"
```

---

## Task 3: Pure filter logic — `lib/discover-filter.ts`

**Files:**
- Create: `lib/discover-filter.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/discover-filter.ts
import type { SalonWithDistance } from '@/lib/discover';
import type { BarberService } from '@/types/database';
import type { DiscoverFilters, SortOption } from '@/types/filters';

export interface FilterContext {
  /** Services per salon_id — used for the "services" filter. */
  servicesBySalonId: Map<string, BarberService[]>;
  /** Availability entries per salon_id: day_of_week array, any barber. */
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

  // Determine target day-of-week
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
        const r = cmpNullLast(b.rating_avg, a.rating_avg, 'asc'); // desc via swap
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/discover-filter.ts
git commit -m "feat(filters): add pure applyFilters logic with sort comparators"
```

---

## Task 4: Manual validation harness

**Files:**
- Create: `lib/__manual__/discover-filter.manual.ts`

- [ ] **Step 1: Write the harness**

```ts
// lib/__manual__/discover-filter.manual.ts
// Run with: npx tsx lib/__manual__/discover-filter.manual.ts
import { applyFilters, type FilterContext } from '@/lib/discover-filter';
import { DEFAULT_FILTERS } from '@/types/filters';
import type { SalonWithDistance } from '@/lib/discover';
import type { BarberService } from '@/types/database';

// ─── Fixture builder ─────────────────────────────────────────────────────────

function makeSalon(over: Partial<SalonWithDistance>): SalonWithDistance {
  return {
    id: 's1',
    owner_id: null,
    name: 'Salon',
    address: null,
    city: null,
    phone: null,
    avatar_url: null,
    cover_url: null,
    bio: null,
    specialties: null,
    latitude: null,
    longitude: null,
    rating_avg: 4.0,
    reviews_count: 10,
    avg_price_cents: 5000,
    is_promoted: false,
    amenities: null,
    salon_type: 'barbershop',
    salon_types: ['barbershop'],
    active: true,
    created_at: new Date().toISOString(),
    // SalonWithDistance extras
    distance_km: 2,
    travel_time_min: null,
    is_favorite: false,
    has_happy_hour: false,
    happy_hour_discount: null,
    happy_hour_ends_at: null,
    is_available_now: false,
    price_range_label: null,
    ...over,
  };
}

function makeCtx(over: Partial<FilterContext> = {}): FilterContext {
  return {
    servicesBySalonId: new Map(),
    scheduleDaysBySalonId: new Map(),
    now: new Date('2026-04-15T10:00:00Z'),
    ...over,
  };
}

// ─── Assertions ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, got?: unknown, want?: unknown) {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`);
    if (got !== undefined) console.log('  got :', got);
    if (want !== undefined) console.log('  want:', want);
  }
}

// ─── Cases ───────────────────────────────────────────────────────────────────

(function defaultIsNoop() {
  const list = [makeSalon({ id: 'a' }), makeSalon({ id: 'b' })];
  const out = applyFilters(list, DEFAULT_FILTERS, makeCtx());
  check('default filters return all salons', out.length === 2, out.length, 2);
})();

(function distanceExcludes() {
  const list = [
    makeSalon({ id: 'near', distance_km: 2 }),
    makeSalon({ id: 'far', distance_km: 8 }),
    makeSalon({ id: 'noloc', distance_km: null }),
  ];
  const out = applyFilters(list, { ...DEFAULT_FILTERS, distanceKm: 3 }, makeCtx());
  check(
    'distance <= 3km excludes far + noloc',
    out.length === 1 && out[0].id === 'near',
    out.map((s) => s.id)
  );
})();

(function priceRange() {
  const list = [
    makeSalon({ id: 'cheap', avg_price_cents: 3000 }),
    makeSalon({ id: 'mid', avg_price_cents: 7000 }),
    makeSalon({ id: 'high', avg_price_cents: 15000 }),
    makeSalon({ id: 'unknown', avg_price_cents: null }),
  ];
  const out = applyFilters(
    list,
    { ...DEFAULT_FILTERS, priceMinCents: 5000, priceMaxCents: 10000 },
    makeCtx()
  );
  check(
    'price 50–100 keeps mid only',
    out.length === 1 && out[0].id === 'mid',
    out.map((s) => s.id)
  );
})();

(function ratingExcludes() {
  const list = [
    makeSalon({ id: 'top', rating_avg: 4.7 }),
    makeSalon({ id: 'mid', rating_avg: 4.1 }),
    makeSalon({ id: 'low', rating_avg: 3.8 }),
    makeSalon({ id: 'none', rating_avg: null }),
  ];
  const out = applyFilters(list, { ...DEFAULT_FILTERS, minRating: 4.5 }, makeCtx());
  check('rating ≥4.5 keeps top only', out.length === 1 && out[0].id === 'top', out.map((s) => s.id));
})();

(function availabilityNow() {
  const list = [
    makeSalon({ id: 'open', is_available_now: true }),
    makeSalon({ id: 'closed', is_available_now: false }),
  ];
  const out = applyFilters(
    list,
    { ...DEFAULT_FILTERS, availability: { kind: 'now' } },
    makeCtx()
  );
  check('availability now keeps open only', out.length === 1 && out[0].id === 'open');
})();

(function availabilityDay() {
  // now = Wed 2026-04-15. tomorrow = Thu (dow=4)
  const ctx = makeCtx({
    scheduleDaysBySalonId: new Map([
      ['s-thu', new Set([4])],
      ['s-mon', new Set([1])],
    ]),
  });
  const list = [makeSalon({ id: 's-thu' }), makeSalon({ id: 's-mon' })];
  const out = applyFilters(
    list,
    { ...DEFAULT_FILTERS, availability: { kind: 'tomorrow' } },
    ctx
  );
  check('tomorrow filter matches schedule day', out.length === 1 && out[0].id === 's-thu');
})();

(function servicesMatch() {
  const svc = (id: string, name: string, category: string | null): BarberService => ({
    id,
    salon_id: 's1',
    name,
    description: null,
    duration_min: 30,
    price_cents: 5000,
    currency: 'RON',
    category,
    active: true,
    created_at: '',
  });
  const ctx = makeCtx({
    servicesBySalonId: new Map([
      ['a', [svc('x', 'Tuns', 'tuns')]],
      ['b', [svc('y', 'Manichiură', 'manichiura')]],
    ]),
  });
  const list = [makeSalon({ id: 'a' }), makeSalon({ id: 'b' })];
  const out = applyFilters(list, { ...DEFAULT_FILTERS, services: ['tuns'] }, ctx);
  check('services=tuns keeps salon a', out.length === 1 && out[0].id === 'a');
})();

(function amenitiesMatch() {
  const list = [
    makeSalon({ id: 'good', amenities: ['parcare', 'wifi'] }),
    makeSalon({ id: 'bad', amenities: ['wifi'] }),
  ];
  const out = applyFilters(
    list,
    { ...DEFAULT_FILTERS, amenities: ['parcare', 'wifi'] },
    makeCtx()
  );
  check('amenities requires all present', out.length === 1 && out[0].id === 'good');
})();

(function sortCheapest() {
  const list = [
    makeSalon({ id: 'b', avg_price_cents: 8000 }),
    makeSalon({ id: 'a', avg_price_cents: 3000 }),
    makeSalon({ id: 'c', avg_price_cents: 12000 }),
  ];
  const out = applyFilters(list, { ...DEFAULT_FILTERS, sort: 'cheapest' }, makeCtx());
  check(
    'sort=cheapest orders ascending',
    out.map((s) => s.id).join(',') === 'a,b,c',
    out.map((s) => s.id).join(',')
  );
})();

(function combo() {
  const list = [
    makeSalon({ id: 'ok', distance_km: 2, rating_avg: 4.6 }),
    makeSalon({ id: 'far', distance_km: 8, rating_avg: 4.9 }),
    makeSalon({ id: 'low', distance_km: 1, rating_avg: 4.1 }),
  ];
  const out = applyFilters(
    list,
    { ...DEFAULT_FILTERS, distanceKm: 3, minRating: 4.5, sort: 'nearest' },
    makeCtx()
  );
  check('combo distance+rating+sort', out.length === 1 && out[0].id === 'ok');
})();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run harness**

Run: `npx tsx lib/__manual__/discover-filter.manual.ts`
Expected: `10 passed, 0 failed`. If any FAIL, fix logic in `lib/discover-filter.ts` and re-run.

- [ ] **Step 3: Commit**

```bash
git add lib/__manual__/discover-filter.manual.ts
git commit -m "chore(filters): add manual validation harness for applyFilters"
```

---

## Task 5: `useDiscoverFilters` hook

**Files:**
- Create: `hooks/useDiscoverFilters.ts`

- [ ] **Step 1: Write the hook**

```ts
// hooks/useDiscoverFilters.ts
import { useCallback, useState } from 'react';
import {
  DEFAULT_FILTERS,
  type DiscoverFilters,
  countActiveFilters,
} from '@/types/filters';

export interface UseDiscoverFiltersResult {
  filters: DiscoverFilters;
  apply: (next: DiscoverFilters) => void;
  reset: () => void;
  count: number;
}

export function useDiscoverFilters(): UseDiscoverFiltersResult {
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);

  const apply = useCallback((next: DiscoverFilters) => {
    setFilters(next);
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return {
    filters,
    apply,
    reset,
    count: countActiveFilters(filters),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useDiscoverFilters.ts
git commit -m "feat(filters): add useDiscoverFilters state hook"
```

---

## Task 6: `ChipGroup` presentational component

**Files:**
- Create: `components/discover/filters/ChipGroup.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/discover/filters/ChipGroup.tsx
import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Colors, FontFamily, Bubble } from '@/constants/theme';

export interface ChipGroupItem<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SingleProps<T> {
  mode: 'single';
  items: ChipGroupItem<T>[];
  selected: T;
  onChange: (value: T) => void;
  isEqual?: (a: T, b: T) => boolean;
}

interface MultiProps<T> {
  mode: 'multi';
  items: ChipGroupItem<T>[];
  selected: T[];
  onChange: (value: T[]) => void;
  isEqual?: (a: T, b: T) => boolean;
}

type Props<T> = SingleProps<T> | MultiProps<T>;

function defaultEq<T>(a: T, b: T): boolean {
  return a === b;
}

export function ChipGroup<T>(props: Props<T>) {
  const eq = props.isEqual ?? defaultEq;

  const isActive = (v: T): boolean => {
    if (props.mode === 'single') return eq(props.selected, v);
    return props.selected.some((s) => eq(s, v));
  };

  const handlePress = (v: T) => {
    if (props.mode === 'single') {
      props.onChange(v);
      return;
    }
    const exists = props.selected.some((s) => eq(s, v));
    const next = exists ? props.selected.filter((s) => !eq(s, v)) : [...props.selected, v];
    props.onChange(next);
  };

  return (
    <View style={styles.row}>
      {props.items.map((item, idx) => {
        const active = isActive(item.value);
        const disabled = item.disabled === true;
        return (
          <Pressable
            key={idx}
            onPress={() => !disabled && handlePress(item.value)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              !active && styles.chipInactive,
              disabled && styles.chipDisabled,
              pressed && !disabled && styles.chipPressed,
            ]}
          >
            <Text
              style={[
                styles.label,
                active ? styles.labelActive : styles.labelInactive,
                disabled && styles.labelDisabled,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
    ...Bubble.radiiSm,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipInactive: {
    backgroundColor: Colors.white,
    borderColor: Colors.inputBorder,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipPressed: {
    opacity: 0.8,
  },
  label: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
  },
  labelActive: {
    color: Colors.white,
    fontFamily: FontFamily.semiBold,
  },
  labelInactive: {
    color: Colors.text,
  },
  labelDisabled: {
    color: Colors.textTertiary,
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/discover/filters/ChipGroup.tsx
git commit -m "feat(filters): add squircle ChipGroup component"
```

---

## Task 7: `PriceRangeSlider` component

**Files:**
- Create: `components/discover/filters/PriceRangeSlider.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/discover/filters/PriceRangeSlider.tsx
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { Colors, FontFamily } from '@/constants/theme';

interface Props {
  /** Current range in LEI (not cents). */
  minLei: number | null;
  maxLei: number | null;
  boundsMinLei: number;
  boundsMaxLei: number;
  stepLei: number;
  onChange: (next: { minLei: number | null; maxLei: number | null }) => void;
}

const KNOB = 22;
const TRACK_HEIGHT = 4;

export function PriceRangeSlider({
  minLei,
  maxLei,
  boundsMinLei,
  boundsMaxLei,
  stepLei,
  onChange,
}: Props) {
  const [width, setWidth] = React.useState(0);
  const leftPct = useSharedValue(toPct(minLei ?? boundsMinLei, boundsMinLei, boundsMaxLei));
  const rightPct = useSharedValue(toPct(maxLei ?? boundsMaxLei, boundsMinLei, boundsMaxLei));
  const leftStart = useSharedValue(leftPct.value);
  const rightStart = useSharedValue(rightPct.value);

  // Keep shared values in sync when props change (ex: reset)
  React.useEffect(() => {
    leftPct.value = withTiming(toPct(minLei ?? boundsMinLei, boundsMinLei, boundsMaxLei), {
      duration: 150,
    });
    rightPct.value = withTiming(toPct(maxLei ?? boundsMaxLei, boundsMinLei, boundsMaxLei), {
      duration: 150,
    });
  }, [minLei, maxLei, boundsMinLei, boundsMaxLei, leftPct, rightPct]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const emit = useCallback(
    (lp: number, rp: number) => {
      const lVal = snap(fromPct(lp, boundsMinLei, boundsMaxLei), stepLei);
      const rVal = snap(fromPct(rp, boundsMinLei, boundsMaxLei), stepLei);
      const minOut = lVal === boundsMinLei ? null : lVal;
      const maxOut = rVal === boundsMaxLei ? null : rVal;
      onChange({ minLei: minOut, maxLei: maxOut });
    },
    [boundsMinLei, boundsMaxLei, stepLei, onChange]
  );

  const makeKnobGesture = (isLeft: boolean) =>
    Gesture.Pan()
      .onBegin(() => {
        leftStart.value = leftPct.value;
        rightStart.value = rightPct.value;
      })
      .onUpdate((e) => {
        if (width === 0) return;
        const delta = e.translationX / width;
        if (isLeft) {
          const next = Math.max(0, Math.min(rightPct.value - 0.05, leftStart.value + delta));
          leftPct.value = next;
        } else {
          const next = Math.min(1, Math.max(leftPct.value + 0.05, rightStart.value + delta));
          rightPct.value = next;
        }
      })
      .onEnd(() => {
        runOnJS(emit)(leftPct.value, rightPct.value);
      });

  const leftGesture = makeKnobGesture(true);
  const rightGesture = makeKnobGesture(false);

  const leftStyle = useAnimatedStyle(() => ({
    left: `${leftPct.value * 100}%`,
  }));
  const rightStyle = useAnimatedStyle(() => ({
    left: `${rightPct.value * 100}%`,
  }));
  const fillStyle = useAnimatedStyle(() => ({
    left: `${leftPct.value * 100}%`,
    right: `${(1 - rightPct.value) * 100}%`,
  }));

  const currentMin = snap(fromPct(leftPct.value, boundsMinLei, boundsMaxLei), stepLei);
  const currentMax = snap(fromPct(rightPct.value, boundsMinLei, boundsMaxLei), stepLei);

  return (
    <View>
      <View style={styles.track} onLayout={onLayout}>
        <Animated.View style={[styles.fill, fillStyle]} />
        <GestureDetector gesture={leftGesture}>
          <Animated.View style={[styles.knob, leftStyle]} />
        </GestureDetector>
        <GestureDetector gesture={rightGesture}>
          <Animated.View style={[styles.knob, rightStyle]} />
        </GestureDetector>
      </View>
      <View style={styles.labelsRow}>
        <Text style={styles.labelText}>{currentMin} lei</Text>
        <Text style={styles.labelText}>{currentMax} lei</Text>
      </View>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toPct(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function fromPct(pct: number, min: number, max: number): number {
  return min + pct * (max - min);
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  track: {
    height: KNOB,
    justifyContent: 'center',
    marginHorizontal: KNOB / 2,
    marginTop: 6,
  },
  fill: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    backgroundColor: Colors.primary,
    borderRadius: TRACK_HEIGHT / 2,
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    marginLeft: -KNOB / 2,
    borderRadius: KNOB / 2,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  labelText: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: Colors.textSecondary,
  },
});
```

Note: the track's empty state is rendered by absolutely-positioned knobs — we skip a separate track line for simplicity (fill is visible on whole range when no filter is set because knobs are at extremes and `fillStyle` spans full).

- [ ] **Step 2: Add a background track line**

Edit `components/discover/filters/PriceRangeSlider.tsx`, inside the `track` View, add a background rect BEFORE `fill`:

```tsx
<View style={styles.track} onLayout={onLayout}>
  <View style={styles.trackBg} />
  <Animated.View style={[styles.fill, fillStyle]} />
  <GestureDetector gesture={leftGesture}>
    <Animated.View style={[styles.knob, leftStyle]} />
  </GestureDetector>
  <GestureDetector gesture={rightGesture}>
    <Animated.View style={[styles.knob, rightStyle]} />
  </GestureDetector>
</View>
```

And add style:

```ts
trackBg: {
  position: 'absolute',
  left: 0,
  right: 0,
  height: TRACK_HEIGHT,
  backgroundColor: Colors.inputBorder,
  borderRadius: TRACK_HEIGHT / 2,
},
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/discover/filters/PriceRangeSlider.tsx
git commit -m "feat(filters): add dual-thumb PriceRangeSlider component"
```

---

## Task 8: `AccordionRow` component

**Files:**
- Create: `components/discover/filters/AccordionRow.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/discover/filters/AccordionRow.tsx
import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors, FontFamily, Spacing } from '@/constants/theme';

interface Props {
  label: string;
  value: string;
  isSet: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const SPRING = { damping: 22, stiffness: 220, mass: 0.8 };

export function AccordionRow({ label, value, isSet, expanded, onToggle, children }: Props) {
  const caretRot = useSharedValue(expanded ? 90 : 0);
  const bodyOpacity = useSharedValue(expanded ? 1 : 0);

  React.useEffect(() => {
    caretRot.value = withSpring(expanded ? 90 : 0, SPRING);
    bodyOpacity.value = withTiming(expanded ? 1 : 0, { duration: 180 });
  }, [expanded, caretRot, bodyOpacity]);

  const caretStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${caretRot.value}deg` }],
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: bodyOpacity.value,
  }));

  return (
    <View>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <Text style={styles.label}>{label}</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.value, isSet && styles.valueSet]}>{value}</Text>
          <Animated.View style={caretStyle}>
            <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
          </Animated.View>
        </View>
      </Pressable>
      {expanded && (
        <Animated.View style={[styles.body, bodyStyle]}>{children}</Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  headerPressed: {
    backgroundColor: Colors.background,
  },
  label: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: Colors.text,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: Colors.textTertiary,
  },
  valueSet: {
    color: Colors.primary,
    fontFamily: FontFamily.semiBold,
  },
  body: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/discover/filters/AccordionRow.tsx
git commit -m "feat(filters): add AccordionRow component with chevron animation"
```

---

## Task 9: Value formatter helpers

**Files:**
- Create: `components/discover/filters/formatValue.ts`

- [ ] **Step 1: Write helpers**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/discover/filters/formatValue.ts
git commit -m "feat(filters): add value formatters for accordion rows"
```

---

## Task 10: `FiltersSheet` — main component

**Files:**
- Create: `components/discover/FiltersSheet.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/discover/FiltersSheet.tsx
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { Colors, FontFamily, Spacing, Bubble } from '@/constants/theme';
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  isDefaultFilters,
  type DiscoverFilters,
} from '@/types/filters';
import {
  DISTANCE_OPTIONS,
  RATING_OPTIONS,
  AVAILABILITY_OPTIONS,
  SORT_OPTIONS,
  AMENITY_OPTIONS,
  PRICE_RANGE_MIN_LEI,
  PRICE_RANGE_MAX_LEI,
  PRICE_RANGE_STEP_LEI,
  availabilityKey,
  type AmenityItem,
} from '@/constants/filters';
import { ChipGroup } from './filters/ChipGroup';
import { AccordionRow } from './filters/AccordionRow';
import { PriceRangeSlider } from './filters/PriceRangeSlider';
import {
  formatDistance,
  formatPrice,
  formatRating,
  formatAvailability,
  formatServices,
  formatAmenities,
  formatSort,
} from './filters/formatValue';

export interface FiltersSheetHandle {
  open: () => void;
  close: () => void;
}

export interface ServiceOption {
  key: string;
  label: string;
}

interface Props {
  value: DiscoverFilters;
  onApply: (next: DiscoverFilters) => void;
  /** Services loaded from DB. Empty = "no services available" state. */
  serviceOptions: ServiceOption[];
  /** Live preview count computed by parent on the current draft. */
  previewCount: number;
  /** Called on every draft change — parent recalculates previewCount. */
  onDraftChange?: (draft: DiscoverFilters) => void;
}

type RowKey =
  | 'distance'
  | 'price'
  | 'rating'
  | 'availability'
  | 'services'
  | 'amenities'
  | 'sort';

export const FiltersSheet = forwardRef<FiltersSheetHandle, Props>(function FiltersSheet(
  { value, onApply, serviceOptions, previewCount, onDraftChange },
  ref
) {
  const sheetRef = useRef<BottomSheet>(null);
  const [draft, setDraft] = useState<DiscoverFilters>(value);
  const [expanded, setExpanded] = useState<RowKey | null>('distance');

  // Sync draft from props when sheet re-opens
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Let parent know draft changed so it can recompute previewCount
  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setDraft(value); // reset draft to currently-applied filters
        setExpanded('distance');
        sheetRef.current?.expand();
      },
      close: () => sheetRef.current?.close(),
    }),
    [value]
  );

  const snapPoints = useMemo(() => ['85%'], []);

  const handleToggle = useCallback((key: RowKey) => {
    setExpanded((curr) => (curr === key ? null : key));
  }, []);

  const handleReset = useCallback(() => {
    setDraft(DEFAULT_FILTERS);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSubmit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onApply(draft);
    sheetRef.current?.close();
  }, [draft, onApply]);

  const resetDisabled = isDefaultFilters(draft);
  const activeCount = countActiveFilters(draft);

  const serviceLabelMap = useMemo(
    () => new Map(serviceOptions.map((s) => [s.key, s.label])),
    [serviceOptions]
  );

  const renderBackdrop = useCallback(
    (p: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...p}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Filtre</Text>
        <Pressable
          onPress={handleReset}
          disabled={resetDisabled}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.resetText, resetDisabled && styles.resetDisabled]}>
            Resetează
          </Text>
        </Pressable>
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.body}>
        {/* Distanță */}
        <AccordionRow
          label="Distanță"
          value={formatDistance(draft.distanceKm)}
          isSet={draft.distanceKm != null}
          expanded={expanded === 'distance'}
          onToggle={() => handleToggle('distance')}
        >
          <ChipGroup
            mode="single"
            items={DISTANCE_OPTIONS}
            selected={draft.distanceKm}
            onChange={(v) => setDraft({ ...draft, distanceKm: v })}
          />
        </AccordionRow>

        {/* Preț */}
        <AccordionRow
          label="Preț"
          value={formatPrice(draft.priceMinCents, draft.priceMaxCents)}
          isSet={draft.priceMinCents != null || draft.priceMaxCents != null}
          expanded={expanded === 'price'}
          onToggle={() => handleToggle('price')}
        >
          <PriceRangeSlider
            minLei={draft.priceMinCents != null ? draft.priceMinCents / 100 : null}
            maxLei={draft.priceMaxCents != null ? draft.priceMaxCents / 100 : null}
            boundsMinLei={PRICE_RANGE_MIN_LEI}
            boundsMaxLei={PRICE_RANGE_MAX_LEI}
            stepLei={PRICE_RANGE_STEP_LEI}
            onChange={({ minLei, maxLei }) =>
              setDraft({
                ...draft,
                priceMinCents: minLei == null ? null : minLei * 100,
                priceMaxCents: maxLei == null ? null : maxLei * 100,
              })
            }
          />
        </AccordionRow>

        {/* Rating */}
        <AccordionRow
          label="Rating"
          value={formatRating(draft.minRating)}
          isSet={draft.minRating != null}
          expanded={expanded === 'rating'}
          onToggle={() => handleToggle('rating')}
        >
          <ChipGroup
            mode="single"
            items={RATING_OPTIONS}
            selected={draft.minRating}
            onChange={(v) => setDraft({ ...draft, minRating: v })}
          />
        </AccordionRow>

        {/* Disponibilitate */}
        <AccordionRow
          label="Disponibilitate"
          value={formatAvailability(draft.availability)}
          isSet={draft.availability.kind !== 'any'}
          expanded={expanded === 'availability'}
          onToggle={() => handleToggle('availability')}
        >
          <ChipGroup
            mode="single"
            items={AVAILABILITY_OPTIONS}
            selected={draft.availability}
            isEqual={(a, b) => availabilityKey(a) === availabilityKey(b)}
            onChange={(v) => setDraft({ ...draft, availability: v })}
          />
        </AccordionRow>

        {/* Servicii */}
        <AccordionRow
          label="Servicii"
          value={formatServices(draft.services, serviceLabelMap)}
          isSet={draft.services.length > 0}
          expanded={expanded === 'services'}
          onToggle={() => handleToggle('services')}
        >
          {serviceOptions.length === 0 ? (
            <Text style={styles.emptyMsg}>Nu s-au putut încărca serviciile.</Text>
          ) : (
            <ChipGroup
              mode="multi"
              items={serviceOptions.map((s) => ({ value: s.key, label: s.label }))}
              selected={draft.services}
              onChange={(v) => setDraft({ ...draft, services: v })}
            />
          )}
        </AccordionRow>

        {/* Amenities */}
        <AccordionRow
          label="Amenities"
          value={formatAmenities(draft.amenities, AMENITY_OPTIONS)}
          isSet={draft.amenities.length > 0}
          expanded={expanded === 'amenities'}
          onToggle={() => handleToggle('amenities')}
        >
          <ChipGroup
            mode="multi"
            items={AMENITY_OPTIONS.map((a: AmenityItem) => ({ value: a.key, label: a.label }))}
            selected={draft.amenities}
            onChange={(v) => setDraft({ ...draft, amenities: v })}
          />
        </AccordionRow>

        {/* Sortare */}
        <AccordionRow
          label="Sortare"
          value={formatSort(draft.sort)}
          isSet={draft.sort !== 'recommended'}
          expanded={expanded === 'sort'}
          onToggle={() => handleToggle('sort')}
        >
          <ChipGroup
            mode="single"
            items={SORT_OPTIONS}
            selected={draft.sort}
            onChange={(v) => setDraft({ ...draft, sort: v })}
          />
        </AccordionRow>
      </BottomSheetScrollView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        <Pressable onPress={handleSubmit} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
          <Text style={styles.ctaText}>
            {previewCount === 0
              ? 'Niciun rezultat'
              : `Arată ${previewCount} ${previewCount === 1 ? 'rezultat' : 'rezultate'}`}
          </Text>
          {activeCount > 0 && (
            <View style={styles.ctaBadge}>
              <Text style={styles.ctaBadgeText}>{activeCount}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: Colors.white,
    ...Bubble.sheetRadii,
  },
  handle: {
    backgroundColor: Colors.handleBar,
    width: 36,
    height: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    color: Colors.text,
    letterSpacing: -0.2,
  },
  resetText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: Colors.primary,
  },
  resetDisabled: {
    opacity: 0.4,
  },
  body: {
    paddingBottom: Spacing.xl,
  },
  emptyMsg: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
    backgroundColor: Colors.white,
  },
  cta: {
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...Bubble.radiiSm,
  },
  ctaText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: Colors.white,
  },
  ctaBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  ctaBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    color: Colors.white,
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/discover/FiltersSheet.tsx
git commit -m "feat(filters): add FiltersSheet main component with accordion layout"
```

---

## Task 11: Integrate in `discover.tsx` — step A: hook + schedule map

**Files:**
- Modify: `app/(tabs)/discover.tsx`

- [ ] **Step 1: Add imports**

Open `app/(tabs)/discover.tsx`. Near the top of the import block, add:

```ts
import { useDiscoverFilters } from '@/hooks/useDiscoverFilters';
import { applyFilters, type FilterContext } from '@/lib/discover-filter';
import type { DiscoverFilters } from '@/types/filters';
import { FiltersSheet, type FiltersSheetHandle, type ServiceOption } from '@/components/discover/FiltersSheet';
```

- [ ] **Step 2: Instantiate hook and sheet ref**

Find `const [filterAvailableNow, setFilterAvailableNow] = useState(false);` (~line 57). Immediately below, add:

```ts
const { filters: discoverFilters, apply: applyDiscoverFilters, count: discoverFilterCount } = useDiscoverFilters();
const filtersSheetRef = useRef<FiltersSheetHandle>(null);
```

- [ ] **Step 3: Build `scheduleDaysBySalonId` map**

After `availabilityMap` useMemo (~line 248), add:

```ts
const scheduleDaysBySalonId = useMemo(() => {
  const map = new Map<string, Set<number>>();
  if (!availabilityData) return map;
  for (const a of availabilityData) {
    const salonId = a.barber?.salon_id;
    if (!salonId) continue;
    const set = map.get(salonId) ?? new Set<number>();
    set.add(a.day_of_week);
    map.set(salonId, set);
  }
  return map;
}, [availabilityData]);
```

- [ ] **Step 4: Build `servicesBySalonId` query + map**

Right after the `servicePricesData` query (~line 201), add a new query fetching full service rows. Replace the existing `servicePricesData` query body OR add a second query:

```ts
const { data: salonServicesData } = useQuery({
  queryKey: ["salon-services-full"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("barber_services")
      .select("id, salon_id, name, description, duration_min, price_cents, currency, category, active, created_at")
      .eq("active", true)
      .not("salon_id", "is", null);
    if (error) throw error;
    return data as BarberService[];
  },
  staleTime: 5 * 60 * 1000,
});

const servicesBySalonId = useMemo(() => {
  const map = new Map<string, BarberService[]>();
  if (!salonServicesData) return map;
  for (const s of salonServicesData) {
    if (!s.salon_id) continue;
    const list = map.get(s.salon_id) ?? [];
    list.push(s);
    map.set(s.salon_id, list);
  }
  return map;
}, [salonServicesData]);
```

Ensure `BarberService` is imported from `@/types/database` at the top of the file (check existing imports first).

- [ ] **Step 5: Compute unique service options for the sheet**

Below `servicesBySalonId`, add:

```ts
const serviceOptions = useMemo<ServiceOption[]>(() => {
  const seen = new Map<string, string>();
  if (!salonServicesData) return [];
  for (const s of salonServicesData) {
    const key = (s.category ?? s.name ?? '').toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) {
      // Prefer a capitalized label from name if category is missing
      const label = s.category ?? s.name ?? key;
      seen.set(key, label.charAt(0).toUpperCase() + label.slice(1));
    }
  }
  return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
}, [salonServicesData]);
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/\(tabs\)/discover.tsx
git commit -m "feat(discover): wire up filter hook, services query, schedule map"
```

---

## Task 12: Integrate in `discover.tsx` — step B: apply filters in `sortedSalons`

**Files:**
- Modify: `app/(tabs)/discover.tsx`

- [ ] **Step 1: Update `sortedSalons` useMemo**

Find `const sortedSalons = useMemo(() => { ... })` (~line 298). Replace the entire body with:

```ts
const sortedSalons = useMemo(() => {
  let filtered = [...salons];

  // Filter favorites only
  if (showFavoritesOnly) {
    filtered = filtered.filter((s) => s.is_favorite);
  }

  // Filter by category
  if (selectedCategory) {
    filtered = filtered.filter((s) => s.salon_types?.includes(selectedCategory));
  }

  // Filter by search query against our own salon data
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q) ||
        s.specialties?.some((sp) => sp.toLowerCase().includes(q)) ||
        s.bio?.toLowerCase().includes(q)
    );
  }

  // New unified filters (distance, price, rating, availability, services, amenities, sort)
  const ctx: FilterContext = {
    servicesBySalonId,
    scheduleDaysBySalonId,
    now: new Date(),
  };
  filtered = applyFilters(filtered, discoverFilters, ctx);

  return filtered;
}, [
  salons,
  searchQuery,
  selectedCategory,
  showFavoritesOnly,
  discoverFilters,
  servicesBySalonId,
  scheduleDaysBySalonId,
]);
```

Note: we removed the legacy `filterAvailableNow` branch and the final distance-sort — `applyFilters` now owns sorting.

- [ ] **Step 2: Sync legacy `filterAvailableNow` with new availability filter**

Find the `handleAvailableNowToggle` callback (~line 469). Replace:

```ts
const handleAvailableNowToggle = useCallback(() => {
  const next = !filterAvailableNow;
  setFilterAvailableNow(next);
  // keep the legacy boolean and the unified filters in sync
  applyDiscoverFilters({
    ...discoverFilters,
    availability: next ? { kind: 'now' } : { kind: 'any' },
  });
}, [filterAvailableNow, discoverFilters, applyDiscoverFilters]);
```

- [ ] **Step 3: Sync banner boolean when sheet changes availability**

After the `useDiscoverFilters` hook instantiation (Task 11 step 2), add:

```ts
useEffect(() => {
  const shouldBeOn = discoverFilters.availability.kind === 'now';
  if (shouldBeOn !== filterAvailableNow) {
    setFilterAvailableNow(shouldBeOn);
  }
}, [discoverFilters.availability, filterAvailableNow]);
```

Ensure `useEffect` is imported.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(tabs\)/discover.tsx
git commit -m "feat(discover): apply unified filters in sortedSalons and sync legacy toggle"
```

---

## Task 13: Integrate in `discover.tsx` — step C: filter button + sheet render

**Files:**
- Modify: `app/(tabs)/discover.tsx`

- [ ] **Step 1: Replace the filter button**

Find the filter button Pressable (~line 594-612). Replace the block `{/* Filter button */}` through `</Pressable>` with:

```tsx
{/* Filter button — opens FiltersSheet */}
<Pressable
  style={{
    marginLeft: 8,
    width: 36,
    height: 36,
    ...Bubble.radiiSm,
    backgroundColor: discoverFilterCount > 0 ? Colors.primary : "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  }}
  onPress={() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    filtersSheetRef.current?.open();
  }}
>
  <Ionicons
    name="options"
    size={18}
    color={discoverFilterCount > 0 ? "white" : "#64748b"}
  />
  {discoverFilterCount > 0 && (
    <View
      style={{
        position: "absolute",
        top: -4,
        right: -4,
        backgroundColor: Colors.error,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 3,
        borderWidth: 1.5,
        borderColor: Colors.white,
      }}
    >
      <Text
        style={{
          color: Colors.white,
          fontSize: 9,
          fontFamily: FontFamily.bold,
          lineHeight: 11,
        }}
      >
        {discoverFilterCount}
      </Text>
    </View>
  )}
</Pressable>
```

Ensure `Haptics`, `Colors`, `FontFamily`, `Text`, `View` are already imported. If `FontFamily` isn't imported yet, add:
```ts
import { Colors, FontFamily, Bubble } from '@/constants/theme';
```
(update the existing theme import line).

- [ ] **Step 2: Add preview count state**

Near the other filter state (Task 11 step 2 area), add:

```ts
const [filterPreviewCount, setFilterPreviewCount] = useState(0);

const handleFilterDraftChange = useCallback(
  (draft: DiscoverFilters) => {
    const ctx: FilterContext = {
      servicesBySalonId,
      scheduleDaysBySalonId,
      now: new Date(),
    };
    // Recompute against the same base pipeline (minus discoverFilters application)
    let base = [...salons];
    if (showFavoritesOnly) base = base.filter((s) => s.is_favorite);
    if (selectedCategory) base = base.filter((s) => s.salon_types?.includes(selectedCategory));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.city?.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q) ||
          s.specialties?.some((sp) => sp.toLowerCase().includes(q)) ||
          s.bio?.toLowerCase().includes(q)
      );
    }
    setFilterPreviewCount(applyFilters(base, draft, ctx).length);
  },
  [salons, searchQuery, selectedCategory, showFavoritesOnly, servicesBySalonId, scheduleDaysBySalonId]
);
```

- [ ] **Step 3: Render the sheet**

At the bottom of the return JSX of `DiscoverScreen`, just before the final closing tag of the root View / Fragment (look for the `</GestureHandlerRootView>` or equivalent — usually near the end of the file), add:

```tsx
<FiltersSheet
  ref={filtersSheetRef}
  value={discoverFilters}
  onApply={applyDiscoverFilters}
  serviceOptions={serviceOptions}
  previewCount={filterPreviewCount}
  onDraftChange={handleFilterDraftChange}
/>
```

If there's no clear root-level region (sheets in this file are already rendered inside the map overlay layout), place it at the same nesting level as the existing `BottomSheet` for the salon list.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(tabs\)/discover.tsx
git commit -m "feat(discover): render FiltersSheet and upgrade filter button with badge"
```

---

## Task 14: Manual QA on simulator

**No file changes — validation only.**

- [ ] **Step 1: Run the app**

Run: `npx expo start` (or `npm run ios` / `npm run android` depending on your setup).
Expected: app builds and opens on simulator/device.

- [ ] **Step 2: Open Programări tab**

Tap the "Programări" tab in the bottom bar.
Expected: map + search bar + options button visible, no crashes.

- [ ] **Step 3: Open filters sheet**

Tap the "options" button (right of the search bar).
Expected: bottom sheet slides up to ~85% height, showing 7 accordion rows with "Distanță" expanded by default.

- [ ] **Step 4: Exercise each row**

For each row (Distanță, Preț, Rating, Disponibilitate, Servicii, Amenities, Sortare):
1. Tap the row → previous row collapses, new row expands.
2. Select a value → row's right-side value updates, CTA text updates ("Arată X rezultate").

Expected: all interactions work, no crashes, `previewCount` reflects the selected filters.

- [ ] **Step 5: Reset**

Tap "Resetează".
Expected: all selections clear; CTA shows total results count; "Resetează" becomes disabled (opacity 0.4).

- [ ] **Step 6: Dismiss**

Swipe down on the sheet.
Expected: sheet closes; salon list is NOT re-filtered (because dismiss doesn't apply); filter button has no badge.

- [ ] **Step 7: Submit**

Re-open sheet, select `Distanță = 3km` and `Rating = 4.0+`, tap "Arată X rezultate".
Expected: sheet closes; salon list re-filters; filter button shows red badge "2" and background becomes primary blue.

- [ ] **Step 8: Cross-sync with legacy banner**

Scroll the bottom sheet list, find the "Cine e liber acum?" banner, tap it.
Expected: banner activates; re-open filters sheet; "Disponibilitate" row shows "Acum". Tap banner again → row returns to "Orice".

- [ ] **Step 9: Tab switch resets**

Navigate to another tab (e.g. Acasa), then back to Programări.
Expected: filters are reset to defaults; badge gone.

- [ ] **Step 10: Commit QA notes**

If any issues found, fix them inline and commit the fixes with descriptive messages. Otherwise:

```bash
git commit --allow-empty -m "qa: verified discover filters sheet end-to-end on simulator"
```

---

## Task 15: Code review

**No file changes — review only.**

- [ ] **Step 1: Dispatch `superpowers:code-reviewer`**

Ask the reviewer to validate:
- Every task from the plan has been implemented.
- `applyFilters` has no side-effects.
- `FiltersSheet` state doesn't leak between sessions (draft is re-init on `open()`).
- `discover.tsx` no longer double-applies `filterAvailableNow`.
- Styles use `Bubble.radiiSm` and theme tokens (no hardcoded colors beyond the small palette already in use).
- Typecheck passes: `npx tsc --noEmit`.

- [ ] **Step 2: Address feedback**

Apply any changes requested by the reviewer. Commit each fix separately with a clear message.

- [ ] **Step 3: Final typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

## Done

Branch `feat/discover-filters-sheet` contains:
- 9 new files (types, constants, logic, hook, 4 components, harness)
- 1 modified file (`discover.tsx`)
- ~14 focused commits

Next step: open PR against `main`, request human review of the visual behavior on real devices (iOS + Android), then merge.
