# Loyalty Points System — Implementation Plan

> **For agentic workers:** This plan is designed to be dispatched to 10 volt subagents across 2 waves. Tasks within a wave are parallel; Wave 2 depends on Wave 1 completion. The orchestrator verifies end-to-end and performs a single final commit (no per-task commits — project convention).

**Goal:** Award loyalty points automatically when users spend money (appointment completed or shop order paid), show a unified points balance in profile with 4 tier progression, and celebrate earns with toasts and tier-ups with a modal — no streaks, no rewards catalog, no referrals.

**Architecture:** Supabase Postgres triggers on `appointments.status → 'completed'` and `orders.status → 'paid'` invoke SECURITY DEFINER RPCs that compute `base × tier multiplier`, clamp to daily cap, insert an immutable transaction row, and bump the user's balance + tier. React Native UI listens via Supabase Realtime on `point_transactions` INSERT (toast) and `loyalty_profiles` UPDATE (tier-up modal). Idempotency via `UNIQUE (source, reference_id)` prevents double-awards. Architecture leaves space for a future voucher-redemption feature (negative `amount` values are allowed in `point_transactions`).

**Tech Stack:** Supabase (Postgres + Realtime + RLS), React Native + Expo Router, TypeScript, `@tanstack/react-query`, Zustand (`useAuthStore`), `react-native-reanimated` v3, `expo-blur`, `expo-haptics`, `react-native-confetti-cannon`, StyleSheet + `constants/theme` tokens (`Colors`, `Bubble`, `Shadows`, `Typography`).

**Reference spec:** [docs/superpowers/specs/2026-04-23-loyalty-points-system-design.md](../specs/2026-04-23-loyalty-points-system-design.md)

---

## File structure

**Delete (3 orphan migrations, copy-pasted from Tapzi without dependencies):**
- `migrations/063_loyalty_analytics.sql`
- `migrations/064_loyalty_seed_data.sql`
- `migrations/065_fix_loyalty_dashboard_vtier.sql`

**Create (11):**
- `migrations/072_loyalty_core.sql` — all tables + RLS + triggers + RPCs + seed (single migration)
- `constants/loyalty.ts` — tier config, formulas, colors (mirrors DB seed for client-side use)
- `lib/loyalty.ts` — Supabase query helpers + tier-progress computation
- `hooks/useLoyaltyProfile.ts` — fetch + Realtime subscribe to loyalty_profiles
- `hooks/useLoyaltyNotifications.ts` — Realtime subscribe to point_transactions + loyalty_profiles for toast/tier-up events
- `components/loyalty/TierBadge.tsx` — circular tier badge, 3 sizes
- `components/loyalty/TierProgressBar.tsx` — animated progress bar to next tier
- `components/loyalty/PointsEarnedToast.tsx` — slide-up toast after earn
- `components/loyalty/TierUpModal.tsx` — full-screen celebration
- `components/loyalty/PointsTransactionList.tsx` — history list
- `app/loyalty/index.tsx` — Punctele mele dashboard screen

**Edit (3):**
- `types/database.ts` — add loyalty_* Row/Insert/Update types
- `app/(tabs)/profile.tsx` — add "Punctele mele" menu entry
- `app/_layout.tsx` — mount global `useLoyaltyNotifications` + render toast/modal

---

## Wave 1 — Backend foundation (tasks 1, 2, 3 run in parallel)

### Task 1: Core migration + orphan cleanup

**Agent:** `voltagent-core-dev:backend-developer`

**Files:**
- Create: `migrations/072_loyalty_core.sql`
- Delete: `migrations/063_loyalty_analytics.sql`, `migrations/064_loyalty_seed_data.sql`, `migrations/065_fix_loyalty_dashboard_vtier.sql`

**Context the agent needs:**
- `profiles` table exists with `id UUID PRIMARY KEY` (matches `auth.users.id`).
- `appointments` table has `id UUID`, `user_id UUID`, `status` enum with values `'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'`, and `total_cents INT`.
- `orders` table has `id UUID`, `user_id UUID`, `status` enum `'pending' | 'paid' | 'shipped' | 'cancelled'`. The total amount column name may be `total_cents` or `total` — the agent must `\d orders` (or `SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'`) to confirm before writing the `earn_points_from_order` RPC. If the column is different, adapt.
- Supabase Realtime must be enabled on `loyalty_profiles` and `point_transactions` via `ALTER PUBLICATION supabase_realtime ADD TABLE ...`.

**Step 1: Delete the three orphan migrations.**

```bash
rm migrations/063_loyalty_analytics.sql migrations/064_loyalty_seed_data.sql migrations/065_fix_loyalty_dashboard_vtier.sql
```

**Step 2: Create `migrations/072_loyalty_core.sql` with this exact content (all tables + RLS + triggers + RPCs + seed in one migration):**

