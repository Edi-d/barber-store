# Discover Filters — Design Spec

**Date:** 2026-04-15
**Status:** Draft (awaiting user review)
**Scope:** Tab-ul Programări (`app/(tabs)/discover.tsx`) — butonul "options" din search bar devine funcțional și deschide un bottom sheet de filtre.

---

## 1. Problem

Pe pagina de Programări, butonul "options" din search bar este în prezent doar un toggle duplicat pentru "Disponibil acum" ([discover.tsx:594-612](../../../app/(tabs)/discover.tsx#L594-L612)). Nu există o experiență de filtrare reală — userul nu poate restrânge saloanele după distanță, preț, rating, disponibilitate, servicii sau amenities, deși toate aceste date există deja în model ([types/database.ts:550-572](../../../types/database.ts#L550-L572)).

Vrem să înlocuim butonul-toggle cu un **bottom sheet dedicat de filtre** inspirat din Fresha și Booksy, care să expună dimensiunile de filtrare relevante și să lase harta + lista să se re-filtreze la submit.

## 2. Goals

- Butonul "options" deschide un bottom sheet structurat în **accordion**.
- 7 dimensiuni de filtrare: **Distanță, Preț, Rating, Disponibilitate, Servicii, Amenities, Sortare**.
- Stil **squircle** (`Bubble.radiiSm` = 18 / 8 / 18 / 18), fără emoji, consistent cu restul app-ului.
- Aplicare **on submit** (nu live).
- **Reset per tab** — filtrele se șterg de fiecare dată când userul deschide tab-ul Programări.
- Badge pe butonul "options" cu numărul de filtre active.

## 3. Non-goals

- Filtre pentru tip salon (`barbershop` / `coafor`) și favorite — rămân ca UI separate (chips deasupra listei), nu intră în sheet.
- Căutare text în lista de servicii (chips ajung).
- Slot-level availability ("liber la 14:00 azi") — granularitate MVP = zi.
- Date picker real pentru "Altă dată" — la MVP doar `now / today / tomorrow`; "Altă dată" apare dar e disabled cu label "În curând".
- Persistență între sesiuni (AsyncStorage) — filtrele se resetează la fiecare intrare în tab.

## 4. Architecture & Components

### Fișiere noi

| Fișier | Rol |
|---|---|
| [components/discover/FiltersSheet.tsx](../../../components/discover/FiltersSheet.tsx) | Componenta principală: `BottomSheet` (@gorhom/bottom-sheet, deja folosit în proiect). Primește `value: DiscoverFilters`, `onApply(next)`, `onDismiss()`. |
| [components/discover/filters/AccordionRow.tsx](../../../components/discover/filters/AccordionRow.tsx) | Rând pliabil reutilizabil: `label` stânga, `value` dreapta, expand body. Controlled — un singur rând expandat la un moment dat. |
| [components/discover/filters/ChipGroup.tsx](../../../components/discover/filters/ChipGroup.tsx) | Grup de chip-uri squircle single-select sau multi-select (`mode: 'single' \| 'multi'`). |
| [components/discover/filters/PriceRangeSlider.tsx](../../../components/discover/filters/PriceRangeSlider.tsx) | Slider dual-thumb min/max preț. |
| [hooks/useDiscoverFilters.ts](../../../hooks/useDiscoverFilters.ts) | State hook care ține `DiscoverFilters` curent + funcții `apply(next)`, `reset()`, `count()`. Resetat la mount-ul tab-ului Programări. |
| [lib/discover-filter.ts](../../../lib/discover-filter.ts) | Funcție pură `applyFilters(salons, filters, context)` — returnează lista filtrată și sortată. Testabilă izolat. |
| [types/filters.ts](../../../types/filters.ts) | `DiscoverFilters`, `DistanceOption`, `RatingOption`, `AvailabilityOption`, `SortOption`, `DEFAULT_FILTERS`. |

### Refactor în [discover.tsx](../../../app/(tabs)/discover.tsx)

- Banner-ul legacy "Cine e liber acum?" și toggle-ul `filterAvailableNow` rămân intacte (compat cu tutorial și tutorial ref). Acționează ca **shortcut** pentru `availability: { kind: 'now' }`.
- Când userul apasă banner-ul legacy → `filterAvailableNow = true` și `useDiscoverFilters.apply({ ...filters, availability: { kind: 'now' } })`. Când apasă din nou → ambele revin la default.
- Invers, când userul setează `availability !== 'now'` din sheet → `filterAvailableNow = false` (se sincronizează).
- Sursa de adevăr pentru filtrare e `DiscoverFilters.availability`; `filterAvailableNow` e doar UI state pentru banner.
- `selectedCategory` (barbershop/coafor) și `showFavoritesOnly` rămân ca UI separate, în afara sheet-ului.
- Butonul "options" primește:
  - `onPress` → deschide `FiltersSheet`.
  - Badge cu `useDiscoverFilters().count()`.
  - Background primary când `count() > 0`, default altfel.
- Lista finală de saloane se calculează în `useMemo`: `applyFilters(salonsWithDistance, filters, { servicesBySalonId })` după ce se aplică categoria și favorites.

### Izolare și boundaries

- `applyFilters` e **pură**, fără side-effects, fără network — primește tot ce are nevoie prin params.
- `FiltersSheet` nu știe despre saloane sau API — primește doar `value` și `onApply`.
- `useDiscoverFilters` e singurul owner al state-ului activ de filtre.
- `ChipGroup`, `AccordionRow`, `PriceRangeSlider` sunt "dumb" presentational — nu au idee despre `DiscoverFilters`.

## 5. Data model

### `types/filters.ts`

```ts
export type DistanceOption = 1 | 3 | 5 | 10 | null;  // null = orice

export type RatingOption = null | 4.0 | 4.5;         // null = orice

export type AvailabilityOption =
  | { kind: 'any' }
  | { kind: 'now' }
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'date'; date: string };                  // ISO yyyy-mm-dd — disabled la MVP

export type SortOption =
  | 'recommended'   // default: is_promoted desc, rating_avg desc, distance asc
  | 'nearest'
  | 'cheapest'
  | 'rating';

export interface DiscoverFilters {
  distanceKm: DistanceOption;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  minRating: RatingOption;
  availability: AvailabilityOption;
  services: string[];    // category keys din barber_services
  amenities: string[];   // chei fixe: parcare | wifi | card | accesibil | rezervare_online
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
```

### Surse dinamice

| Filtru | Sursă |
|---|---|
| Servicii | distinct `category` din `barber_services` (fallback pe `name` dacă `category` e `null`). Cached one-time la prima deschidere. |
| Preț min/max bounds | min/max `avg_price_cents` din saloanele vizibile, clamped la 30–300 lei. |
| Amenities | listă fixă codată în `constants/filters.ts`: `parcare`, `wifi`, `card`, `accesibil`, `rezervare_online`. |

### Count filtre active

`count()` numără câmpurile diferite de `DEFAULT_FILTERS`. Reguli:
- `distanceKm != null` → +1
- `priceMinCents != null || priceMaxCents != null` → +1
- `minRating != null` → +1
- `availability.kind !== 'any'` → +1
- `services.length > 0` → +1
- `amenities.length > 0` → +1
- `sort !== 'recommended'` → +1

Max count = 7.

## 6. User flow & UX

### Deschidere
Tap pe buton "options" → `FiltersSheet` se deschide la snap `85%` din ecran. Animație spring (`damping: 22, stiffness: 220`). Haptic `Light`.

La deschidere, `draft` este inițializat cu filtrele **curent aplicate** (nu cu `DEFAULT_FILTERS`), astfel încât userul vede ce a setat înainte și poate modifica incremental.

### Navigare în sheet

**Header fix:**
- Titlu **"Filtre"** stânga (17px, bold, `Colors.text`).
- Buton **"Resetează"** dreapta (12px, `Colors.primary`, `medium`). Disabled (opacity 0.4) când nu există filtre active.

**Body scrollabil** — 7 rânduri accordion în ordinea:
1. Distanță
2. Preț
3. Rating
4. Disponibilitate
5. Servicii
6. Amenities
7. Sortare

**Reguli accordion:**
- **Un singur rând expandat la un moment dat**. Click pe alt rând colapsează rândul curent și expandează noul rând. Animație height spring.
- Rând colapsat:
  - `label` stânga (13px, semibold, `Colors.text`).
  - `value` dreapta (11px, medium, `Colors.textTertiary` default / `Colors.primary` când setat) + caret `›`.
  - Separator 1px `Colors.separator` între rânduri.
- Rând expandat: background `Colors.backgroundMuted` (#f8fafc), padding 12 vertical 20 horizontal.

**Conținut pe rând:**
| Rând | Control |
|---|---|
| Distanță | `ChipGroup` single: `1 km`, `3 km`, `5 km`, `10 km`, `Orice` |
| Preț | `PriceRangeSlider` dual-thumb + label "X lei – Y lei" |
| Rating | `ChipGroup` single: `Orice`, `4.0+`, `4.5+` |
| Disponibilitate | `ChipGroup` single: `Orice`, `Acum`, `Azi`, `Mâine`, `Altă dată (disabled)` |
| Servicii | `ChipGroup` multi: categoriile încărcate din `barber_services` |
| Amenities | `ChipGroup` multi: `Parcare`, `Wifi`, `Card`, `Accesibil`, `Rezervare online` |
| Sortare | `ChipGroup` single: `Recomandate`, `Cel mai apropiat`, `Cel mai ieftin`, `Rating` |

**Footer fix:**
- Buton CTA **"Arată X rezultate"** — squircle, background `Colors.primary`, width full, padding 13 vertical. X se calculează live pe draft state folosind `applyFilters(salons, draft, ctx).length`, dar **nu aplică** până la submit.
- Haptic `Medium` la tap.

### Acțiuni

| Acțiune | Comportament |
|---|---|
| **Schimbare chip / slider** | Update state local `draft` în sheet. CTA recalculează "Arată X rezultate" live. |
| **Tap CTA** | `onApply(draft)` → `useDiscoverFilters.apply(draft)` → sheet se închide → lista + harta se re-filtrează. |
| **Swipe down / tap backdrop** | Sheet se închide fără să apeleze `onApply`. Filtrele active rămân cele anterioare. |
| **Tap "Resetează"** | `draft = DEFAULT_FILTERS` instant. Nu se aplică până nu apeși CTA. |

### Persistență

`useDiscoverFilters` e mount la `discover.tsx`. La `unmount` (user navighează la alt tab și înapoi), hook-ul re-mount → state inițial `DEFAULT_FILTERS`. **Nu** se salvează nimic în `AsyncStorage`.

### Butonul "options" după aplicare

- Background: `Colors.primary` (#0A66C2) când `count() > 0`, `#f1f5f9` altfel.
- Icon color: `white` când activ, `#64748b` altfel.
- Badge roșu în top-right cu număr (ex: "3") când `count() > 0`. Reuse stilul de `badge` din `_layout.tsx:430-449`.

## 7. Filter logic — `applyFilters`

```ts
applyFilters(
  salons: SalonWithDistance[],
  filters: DiscoverFilters,
  context: { servicesBySalonId: Map<string, BarberService[]> }
): SalonWithDistance[]
```

### Reguli (AND între toate)

1. **Distanță** — `distanceKm != null` → păstrează `distance_km != null && distance_km <= distanceKm`. Saloanele fără locație sunt excluse.
2. **Preț** — dacă `priceMinCents != null || priceMaxCents != null` → păstrează `avg_price_cents != null && in [min?, max?]`. Saloanele fără preț sunt excluse doar când filtrul e setat.
3. **Rating** — `minRating != null` → păstrează `rating_avg != null && rating_avg >= minRating`. Saloanele fără rating sunt excluse.
4. **Disponibilitate**:
   - `any` — no-op
   - `now` — păstrează `is_available_now === true` (reutilizează field-ul deja calculat în [lib/discover.ts](../../../lib/discover.ts))
   - `today` / `tomorrow` / `date` — păstrează saloanele care au cel puțin un barber cu schedule în ziua respectivă (`hasScheduleOnDay(salon, dayOfWeek)`). MVP nu verifică slot-uri libere la granularitate de oră.
5. **Servicii** — `services.length > 0` → păstrează saloanele care au cel puțin un service match în `servicesBySalonId`.
6. **Amenities** — `amenities.length > 0` → păstrează saloanele cu `salon.amenities ⊇ filters.amenities` (toate cerute).

### Sortare (după filtrare)

| Option | Comparator |
|---|---|
| `recommended` | `is_promoted desc, rating_avg desc nulls last, distance_km asc nulls last` |
| `nearest` | `distance_km asc nulls last` |
| `cheapest` | `avg_price_cents asc nulls last` |
| `rating` | `rating_avg desc nulls last, reviews_count desc nulls last` |

### Integrare cu filtrele legacy

În `discover.tsx`, ordinea de aplicare:
```
salonsWithDistance
  → filter by selectedCategory (existent)
  → filter by showFavoritesOnly (existent)
  → applyFilters(…, discoverFilters, ctx)   // new — include availability + restul
  → sortedSalons
```

`filterAvailableNow` nu se mai aplică separat în `sortedSalons` — e înlocuit de `discoverFilters.availability.kind === 'now'`.

## 8. Testing

### Unit tests — [lib/__tests__/discover-filter.test.ts](../../../lib/__tests__/discover-filter.test.ts)

- `DEFAULT_FILTERS` → returnează lista neschimbată (doar resortată după `recommended`).
- Distanță: saloanele peste raza setată sunt excluse; saloanele fără `distance_km` sunt excluse.
- Preț: saloanele în afara intervalului sunt excluse; saloanele fără `avg_price_cents` sunt excluse.
- Rating: saloanele sub prag sunt excluse.
- Disponibilitate `now`: reutilizează `is_available_now`.
- Servicii: match pe category.
- Amenities: ⊇ match.
- Combinație: distanță + rating + sort `nearest`.
- `count()` — câte un caz per regulă + unul "all set" = 7.

### Component tests — [components/discover/__tests__/FiltersSheet.test.tsx](../../../components/discover/__tests__/FiltersSheet.test.tsx)

- Deschidere cu `DEFAULT_FILTERS` → toate rândurile arată "Orice".
- Tap pe rând → se expandează; tap pe alt rând → primul se colapsează.
- Reset → draft local = `DEFAULT_FILTERS`.
- Dismiss prin backdrop → `onApply` NU este apelat.
- Submit → `onApply(draft)` apelat cu state-ul curent.
- Buton "Resetează" disabled când draft = default.

## 9. Error handling

- Saloane fără `avg_price_cents` / `rating_avg` / `distance_km` → excluse doar când filtrul e setat. Comportament documentat în test.
- Fetch servicii eșuează → sheet se deschide; rândul "Servicii" arată mesaj "Nu s-au putut încărca serviciile". Restul rândurilor rămân funcționale.
- `applyFilters` nu aruncă niciodată — dacă primește date invalide, le sare (defensive).
- Fără side-effects I/O în `applyFilters`.

## 10. Implementation plan (high-level)

Implementarea va fi condusă de agentul principal ca **lead**, folosind **volt specialized subagents** pentru execuție:
- `voltagent-core-dev:frontend-developer` — componente UI (`FiltersSheet`, `AccordionRow`, `ChipGroup`, `PriceRangeSlider`).
- `voltagent-core-dev:fullstack-developer` — hook `useDiscoverFilters` + `applyFilters` + integrare în `discover.tsx`.
- `superpowers:code-reviewer` — review la fiecare milestone major.

Task breakdown detaliat se va face în planul de implementare (writing-plans).

## 11. Open questions

Niciuna neaddresată — toate deciziile au fost confirmate în brainstorming:
- ✅ Dimensiuni filtre: 7 (Distanță, Preț, Rating, Disponibilitate, Servicii, Amenities, Sortare)
- ✅ Layout: Bottom sheet
- ✅ Structură interioară: Accordion rows (1 expandat la un moment dat)
- ✅ Aplicare: On submit (nu live)
- ✅ Persistență: Reset per tab
- ✅ Stil: Squircle `Bubble.radiiSm`, fără emoji
- ✅ Implementare: Volt subagents, lead = agent principal
