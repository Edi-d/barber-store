# Tapzi Barber Store — Full Audit

**Date:** 2026-03-24
**Audited by:** 10 specialized Volt subagents
**Screens covered:** Feed, Discover, Salon Detail, Courses, Lessons, Profile, Settings, Shop, Product, Cart, Checkout, Auth (5 screens), Booking, Navigation

---

## Critical Bugs (App broken)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| C-01 | Services query fetches ALL services globally — no `salon_id` filter | `lib/salon.ts` `fetchServicesGrouped` | Every salon shows every service from every salon |
| C-02 | Add to cart from Shop is visual only — never calls `cartStore.addItem()` | `shop.tsx:109-116` | Products from shop grid never enter cart |
| C-03 | No reactive auth guard — session expiry doesn't redirect to login | `_layout.tsx` | User stays on protected screens with expired session |
| C-04 | CommentsModal corrupts feed cache — flat `.map()` on `InfiniteData` wipes entire feed | `CommentsModal.tsx:268,361` | Adding/deleting a comment silently clears all feed data |

---

## High Priority (Features incomplete or mocked)

### Feed / Social

| ID | Issue | Location |
|----|-------|----------|
| H-01 | Placeholder lives titles in English — visible when no real streams | `feed.tsx:33-62` |
| H-02 | Notification bell badge hardcoded "3" — not connected to real data | `feed.tsx:599` |
| H-03 | Search button has no onPress | `feed.tsx:546-564` |
| H-04 | Bell button has no onPress | `feed.tsx:565-601` |
| H-05 | Feed filter icon has no onPress | `feed.tsx:508-511` |
| H-06 | Share ("Trimite") on FeedCard — empty handler | `feed.tsx:617` / `FeedCard.tsx` |
| H-07 | Author avatar/name tap — no navigation to profile | `FeedCard.tsx:221` |
| H-08 | 3-dot more menu — no action sheet, does nothing | `FeedCard.tsx:268` |
| H-09 | "Apreciaza" on comments — haptic only, no mutation | `CommentsModal.tsx:907` |

### Discover / Map

| ID | Issue | Location |
|----|-------|----------|
| H-10 | selectedSalon on marker tap — nothing shown in bottom sheet | `discover.tsx:248-259` |
| H-11 | "Anuleaza" appointment — navigates to list instead of cancelling | `discover.tsx:652` |
| H-12 | "Favorites — Vezi toate" — routes to `/appointments` (wrong!) | `discover.tsx:792` |
| H-13 | Chat modal is a stub — "Niciun mesaj" static | `discover.tsx:989-1017` |
| H-14 | Notifications modal is a stub — "Nicio notificare" static | `discover.tsx:957-986` |
| H-15 | `showCategoryPicker` starts `true` — modal forced on mount | `discover.tsx:53` |

### Salon Detail

| ID | Issue | Location |
|----|-------|----------|
| H-16 | Team member cards — Pressable with no onPress | `salon/[id].tsx:569` |
| H-17 | Owner reply on reviews — exists in DB, never rendered | `salon/[id].tsx` |
| H-18 | No phone/call button on salon detail | `salon/[id].tsx` |
| H-19 | Gallery photos — no full-screen viewer on tap | `salon/[id].tsx` |
| H-20 | Happy hour discount not reflected in service prices | `salon/[id].tsx` |
| H-21 | "Already reviewed" guard missing — user can unknowingly overwrite review | `salon/[id].tsx` |

### Academy / Courses

| ID | Issue | Location |
|----|-------|----------|
| H-22 | No premium gating — PRO badge is cosmetic, all content freely accessible | `course/[id].tsx` |
| H-23 | Lesson resume position — `lastPosition` fetched but never applied to Video | `lesson/[id].tsx` |
| H-24 | Text lesson content — hardcoded placeholder "Continutul lectiei va fi afisat aici" | `lesson/[id].tsx:227` |
| H-25 | Video controls fight — Pressable wrapper + `useNativeControls` race condition | `lesson/[id].tsx:135` |
| H-26 | Gradient overlay on course detail is Tailwind web class — no-op on RN | `course/[id].tsx:119` |