```sql
-- ============================================
-- Migration 072: Loyalty Points Core
-- ============================================
-- Single unified points system. Users earn points on:
--   - appointments.status -> 'completed'
--   - orders.status       -> 'paid'
--
-- Mechanics: 10 pts/RON × tier multiplier, daily cap 5000.
-- Four tiers: clipper (0) -> blade (5K) -> sharp (15K) -> maestru (35K).
-- Idempotent via UNIQUE (source, reference_id).
-- Architecture leaves room for future voucher redemption (negative amounts).
--
-- Out of scope for this migration: streaks, seasonal events,
-- achievements, referrals, rewards catalog, refund clawback.
-- ============================================

BEGIN;

-- ─── 1. Tables ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS loyalty_tiers (
    slug        TEXT PRIMARY KEY,
    name_ro     TEXT NOT NULL,
    threshold   INT  NOT NULL CHECK (threshold >= 0),
    multiplier  NUMERIC(3,2) NOT NULL CHECK (multiplier >= 1.00),
    color       TEXT NOT NULL,
    sort_order  INT  NOT NULL UNIQUE
);

ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_tiers_public_read"
  ON loyalty_tiers FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS loyalty_settings (
    id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    points_per_ron  INT     NOT NULL DEFAULT 10 CHECK (points_per_ron > 0),
    daily_cap       INT     NOT NULL DEFAULT 5000 CHECK (daily_cap >= 0),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE loyalty_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_settings_public_read"
  ON loyalty_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS loyalty_profiles (
    user_id                 UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    points_balance          INT  NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
    lifetime_points_earned  INT  NOT NULL DEFAULT 0 CHECK (lifetime_points_earned >= 0),
    current_tier            TEXT NOT NULL DEFAULT 'clipper' REFERENCES loyalty_tiers(slug),
    last_earned_at          TIMESTAMPTZ,
    last_tier_up_at         TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_current_tier
  ON loyalty_profiles(current_tier);

ALTER TABLE loyalty_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_profiles_self_read"
  ON loyalty_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No client-side INSERT/UPDATE/DELETE. Only SECURITY DEFINER RPCs mutate.

CREATE TABLE IF NOT EXISTS point_transactions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount        INT  NOT NULL,                          -- positive = earn, negative reserved for future
    source        TEXT NOT NULL CHECK (source IN ('appointment','order','bonus','adjustment')),
    reference_id  UUID,                                    -- appointment.id or order.id
    base_amount   INT  NOT NULL,                          -- pre-multiplier base
    multiplier    NUMERIC(3,2) NOT NULL DEFAULT 1.00,     -- tier multiplier applied
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_created
  ON point_transactions(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_point_transactions_source_ref
  ON point_transactions(source, reference_id)
  WHERE reference_id IS NOT NULL;

ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "point_transactions_self_read"
  ON point_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Immutability trigger
CREATE OR REPLACE FUNCTION prevent_point_transaction_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'point_transactions is append-only';
END;
$$;

CREATE TRIGGER trg_point_transactions_no_update
  BEFORE UPDATE ON point_transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_point_transaction_mutation();

CREATE TRIGGER trg_point_transactions_no_delete
  BEFORE DELETE ON point_transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_point_transaction_mutation();


-- ─── 2. Seed data ────────────────────────────────────────

INSERT INTO loyalty_settings (id, points_per_ron, daily_cap, enabled)
VALUES (1, 10, 5000, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO loyalty_tiers (slug, name_ro, threshold, multiplier, color, sort_order) VALUES
  ('clipper', 'Clipper', 0,     1.00, '#8E8E93', 1),
  ('blade',   'Blade',   5000,  1.20, '#0A84FF', 2),
  ('sharp',   'Sharp',   15000, 1.50, '#FFD60A', 3),
  ('maestru', 'Maestru', 35000, 2.00, '#FFD700', 4)
ON CONFLICT (slug) DO NOTHING;

-- Backfill loyalty_profiles rows for existing profiles so dashboard shows zero-state for everyone.
INSERT INTO loyalty_profiles (user_id)
SELECT id FROM profiles
ON CONFLICT (user_id) DO NOTHING;


-- ─── 3. Helper: compute tier from lifetime points ────────

CREATE OR REPLACE FUNCTION loyalty_tier_for_lifetime(p_lifetime INT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT slug
  FROM loyalty_tiers
  WHERE threshold <= GREATEST(p_lifetime, 0)
  ORDER BY threshold DESC
  LIMIT 1;
$$;


-- ─── 4. Earn RPC: appointment ────────────────────────────

CREATE OR REPLACE FUNCTION earn_points_from_appointment(p_appointment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt        RECORD;
  v_settings    RECORD;
  v_profile     RECORD;
  v_tier_mult   NUMERIC(3,2);
  v_base        INT;
  v_earned      INT;
  v_daily_sum   INT;
  v_new_tier    TEXT;
  v_tier_changed BOOLEAN := FALSE;
BEGIN
  -- 1. Lock + fetch appointment
  SELECT id, user_id, status, total_cents
    INTO v_appt
    FROM appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

  IF NOT FOUND OR v_appt.status <> 'completed' THEN
    RETURN jsonb_build_object('skipped','wrong_status');
  END IF;

  -- 2. Idempotency
  IF EXISTS (
    SELECT 1 FROM point_transactions
    WHERE source='appointment' AND reference_id = p_appointment_id
  ) THEN
    RETURN jsonb_build_object('skipped','already_awarded');
  END IF;

  -- 3. Settings
  SELECT * INTO v_settings FROM loyalty_settings WHERE id = 1;
  IF NOT v_settings.enabled THEN
    RETURN jsonb_build_object('skipped','disabled');
  END IF;

  -- 4. Lock/create profile
  INSERT INTO loyalty_profiles (user_id)
    VALUES (v_appt.user_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = v_appt.user_id
    FOR UPDATE;

  -- 5. Base points
  v_base := FLOOR( (COALESCE(v_appt.total_cents, 0) / 100.0) * v_settings.points_per_ron );
  IF v_base <= 0 THEN
    RETURN jsonb_build_object('skipped','zero_amount');
  END IF;

  -- 6. Tier multiplier
  SELECT multiplier INTO v_tier_mult
    FROM loyalty_tiers WHERE slug = v_profile.current_tier;
  v_earned := CEIL(v_base * v_tier_mult)::INT;

  -- 7. Daily cap
  SELECT COALESCE(SUM(amount),0) INTO v_daily_sum
    FROM point_transactions
    WHERE user_id = v_appt.user_id
      AND amount > 0
      AND created_at >= date_trunc('day', NOW());

  IF v_daily_sum + v_earned > v_settings.daily_cap THEN
    v_earned := GREATEST(0, v_settings.daily_cap - v_daily_sum);
  END IF;

  IF v_earned <= 0 THEN
    RETURN jsonb_build_object('skipped','daily_cap');
  END IF;

  -- 8. Insert transaction
  INSERT INTO point_transactions
    (user_id, amount, source, reference_id, base_amount, multiplier, metadata)
  VALUES
    (v_appt.user_id, v_earned, 'appointment', v_appt.id, v_base, v_tier_mult,
     jsonb_build_object('appointment_total_cents', v_appt.total_cents));

  -- 9. Update profile balance
  UPDATE loyalty_profiles
    SET points_balance         = points_balance + v_earned,
        lifetime_points_earned = lifetime_points_earned + v_earned,
        last_earned_at         = NOW(),
        updated_at             = NOW()
    WHERE user_id = v_appt.user_id
    RETURNING lifetime_points_earned INTO v_profile.lifetime_points_earned;

  -- 10. Tier-up check
  v_new_tier := loyalty_tier_for_lifetime(v_profile.lifetime_points_earned);
  IF v_new_tier IS DISTINCT FROM v_profile.current_tier THEN
    UPDATE loyalty_profiles
      SET current_tier    = v_new_tier,
          last_tier_up_at = NOW(),
          updated_at      = NOW()
      WHERE user_id = v_appt.user_id;
    v_tier_changed := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'earned',        v_earned,
    'base',          v_base,
    'multiplier',    v_tier_mult,
    'tier_changed',  v_tier_changed,
    'new_tier',      v_new_tier
  );
END;
$$;

REVOKE ALL ON FUNCTION earn_points_from_appointment(UUID) FROM PUBLIC, authenticated;


-- ─── 5. Earn RPC: order ──────────────────────────────────
-- NOTE: verify the orders.total column name. If the column is NOT total_cents,
-- update the SELECT below (the rest of the body is identical pattern to appointment).

CREATE OR REPLACE FUNCTION earn_points_from_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order       RECORD;
  v_settings    RECORD;
  v_profile     RECORD;
  v_tier_mult   NUMERIC(3,2);
  v_base        INT;
  v_earned      INT;
  v_daily_sum   INT;
  v_new_tier    TEXT;
  v_tier_changed BOOLEAN := FALSE;
BEGIN
  SELECT id, user_id, status, total_cents
    INTO v_order
    FROM orders
    WHERE id = p_order_id
    FOR UPDATE;

  IF NOT FOUND OR v_order.status <> 'paid' THEN
    RETURN jsonb_build_object('skipped','wrong_status');
  END IF;

  IF EXISTS (
    SELECT 1 FROM point_transactions
    WHERE source='order' AND reference_id = p_order_id
  ) THEN
    RETURN jsonb_build_object('skipped','already_awarded');
  END IF;

  SELECT * INTO v_settings FROM loyalty_settings WHERE id = 1;
  IF NOT v_settings.enabled THEN
    RETURN jsonb_build_object('skipped','disabled');
  END IF;

  INSERT INTO loyalty_profiles (user_id)
    VALUES (v_order.user_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = v_order.user_id
    FOR UPDATE;

  v_base := FLOOR( (COALESCE(v_order.total_cents, 0) / 100.0) * v_settings.points_per_ron );
  IF v_base <= 0 THEN
    RETURN jsonb_build_object('skipped','zero_amount');
  END IF;

  SELECT multiplier INTO v_tier_mult
    FROM loyalty_tiers WHERE slug = v_profile.current_tier;
  v_earned := CEIL(v_base * v_tier_mult)::INT;

  SELECT COALESCE(SUM(amount),0) INTO v_daily_sum
    FROM point_transactions
    WHERE user_id = v_order.user_id
      AND amount > 0
      AND created_at >= date_trunc('day', NOW());

  IF v_daily_sum + v_earned > v_settings.daily_cap THEN
    v_earned := GREATEST(0, v_settings.daily_cap - v_daily_sum);
  END IF;

  IF v_earned <= 0 THEN
    RETURN jsonb_build_object('skipped','daily_cap');
  END IF;

  INSERT INTO point_transactions
    (user_id, amount, source, reference_id, base_amount, multiplier, metadata)
  VALUES
    (v_order.user_id, v_earned, 'order', v_order.id, v_base, v_tier_mult,
     jsonb_build_object('order_total_cents', v_order.total_cents));

  UPDATE loyalty_profiles
    SET points_balance         = points_balance + v_earned,
        lifetime_points_earned = lifetime_points_earned + v_earned,
        last_earned_at         = NOW(),
        updated_at             = NOW()
    WHERE user_id = v_order.user_id
    RETURNING lifetime_points_earned INTO v_profile.lifetime_points_earned;

  v_new_tier := loyalty_tier_for_lifetime(v_profile.lifetime_points_earned);
  IF v_new_tier IS DISTINCT FROM v_profile.current_tier THEN
    UPDATE loyalty_profiles
      SET current_tier    = v_new_tier,
          last_tier_up_at = NOW(),
          updated_at      = NOW()
      WHERE user_id = v_order.user_id;
    v_tier_changed := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'earned',        v_earned,
    'base',          v_base,
    'multiplier',    v_tier_mult,
    'tier_changed',  v_tier_changed,
    'new_tier',      v_new_tier
  );
END;
$$;

REVOKE ALL ON FUNCTION earn_points_from_order(UUID) FROM PUBLIC, authenticated;


-- ─── 6. Triggers on status transitions ───────────────────

CREATE OR REPLACE FUNCTION handle_appointment_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    BEGIN
      PERFORM earn_points_from_appointment(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'loyalty earn failed for appointment % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION handle_order_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    BEGIN
      PERFORM earn_points_from_order(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'loyalty earn failed for order % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_points_on_appointment_complete ON appointments;
CREATE TRIGGER trg_award_points_on_appointment_complete
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW EXECUTE FUNCTION handle_appointment_completion();

DROP TRIGGER IF EXISTS trg_award_points_on_order_paid ON orders;
CREATE TRIGGER trg_award_points_on_order_paid
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION handle_order_paid();


-- ─── 7. Auto-create loyalty_profile on new profile ───────

CREATE OR REPLACE FUNCTION handle_new_profile_loyalty()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO loyalty_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_loyalty_profile ON profiles;
CREATE TRIGGER trg_create_loyalty_profile
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_new_profile_loyalty();


-- ─── 8. Enable Realtime ──────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE loyalty_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE point_transactions;

COMMIT;

-- End of migration 072.
```

