# Loyalty Points System — Design Spec

**Date:** 2026-04-23
**Status:** Approved for implementation
**Reference app:** `/Users/edi/Desktop/Tapzi-barber` (neighboring repo)

## Context

barber-store (React Native + Expo Router + Supabase) needs a gamified loyalty system where users earn points on spend. We port a simplified subset of Tapzi-barber's mature 13-migration loyalty stack (054–070). This spec covers the points/tier core; all other Tapzi subsystems (streaks, referrals, achievements, seasonal events, rewards catalog) are explicitly deferred.

## Goals

1. Users earn points automatically when they spend money (two sources: appointment completed, shop order paid).
2. Single unified "puncte" balance per user.
3. Visual progression via 4 tiers with multipliers that boost future earnings.
4. Profile menu entry leading to a dashboard showing balance, tier, progress, history.
5. Realtime feedback: toast on earn, celebration modal on tier-up.
6. Architecture leaves room for a future voucher redemption feature without rework.

## Non-goals (deferred)

- Streaks / multipliers beyond tier multiplier
- Seasonal events
- Achievements / badges
- Referrals
- Rewards catalog + redemption (architecture-ready, not built)
- Push notifications (reactive in-app only)
- Stripe / online payments (trigger on existing `status` transitions)
- Admin dashboards / analytics

## Terminology

User-facing Romanian term is **"puncte"** (not "XP"). Internal code uses `points`.

## Current state of barber-store

- 3 orphan loyalty migrations exist ([063](migrations/063_loyalty_analytics.sql), [064](migrations/064_loyalty_seed_data.sql), [065](migrations/065_fix_loyalty_dashboard_vtier.sql)) — copied from Tapzi but reference tables (`loyalty_profiles`, `point_transactions`, `loyalty_tiers`) that were never ported. They are unusable and will be deleted.
- Zero loyalty frontend code.
- `appointments` table exists with `status` enum: `pending | confirmed | completed | cancelled | no_show` and `total_cents`.
- `orders` table exists with `status` enum: `pending | paid | shipped | cancelled`.
- No Stripe integration; "payment" is offline (cash/COD) — `paid` status is set manually or by existing checkout flow.
- Stack: StyleSheet + `constants/theme` tokens (`Bubble`, `Colors`, `Shadows`, `Typography`), `react-native-reanimated` v3, `expo-blur`, `expo-haptics`, `@tanstack/react-query`, Zustand stores, Supabase Realtime already used elsewhere.

## Data Model

### Tables

**1. `loyalty_profiles`** (one row per user)
```sql
user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE
points_balance INT NOT NULL DEFAULT 0 CHECK (points_balance >= 0)
lifetime_points_earned INT NOT NULL DEFAULT 0
current_tier TEXT NOT NULL DEFAULT 'clipper' REFERENCES loyalty_tiers(slug)
last_earned_at TIMESTAMPTZ
last_tier_up_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```
- RLS: user reads own row only. Writes only via SECURITY DEFINER earn RPCs (no direct user writes).
- Row lifecycle: created lazily by `earn_points_from_*` RPCs on first earn (step 4 in Earn Flow). Also backfilled during migration for all existing `profiles` rows so the dashboard shows a zero-state for everyone.
- Index: `(current_tier)` for future admin queries.

**2. `point_transactions`** (append-only audit log)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
amount INT NOT NULL               -- always positive for earn; negative reserved for future redemption
source TEXT NOT NULL              -- 'appointment' | 'order' | 'bonus' | 'adjustment'
reference_id UUID                 -- appointment.id or order.id; NULL for bonus/adjustment
base_amount INT NOT NULL          -- pre-multiplier base
multiplier NUMERIC(3,2) NOT NULL  -- tier multiplier applied (e.g., 1.50)
metadata JSONB NOT NULL DEFAULT '{}'::jsonb
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