### Shop / Cart / Checkout

| ID | Issue | Location |
|----|-------|----------|
| H-27 | Payment online — "Coming soon" permanent, COD only | `checkout.tsx:256` |
| H-28 | No stock decrement on order placement | `checkout.tsx` |
| H-29 | Product data split — shop uses local JSON, product/[id] uses Supabase | `shop.tsx` vs `product/[id].tsx` |
| H-30 | No product reviews/ratings anywhere in shop flow | All shop screens |

### Auth

| ID | Issue | Location |
|----|-------|----------|
| H-31 | No social login (Google/Apple) anywhere | All auth screens |
| H-32 | Forgot password — completely different design (no gradient, GlassCard, squircle) | `forgot-password.tsx` |
| H-33 | Supabase error messages shown in English to user | `login.tsx, signup.tsx, onboarding.tsx` |
| H-34 | No avatar upload on onboarding | `onboarding.tsx` |
| H-35 | Terms/Privacy links non-functional | `signup.tsx:221-229` |
| H-36 | SwipeButton doesn't reset on error — thumb can stick | `login.tsx, signup.tsx` |
| H-37 | `resetPasswordForEmail` missing `redirectTo` — opens browser not app | `authStore.ts` |

### Booking / Appointments

| ID | Issue | Location |
|----|-------|----------|
| H-38 | Services not filtered per-barber/salon in booking | `book-appointment.tsx` |
| H-39 | Cancel/Reschedule appointments — TODO stubs | `appointments.tsx` |
| H-40 | No race condition guard on double-booking same slot | `book-appointment.tsx` |
| H-41 | Success state is Alert only — no dedicated confirmation screen | `book-appointment.tsx` |

### Navigation

| ID | Issue | Location |
|----|-------|----------|
| H-42 | `book-appointment`, `appointments`, `orders` not in root Stack explicitly | `_layout.tsx` |
| H-43 | No `presentation: 'modal'` on cart/checkout/go-live screens | `_layout.tsx` |
| H-44 | No Universal Links configured (iOS associatedDomains, Android intentFilters) | `app.json` |

---

## Medium Priority (Polish, consistency, UX)

### Squircle / Bubble Brand Consistency

| ID | Issue | Location |
|----|-------|----------|
| M-01 | 12+ elements with `rounded-full`/`rounded-xl` instead of Bubble radii | Multiple screens |
| M-02 | LiveSection LiveCard `rounded-2xl` vs ModalLiveCard Bubble radii | `LiveSection.tsx:67` vs `feed.tsx:87` |
| M-03 | NewPostsBanner — `borderRadius: 999` pill instead of squircle | `NewPostsBanner.tsx:33` |
| M-04 | Input component — uniform 12px radius, not Bubble | `Input.tsx` |
| M-05 | Card component — `rounded-2xl` not Bubble | `Card.tsx` |
| M-06 | Review cards, rating card, happy hour banner on salon — `rounded-2xl` | `salon/[id].tsx` |
| M-07 | Booking flow — all cards use `rounded-2xl`, never `<Button>` component | `book-appointment.tsx` |
| M-08 | Product detail CTA — `borderRadius: 16` not Bubble | `product/[id].tsx` |
| M-09 | Cart item images — `rounded-lg` not Bubble | `cart.tsx` |

### Color / Theme Inconsistencies

| ID | Issue | Location |
|----|-------|----------|
| M-10 | Input background `#F1F5F9` vs `Colors.inputBackground #F8FAFF` | `Input.tsx` |
| M-11 | Input error red `#ef4444` vs `Colors.error #E53935` | `Input.tsx` |
| M-12 | Avatar DEFAULT_AVATAR — real person's photo as generic default | `Avatar.tsx` |
| M-13 | Avatar sizes in component vs `AvatarSize` in theme — different values | `Avatar.tsx` vs `theme.ts` |
| M-14 | Badge "default" — white text on light gray, WCAG AA fail | `Badge.tsx` |
| M-15 | No `Colors.warning` or `Colors.info` tokens despite usage | `theme.ts` |
| M-16 | Tailwind `dark` scale named "dark" but is actually a gray scale | `tailwind.config.js` |
| M-17 | 8+ raw hex colors inline instead of theme tokens | Multiple files |

