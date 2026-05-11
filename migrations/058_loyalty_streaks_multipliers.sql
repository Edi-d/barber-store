-- ============================================================================
-- Migration 058: Streaks & Multipliers V2
-- ============================================================================
-- Evolves loyalty_streaks and point_multipliers from 054, adds:
--   - Grace periods (tier-based) on streaks
--   - streak_rewards config table with milestone bonuses
--   - Expanded multiplier scopes (product, referral, specific_service)
--   - RPC: update_streak_on_visit  (called after appointment completion)
--   - RPC: get_active_multipliers  (used during point calculation)
--   - Default seed data for streak milestones
-- ============================================================================


-- ============================================================================
-- 1. EVOLVE loyalty_streaks — Add grace period + booking_ahead type
-- ============================================================================

-- Add new columns
ALTER TABLE loyalty_streaks
    ADD COLUMN IF NOT EXISTS grace_periods_remaining INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS broken_at TIMESTAMPTZ;

-- Rename streak_broken_at → broken_at if the old column exists and new one doesn't
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'loyalty_streaks' AND column_name = 'streak_broken_at'
    ) THEN
        -- Copy data from old column to new column
        UPDATE loyalty_streaks SET broken_at = streak_broken_at WHERE broken_at IS NULL AND streak_broken_at IS NOT NULL;
    END IF;
END $$;

-- Expand streak_type CHECK to include 'booking_ahead'
-- Drop existing check constraint if it exists, then re-add
ALTER TABLE loyalty_streaks DROP CONSTRAINT IF EXISTS loyalty_streaks_streak_type_check;
ALTER TABLE loyalty_streaks ADD CONSTRAINT loyalty_streaks_streak_type_check
    CHECK (streak_type IN ('monthly_visit', 'weekly_visit', 'booking_ahead'));

-- Update default to monthly_visit (the primary streak type)
ALTER TABLE loyalty_streaks ALTER COLUMN streak_type SET DEFAULT 'monthly_visit';

-- Remove loyalty_profile_id NOT NULL requirement if column exists (we rely on user_id + salon_id)
-- (kept for backwards compat, just make nullable)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'loyalty_streaks' AND column_name = 'loyalty_profile_id'
    ) THEN
        ALTER TABLE loyalty_streaks ALTER COLUMN loyalty_profile_id DROP NOT NULL;
    END IF;
END $$;


-- ============================================================================
-- 2. EVOLVE point_multipliers — Expand scope + add service_id FK
-- ============================================================================

-- Expand applies_to → scope with more values
ALTER TABLE point_multipliers
    ADD COLUMN IF NOT EXISTS scope TEXT;

-- Backfill scope from applies_to
UPDATE point_multipliers SET scope = applies_to WHERE scope IS NULL;

-- Add service_id FK column
ALTER TABLE point_multipliers
    ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES barber_services(id) ON DELETE SET NULL;

-- Backfill service_id from applies_to_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'point_multipliers' AND column_name = 'applies_to_id'
    ) THEN
        UPDATE point_multipliers SET service_id = applies_to_id WHERE service_id IS NULL AND applies_to = 'specific_service';
    END IF;
END $$;

-- Add scope CHECK constraint
ALTER TABLE point_multipliers DROP CONSTRAINT IF EXISTS point_multipliers_scope_check;
ALTER TABLE point_multipliers ADD CONSTRAINT point_multipliers_scope_check
    CHECK (scope IN ('all', 'appointment', 'product', 'referral', 'specific_service'));

-- Add multiplier range CHECK
ALTER TABLE point_multipliers DROP CONSTRAINT IF EXISTS point_multipliers_multiplier_range;
ALTER TABLE point_multipliers ADD CONSTRAINT point_multipliers_multiplier_range
    CHECK (multiplier > 0 AND multiplier <= 5.0);

-- Add time window CHECK
ALTER TABLE point_multipliers DROP CONSTRAINT IF EXISTS point_multipliers_time_window;
ALTER TABLE point_multipliers ADD CONSTRAINT point_multipliers_time_window
    CHECK (ends_at > starts_at);

-- Index for service-specific multiplier lookups
CREATE INDEX IF NOT EXISTS idx_point_multipliers_service
    ON point_multipliers(service_id) WHERE service_id IS NOT NULL;


-- ============================================================================
-- 3. STREAK REWARDS — Milestone bonus configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS streak_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    streak_type TEXT NOT NULL,
    milestone INT NOT NULL,                      -- streak count that triggers reward (2, 3, 4, 6, 12)
    bonus_points INT NOT NULL,                   -- points awarded at this milestone
    badge_id UUID REFERENCES achievements(id) ON DELETE SET NULL,  -- optional achievement to unlock
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(salon_id, streak_type, milestone),
    CONSTRAINT streak_rewards_streak_type_check
        CHECK (streak_type IN ('monthly_visit', 'weekly_visit', 'booking_ahead')),
    CONSTRAINT streak_rewards_milestone_positive
        CHECK (milestone > 0),
    CONSTRAINT streak_rewards_bonus_positive
        CHECK (bonus_points > 0)
);