**Step 3: Verify the migration locally (orchestrator will run — agent only needs to ensure SQL is lint-clean).**

Agent verification: use `psql` or the Supabase CLI linter if available:

```bash
# If the Supabase CLI is installed:
supabase db lint --file migrations/072_loyalty_core.sql
# Otherwise just confirm the file is valid SQL by opening it.
```

**Step 4: Report deliverables.**

Return:
- Path to new migration file
- Whether `orders.total_cents` column name was confirmed or adapted (if adapted, note the change)
- Confirmation that 3 orphan files were deleted

**DO NOT commit.** Orchestrator commits end-to-end.

---

### Task 2: Types + constants

**Agent:** `voltagent-core-dev:backend-developer`

**Files:**
- Modify: `types/database.ts` — append 4 new table Row/Insert/Update types, export `TierSlug` type
- Create: `constants/loyalty.ts`

**Context:** The agent must read `types/database.ts` first to follow the existing pattern (check how `Appointment`, `Profile`, `Order` types are declared — this file uses a specific convention, likely inline under a `Database` interface OR free-standing exports).

**Step 1: Add to `types/database.ts`.**

Read the existing pattern first. Add these types matching the convention. If the file uses a `Database.public.Tables` nested interface (Supabase generated style), add entries under that. If it uses free-standing exported types, add free-standing.

Minimal additions (adapt to file style):

```ts
// ── Loyalty ──────────────────────────────────────────────
export type TierSlug = 'clipper' | 'blade' | 'sharp' | 'maestru';

export interface LoyaltyTier {
  slug: TierSlug;
  name_ro: string;
  threshold: number;
  multiplier: number;
  color: string;
  sort_order: number;
}

export interface LoyaltyProfile {
  user_id: string;
  points_balance: number;
  lifetime_points_earned: number;
  current_tier: TierSlug;
  last_earned_at: string | null;
  last_tier_up_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PointTransactionSource = 'appointment' | 'order' | 'bonus' | 'adjustment';

export interface PointTransaction {
  id: string;
  user_id: string;
  amount: number;
  source: PointTransactionSource;
  reference_id: string | null;
  base_amount: number;
  multiplier: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LoyaltySettings {
  id: 1;
  points_per_ron: number;
  daily_cap: number;
  enabled: boolean;
  updated_at: string;
}
```

If `types/database.ts` uses the Supabase-generated `Database['public']['Tables'][name]['Row']` shape, add entries into that structure using the same column types.

**Step 2: Create `constants/loyalty.ts` with this exact content:**

