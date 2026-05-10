# Search Result Cards Redesign — Design Spec

**Date:** 2026-04-14
**Target file:** `components/search/SearchResultItem.tsx`
**Scope:** All three result types rendered in the Search screen (`app/search.tsx`): salon, person, post.

## Problem

The current search result cards feel cluttered. The salon variant stacks three vertical metadata rows (title → type pill + rating chip → address with icon), plus a chevron, plus border + shadow + gap between cards. Every row screams for attention and the card ends up ~108pt tall, so only ~4 results fit on screen.

Industry research across Yelp, Google Maps, Apple Maps, Airbnb, Booking, Uber Eats, DoorDash, Instagram, TikTok, and Apple HIG converges on the same pattern for search result rows: two-tier typography, one muted metadata line with bullet separators, no per-row pills, no chevron. The current implementation fights this consensus.

## Goals

- Reduce visual clutter in all three result card types without losing information
- Increase list density (target ~5–6 cards visible per screen instead of ~4)
- Stay consistent with existing design tokens (`Bubble.radiiSm`, `Colors.primary`, `FontFamily`, `Shadows.sm`)
- Keep the card-with-gap container treatment (matches rest of app — `SalonCard`, `DiscoverSalonCard`)

## Non-Goals

- No changes to `app/search.tsx` section list logic, `SearchBar`, `IdleState`, `NoResults`, or idle/loading states
- No changes to `useSearch` hook or data types (`SearchSalon`, `SearchProfile`, `SearchPost`)
- No new theme tokens — reuse what exists in `constants/theme.ts`
- No changes to navigation behavior or `handleResultPress`

## Shared Principles (all three card types)

**Container (unchanged, already consistent with app):**
- `Bubble.radiiSm` squircle corners
- `Shadows.sm` + `borderWidth: 1` `borderColor: rgba(15,23,42,0.06)`
- `marginBottom: 10` between cards (from `resultItemWrapper` in `app/search.tsx`)

**Row layout tokens (new values):**
- `paddingHorizontal: 14` (was 18)
- `paddingVertical: 14` (was 18)
- `minHeight: 84` (was 108)
- Gap avatar → text block: `marginLeft: 12` (was 16)
- Chevron: **removed** from all three variants

**Typography:**
- Primary (title): `FontFamily.semiBold` 16px, color `#0F172A`, `letterSpacing: -0.2`
- Metadata: `FontFamily.regular` 13px, color `#64748B`
- Inline separator in metadata: ` · ` (space + middle dot + space, literal string)
- Gap title → metadata row: `marginTop: 4` (was 7)

**Avatar/thumbnail:** 56px (unchanged). Salon + post = squircle (`Bubble.radiiSm`), person = circle.

## Salon Card (`SalonItem`)

**Target layout:**
```
┌──────────────────────────────────────────────┐
│  ┌────┐   Dive Software Barbershop           │
│  │ 🏪 │   Barbershop · ★ 4.8 · Str. Victoriei│
│  └────┘                                      │
└──────────────────────────────────────────────┘
```

**Row 1 — Title:**
- `salon.name`
- `numberOfLines={1}`, tail truncation

**Row 2 — Inline metadata (single line, `numberOfLines={1}`, tail truncation):**

Build as an array of parts, then join with ` · ` and render inline. Parts in order:

1. **Type label** (plain text, no pill background) — computed from `salon.salon_types`. The current implementation joins multiple types with ` · `, which would collide with the outer metadata separator and be unparseable. **Change the internal join to ` / `**: `['barbershop', 'coafor'] → 'Barbershop / Coafor'`. The resulting label is then treated as ONE part of the outer metadata row.
2. **Rating** — only if `salon.rating_avg != null`. Rendered as a small inline group: star icon (Ionicons `star`, size 12, color `#F59E0B`) + space + `rating_avg.toFixed(1)` in `FontFamily.semiBold` 13px color `#0F172A`. Because this mixes two fonts and an icon, it cannot be a plain text part — it needs to be a nested `<Text>` with embedded `<Ionicons>` or a flex-row wrapper inside the Text line.
3. **Address** — `salon.address` as-is, plain text, muted color. No location icon.

**Assembly approach:** render the metadata row as a single `<Text numberOfLines={1}>` containing interleaved `<Text>` children for each part and literal ` · ` separators between parts that exist. The rating sub-group uses a nested `<Text>` so the star icon is text-embedded (React Native supports `<Ionicons>` inside `<Text>` via `@expo/vector-icons`). Truncation naturally bites the tail (typically the address) because it's the last part.

