# Tapzi — Audit Fix Phases

**Based on:** AUDIT.md (98 issues, 2026-03-24)
**Strategy:** Fix critical/high first, group by screen/feature area, parallelize with Volt subagents

---

## Phase A: Critical Data & Security Fixes
**Priority:** P0 — Must fix before any TestFlight/release
**Estimated:** 1 session

| Task | Issues | What to do |
|------|--------|------------|
| A-1 | C-01 | Fix `fetchServicesGrouped` — add `salon_id` filter to query |
| A-2 | C-02 | Fix `shop.tsx` add-to-cart — call `cartStore.addItem()` properly |
| A-3 | C-03 | Add reactive auth guard in `_layout.tsx` — watch session, redirect on expiry |
| A-4 | C-04 | Fix CommentsModal — use `InfiniteData` shape for `setQueryData` |

---

## Phase B: Feed & Social Polish
**Priority:** P1 — Core user experience
**Estimated:** 1-2 sessions

| Task | Issues | What to do |
|------|--------|------------|
| B-1 | H-01, M-25 | Translate placeholder lives titles to Romanian |
| B-2 | H-02 | Connect notification badge to real unread count (or remove badge) |
| B-3 | H-03, H-04, H-05 | Wire search → discover tab, bell → notifications, filter → sort modal |
| B-4 | H-06 | Implement share via `Share.share()` on FeedCard |
| B-5 | H-07 | Author tap → navigate to `/profile/[id]` (or salon if creator) |
| B-6 | H-08 | 3-dot menu → action sheet (report, hide, copy link) |
| B-7 | H-09 | Comment like — implement mutation + optimistic update |
| B-8 | M-02, M-03 | Unify LiveCard radii (Bubble squircle) + NewPostsBanner squircle |

---

## Phase C: Discover & Map Completion
**Priority:** P1 — Key discovery feature
**Estimated:** 1-2 sessions

| Task | Issues | What to do |
|------|--------|------------|
| C-1 | H-10 | Marker tap → show selected salon mini-card in bottom sheet |
| C-2 | H-11 | "Anuleaza" → real cancellation with confirm dialog |
| C-3 | H-12 | Fix "Favorites — Vezi toate" route → filtered discover or favorites list |
| C-4 | H-13, H-14 | Remove chat/notification stub modals or implement properly |
| C-5 | H-15 | Set `showCategoryPicker` to `false` by default |
| C-6 | M-28 | Add null guard on `happy_hour_discount` |
| C-7 | M-22 | Translate "BOOST" label |

---

## Phase D: Salon Detail Completion
**Priority:** P1
**Estimated:** 1 session

| Task | Issues | What to do |
|------|--------|------------|
| D-1 | H-16 | Team member tap → open barber detail sheet or pre-select for booking |
| D-2 | H-17 | Render owner reply below review comment |
| D-3 | H-18 | Add phone/call button (if salon.phone exists) |
| D-4 | H-19 | Gallery photo tap → full-screen lightbox viewer |
| D-5 | H-20 | Show happy hour discounted prices with strikethrough |
| D-6 | H-21 | Check if user already reviewed → show "Editeaza recenzia" instead |

---

## Phase E: Academy & Courses Fix
**Priority:** P1
**Estimated:** 1 session

| Task | Issues | What to do |
|------|--------|------------|
| E-1 | H-22 | Implement premium gating — paywall modal or lock icon on PRO lessons |
| E-2 | H-23 | Apply `lastPosition` to Video component on mount (resume playback) |
| E-3 | H-24 | Render lesson body content from DB (add `content` field) or remove placeholder |
| E-4 | H-25 | Remove outer Pressable wrapper — let native controls handle play/pause |
| E-5 | H-26 | Replace Tailwind gradient with `expo-linear-gradient` on course cover |
| E-6 | M-18, M-19 | Translate "Not started" → "Neinceput", "Premium Courses" → "Cursuri Premium" |

---

## Phase F: Shop & Checkout Fix
**Priority:** P1
**Estimated:** 1 session

| Task | Issues | What to do |
|------|--------|------------|
| F-1 | H-29 | Unify product data source — migrate local JSON to Supabase or use local consistently |
| F-2 | H-27 | Payment integration (Stripe/Netopia) or clearly label COD-only |
| F-3 | H-28 | Add stock decrement on order placement |
| F-4 | H-30 | Add product reviews/ratings (or plan for v2) |
| F-5 | M-37 | Add search debounce (300ms) |

---

## Phase G: Auth Flow Polish
**Priority:** P2
**Estimated:** 1 session