```ts
import type { TierSlug } from '@/types/database';

export const TIER_SLUGS: readonly TierSlug[] = ['clipper', 'blade', 'sharp', 'maestru'] as const;

export interface TierConfig {
  slug: TierSlug;
  nameRo: string;
  threshold: number;       // lifetime points required
  multiplier: number;      // earn multiplier at this tier
  color: string;           // hex
  sortOrder: number;
}

export const TIER_CONFIG: Record<TierSlug, TierConfig> = {
  clipper: { slug: 'clipper', nameRo: 'Clipper', threshold: 0,     multiplier: 1.00, color: '#8E8E93', sortOrder: 1 },
  blade:   { slug: 'blade',   nameRo: 'Blade',   threshold: 5000,  multiplier: 1.20, color: '#0A84FF', sortOrder: 2 },
  sharp:   { slug: 'sharp',   nameRo: 'Sharp',   threshold: 15000, multiplier: 1.50, color: '#FFD60A', sortOrder: 3 },
  maestru: { slug: 'maestru', nameRo: 'Maestru', threshold: 35000, multiplier: 2.00, color: '#FFD700', sortOrder: 4 },
};

export const TIER_BENEFITS: Record<TierSlug, string[]> = {
  clipper: ['1.0× puncte per RON'],
  blade:   ['1.2× puncte per RON', 'Acces precoce la vouchere (in curand)'],
  sharp:   ['1.5× puncte per RON', 'Vouchere exclusive (in curand)'],
  maestru: ['2.0× puncte per RON', 'Vouchere legendare (in curand)', 'Priority booking (in curand)'],
};

// Mirrors server defaults for client-side preview math only.
// Server is source of truth; read loyalty_settings table if exact value is needed.
export const POINTS_PER_RON = 10;
export const DAILY_CAP = 5000;

// Ordered tier list for iteration
export const TIER_LIST: TierConfig[] = TIER_SLUGS.map((s) => TIER_CONFIG[s]);

export function nextTierFor(current: TierSlug): TierConfig | null {
  const idx = TIER_LIST.findIndex((t) => t.slug === current);
  return idx >= 0 && idx < TIER_LIST.length - 1 ? TIER_LIST[idx + 1] : null;
}

export function tierForLifetime(lifetime: number): TierConfig {
  let pick = TIER_LIST[0];
  for (const t of TIER_LIST) {
    if (lifetime >= t.threshold) pick = t;
  }
  return pick;
}

// Display helper: returns {progress: 0..1, pointsToNext: number | null}
// progress is 1 if at max tier.
export function computeTierProgress(lifetime: number, current: TierSlug): {
  progress: number;
  pointsToNext: number | null;
  currentTier: TierConfig;
  nextTier: TierConfig | null;
} {
  const currentTier = TIER_CONFIG[current];
  const nextTier = nextTierFor(current);

  if (!nextTier) {
    return { progress: 1, pointsToNext: null, currentTier, nextTier: null };
  }

  const span = nextTier.threshold - currentTier.threshold;
  const gained = Math.max(0, lifetime - currentTier.threshold);
  const progress = Math.min(1, span > 0 ? gained / span : 0);
  const pointsToNext = Math.max(0, nextTier.threshold - lifetime);

  return { progress, pointsToNext, currentTier, nextTier };
}
```

**Step 3: Verify TypeScript compiles.**

```bash
npx tsc --noEmit
```

Expected: zero new errors.

**DO NOT commit.**

---

### Task 3: Library helpers

**Agent:** `voltagent-core-dev:backend-developer`

**Files:**
- Create: `lib/loyalty.ts`

**Context:** Existing pattern is in [lib/salon.ts](lib/salon.ts) and [lib/discover.ts](lib/discover.ts) — plain async functions that take the supabase client as a dependency (or import it directly). The app uses `@supabase/supabase-js` via `@/lib/supabase` singleton. Queries are usually wrapped in `useQuery` in hooks; helpers return typed data or throw.

**Step 1: Create `lib/loyalty.ts`.**

```ts
import { supabase } from '@/lib/supabase';
import type { LoyaltyProfile, PointTransaction, TierSlug } from '@/types/database';
import { computeTierProgress } from '@/constants/loyalty';

export type LoyaltyProfileWithProgress = LoyaltyProfile & {
  progress: number;
  pointsToNext: number | null;
};

/**
 * Fetch current user's loyalty profile. Returns null if no session.
 * Row is guaranteed to exist (created by DB trigger on profile insert + backfilled
 * by migration 072), but handle not-found gracefully for robustness.
 */
export async function fetchLoyaltyProfile(userId: string): Promise<LoyaltyProfileWithProgress | null> {
  const { data, error } = await supabase
    .from('loyalty_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { progress, pointsToNext } = computeTierProgress(
    data.lifetime_points_earned,
    data.current_tier as TierSlug,
  );

  return { ...(data as LoyaltyProfile), progress, pointsToNext };
}

/**
 * Fetch most recent N transactions for a user.
 */
export async function fetchRecentTransactions(
  userId: string,
  limit = 20,
): Promise<PointTransaction[]> {
  const { data, error } = await supabase
    .from('point_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as PointTransaction[];
}

/**
 * Human-readable label for a transaction source (Romanian, no diacritics).
 */
export function transactionSourceLabel(
  source: PointTransaction['source'],
  metadata?: Record<string, unknown>,
): string {
  switch (source) {
    case 'appointment': return 'Programare finalizata';
    case 'order':       return 'Comanda shop';
    case 'bonus':       return 'Bonus';
    case 'adjustment':  return 'Ajustare';
    default:            return source;
  }
}

/**
 * Relative-time label (Romanian, no diacritics).
 */
export function relativeTimeLabel(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Acum';
  if (diffMin < 60) return `Acum ${diffMin} min`;
  if (diffHr < 24) return diffHr === 1 ? 'Acum 1 ora' : `Acum ${diffHr} ore`;
  if (diffDay === 1) return 'Ieri';
  if (diffDay < 7) return `Acum ${diffDay} zile`;
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}
```

**Step 2: Verify TypeScript.**

```bash
npx tsc --noEmit
```

Expected: zero new errors.

**DO NOT commit.**

---

## Wave 2 — Frontend (tasks 4–10 run in parallel after Wave 1)

### Task 4: Hooks

**Agent:** `voltagent-core-dev:frontend-developer`

**Files:**
- Create: `hooks/useLoyaltyProfile.ts`
- Create: `hooks/useLoyaltyNotifications.ts`

**Context:** The app uses `@tanstack/react-query` v5 with `useQuery`. Realtime subscriptions via `supabase.channel(...).on('postgres_changes', ...).subscribe()` + cleanup. Session is read from Zustand: `useAuthStore((s) => s.session)`. Similar Realtime patterns exist in [lib/realtime.ts](lib/realtime.ts) — agent should glance at it to match channel-naming convention and cleanup discipline.

