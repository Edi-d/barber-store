# CategoryPickerModal — "Toate saloanele" third option

## Problem

The initial-load `CategoryPickerModal` (shown on app open) forces the user to pick **Barbershop** or **Coafor**, with only an X in the corner as a skip path. The X feels dismissive and many users X-close to proceed without a category filter. We want a friendlier third option that explicitly means "show me everything" and takes the user to the unfiltered discover screen.

## Goal

Add a third tappable card labeled **"Toate saloanele"** beneath Coafor. Tapping it closes the modal with `selectedCategory = null` (same terminal state as X-close), so the discover screen behaves exactly as it does today when the user X-dismisses.

## Scope

- **In scope:** `components/discover/CategoryPickerModal.tsx`, the call-site in `app/(tabs)/discover.tsx:1386-1394` if its prop signature needs to change.
- **Out of scope:** re-entry path after the picker is closed; TryOn CTA fallback behavior ([discover.tsx:972](../../app/(tabs)/discover.tsx#L972)) that silently defaults to `"barbershop"`; analytics (no analytics layer exists); persistence of choice (no persistence layer exists). These are acknowledged follow-ups, not part of this change.

## UX Specification

### Copy

- Label: **"Toate saloanele"**
- Subtitle: **"Barbershop-uri, coafoare & tot ce e între"**

### Layout

A half-height pill card (squircle via `Bubble.radiiSm`) sitting below the two hero cards. Single row: glyph on the left, title + subtitle stacked in the middle, no chevron. It must read as **subordinate to the two hero cards** — not a third peer.

Card anatomy:
- Shape: `...Bubble.radiiSm` (asymmetric 18/8/18/18 — the existing "squircle" pattern used on pill-size elements like `bookingBadge` and `closeButton`)
- Inner padding: `paddingVertical: Spacing.lg`, `paddingHorizontal: Spacing.xl`
- Glyph container (left): 44×44, `Bubble.radiiSm`, background `rgba(100,116,139,0.10)`, contains `<Ionicons name="apps-outline" size={22} color="#64748B" />`
- Text block (flex:1): title `Typography.bodySemiBold` `color: Colors.text`, subtitle `Typography.caption` `color: Colors.textSecondary` `numberOfLines={1}`
- No chevron, no right-side affordance

### Visual treatment

- Gradient: `['#F4F5F7', '#FAFBFC']` via `LinearGradient` (same component pattern as the two hero cards so code structure mirrors)
- Border: `borderWidth: 1`, `borderColor: 'rgba(0,0,0,0.06)'` (softer than the hero cards' `rgba(255,255,255,0.7)` white border, signaling lower weight)
- Shadow: `shadowColor: '#000'`, `shadowOpacity: 0.06`, `shadowRadius: 8`, `shadowOffset: {0, 2}`, Android `elevation: 2` (significantly lighter than the hero cards' `shadowOpacity: 0.22`)
- Pressed state: same as hero cards (`opacity: 0.9`, `scale: 0.97`) for consistency

### Haptics

`Haptics.ImpactFeedbackStyle.Light` on tap (not `Medium` like the two hero cards) — intent weight is lower, it's a "show everything" action.

### Accessibility

- `accessibilityRole="button"`
- `accessibilityLabel="Toate saloanele. Barbershop-uri, coafoare și tot ce e între"`
- `accessibilityHint="Apasă pentru a vedea toate saloanele fără filtru"`

## Technical Specification

### Prop signature change

`CategoryPickerModal.tsx` currently exposes:

```ts
onSelect: (type: SalonType) => void;
```

Widen to:

```ts
onSelect: (type: SalonType | null) => void;  // null = "Toate saloanele"
```

Rationale: `selectedCategory` in `discover.tsx:77` is already typed `SalonType | null`, so the parent state and all downstream `if (selectedCategory)` guards already handle `null` correctly. Zero parent-type changes required.

### Concurrency guard

The existing `selecting.current` ref ([CategoryPickerModal.tsx:66-74](../../components/discover/CategoryPickerModal.tsx#L66-L74)) MUST cover the Mixt path too, using the same 500 ms debounce. Extract a shared `handleSelect(type: SalonType | null)` that both code paths call.

### Parent call-site

At [discover.tsx:1386-1394](../../app/(tabs)/discover.tsx#L1386-L1394), the `onSelect` handler must NOT call `bottomSheetRef.current?.snapToIndex(1)` when `type === null` — the X-close path doesn't snap, and the "Toate saloanele" path must match X-close exactly to preserve the unfiltered behavior users already get today. Gate the `snapToIndex` call on `type != null`.

### Non-changes (explicit)

- No changes to `SalonType` enum in `types/database.ts`.
- No new state, no persistence, no analytics instrumentation.
- No changes to any downstream filter predicate — they already handle `selectedCategory === null` as "no filter".

## Out-of-scope follow-ups (noted, not this PR)

- **TryOn CTA fallback:** [discover.tsx:972](../../app/(tabs)/discover.tsx#L972) uses `selectedCategory || "barbershop"`. A user who picks "Toate saloanele" and taps TryOn will silently enter barbershop/male mode even if their intent was coafor. Resolve by prompting for gender/style on TryOn entry when `selectedCategory === null`.
- **Re-entry:** No path currently lets the user reopen the picker after closing it. Revisit once this change ships.