| Task | Issues | What to do |
|------|--------|------------|
| G-1 | H-32 | Redesign forgot-password with AuthBackground, GlassCard, SwipeButton |
| G-2 | H-33 | Map Supabase English errors to Romanian strings |
| G-3 | H-34 | Add avatar picker on onboarding |
| G-4 | H-35 | Make Terms/Privacy links tappable (open web URL) |
| G-5 | H-36 | Expose SwipeButton `reset()` to parent on error |
| G-6 | H-37 | Add `redirectTo` deep link to `resetPasswordForEmail` |
| G-7 | H-31 | Social login (Google/Apple) — separate milestone if complex |
| G-8 | M-33, M-34 | Fix autoCapitalize + returnKeyType chaining |

---

## Phase H: Booking & Appointments
**Priority:** P2
**Estimated:** 1 session

| Task | Issues | What to do |
|------|--------|------------|
| H-1 | H-38 | Filter services per barber/salon in booking flow |
| H-2 | H-39 | Implement cancel + reschedule on appointments screen |
| H-3 | H-40 | Add re-check availability before insert (race condition guard) |
| H-4 | H-41 | Dedicated success screen with booking ID + add-to-calendar |
| H-5 | M-07 | Replace raw Pressables with `<Button>` + Bubble squircle in booking |

---

## Phase I: Brand Consistency (Squircle + Theme)
**Priority:** P2 — Design system unification
**Estimated:** 1 session

| Task | Issues | What to do |
|------|--------|------------|
| I-1 | M-01 | Systematic pass: replace all `rounded-full`/`rounded-xl` on interactive elements with Bubble |
| I-2 | M-04, M-05 | Update Input + Card components to use Bubble radii |
| I-3 | M-08, M-09 | Squircle on product detail CTA, cart items |
| I-4 | M-06 | Squircle on salon detail review cards, rating card, happy hour |
| I-5 | M-10, M-11 | Fix Input color tokens — use `Colors.*` instead of raw hex |
| I-6 | M-12 | Replace DEFAULT_AVATAR with generic placeholder |
| I-7 | M-13 | Align Avatar sizes in component with `AvatarSize` theme tokens |
| I-8 | M-14 | Fix Badge "default" contrast — dark text on light bg |
| I-9 | M-17 | Replace all inline hex colors with theme tokens |
| I-10 | L-09 | Clean up Bubble.radii redundant bare keys |
| I-11 | L-12 | Button → use Typography.button token |

---

## Phase J: Navigation & Infrastructure
**Priority:** P2
**Estimated:** 1 session

| Task | Issues | What to do |
|------|--------|------------|
| J-1 | H-42 | Register book-appointment, appointments, orders in root Stack |
| J-2 | H-43 | Add `presentation: 'modal'` to cart, checkout, go-live |
| J-3 | H-44 | Configure Universal Links (associatedDomains + intentFilters) |
| J-4 | M-27 | Fix tab icon color animation on Android |
| J-5 | M-35 | Per-screen StatusBar override (light for live viewer) |

---

## Phase K: i18n & Translations
**Priority:** P3
**Estimated:** 0.5 session

| Task | Issues | What to do |
|------|--------|------------|
| K-1 | M-18-M-25 | Translate all remaining English strings to Romanian |
| K-2 | M-24 | Fix "Note:" in order string |
| K-3 | L-06 | Rename logo asset from placeholder filename |

---

## Phase L: Code Cleanup
**Priority:** P3
**Estimated:** 0.5 session

| Task | Issues | What to do |
|------|--------|------------|
| L-1 | L-01, L-02 | Delete unused components (FeedItem, BookingHeroCard, QuickActions, SlidingTabs, SalonCard) |
| L-2 | L-03, L-07 | Remove unused imports, fix useMemo misuse |
| L-3 | L-04, L-05 | Fix SCREEN_WIDTH reactivity, EMPTY_STORIES typing |
| L-4 | L-08 | Consolidate GlassCard + Card into one component system |
| L-5 | L-10, L-11 | Font error handling, accent color sync |
| L-6 | M-38 | Extract shared components (SectionHeader, EmptyState, ScreenHeader etc.) |

---

## Phase M: Dark Mode (Future)
**Priority:** P4 — Separate milestone
**Estimated:** 2-3 sessions

| Task | Issues | What to do |
|------|--------|------------|
| M-1 | M-26 | Define DarkColors tokens in theme.ts |
| M-2 | M-16 | Rename Tailwind `dark` scale to `gray`/`neutral` |
| M-3 | — | Add `darkMode: 'media'` to Tailwind config |
| M-4 | — | Add `useColorScheme` provider + context |
| M-5 | — | Apply dark: variants across all screens |
| M-6 | M-32 | Add dark mode toggle in settings |

---

## Execution Order

```
Phase A (critical) ──→ Phase B + C + D (parallel, core screens)
                   ──→ Phase E + F (parallel, secondary screens)
                   ──→ Phase G + H (parallel, flows)
                   ──→ Phase I (brand consistency)
                   ──→ Phase J + K + L (parallel, infrastructure + cleanup)
                   ──→ Phase M (dark mode — future milestone)
```

**Total estimated sessions:** 10-12 (excluding dark mode)