**Step 1: Create `hooks/useLoyaltyProfile.ts`.**

```ts
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { fetchLoyaltyProfile, LoyaltyProfileWithProgress } from '@/lib/loyalty';

const QK_PROFILE = (userId: string) => ['loyalty-profile', userId] as const;

export function useLoyaltyProfile() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  const query = useQuery<LoyaltyProfileWithProgress | null>({
    queryKey: userId ? QK_PROFILE(userId) : ['loyalty-profile', 'anonymous'],
    queryFn: () => (userId ? fetchLoyaltyProfile(userId) : Promise.resolve(null)),
    enabled: !!userId,
  });

  // Realtime subscription: invalidate on own-row update
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`loyalty_profile:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'loyalty_profiles',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: QK_PROFILE(userId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return query;
}
```

**Step 2: Create `hooks/useLoyaltyNotifications.ts`.**

```ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import type { TierSlug } from '@/types/database';

export interface EarnedNotice {
  id: string;                                   // transaction id — for dedupe
  points: number;
  source: 'appointment' | 'order' | 'bonus' | 'adjustment';
}

export interface TierChangeNotice {
  from: TierSlug;
  to: TierSlug;
}

/**
 * Global Realtime subscription for loyalty events.
 * Mount ONCE at the root layout, inside the auth gate.
 */
export function useLoyaltyNotifications() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const [lastEarned, setLastEarned] = useState<EarnedNotice | null>(null);
  const [tierChanged, setTierChanged] = useState<TierChangeNotice | null>(null);
  const currentTierRef = useRef<TierSlug | null>(null);
  const seenTxIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      setLastEarned(null);
      setTierChanged(null);
      currentTierRef.current = null;
      seenTxIdsRef.current.clear();
      return;
    }

    // Seed current tier (so first UPDATE doesn't fire a false tier-up)
    supabase
      .from('loyalty_profiles')
      .select('current_tier')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) currentTierRef.current = data.current_tier as TierSlug;
      });

    const channel = supabase
      .channel(`loyalty_notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'point_transactions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const tx = payload.new as {
            id: string;
            amount: number;
            source: EarnedNotice['source'];
          };
          if (tx.amount <= 0) return;
          if (seenTxIdsRef.current.has(tx.id)) return;
          seenTxIdsRef.current.add(tx.id);
          setLastEarned({ id: tx.id, points: tx.amount, source: tx.source });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'loyalty_profiles',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newTier = (payload.new as { current_tier: TierSlug }).current_tier;
          const prev = currentTierRef.current;
          if (prev && prev !== newTier) {
            setTierChanged({ from: prev, to: newTier });
          }
          currentTierRef.current = newTier;
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const dismissEarned = useCallback(() => setLastEarned(null), []);
  const dismissTierChanged = useCallback(() => setTierChanged(null), []);

  return { lastEarned, dismissEarned, tierChanged, dismissTierChanged };
}
```

**Step 3: Verify TypeScript.**

```bash
npx tsc --noEmit
```

**DO NOT commit.**

---

### Task 5: TierBadge + TierProgressBar components

**Agent:** `voltagent-core-dev:ui-designer`

**Files:**
- Create: `components/loyalty/TierBadge.tsx`
- Create: `components/loyalty/TierProgressBar.tsx`

**Context:** Project style is `StyleSheet.create` + `constants/theme` tokens (`Colors`, `Bubble`, `Shadows`, `Typography`). `Bubble.radiiSm` gives asymmetric squircle corners. Animations via `react-native-reanimated` v3. Example shadow/blur patterns live in [components/shop/ProductCard.tsx](components/shop/ProductCard.tsx) and [app/checkout.tsx](app/checkout.tsx).

**Step 1: Create `components/loyalty/TierBadge.tsx`.**

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TierSlug } from '@/types/database';
import { TIER_CONFIG } from '@/constants/loyalty';
import { Typography } from '@/constants/theme';

type Size = 'sm' | 'md' | 'lg';

interface Props {
  tier: TierSlug;
  size?: Size;
  showLabel?: boolean;
}

const DIM: Record<Size, { circle: number; icon: number; label: number }> = {
  sm: { circle: 28, icon: 14, label: 11 },
  md: { circle: 48, icon: 24, label: 13 },
  lg: { circle: 96, icon: 48, label: 18 },
};

export function TierBadge({ tier, size = 'md', showLabel = false }: Props) {
  const cfg = TIER_CONFIG[tier];
  const dim = DIM[size];

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.circle,
          {
            width: dim.circle,
            height: dim.circle,
            borderRadius: dim.circle / 2,
            backgroundColor: cfg.color,
          },
        ]}
      >
        <Ionicons name="trophy" size={dim.icon} color="#FFFFFF" />
      </View>
      {showLabel && (
        <Text
          style={[
            styles.label,
            { fontSize: dim.label, color: cfg.color },
          ]}
        >
          {cfg.nameRo}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  label: {
    marginTop: 6,
    fontFamily: Typography.semiBold,
    letterSpacing: 0.2,
  },
});
```

**Step 2: Create `components/loyalty/TierProgressBar.tsx`.**

```tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { TierSlug } from '@/types/database';
import { computeTierProgress, TIER_CONFIG } from '@/constants/loyalty';
import { Typography } from '@/constants/theme';

interface Props {
  lifetimePoints: number;
  currentTier: TierSlug;
}

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