**Edge cases:**
- If `typeLabel` is empty: skip part 1; row starts with rating or address
- If `rating_avg` is null: skip part 2
- If `address` is null/empty: skip part 3
- If all three parts are empty: do not render row 2 at all — card collapses to 1 text row, `minHeight: 84` still enforced by padding

**Removed from current implementation:**
- `metaRow` View with pill + chip
- `typePill` + `typePillText` styles
- `ratingChip` + `ratingText` styles
- `addressRow` View
- `location-outline` Ionicon
- `chevron-forward` Ionicon
- Associated styles: `metaRow`, `typePill`, `typePillText`, `ratingChip`, `ratingText`, `addressRow`, `tertiaryText`, `chevron`

## Person Card (`PersonItem`)

**Target layout:**
```
┌──────────────────────────────────────────────┐
│  ( 👤 )   Ana Popescu ✓                      │
│           @anapopescu                         │
└──────────────────────────────────────────────┘
```

**Row 1 — Name:**
- `profile.display_name ?? profile.username`
- `numberOfLines={1}`
- Verified badge rendered inline after name (unchanged — existing `verifiedBadge` style kept)

**Row 2 — Username:**
- `@${profile.username}`
- `numberOfLines={1}`
- Style: `FontFamily.regular` 13px color `#64748B`, `marginTop: 2`

**Unchanged:** circle avatar 56px with border `rgba(10,102,194,0.12)` bg `#DCEBFF`, initial fallback in `ACCENT` color.

**Removed:** chevron.

**Applied new tokens from shared principles:** padding 14/14, marginLeft 12, minHeight 84, metadata size 13.

## Post Card (`PostItem`)

**Target layout:**
```
┌──────────────────────────────────────────────┐
│  ┌────┐   Cel mai nou fade la noi in salon  │
│  │img▶│   Ana Popescu · acum 2h              │
│  └────┘                                      │
└──────────────────────────────────────────────┘
```

**Row 1 — Caption:**
- `post.caption` if present, `numberOfLines={1}` (changed from 2 → 1 for list uniformity)
- Fallback if `!post.caption`: `'Video'` or `'Imagine'` based on `post.type`, in `FontFamily.regular` color `Colors.textTertiary`

**Row 2 — Meta (single line, `numberOfLines={1}`):**
- `${post.author.display_name ?? post.author.username} · ${timeAgo(post.created_at)}`
- Style: `FontFamily.regular` 13px color `#64748B`
- `marginTop: 2`

**Unchanged:** thumbnail 56px squircle (`Bubble.radiiSm`), video overlay badge in bottom-right corner.

**Removed:** chevron.

**Applied new tokens:** padding 14/14, marginLeft 12, minHeight 84.

## Style Cleanup

After refactor, the `styles` StyleSheet should drop these entries (no longer used):
- `metaRow`
- `typePill`
- `typePillText`
- `ratingChip`
- `ratingText`
- `addressRow`
- `tertiaryText`
- `chevron`
- `avatarFallback` (already unused, clean up)
- `avatarIconCenter` (already unused, clean up)
- `circleAvatarFallback` (already unused, clean up)

And update these existing entries:
- `row`: `minHeight: 84`, `paddingHorizontal: 14`, `paddingVertical: 14`
- `textBlock`: `marginLeft: 12`
- `primaryText`: unchanged (font 16 semiBold)
- `usernameText`: unchanged (already 13/regular/#64748B)

New/modified entries:
- `metaTextRow` (new): `marginTop: 4`, font regular 13, color `#64748B`

## Verification

Manual visual check on the Search screen with:
1. Query `dive` — one salon result (baseline case from the screenshot)
2. Query that returns salons with no address (edge case: metadata row has only type + rating)
3. Query that returns salons with no rating (edge case: metadata row has type + address)
4. Query that returns a mix of salons, persons, and posts (visual consistency check)
5. Query that returns a post with no caption (fallback text)
6. Query that returns a post with a very long caption (truncation)
7. Query that returns a salon with a very long address (truncation on last part)

Success criteria (user-validated):
- Card feels less cluttered than before
- List shows ~5–6 cards per screen instead of ~4
- All three card types feel visually consistent in the same list
- No information is lost (all previously-shown fields still visible unless null)

## Out of Scope (explicit)

- Changing `app/search.tsx` layout, section headers, idle state, or no-results state
- Adding new data fields (distance, open/closed status, price range — not in `SearchSalon` today)
- Changing navigation targets in `handleResultPress`
- Modifying `DiscoverSalonCard` or `SalonCard` (Discover screen cards stay as-is)
- Light/dark mode theming beyond what already exists
- Accessibility improvements beyond current state (can be follow-up)