UNIQUE (source, reference_id) WHERE reference_id IS NOT NULL  -- idempotency
```
- BEFORE UPDATE/DELETE trigger → `RAISE EXCEPTION` (immutable).
- RLS: user reads own rows only.
- Indexes: `(user_id, created_at DESC)` for history list; UNIQUE partial index acts as dedupe key.

**3. `loyalty_tiers`** (config, seeded)
```sql
slug TEXT PRIMARY KEY             -- 'clipper' | 'blade' | 'sharp' | 'maestru'
name_ro TEXT NOT NULL
threshold INT NOT NULL            -- lifetime_points_earned required
multiplier NUMERIC(3,2) NOT NULL  -- 1.00, 1.20, 1.50, 2.00
color TEXT NOT NULL               -- hex
sort_order INT NOT NULL UNIQUE
```
- RLS: public read, no write (admin-only via service role).

Seed (identical to Tapzi):
| slug     | name_ro  | threshold | multiplier | color    | sort |
|----------|----------|-----------|------------|----------|------|
| clipper  | Clipper  | 0         | 1.00       | #8E8E93  | 1    |
| blade    | Blade    | 5000      | 1.20       | #0A84FF  | 2    |
| sharp    | Sharp    | 15000     | 1.50       | #FFD60A  | 3    |
| maestru  | Maestru  | 35000     | 2.00       | #FFD700  | 4    |

**4. `loyalty_settings`** (global config, single row)
```sql
id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1)  -- singleton guard
points_per_ron INT NOT NULL DEFAULT 10
daily_cap INT NOT NULL DEFAULT 5000
enabled BOOLEAN NOT NULL DEFAULT TRUE
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```
- RLS: public read, admin write (service role only).

## Earn Flow

### RPC: `earn_points_from_appointment(p_appointment_id UUID) RETURNS JSONB`

**SECURITY DEFINER** (runs as service role). Callable by server-side triggers only — no direct client access.

Algorithm:
1. `SELECT ... FROM appointments WHERE id = p_appointment_id FOR UPDATE`. If not found or `status != 'completed'` → return `{"skipped": "wrong_status"}`.
2. Check idempotency: `SELECT 1 FROM point_transactions WHERE source = 'appointment' AND reference_id = p_appointment_id`. If exists → return `{"skipped": "already_awarded"}`.
3. `SELECT ... FROM loyalty_settings WHERE id = 1`. If `enabled = FALSE` → return `{"skipped": "disabled"}`.
4. `SELECT ... FROM loyalty_profiles WHERE user_id = appointment.user_id FOR UPDATE`. Create row if missing.
5. Compute base: `base = FLOOR(appointment.total_cents / 100 * settings.points_per_ron)`. If base ≤ 0 → return `{"skipped": "zero_amount"}`.
6. Read tier multiplier from `loyalty_tiers` using current tier: `earned = CEIL(base * tier.multiplier)`.
7. Daily cap check: sum today's earn for user; if `daily_earned + earned > daily_cap`, clamp `earned = MAX(0, daily_cap - daily_earned)`. If result is 0 → return `{"skipped": "daily_cap"}`.
8. INSERT into `point_transactions (user_id, amount=earned, source='appointment', reference_id=appointment.id, base_amount=base, multiplier=tier.multiplier, metadata={appointment_total_cents})`.
9. UPDATE `loyalty_profiles SET points_balance = points_balance + earned, lifetime_points_earned = lifetime_points_earned + earned, last_earned_at = NOW()`.
10. Tier-up check: find highest tier where `threshold <= new lifetime_points_earned`. If different from current tier → UPDATE `current_tier`, `last_tier_up_at = NOW()`.
11. Return `{"earned": earned, "new_balance": ..., "tier_changed": bool, "new_tier": ...}`.

### RPC: `earn_points_from_order(p_order_id UUID) RETURNS JSONB`

Identical structure, keyed to `orders.status = 'paid'` and `orders.total_cents` (field to confirm in implementation), `source='order'`.

### Triggers (auto-invoke RPCs)

```sql
CREATE TRIGGER trg_award_points_on_appointment_complete
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION handle_appointment_completion();  -- wraps earn_points_from_appointment(NEW.id)