export function TierProgressBar({ lifetimePoints, currentTier }: Props) {
  const { progress, pointsToNext, nextTier } = computeTierProgress(
    lifetimePoints,
    currentTier,
  );
  const cfg = TIER_CONFIG[currentTier];

  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(progress, { duration: 800, easing: SMOOTH });
  }, [progress, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <Animated.View
          style={[styles.fill, fillStyle, { backgroundColor: cfg.color }]}
        />
      </View>
      <Text style={styles.caption}>
        {nextTier
          ? `${pointsToNext?.toLocaleString('ro-RO')} puncte pana la ${nextTier.nameRo}`
          : 'Nivel maxim atins'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  track: {
    height: 10,
    backgroundColor: 'rgba(15,23,42,0.08)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  caption: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748B',
    fontFamily: Typography.regular,
  },
});
```

**Step 3: Verify.**

```bash
npx tsc --noEmit
```

**DO NOT commit.**

---

### Task 6: PointsEarnedToast component

**Agent:** `voltagent-core-dev:ui-designer`

**Files:**
- Create: `components/loyalty/PointsEarnedToast.tsx`

**Context:** Position: slide-up from bottom, above tab bar (tabs have `paddingBottom: 120` — position toast at `bottom: 100`). Auto-dismisses after 4000 ms. Counts up over 1200 ms. Haptic on mount. Uses `expo-blur` BlurView for glass look.

**Step 1: Create file.**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOutDown,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Typography, Shadows, Bubble } from '@/constants/theme';

interface Props {
  visible: boolean;
  points: number;
  source: 'appointment' | 'order' | 'bonus' | 'adjustment';
  onDismiss: () => void;
}

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const COUNT_STEPS = 20;
const COUNT_DURATION = 1200;
const AUTO_DISMISS_MS = 4000;

const SUBTITLES: Record<Props['source'], string> = {
  appointment: 'Programare finalizata',
  order:       'Comanda platita',
  bonus:       'Bonus primit',
  adjustment:  'Ajustare cont',
};

export function PointsEarnedToast({ visible, points, source, onDismiss }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Count-up animation
  useEffect(() => {
    if (!visible || points <= 0) {
      setDisplayed(points);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const step = Math.max(1, Math.ceil(points / COUNT_STEPS));
    const intervalMs = Math.floor(COUNT_DURATION / COUNT_STEPS);
    let current = 0;
    setDisplayed(0);
    intervalRef.current = setInterval(() => {
      current = Math.min(points, current + step);
      setDisplayed(current);
      if (current >= points && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible, points]);

  // Auto-dismiss
  useEffect(() => {
    if (!visible) return;
    dismissTimerRef.current = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(350).easing(SMOOTH)}
      exiting={FadeOutDown.duration(250)}
      style={styles.wrap}
      pointerEvents="box-none"
    >
      <Pressable onPress={onDismiss} style={styles.pressable}>
        <BlurView intensity={40} tint="dark" style={styles.blur}>
          <View style={styles.iconWrap}>
            <Ionicons name="trophy" size={22} color="#FFD60A" />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title}>Ai castigat puncte!</Text>
            <Text style={styles.value}>+{displayed.toLocaleString('ro-RO')} puncte</Text>
            <Text style={styles.subtitle}>{SUBTITLES[source]}</Text>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  pressable: {
    ...Bubble.radiiSm,
    overflow: 'hidden',
    ...Shadows.md,
  },
  blur: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    backgroundColor: 'rgba(15,23,42,0.85)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,214,10,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: Typography.regular,
  },
  value: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: Typography.semiBold,
    marginTop: 2,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
    fontFamily: Typography.regular,
  },
});
```

**Step 2: Verify.**

```bash
npx tsc --noEmit
```

**DO NOT commit.**

---

### Task 7: TierUpModal component

**Agent:** `voltagent-core-dev:ui-designer`

**Files:**
- Create: `components/loyalty/TierUpModal.tsx`

**Context:** Full-screen modal with confetti burst, large tier badge, beneficii list, dismiss button. Uses `react-native-confetti-cannon` (already in `package.json` dependencies — if not, fall back to a pulse animation). Agent must check `package.json` first.

**Step 1: Install confetti package (confirmed not yet in package.json).**

```bash
npm install react-native-confetti-cannon --save
```

Expected: adds the dep to package.json. No native rebuild needed (pure JS).

**Step 2: Create `components/loyalty/TierUpModal.tsx`.**

```tsx
import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';
import type { TierSlug } from '@/types/database';
import { TIER_CONFIG, TIER_BENEFITS } from '@/constants/loyalty';
import { TierBadge } from './TierBadge';
import { Typography, Bubble, Shadows } from '@/constants/theme';

interface Props {
  visible: boolean;
  fromTier: TierSlug;
  toTier: TierSlug;
  onClose: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

export function TierUpModal({ visible, fromTier, toTier, onClose }: Props) {
  const confettiRef = useRef<ConfettiCannon>(null);
  const toCfg = TIER_CONFIG[toTier];
  const fromCfg = TIER_CONFIG[fromTier];
  const benefits = TIER_BENEFITS[toTier];

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const t = setTimeout(() => confettiRef.current?.start(), 100);
      return () => clearTimeout(t);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(250)}
        exiting={FadeOut.duration(200)}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <Animated.View entering={FadeInDown.delay(200).duration(500).easing(SMOOTH)}>
            <Text style={styles.label}>NIVEL NOU</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).duration(600).easing(SMOOTH)} style={styles.badgeWrap}>
            <TierBadge tier={toTier} size="lg" />
          </Animated.View>

          <Animated.Text
            entering={FadeInDown.delay(450).duration(500).easing(SMOOTH)}
            style={[styles.tierName, { color: toCfg.color }]}
          >
            {toCfg.nameRo}
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.delay(550).duration(500).easing(SMOOTH)}
            style={styles.subtitle}
          >
            Felicitari! Ai avansat de la {fromCfg.nameRo} la {toCfg.nameRo}.
          </Animated.Text>

          <Animated.View
            entering={FadeInDown.delay(700).duration(500).easing(SMOOTH)}
            style={styles.benefitsWrap}
          >
            <Text style={styles.benefitsHeader}>Beneficii noi</Text>
            {benefits.map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={[styles.bullet, { backgroundColor: toCfg.color }]} />
                <Text style={styles.benefitText}>{b}</Text>
              </View>
            ))}
          </Animated.View>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: toCfg.color, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.buttonLabel}>Continua</Text>
          </Pressable>
        </View>

        <ConfettiCannon
          ref={confettiRef}
          count={120}
          origin={{ x: SCREEN_W / 2, y: 0 }}
          autoStart={false}
          fadeOut
          explosionSpeed={550}
          fallSpeed={2800}
          colors={[toCfg.color, '#FFFFFF', '#0A66C2', '#FFD60A']}
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    ...Bubble.radiiSm,
    ...Shadows.lg,
    padding: 28,
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#64748B',
    fontFamily: Typography.semiBold,
  },
  badgeWrap: { marginTop: 16 },
  tierName: {
    marginTop: 12,
    fontSize: 28,
    fontFamily: Typography.semiBold,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    fontFamily: Typography.regular,
    lineHeight: 20,
  },
  benefitsWrap: {
    marginTop: 20,
    alignSelf: 'stretch',
  },
  benefitsHeader: {
    fontSize: 13,
    color: '#0F172A',
    fontFamily: Typography.semiBold,
    marginBottom: 8,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  benefitText: {
    fontSize: 14,
    color: '#334155',
    fontFamily: Typography.regular,
    flex: 1,
  },
  button: {
    marginTop: 24,
    alignSelf: 'stretch',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: Typography.semiBold,
    letterSpacing: 0.3,
  },
});
```

**Step 3: Verify.**

```bash
npx tsc --noEmit
```

**DO NOT commit.**

---

### Task 8: PointsTransactionList component

**Agent:** `voltagent-core-dev:frontend-developer`

**Files:**
- Create: `components/loyalty/PointsTransactionList.tsx`

**Context:** Flat list with earn rows: +NNN puncte (green text) / source label / relative time. Uses `lib/loyalty.ts` helpers.