ALTER TABLE streak_rewards ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_streak_rewards_salon ON streak_rewards(salon_id, streak_type);
CREATE INDEX IF NOT EXISTS idx_streak_rewards_lookup ON streak_rewards(salon_id, streak_type, milestone);

DROP POLICY IF EXISTS "Anyone can view streak rewards" ON streak_rewards;
CREATE POLICY "Anyone can view streak rewards" ON streak_rewards
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Salon owner can manage streak rewards" ON streak_rewards;
CREATE POLICY "Salon owner can manage streak rewards" ON streak_rewards
    FOR ALL USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = streak_rewards.salon_id AND s.owner_id = auth.uid())
    );


-- ============================================================================
-- 4. RPC: update_streak_on_visit
-- ============================================================================
-- Called after appointment completion. Handles:
--   - Monthly visit streak window (35 days)
--   - Grace periods based on loyalty tier
--   - Milestone bonus point awards via earn_loyalty_points
--   - Achievement/badge unlocks at milestones
-- ============================================================================
CREATE OR REPLACE FUNCTION update_streak_on_visit(
    p_user_id UUID,
    p_salon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_streak loyalty_streaks%ROWTYPE;
    v_tier_slug TEXT;
    v_grace_periods INT := 0;
    v_streak_window INTERVAL := INTERVAL '35 days';
    v_now TIMESTAMPTZ := NOW();
    v_days_since_last NUMERIC;
    v_was_broken BOOLEAN := FALSE;
    v_grace_used BOOLEAN := FALSE;
    v_milestones_hit JSONB := '[]'::JSONB;
    v_milestone RECORD;
    v_earn_result JSONB;
    v_profile_id UUID;
BEGIN
    -- ── Determine tier-based grace periods ──
    SELECT lt.slug INTO v_tier_slug
    FROM loyalty_profiles lp
    JOIN loyalty_tiers lt ON lt.id = lp.current_tier_id
    WHERE lp.user_id = p_user_id AND lp.salon_id = p_salon_id;

    v_grace_periods := CASE v_tier_slug
        WHEN 'clipper'  THEN 0
        WHEN 'blade'    THEN 1
        WHEN 'sharp'    THEN 2
        WHEN 'maestru'  THEN 2
        ELSE 0
    END;

    -- ── Get or create streak row (with row lock) ──
    SELECT * INTO v_streak
    FROM loyalty_streaks
    WHERE user_id = p_user_id
      AND salon_id = p_salon_id
      AND streak_type = 'monthly_visit'
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO loyalty_streaks (
            user_id, salon_id, streak_type,
            current_count, longest_count,
            last_activity_at, streak_started_at,
            grace_period_used, grace_periods_remaining
        ) VALUES (
            p_user_id, p_salon_id, 'monthly_visit',
            1, 1,
            v_now, v_now,
            FALSE, v_grace_periods
        )
        RETURNING * INTO v_streak;

        -- Check if milestone 1 exists (unlikely but possible)
        -- Fall through to milestone check below
    ELSE
        -- ── Evaluate streak continuity ──
        IF v_streak.last_activity_at IS NOT NULL THEN
            v_days_since_last := EXTRACT(EPOCH FROM (v_now - v_streak.last_activity_at)) / 86400.0;

            IF v_days_since_last <= EXTRACT(EPOCH FROM v_streak_window) / 86400.0 THEN
                -- Within window: increment streak
                UPDATE loyalty_streaks SET
                    current_count = current_count + 1,
                    longest_count = GREATEST(longest_count, current_count + 1),
                    last_activity_at = v_now,
                    grace_period_used = FALSE,
                    grace_periods_remaining = v_grace_periods,
                    updated_at = v_now
                WHERE id = v_streak.id
                RETURNING * INTO v_streak;

            ELSIF v_days_since_last <= (EXTRACT(EPOCH FROM v_streak_window) / 86400.0) * 2
                  AND v_streak.grace_periods_remaining > 0 THEN
                -- Within double window AND has grace period: use grace, increment
                v_grace_used := TRUE;
                UPDATE loyalty_streaks SET
                    current_count = current_count + 1,
                    longest_count = GREATEST(longest_count, current_count + 1),
                    last_activity_at = v_now,
                    grace_period_used = TRUE,
                    grace_periods_remaining = grace_periods_remaining - 1,
                    updated_at = v_now
                WHERE id = v_streak.id
                RETURNING * INTO v_streak;

            ELSE
                -- Streak broken: reset
                v_was_broken := TRUE;
                UPDATE loyalty_streaks SET
                    current_count = 1,
                    last_activity_at = v_now,
                    streak_started_at = v_now,
                    broken_at = v_now,
                    grace_period_used = FALSE,
                    grace_periods_remaining = v_grace_periods,
                    updated_at = v_now
                WHERE id = v_streak.id
                RETURNING * INTO v_streak;
            END IF;
        ELSE
            -- First visit on existing row (no previous activity)
            UPDATE loyalty_streaks SET
                current_count = 1,
                last_activity_at = v_now,
                streak_started_at = v_now,
                grace_period_used = FALSE,
                grace_periods_remaining = v_grace_periods,
                updated_at = v_now
            WHERE id = v_streak.id
            RETURNING * INTO v_streak;
        END IF;
    END IF;

    -- ── Check milestone rewards ──
    FOR v_milestone IN
        SELECT sr.milestone, sr.bonus_points, sr.badge_id
        FROM streak_rewards sr
        WHERE sr.salon_id = p_salon_id
          AND sr.streak_type = 'monthly_visit'
          AND sr.milestone = v_streak.current_count
    LOOP
        -- Award bonus points via earn_loyalty_points (idempotent)
        v_earn_result := earn_loyalty_points(
            p_user_id := p_user_id,
            p_salon_id := p_salon_id,
            p_amount := v_milestone.bonus_points,
            p_source := 'streak_bonus',
            p_description := 'Bonus streak: ' || v_streak.current_count || ' vizite consecutive',
            p_idempotency_key := 'streak_' || p_user_id || '_' || p_salon_id || '_monthly_' || v_streak.current_count || '_' || v_streak.streak_started_at::TEXT,
            p_metadata := jsonb_build_object(
                'streak_type', 'monthly_visit',
                'streak_count', v_streak.current_count,
                'milestone', v_milestone.milestone
            )
        );

        -- Award badge if configured
        IF v_milestone.badge_id IS NOT NULL THEN
            INSERT INTO user_achievements (user_id, achievement_id, salon_id, points_awarded, metadata)
            VALUES (
                p_user_id,
                v_milestone.badge_id,
                p_salon_id,
                v_milestone.bonus_points,
                jsonb_build_object('streak_milestone', v_milestone.milestone)
            )
            ON CONFLICT (user_id, achievement_id) DO NOTHING;
        END IF;

        v_milestones_hit := v_milestones_hit || jsonb_build_object(
            'milestone', v_milestone.milestone,
            'bonus_points', v_milestone.bonus_points,
            'badge_id', v_milestone.badge_id
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'current_count', v_streak.current_count,
        'longest_count', v_streak.longest_count,
        'was_broken', v_was_broken,
        'grace_used', v_grace_used,
        'grace_periods_remaining', v_streak.grace_periods_remaining,
        'milestones_hit', v_milestones_hit,
        'streak_started_at', v_streak.streak_started_at
    );
END;
$$;


-- ============================================================================
-- 5. RPC: get_active_multipliers
-- ============================================================================
-- Returns currently active multipliers for a salon.
-- Used during point calculation to apply bonus multipliers.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_active_multipliers(
    p_salon_id UUID
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    multiplier NUMERIC(3,2),
    scope TEXT,
    service_id UUID,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pm.id,
        pm.name,
        pm.description,
        pm.multiplier,
        COALESCE(pm.scope, pm.applies_to) AS scope,
        COALESCE(pm.service_id, pm.applies_to_id) AS service_id,
        pm.starts_at,
        pm.ends_at
    FROM point_multipliers pm
    WHERE pm.salon_id = p_salon_id
      AND pm.active = TRUE
      AND NOW() BETWEEN pm.starts_at AND pm.ends_at
    ORDER BY pm.multiplier DESC;
END;
$$;


-- ============================================================================
-- 6. SEED: Default streak milestones
-- ============================================================================
-- Insert default monthly_visit milestones for all existing salons.
-- Uses ON CONFLICT to be idempotent.
-- ============================================================================
DO $$
DECLARE
    v_salon_id UUID;
    v_milestones INT[] := ARRAY[2, 3, 4, 6, 12];
    v_points INT[] := ARRAY[200, 400, 600, 1000, 3000];
    i INT;
BEGIN
    FOR v_salon_id IN SELECT id FROM salons LOOP
        FOR i IN 1..array_length(v_milestones, 1) LOOP
            INSERT INTO streak_rewards (salon_id, streak_type, milestone, bonus_points)
            VALUES (v_salon_id, 'monthly_visit', v_milestones[i], v_points[i])
            ON CONFLICT (salon_id, streak_type, milestone) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;


-- ============================================================================
-- 7. TRIGGER: Auto-seed streak rewards for new salons
-- ============================================================================
CREATE OR REPLACE FUNCTION seed_streak_rewards_for_salon()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO streak_rewards (salon_id, streak_type, milestone, bonus_points) VALUES
        (NEW.id, 'monthly_visit', 2,  200),
        (NEW.id, 'monthly_visit', 3,  400),
        (NEW.id, 'monthly_visit', 4,  600),
        (NEW.id, 'monthly_visit', 6,  1000),
        (NEW.id, 'monthly_visit', 12, 3000)
    ON CONFLICT (salon_id, streak_type, milestone) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_streak_rewards ON salons;
CREATE TRIGGER trg_seed_streak_rewards
    AFTER INSERT ON salons
    FOR EACH ROW
    EXECUTE FUNCTION seed_streak_rewards_for_salon();