CREATE TRIGGER trg_award_points_on_order_paid
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION handle_order_paid();
```

Trigger wrappers use `PERFORM` (not `SELECT`) to discard return value. Errors in earn RPC are logged via `RAISE WARNING` (never block the primary status update).

### Refund / cancellation

Not handled in this spec. If an appointment moves from `completed` back to another status, or an order from `paid` to `cancelled`, points stay. Documented as a future-work TODO with a comment in the migration.

## Frontend

### Components

**`components/loyalty/TierBadge.tsx`**
- Props: `tier: TierSlug`, `size: 'sm' | 'md' | 'lg'`, `showLabel?: boolean`
- Renders circular badge with tier color, optional text label below.
- Uses `constants/loyalty.ts` for color/name lookup.

**`components/loyalty/TierProgressBar.tsx`**
- Props: `lifetimePoints: number`, `currentTier: TierSlug`
- Computes progress to next tier; renders animated fill bar (reanimated v3, 800ms, `Easing.bezier(0.25, 0.1, 0.25, 1)`).
- Shows "X puncte până la {nextTier}" below. Shows maxed state for maestru.

**`components/loyalty/PointsEarnedToast.tsx`**
- Props: `visible: boolean`, `points: number`, `source: 'appointment' | 'order'`, `onDismiss: () => void`
- Slide-up from bottom (reanimated `FadeInUp`/`FadeOutUp`), 4s auto-dismiss, count-up animation over 1200ms.
- Haptic: `Haptics.NotificationFeedbackType.Success` on mount.
- Copy: title "Ai castigat puncte!" / value "+{displayPoints} puncte" / subtitle `source === 'appointment' ? 'Programare finalizata' : 'Comanda platita'`.

**`components/loyalty/TierUpModal.tsx`**
- Props: `visible: boolean`, `fromTier: TierSlug`, `toTier: TierSlug`, `onClose: () => void`
- Full-screen modal with: confetti burst (`react-native-confetti-cannon`, 120 pieces), large tier badge, label "NIVEL NOU", name, subtitle "Felicitari! Ai avansat de la {fromTier} la {toTier}.", benefits list (hardcoded per tier in `constants/loyalty.ts`), "Continua" button.
- Haptic success on mount.

**`components/loyalty/PointsTransactionList.tsx`**
- Props: `transactions: PointTransaction[]`
- FlatList of rows: amount (+NNN puncte, green), source label (Romanian: "Tuns complet" / "Comandă shop" / etc.), relative time (e.g., "Azi", "Ieri", "2 zile în urmă").

### Screens

**`app/loyalty/index.tsx` — Punctele mele dashboard**
- Reads `useLoyaltyProfile()` + `useLoyaltyTransactions()`.
- Sections: back header, tier hero card (BlurView + gradient per tier), points total, `TierProgressBar`, tier benefits preview (teaser list, "Vouchere exclusive — în curând" disabled), `PointsTransactionList` (last 20, load more later).

### Hooks

**`hooks/useLoyaltyProfile.ts`**
- Returns `{ profile, tier, nextTier, progress, isLoading }`.
- React Query fetch from `loyalty_profiles` + joined tier metadata.
- Supabase Realtime subscription on `loyalty_profiles` UPDATE filtered by user_id → invalidates query.

**`hooks/useLoyaltyNotifications.ts`**
- Returns `{ lastEarned, dismissEarned, tierChanged, dismissTierChanged }`.
- Subscribes to `point_transactions` INSERT (user_id filter) → sets `lastEarned = {points, source}`.
- Subscribes to `loyalty_profiles` UPDATE (user_id filter), compares `current_tier` vs ref → if changed, sets `tierChanged = {from, to}`.
- Called once at root layout level.

### Integration points

**[app/_layout.tsx](app/_layout.tsx):**
- Inside root component (inside auth gate), invoke `useLoyaltyNotifications()`.
- Render `<PointsEarnedToast>` and `<TierUpModal>` at the root, driven by hook state.

**[app/(tabs)/profile.tsx](app/(tabs)/profile.tsx):**
- Add menu row "Punctele mele" with trophy icon, gold accent, trailing badge showing current `points_balance` (from `useLoyaltyProfile`). Tap → `router.push('/loyalty')`.

### Constants

**`constants/loyalty.ts`**
```ts
export type TierSlug = 'clipper' | 'blade' | 'sharp' | 'maestru';

export const TIER_CONFIG: Record<TierSlug, {
  slug: TierSlug;
  nameRo: string;
  threshold: number;
  multiplier: number;
  color: string;
  sortOrder: number;
}> = { /* matches DB seed exactly */ };

export const TIER_BENEFITS: Record<TierSlug, string[]> = {
  clipper: ['1.0× puncte per RON'],
  blade:   ['1.2× puncte per RON', 'Acces precoce vouchere (în curând)'],
  sharp:   ['1.5× puncte per RON', 'Vouchere exclusive (în curând)'],
  maestru: ['2.0× puncte per RON', 'Vouchere legendare (în curând)', 'Priority booking (în curând)'],
};

export const POINTS_PER_RON = 10;  // mirrors server default for client-side preview math
export const DAILY_CAP = 5000;