**Step 1: Create file.**

```tsx
import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PointTransaction } from '@/types/database';
import { transactionSourceLabel, relativeTimeLabel } from '@/lib/loyalty';
import { Typography } from '@/constants/theme';

interface Props {
  transactions: PointTransaction[];
  emptyMessage?: string;
}

export function PointsTransactionList({
  transactions,
  emptyMessage = 'Inca nu ai tranzactii. Finalizeaza o programare sau plateste o comanda ca sa primesti puncte.',
}: Props) {
  if (transactions.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="sparkles-outline" size={28} color="#CBD5E1" />
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={transactions}
      keyExtractor={(t) => t.id}
      scrollEnabled={false}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={item.source === 'order' ? 'cart' : item.source === 'appointment' ? 'cut' : 'star'}
              size={16}
              color="#0A66C2"
            />
          </View>
          <View style={styles.middle}>
            <Text style={styles.label}>{transactionSourceLabel(item.source, item.metadata)}</Text>
            <Text style={styles.time}>{relativeTimeLabel(item.created_at)}</Text>
          </View>
          <Text
            style={[
              styles.amount,
              item.amount >= 0 ? styles.amountPositive : styles.amountNegative,
            ]}
          >
            {item.amount >= 0 ? '+' : ''}
            {item.amount.toLocaleString('ro-RO')} puncte
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(10,102,194,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1 },
  label: {
    fontSize: 14,
    color: '#0F172A',
    fontFamily: Typography.semiBold,
  },
  time: {
    marginTop: 2,
    fontSize: 12,
    color: '#94A3B8',
    fontFamily: Typography.regular,
  },
  amount: {
    fontSize: 14,
    fontFamily: Typography.semiBold,
  },
  amountPositive: { color: '#16A34A' },
  amountNegative: { color: '#DC2626' },
  sep: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.05)',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    fontFamily: Typography.regular,
    lineHeight: 18,
    paddingHorizontal: 24,
  },
});
```

**Step 2: Verify.**

```bash
npx tsc --noEmit
```

**DO NOT commit.**

---

### Task 9: Loyalty dashboard screen

**Agent:** `voltagent-core-dev:frontend-developer`

**Files:**
- Create: `app/loyalty/index.tsx`

**Context:** Screen composes the loyalty components. Uses `useLoyaltyProfile()` for profile + `useQuery` directly (or dedicated hook) for recent transactions. Navigated to from profile menu. Uses back arrow pattern from existing screens like [app/orders.tsx](app/orders.tsx) or [app/appointments.tsx](app/appointments.tsx).

**Step 1: Create file.**

```tsx
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuthStore } from '@/stores/authStore';
import { useLoyaltyProfile } from '@/hooks/useLoyaltyProfile';
import { fetchRecentTransactions } from '@/lib/loyalty';
import { TIER_CONFIG, TIER_BENEFITS } from '@/constants/loyalty';
import { TierBadge } from '@/components/loyalty/TierBadge';
import { TierProgressBar } from '@/components/loyalty/TierProgressBar';
import { PointsTransactionList } from '@/components/loyalty/PointsTransactionList';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';

export default function LoyaltyScreen() {
  const session = useAuthStore((s) => s.session);
  const { data: profile, isLoading } = useLoyaltyProfile();

  const { data: transactions = [] } = useQuery({
    queryKey: ['loyalty-transactions', session?.user.id],
    queryFn: () =>
      session?.user.id
        ? fetchRecentTransactions(session.user.id, 20)
        : Promise.resolve([]),
    enabled: !!session?.user.id,
  });

  const tier = profile ? TIER_CONFIG[profile.current_tier] : TIER_CONFIG.clipper;
  const benefits = profile ? TIER_BENEFITS[profile.current_tier] : TIER_BENEFITS.clipper;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Punctele mele</Text>
        <View style={{ width: 26 }} />
      </View>

      {isLoading || !profile ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero card */}
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={[tier.color, `${tier.color}AA`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <BlurView intensity={15} tint="light" style={styles.heroBlur}>
                <View style={styles.heroTop}>
                  <TierBadge tier={profile.current_tier} size="md" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroTierLabel}>Nivelul tau</Text>
                    <Text style={styles.heroTierName}>{tier.nameRo}</Text>
                  </View>
                </View>
                <Text style={styles.pointsValue}>
                  {profile.points_balance.toLocaleString('ro-RO')}
                </Text>
                <Text style={styles.pointsLabel}>puncte disponibile</Text>
                <View style={{ marginTop: 20 }}>
                  <TierProgressBar
                    lifetimePoints={profile.lifetime_points_earned}
                    currentTier={profile.current_tier}
                  />
                </View>
              </BlurView>
            </LinearGradient>
          </View>

          {/* Benefits card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Beneficii nivel {tier.nameRo}</Text>
            {benefits.map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={[styles.bullet, { backgroundColor: tier.color }]} />
                <Text style={styles.benefitText}>{b}</Text>
              </View>
            ))}
          </View>

          {/* How-to-earn helper */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cum castigi puncte</Text>
            <Text style={styles.howToText}>
              Primesti {Math.round(10 * tier.multiplier)} puncte pentru fiecare RON cheltuit la programari si comenzi.
            </Text>
          </View>

          {/* Transactions */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Istoric</Text>
            <PointsTransactionList transactions={transactions} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 17,
    color: Colors.text,
    fontFamily: Typography.semiBold,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },

  heroWrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    ...Bubble.radiiSm,
    overflow: 'hidden',
    ...Shadows.md,
  },
  heroGradient: { padding: 2 },
  heroBlur: {
    padding: 20,
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  heroTierLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: Typography.regular,
  },
  heroTierName: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: Typography.semiBold,
    marginTop: 2,
    letterSpacing: -0.3,
  },
  pointsValue: {
    fontSize: 44,
    color: '#FFFFFF',
    fontFamily: Typography.semiBold,
    letterSpacing: -1,
    marginTop: 6,
  },
  pointsLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: Typography.regular,
    marginTop: -2,
  },

  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 18,
    backgroundColor: '#FFFFFF',
    ...Bubble.radiiSm,
    ...Shadows.sm,
  },
  cardTitle: {
    fontSize: 15,
    color: Colors.text,
    fontFamily: Typography.semiBold,
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  bullet: { width: 6, height: 6, borderRadius: 3 },
  benefitText: {
    fontSize: 14,
    color: '#334155',
    fontFamily: Typography.regular,
    flex: 1,
  },
  howToText: {
    fontSize: 14,
    color: '#475569',
    fontFamily: Typography.regular,
    lineHeight: 20,
  },
});
```

**Step 2: Verify.**

```bash
npx tsc --noEmit
```

**DO NOT commit.**

---

### Task 10: Profile menu entry + root layout wiring

**Agent:** `voltagent-core-dev:fullstack-developer`