### i18n — English Text in Romanian App

| ID | Issue | Location |
|----|-------|----------|
| M-18 | "Not started" on course cards | `courses.tsx:389` |
| M-19 | "Premium Courses" section title | `courses.tsx:154` |
| M-20 | "Made with ♥ for barbers" in settings footer | `settings.tsx:299` |
| M-21 | "Go Live" button label on profile | `profile.tsx:144` |
| M-22 | "BOOST" label on salon cards | `discover.tsx:773,910` |
| M-23 | "Coming soon" in checkout | `checkout.tsx:264` |
| M-24 | "Note:" in order shipping address string | `checkout.tsx:45` |
| M-25 | Placeholder live titles in English (4 titles) | `feed.tsx:35-57` |

### Missing Features / UX Gaps

| ID | Issue | Location |
|----|-------|----------|
| M-26 | No dark mode — zero tokens, zero `useColorScheme` | Entire app |
| M-27 | Tab icon color animation broken on Android (Animated.Text + Ionicons) | `(tabs)/_layout.tsx` |
| M-28 | `happy_hour_discount` null — could render "-null%" | `discover.tsx:691` |
| M-29 | Profile has no "Edit Profile" button — only accessible via settings gear | `profile.tsx` |
| M-30 | "Apreciate" (Liked) menu on profile — empty onPress | `profile.tsx:174` |
| M-31 | Delete account — "Coming Soon" stub behind destructive button | `settings.tsx` |
| M-32 | No notification settings, language settings, dark mode toggle | `settings.tsx` |
| M-33 | `displayName` autocapitalize="none" on onboarding — should be "words" | `onboarding.tsx` |
| M-34 | No `returnKeyType` chaining between fields on auth screens | Auth screens |
| M-35 | Live viewer StatusBar global "dark" — should be "light" for dark fullscreen | `live/[id].tsx` |
| M-36 | `travel_time_min` always null — feature never computed | `lib/discover.ts:97` |
| M-37 | No search debounce in shop — 2752 products filtered per keystroke | `shop.tsx` |
| M-38 | 8+ missing shared components — SectionHeader, EmptyState, ScreenHeader, PriceTag, RatingRow etc. | Codebase-wide |

---

## Low Priority (Dead code, hygiene)

| ID | Issue | Location |
|----|-------|----------|
| L-01 | 4 unused feed components — FeedItem, BookingHeroCard, QuickActions, SlidingTabs | `components/feed/` |
| L-02 | SalonCard component unused — discover has inline cards | `components/discover/SalonCard.tsx` |
| L-03 | `useMutation` import unused in salon detail | `salon/[id].tsx` |
| L-04 | `SCREEN_WIDTH` static — no orientation/resize update | `feed.tsx:63` |
| L-05 | `EMPTY_STORIES` typed `any[]` not `StoryGroup[]` | `feed.tsx:31` |
| L-06 | Logo asset named `image-removebg-preview.png` — placeholder filename | Auth screens |
| L-07 | `useMemo` misused as side effect in salon detail | `salon/[id].tsx:171` |
| L-08 | GlassCard duplicates Card concept with different styling | `components/auth/` vs `components/ui/` |
| L-09 | Bubble.radii has redundant bare keys (topLeft) alongside borderTopLeftRadius | `theme.ts` |
| L-10 | `fontError` silently falls through — no error boundary for font load failure | `_layout.tsx` |
| L-11 | Accent colors (gold, cream) only in Tailwind, not in Colors | `tailwind.config.js` |
| L-12 | Button doesn't use Typography.button token | `Button.tsx` |

---

## Stats

- **Critical:** 4
- **High:** 44
- **Medium:** 38
- **Low:** 12
- **Total issues:** 98