export const TIER_COLORS = { /* hex per tier */ };
```

## Styling conventions

- `StyleSheet.create()` + imports from `constants/theme` (`Colors`, `Bubble`, `Shadows`, `Typography`).
- `BlurView` (intensity 40–45) for tier hero card and toast container.
- NativeWind `className` **only** on `Pressable` for layout (per existing project feedback rule).
- Animations via `react-native-reanimated` v3 (`useSharedValue`, `useAnimatedStyle`, `withTiming`, `FadeInUp`/`FadeOutUp`).
- Haptics on toast show and tier-up via `expo-haptics`.
- Romanian UI copy (no diacritics, matches existing app convention).

## File inventory (delete vs create vs edit)

**Delete (orphans):**
- `migrations/063_loyalty_analytics.sql`
- `migrations/064_loyalty_seed_data.sql`
- `migrations/065_fix_loyalty_dashboard_vtier.sql`

**Create:**
- `migrations/072_loyalty_core.sql` (single migration with all tables, RLS, triggers, RPCs, seed)
- `constants/loyalty.ts`
- `lib/loyalty.ts` (query helpers: `fetchLoyaltyProfile`, `fetchTransactions`, `computeTierProgress`)
- `hooks/useLoyaltyProfile.ts`
- `hooks/useLoyaltyNotifications.ts`
- `components/loyalty/TierBadge.tsx`
- `components/loyalty/TierProgressBar.tsx`
- `components/loyalty/PointsEarnedToast.tsx`
- `components/loyalty/TierUpModal.tsx`
- `components/loyalty/PointsTransactionList.tsx`
- `app/loyalty/index.tsx`

**Edit:**
- `types/database.ts` (add `loyalty_profiles`, `point_transactions`, `loyalty_tiers`, `loyalty_settings` types; export `TierSlug` type)
- `app/(tabs)/profile.tsx` (add menu entry)
- `app/_layout.tsx` (wire global `useLoyaltyNotifications` hook + render toast/modal)

## Execution plan — 10 volt subagents, 2 waves

**Wave 1 (backend foundation, parallel):**
- A1 `backend-developer`: write `migrations/072_loyalty_core.sql` + delete 3 orphans
- A2 `backend-developer`: edit `types/database.ts` + create `constants/loyalty.ts`
- A3 `backend-developer`: create `lib/loyalty.ts`

**Wave 2 (frontend, parallel after wave 1):**
- A4 `frontend-developer`: `hooks/useLoyaltyProfile.ts` + `hooks/useLoyaltyNotifications.ts`
- A5 `ui-designer`: `components/loyalty/TierBadge.tsx` + `TierProgressBar.tsx`
- A6 `ui-designer`: `components/loyalty/PointsEarnedToast.tsx`
- A7 `ui-designer`: `components/loyalty/TierUpModal.tsx`
- A8 `frontend-developer`: `components/loyalty/PointsTransactionList.tsx`
- A9 `frontend-developer`: `app/loyalty/index.tsx`
- A10 `fullstack-developer`: edit `app/(tabs)/profile.tsx` + `app/_layout.tsx`

**Integration / verification (orchestrator, single pass):**
- Run migration locally against Supabase.
- Start dev server.
- Manually flip one appointment to `completed` via Supabase dashboard → verify toast + balance.
- Manually flip one order to `paid` → verify toast + balance.
- Force tier threshold crossing → verify tier-up modal.
- Single commit end-to-end (per project convention: no per-task commits).

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Trigger fires on backfill / bulk status updates | Idempotency via UNIQUE (source, reference_id); `PERFORM` + `EXCEPTION WHEN OTHERS` in wrapper |
| Orders table lacks `total_cents` or uses different column | Confirmed during A1 — agent reads orders schema before writing RPC |
| Realtime subscriptions double-fire on reconnect | Hook dedupes by transaction id; toast dismisses itself |
| Existing profile screen tightly coupled (adding menu row breaks layout) | A10 reads profile.tsx structure before edit, adds row in existing menu pattern |
| Daily cap misses edge case where single earn > cap | Clamp logic in RPC (step 7); if clamp result is 0, still insert zero-amount transaction? NO — skip insert if clamped to 0 |

## Future work (not in this spec)

- Voucher catalog + `redeem_points` RPC (architecture-ready: `amount` in `point_transactions` supports negatives; `points_balance` decrements)
- Push notifications via Expo
- Streaks
- Seasonal events
- Referrals
- Achievements
- Admin dashboard / analytics
- Refund clawback on status reversal