**Files:**
- Modify: `app/(tabs)/profile.tsx` (add menu item)
- Modify: `app/_layout.tsx` (wire `useLoyaltyNotifications` + render global toast + modal)

**Step 1: Modify `app/(tabs)/profile.tsx`.**

Read the file first — the menu is in a `menuItems` array inside `ProfileScreen`. Add an entry for "Punctele mele" BEFORE "Comenzile mele". Need to show the current points balance as a `badge`.

Add these imports at the top (alphabetize near existing imports):

```tsx
import { useLoyaltyProfile } from '@/hooks/useLoyaltyProfile';
```

Inside `ProfileScreen`, near the other hooks:

```tsx
const { data: loyaltyProfile } = useLoyaltyProfile();
```

In the `menuItems` array, insert this entry as the FIRST item:

```tsx
{
  icon: 'trophy',
  label: 'Punctele mele',
  onPress: () => router.push('/loyalty'),
  badge: loyaltyProfile?.points_balance ?? undefined,
  iconColor: '#F5A623',
  iconBgColor: 'rgba(245,166,35,0.1)',
},
```

**Step 2: Modify `app/_layout.tsx`.**

Add imports:

```tsx
import { useLoyaltyNotifications } from '@/hooks/useLoyaltyNotifications';
import { PointsEarnedToast } from '@/components/loyalty/PointsEarnedToast';
import { TierUpModal } from '@/components/loyalty/TierUpModal';
```

Locate the component that renders the Stack navigator (inside the auth gate — where the session is known to exist). Add a small sub-component right above the Stack — or directly in the existing component if structure allows:

```tsx
function LoyaltyGlobalOverlays() {
  const { lastEarned, dismissEarned, tierChanged, dismissTierChanged } = useLoyaltyNotifications();

  return (
    <>
      {lastEarned && (
        <PointsEarnedToast
          visible={!!lastEarned}
          points={lastEarned.points}
          source={lastEarned.source}
          onDismiss={dismissEarned}
        />
      )}
      {tierChanged && (
        <TierUpModal
          visible={!!tierChanged}
          fromTier={tierChanged.from}
          toTier={tierChanged.to}
          onClose={dismissTierChanged}
        />
      )}
    </>
  );
}
```

Render `<LoyaltyGlobalOverlays />` inside the root layout, AFTER the Stack navigator but INSIDE the auth gate (so it unmounts on logout). Example placement:

```tsx
return (
  <>
    <Stack screenOptions={{ headerShown: false }}>
      {/* existing screens */}
    </Stack>
    <LoyaltyGlobalOverlays />
  </>
);
```

Agent must read `app/_layout.tsx` to place this correctly relative to the existing layout structure (providers, auth gate, etc.). If there's already a top-level provider wrapper (e.g., `TutorialProvider`, `CelebrationProvider`), mount the overlays INSIDE that wrapper tree.

**Step 3: Verify.**

```bash
npx tsc --noEmit
```

**DO NOT commit.**

---

## End-to-end verification (orchestrator)

After all 10 tasks complete:

**1. Apply migration.**

```bash
# Via Supabase CLI (local) or dashboard SQL runner:
psql "$SUPABASE_DB_URL" -f migrations/072_loyalty_core.sql
# OR: supabase db push (if migrations/ is wired to the CLI)
```

Expected: no errors. Verify tables exist:

```sql
\d loyalty_profiles
\d point_transactions
\d loyalty_tiers
\d loyalty_settings
SELECT COUNT(*) FROM loyalty_tiers;   -- 4
SELECT COUNT(*) FROM loyalty_settings; -- 1
SELECT COUNT(*) FROM loyalty_profiles; -- = COUNT(*) FROM profiles (backfill)
```

**2. Type-check full codebase.**

```bash
npx tsc --noEmit
```

Expected: zero errors.

**3. Start dev server.**

```bash
npm run start
# Open in iOS simulator or device
```

**4. Manual smoke tests — require Supabase dashboard access.**

- **Earn on appointment completed:**
  1. Log in as test user in app.
  2. Navigate to Profile → see "Punctele mele" row with badge showing `0`.
  3. In Supabase dashboard, find a test appointment for this user with `total_cents = 5000` (50 RON).
  4. UPDATE it: `UPDATE appointments SET status='completed' WHERE id='...'`.
  5. App should show the points-earned toast with "+500 puncte" (50 RON × 10 × 1.0 clipper multiplier) within 1–2 s via Realtime.
  6. Profile menu badge updates to `500`. Opening Loyalty screen shows balance `500` + transaction in history.

- **Earn on order paid:**
  1. Similar: find an order, `UPDATE orders SET status='paid' WHERE id='...'`.
  2. Toast + balance update.

- **Tier up:**
  1. Insert a synthetic large transaction: `UPDATE appointments SET total_cents=600000, status='completed' WHERE id='...'` (6000 RON → 5000 pts after daily cap clamp, but enough to push lifetime past 5000 threshold).
  2. TierUpModal appears with "Felicitari! Ai avansat de la Clipper la Blade." + confetti.

- **Idempotency:**
  1. Re-run the same UPDATE (flip appointment to something else and back to 'completed', OR just observe the trigger never re-fires on the same value). The already_awarded guard in the RPC ensures no double-credit.

- **Logout / re-login:** Subscriptions tear down on logout. Re-login resubscribes; existing notifications don't replay (toast dismisses itself; Realtime only streams future events).

**5. If something fails:**
- Check `RAISE WARNING` logs in Supabase dashboard → Database → Logs.
- Verify Realtime is enabled: `SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';` should list `loyalty_profiles` and `point_transactions`.

**6. Single final commit.**

```bash
git add migrations/072_loyalty_core.sql \
        types/database.ts constants/loyalty.ts lib/loyalty.ts \
        hooks/useLoyaltyProfile.ts hooks/useLoyaltyNotifications.ts \
        components/loyalty/ \
        app/loyalty/ \
        app/\(tabs\)/profile.tsx app/_layout.tsx

git add -u migrations/  # picks up the 3 deletions

git commit -m "$(cat <<'EOF'
feat(loyalty): points earning on appointment & order spend

Single unified points balance with 4 tier progression (Clipper → Blade →
Sharp → Maestru) and tier multipliers (1.0x / 1.2x / 1.5x / 2.0x). Points
awarded automatically via Postgres triggers when appointments complete
or orders are marked paid, with append-only transactions, idempotency,
and daily cap. In-app toast on earn and celebration modal on tier-up via
Supabase Realtime. Profile menu surfaces current balance.

Deletes 3 orphan loyalty migrations copy-pasted from Tapzi without their
dependencies. Architecture leaves space for future voucher redemption.

Spec: docs/superpowers/specs/2026-04-23-loyalty-points-system-design.md
Plan: docs/superpowers/plans/2026-04-23-loyalty-points-system.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
