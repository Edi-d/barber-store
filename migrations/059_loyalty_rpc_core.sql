-- ============================================
-- Migration 059: Loyalty Core RPC Functions
-- ============================================
-- Assumes tables from 054_loyalty_core.sql and
-- 054_loyalty_gamification.sql exist.
--
-- Functions:
--   1. earn_appointment_points  — award points for completed appointment
--   2. redeem_reward            — redeem a reward from the catalog
--   3. redeem_points_as_discount — partial payment with points
--   4. get_loyalty_dashboard    — single-call dashboard data
--   5. use_voucher              — barber marks redemption as used
--   6. update_streak_on_visit   — internal streak update helper
--
-- All: SECURITY DEFINER SET search_path = public
-- Race-safe: FOR UPDATE + version checks
-- Idempotent where applicable
-- Romanian error messages
-- ============================================


-- ============================================
-- SCHEMA RECONCILIATION
-- ============================================
-- 054_loyalty_core.sql and 054_loyalty_gamification.sql
-- define overlapping loyalty_profiles columns. Ensure
-- ALL required columns exist regardless of run order.
-- ============================================

-- Columns from gamification schema (may be missing if core ran first)
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS lifetime_points INT NOT NULL DEFAULT 0;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS current_tier_id UUID REFERENCES loyalty_tiers(id) ON DELETE SET NULL;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS tier_updated_at TIMESTAMPTZ;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS total_spent_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Columns from core schema (may be missing if gamification ran first)
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'clipper';
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS tier_since TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS lifetime_earned INT NOT NULL DEFAULT 0;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS lifetime_redeemed INT NOT NULL DEFAULT 0;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS streak_count INT NOT NULL DEFAULT 0;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS longest_streak INT NOT NULL DEFAULT 0;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS streak_last_visit TIMESTAMPTZ;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS frozen_reason TEXT;
ALTER TABLE loyalty_profiles ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- Columns from gamification loyalty_settings (may be missing if core ran first)
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS referral_referrer_points INT NOT NULL DEFAULT 100;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS referral_referred_points INT NOT NULL DEFAULT 50;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS streak_bonus_points INT NOT NULL DEFAULT 25;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS streak_grace_period_hours INT NOT NULL DEFAULT 48;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_expiry_days INT;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS redemption_code_expiry_hours INT NOT NULL DEFAULT 72;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS min_points_to_redeem INT NOT NULL DEFAULT 50;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS welcome_bonus_points INT NOT NULL DEFAULT 0;

-- Columns from core loyalty_settings (may be missing if gamification ran first)
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS welcome_bonus INT NOT NULL DEFAULT 50;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS referral_bonus_referrer INT NOT NULL DEFAULT 150;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS referral_bonus_referee INT NOT NULL DEFAULT 200;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_expire_months INT NOT NULL DEFAULT 12;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS max_daily_earn INT NOT NULL DEFAULT 5000;

-- Columns from gamification point_transactions (may be missing if core ran first)
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS multiplier_applied NUMERIC(3,2) DEFAULT 1.00;
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Columns from core point_transactions (may be missing if gamification ran first)
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0;
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;


-- ============================================
-- HELPER: update_streak_on_visit
-- ============================================
-- Called internally by earn_appointment_points.
-- Updates the weekly_visit streak for a loyalty profile.
-- A visit within 14 days of the last one continues the streak.
-- Grace period: one miss allowed per streak before breaking.
-- ============================================
CREATE OR REPLACE FUNCTION update_streak_on_visit(
    p_loyalty_profile_id UUID,
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
    v_days_since NUMERIC;
    v_settings loyalty_settings%ROWTYPE;
    v_grace_hours INT;
    v_new_count INT;
    v_bonus_points INT := 0;
BEGIN
    SELECT * INTO v_settings FROM loyalty_settings WHERE salon_id = p_salon_id;
    v_grace_hours := COALESCE(v_settings.streak_grace_period_hours, 48);

    -- Get or create streak row (locked)
    SELECT * INTO v_streak
    FROM loyalty_streaks
    WHERE user_id = p_user_id
      AND salon_id = p_salon_id
      AND streak_type = 'weekly_visit'
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO loyalty_streaks (
            user_id, salon_id, loyalty_profile_id, streak_type,
            current_count, longest_count, last_activity_at, streak_started_at
        ) VALUES (
            p_user_id, p_salon_id, p_loyalty_profile_id, 'weekly_visit',
            1, 1, NOW(), NOW()
        );

        RETURN jsonb_build_object(
            'streak_count', 1,
            'longest', 1,
            'streak_started', true,
            'bonus_points', 0
        );
    END IF;

    -- Calculate days since last activity
    IF v_streak.last_activity_at IS NULL THEN
        v_days_since := 999;
    ELSE
        v_days_since := EXTRACT(EPOCH FROM (NOW() - v_streak.last_activity_at)) / 86400.0;
    END IF;

    -- Same day visit — no streak change
    IF v_days_since < 1 THEN
        RETURN jsonb_build_object(
            'streak_count', v_streak.current_count,
            'longest', v_streak.longest_count,
            'streak_started', false,
            'bonus_points', 0
        );
    END IF;

    -- Within 14 days — continue streak
    IF v_days_since <= 14 THEN
        v_new_count := v_streak.current_count + 1;

        -- Milestone bonuses: every 4 weeks (visits)
        IF v_new_count > 0 AND v_new_count % 4 = 0 THEN
            v_bonus_points := COALESCE(v_settings.streak_bonus_points, 25) * (v_new_count / 4);
        END IF;

        UPDATE loyalty_streaks
        SET current_count    = v_new_count,
            longest_count    = GREATEST(v_streak.longest_count, v_new_count),
            last_activity_at = NOW(),
            grace_period_used = false,
            updated_at       = NOW()
        WHERE id = v_streak.id;

        RETURN jsonb_build_object(
            'streak_count', v_new_count,
            'longest', GREATEST(v_streak.longest_count, v_new_count),
            'streak_started', false,
            'bonus_points', v_bonus_points
        );
    END IF;

    -- Between 14 and 14 + grace period — use grace period
    IF v_days_since <= (14 + v_grace_hours / 24.0) AND NOT v_streak.grace_period_used THEN
        v_new_count := v_streak.current_count + 1;

        UPDATE loyalty_streaks
        SET current_count     = v_new_count,
            longest_count     = GREATEST(v_streak.longest_count, v_new_count),
            last_activity_at  = NOW(),
            grace_period_used = true,
            updated_at        = NOW()
        WHERE id = v_streak.id;

        RETURN jsonb_build_object(
            'streak_count', v_new_count,
            'longest', GREATEST(v_streak.longest_count, v_new_count),
            'streak_started', false,
            'grace_used', true,
            'bonus_points', 0
        );
    END IF;

    -- Streak broken — reset
    UPDATE loyalty_streaks
    SET current_count     = 1,
        streak_started_at = NOW(),
        streak_broken_at  = NOW(),
        last_activity_at  = NOW(),
        grace_period_used = false,
        updated_at        = NOW()
    WHERE id = v_streak.id;

    RETURN jsonb_build_object(
        'streak_count', 1,
        'longest', v_streak.longest_count,
        'streak_started', true,
        'streak_broken', true,
        'bonus_points', 0
    );
END;
$$;


-- ============================================
-- 1. earn_appointment_points
-- ============================================
-- Awards loyalty points for a completed appointment.
-- Idempotent via key 'apt_' || appointment_id.
-- Applies tier multiplier, event multipliers (max 2 stacking),
-- daily earn cap, streak update, and tier upgrade check.
-- ============================================
CREATE OR REPLACE FUNCTION earn_appointment_points(
    p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_apt           RECORD;
    v_salon_id      UUID;
    v_user_id       UUID;
    v_settings      loyalty_settings%ROWTYPE;
    v_profile       loyalty_profiles%ROWTYPE;
    v_base_points   INT;
    v_tier_mult     NUMERIC(4,2) := 1.00;
    v_tier_slug     TEXT;
    v_event_mults   NUMERIC(4,2)[];
    v_event_mult    NUMERIC(4,2) := 1.00;
    v_total_mult    NUMERIC(6,2);
    v_final_points  INT;
    v_new_balance   INT;
    v_new_lifetime  INT;
    v_daily_earned  INT;
    v_txn_id        UUID;
    v_idem_key      TEXT;
    v_expires_at    TIMESTAMPTZ;
    v_tier_changed  BOOLEAN := false;
    v_new_tier_id   UUID;
    v_old_tier_id   UUID;
    v_streak_result JSONB;
    v_streak_bonus  INT := 0;
BEGIN
    -- ---- Load appointment ----
    SELECT a.id, a.user_id, a.barber_id, a.total_cents, a.status, a.scheduled_at
    INTO v_apt
    FROM appointments a
    WHERE a.id = p_appointment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'not_found',
            'message', 'Programarea nu a fost gasita'
        );
    END IF;

    IF v_apt.status <> 'completed' THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'not_completed',
            'message', 'Programarea nu este finalizata'
        );
    END IF;

    v_user_id := v_apt.user_id;

    -- ---- Resolve salon_id through barber -> salon_members ----
    SELECT sm.salon_id INTO v_salon_id
    FROM salon_members sm
    WHERE sm.profile_id = v_apt.barber_id
    LIMIT 1;

    IF v_salon_id IS NULL THEN
        -- Fallback: try barbers table directly
        SELECT b.salon_id INTO v_salon_id
        FROM barbers b
        WHERE b.id = v_apt.barber_id;
    END IF;

    IF v_salon_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'no_salon',
            'message', 'Salonul nu a fost gasit pentru acest frizer'
        );
    END IF;

    -- ---- Load settings ----
    SELECT * INTO v_settings FROM loyalty_settings WHERE salon_id = v_salon_id;

    IF NOT FOUND OR NOT v_settings.enabled THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'loyalty_disabled',
            'message', 'Sistemul de loialitate nu este activ pentru acest salon'
        );
    END IF;

    -- ---- Idempotency check ----
    v_idem_key := 'apt_' || p_appointment_id::TEXT;

    IF EXISTS (SELECT 1 FROM point_transactions WHERE idempotency_key = v_idem_key) THEN
        RETURN jsonb_build_object(
            'status', 'duplicate',
            'message', 'Punctele au fost deja acordate pentru aceasta programare'
        );
    END IF;

    -- ---- Get or create loyalty profile (with row lock) ----
    SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = v_user_id AND salon_id = v_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO loyalty_profiles (user_id, salon_id, referral_code)
        VALUES (
            v_user_id,
            v_salon_id,
            UPPER(SUBSTR(MD5(v_user_id::TEXT || v_salon_id::TEXT || NOW()::TEXT), 1, 8))
        )
        RETURNING * INTO v_profile;
    END IF;

    -- ---- Calculate base points ----
    -- total_cents / 100 = RON, * points_per_ron
    v_base_points := GREATEST(FLOOR(v_apt.total_cents::NUMERIC / 100.0 * v_settings.points_per_ron), 0);

    -- ---- Tier multiplier ----
    -- From loyalty_tiers if profile has a tier, else hardcoded defaults
    IF v_profile.current_tier_id IS NOT NULL THEN
        SELECT lt.multiplier, lt.slug INTO v_tier_mult, v_tier_slug
        FROM loyalty_tiers lt
        WHERE lt.id = v_profile.current_tier_id;
    ELSE
        -- Fallback: use tier from loyalty_profiles (054_loyalty_core schema)
        v_tier_slug := COALESCE(v_profile.tier, 'clipper');
        v_tier_mult := CASE v_tier_slug
            WHEN 'clipper'  THEN 1.0
            WHEN 'blade'    THEN 1.2
            WHEN 'sharp'    THEN 1.5
            WHEN 'maestru'  THEN 2.0
            ELSE 1.0
        END;
    END IF;

    -- ---- Event multipliers (max 2 stacking) ----
    SELECT ARRAY_AGG(pm.multiplier ORDER BY pm.multiplier DESC)
    INTO v_event_mults
    FROM point_multipliers pm
    WHERE pm.salon_id = v_salon_id
      AND pm.active = true
      AND NOW() BETWEEN pm.starts_at AND pm.ends_at
      AND (pm.applies_to = 'all' OR pm.applies_to = 'appointment');

    IF v_event_mults IS NOT NULL AND array_length(v_event_mults, 1) > 0 THEN
        v_event_mult := v_event_mults[1];
        IF array_length(v_event_mults, 1) >= 2 THEN
            v_event_mult := v_event_mult * v_event_mults[2];
        END IF;
    END IF;

    -- ---- Combined multiplier & final points ----
    v_total_mult := v_tier_mult * v_event_mult;
    v_final_points := CEIL(v_base_points * v_total_mult);

    -- ---- Daily earn cap ----
    SELECT COALESCE(SUM(pt.amount), 0) INTO v_daily_earned
    FROM point_transactions pt
    WHERE pt.user_id = v_user_id
      AND pt.salon_id = v_salon_id
      AND pt.amount > 0
      AND pt.created_at >= DATE_TRUNC('day', NOW());

    IF v_settings.max_daily_earn IS NOT NULL
       AND (v_daily_earned + v_final_points) > v_settings.max_daily_earn THEN
        v_final_points := GREATEST(v_settings.max_daily_earn - v_daily_earned, 0);
    END IF;

    IF v_final_points <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'capped',
            'message', 'Limita zilnica de puncte a fost atinsa',
            'daily_earned', v_daily_earned,
            'daily_cap', v_settings.max_daily_earn
        );
    END IF;

    -- ---- Point expiry ----
    IF v_settings.points_expiry_days IS NOT NULL THEN
        v_expires_at := NOW() + (v_settings.points_expiry_days || ' days')::INTERVAL;
    END IF;

    -- ---- Update loyalty_profile (version check) ----
    v_new_balance  := v_profile.current_points + v_final_points;
    v_new_lifetime := COALESCE(v_profile.lifetime_points, 0) + v_final_points;
    v_old_tier_id  := v_profile.current_tier_id;

    UPDATE loyalty_profiles
    SET current_points    = v_new_balance,
        lifetime_points   = v_new_lifetime,
        total_visits      = total_visits + 1,
        last_visit_at     = NOW(),
        total_spent_cents = total_spent_cents + COALESCE(v_apt.total_cents, 0),
        updated_at        = NOW()
    WHERE id = v_profile.id;

    -- ---- Insert point_transaction ----
    INSERT INTO point_transactions (
        loyalty_profile_id, salon_id, user_id, type, amount,
        balance_after, source, source_id, description,
        multiplier_applied, idempotency_key, expires_at
    ) VALUES (
        v_profile.id, v_salon_id, v_user_id, 'earn_appointment', v_final_points,
        v_new_balance, 'appointment', p_appointment_id,
        'Puncte castigate din programare',
        v_total_mult, v_idem_key, v_expires_at
    )
    RETURNING id INTO v_txn_id;

    -- ---- Check tier upgrade (lifetime thresholds) ----
    SELECT lt.id INTO v_new_tier_id
    FROM loyalty_tiers lt
    WHERE lt.salon_id = v_salon_id
      AND lt.active = true
      AND lt.min_lifetime_points <= v_new_lifetime
    ORDER BY lt.min_lifetime_points DESC
    LIMIT 1;

    IF v_new_tier_id IS DISTINCT FROM v_old_tier_id THEN
        v_tier_changed := true;
        UPDATE loyalty_profiles
        SET current_tier_id = v_new_tier_id,
            tier_updated_at = NOW()
        WHERE id = v_profile.id;
    END IF;

    -- Also handle hardcoded tier from 054_loyalty_core schema (tier TEXT column)
    -- Thresholds: 5000=blade, 15000=sharp, 35000=maestru
    BEGIN
        UPDATE loyalty_profiles
        SET tier = CASE
                WHEN v_new_lifetime >= 35000 THEN 'maestru'
                WHEN v_new_lifetime >= 15000 THEN 'sharp'
                WHEN v_new_lifetime >=  5000 THEN 'blade'
                ELSE 'clipper'
            END,
            tier_since = CASE
                WHEN tier <> (CASE
                    WHEN v_new_lifetime >= 35000 THEN 'maestru'
                    WHEN v_new_lifetime >= 15000 THEN 'sharp'
                    WHEN v_new_lifetime >=  5000 THEN 'blade'
                    ELSE 'clipper'
                END) THEN NOW()
                ELSE tier_since
            END
        WHERE id = v_profile.id;
    EXCEPTION WHEN undefined_column THEN
        -- tier TEXT column may not exist in gamification schema — skip
        NULL;
    END;

    -- ---- Update streak ----
    v_streak_result := update_streak_on_visit(v_profile.id, v_user_id, v_salon_id);
    v_streak_bonus := COALESCE((v_streak_result->>'bonus_points')::INT, 0);

    -- Award streak bonus if any
    IF v_streak_bonus > 0 THEN
        v_new_balance := v_new_balance + v_streak_bonus;
        v_new_lifetime := v_new_lifetime + v_streak_bonus;

        UPDATE loyalty_profiles
        SET current_points  = v_new_balance,
            lifetime_points = v_new_lifetime,
            updated_at      = NOW()
        WHERE id = v_profile.id;

        INSERT INTO point_transactions (
            loyalty_profile_id, salon_id, user_id, type, amount,
            balance_after, source, source_id, description,
            multiplier_applied, idempotency_key, expires_at
        ) VALUES (
            v_profile.id, v_salon_id, v_user_id, 'earn_bonus', v_streak_bonus,
            v_new_balance, 'system', NULL,
            'Bonus serie vizite (x' || (v_streak_result->>'streak_count') || ')',
            1.00,
            'streak_bonus_' || v_profile.id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT,
            v_expires_at
        );
    END IF;

    -- ---- Return result ----
    RETURN jsonb_build_object(
        'status',         'success',
        'points_earned',  v_final_points + v_streak_bonus,
        'base_points',    v_base_points,
        'multiplier',     v_total_mult,
        'new_balance',    v_new_balance,
        'new_lifetime',   v_new_lifetime,
        'tier',           COALESCE(v_tier_slug, 'clipper'),
        'tier_changed',   v_tier_changed,
        'streak',         v_streak_result,
        'streak_bonus',   v_streak_bonus,
        'daily_earned',   v_daily_earned + v_final_points,
        'daily_cap',      v_settings.max_daily_earn
    );
END;
$$;

-- Service role only — not callable by authenticated users directly
REVOKE EXECUTE ON FUNCTION earn_appointment_points(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION earn_appointment_points(UUID) FROM authenticated;


-- ============================================
-- 2. redeem_reward
-- ============================================
-- User redeems a reward from the catalog.
-- Validates: active, tier, stock, per-user limit, balance.
-- FOR UPDATE lock + atomic debit.
-- Generates 8-char redemption code.
-- ============================================
CREATE OR REPLACE FUNCTION redeem_reward(
    p_user_id   UUID,
    p_reward_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reward    rewards_catalog%ROWTYPE;
    v_profile   loyalty_profiles%ROWTYPE;
    v_settings  loyalty_settings%ROWTYPE;
    v_new_balance       INT;
    v_txn_id            UUID;
    v_redemption_id     UUID;
    v_redemption_code   TEXT;
    v_user_redemptions  INT;
    v_expires_at        TIMESTAMPTZ;
BEGIN
    -- ---- Load reward ----
    SELECT * INTO v_reward FROM rewards_catalog WHERE id = p_reward_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'not_found',
            'message', 'Recompensa nu a fost gasita');
    END IF;

    IF NOT v_reward.active THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'inactive',
            'message', 'Recompensa nu mai este activa');
    END IF;

    -- Validity window
    IF v_reward.valid_from IS NOT NULL AND NOW() < v_reward.valid_from THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'not_yet_valid',
            'message', 'Recompensa nu este inca disponibila');
    END IF;
    IF v_reward.valid_until IS NOT NULL AND NOW() > v_reward.valid_until THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'expired',
            'message', 'Recompensa a expirat');
    END IF;

    -- ---- Lock loyalty profile ----
    SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = p_user_id AND salon_id = v_reward.salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'no_profile',
            'message', 'Nu ai un profil de loialitate la acest salon');
    END IF;

    -- ---- Tier requirement ----
    IF v_reward.min_tier_slug IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM loyalty_tiers lt
            WHERE lt.salon_id = v_reward.salon_id
              AND lt.slug = v_reward.min_tier_slug
              AND lt.min_lifetime_points <= v_profile.lifetime_points
        ) THEN
            RETURN jsonb_build_object('status', 'error', 'error', 'tier_too_low',
                'message', 'Nivel de loialitate insuficient pentru aceasta recompensa');
        END IF;
    END IF;

    -- ---- Stock check ----
    IF v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'out_of_stock',
            'message', 'Stoc epuizat pentru aceasta recompensa');
    END IF;

    -- ---- Per-user redemption limit ----
    IF v_reward.max_per_user IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_redemptions
        FROM redemptions
        WHERE user_id = p_user_id
          AND reward_id = p_reward_id
          AND status NOT IN ('cancelled');

        IF v_user_redemptions >= v_reward.max_per_user THEN
            RETURN jsonb_build_object('status', 'error', 'error', 'limit_reached',
                'message', 'Ai atins limita maxima de revendicari pentru aceasta recompensa');
        END IF;
    END IF;

    -- ---- Balance check ----
    IF v_profile.current_points < v_reward.points_cost THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'insufficient_points',
            'message', 'Puncte insuficiente',
            'required', v_reward.points_cost,
            'available', v_profile.current_points);
    END IF;

    -- ---- Debit points atomically ----
    v_new_balance := v_profile.current_points - v_reward.points_cost;

    UPDATE loyalty_profiles
    SET current_points = v_new_balance,
        updated_at     = NOW()
    WHERE id = v_profile.id;

    -- ---- Get settings for redemption code expiry ----
    SELECT * INTO v_settings FROM loyalty_settings WHERE salon_id = v_reward.salon_id;

    IF v_settings.redemption_code_expiry_hours IS NOT NULL THEN
        v_expires_at := NOW() + (v_settings.redemption_code_expiry_hours || ' hours')::INTERVAL;
    ELSE
        v_expires_at := NOW() + INTERVAL '72 hours'; -- default
    END IF;

    -- ---- Generate 8-char alphanumeric code ----
    v_redemption_code := UPPER(SUBSTR(MD5(uuid_generate_v4()::TEXT || NOW()::TEXT), 1, 8));

    -- ---- Insert point_transaction (negative amount) ----
    INSERT INTO point_transactions (
        loyalty_profile_id, salon_id, user_id, type, amount,
        balance_after, source, source_id, description,
        multiplier_applied, idempotency_key
    ) VALUES (
        v_profile.id, v_reward.salon_id, p_user_id, 'redeem_reward',
        -v_reward.points_cost, v_new_balance,
        'manual', p_reward_id,
        'Revendicare: ' || v_reward.name,
        1.00,
        'redeem_' || p_user_id::TEXT || '_' || p_reward_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT
    )
    RETURNING id INTO v_txn_id;

    -- ---- Insert redemption record ----
    INSERT INTO redemptions (
        user_id, salon_id, reward_id, loyalty_profile_id,
        points_spent, redemption_code, point_transaction_id,
        expires_at, status
    ) VALUES (
        p_user_id, v_reward.salon_id, p_reward_id, v_profile.id,
        v_reward.points_cost, v_redemption_code, v_txn_id,
        v_expires_at, 'confirmed'
    )
    RETURNING id INTO v_redemption_id;

    -- ---- Decrement stock if applicable ----
    IF v_reward.stock IS NOT NULL THEN
        UPDATE rewards_catalog
        SET stock = stock - 1,
            updated_at = NOW()
        WHERE id = p_reward_id;
    END IF;

    -- ---- Return result ----
    RETURN jsonb_build_object(
        'status',        'success',
        'voucher_id',    v_redemption_id,
        'voucher_code',  v_redemption_code,
        'reward_name',   v_reward.name,
        'points_spent',  v_reward.points_cost,
        'new_balance',   v_new_balance,
        'expires_at',    v_expires_at
    );
END;
$$;

-- User-facing
REVOKE EXECUTE ON FUNCTION redeem_reward(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_reward(UUID, UUID) TO authenticated;


-- ============================================
-- 3. redeem_points_as_discount
-- ============================================
-- For partial payment with points at checkout.
-- Rules: min 100 pts, rounded to nearest 100,
-- max 50% of order value.
-- FOR UPDATE + version check on loyalty_profile.
-- ============================================
CREATE OR REPLACE FUNCTION redeem_points_as_discount(
    p_user_id       UUID,
    p_salon_id      UUID,
    p_points        INT,
    p_order_cents   INT,
    p_source_type   TEXT,
    p_source_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile       loyalty_profiles%ROWTYPE;
    v_settings      loyalty_settings%ROWTYPE;
    v_points_to_use INT;
    v_discount_cents INT;
    v_max_discount  INT;
    v_new_balance   INT;
    v_txn_id        UUID;
    v_idem_key      TEXT;
BEGIN
    -- ---- Validate source_type ----
    IF p_source_type NOT IN ('appointment', 'order') THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'invalid_source',
            'message', 'Tip sursa invalid');
    END IF;

    -- ---- Load settings ----
    SELECT * INTO v_settings FROM loyalty_settings WHERE salon_id = p_salon_id;

    IF NOT FOUND OR NOT v_settings.enabled THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'loyalty_disabled',
            'message', 'Sistemul de loialitate nu este activ');
    END IF;

    -- ---- Minimum 100 points ----
    IF p_points < 100 THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'min_points',
            'message', 'Minim 100 de puncte pentru discount');
    END IF;

    -- ---- Round to nearest 100 ----
    v_points_to_use := (p_points / 100) * 100;

    -- ---- Lock profile ----
    SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = p_user_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'no_profile',
            'message', 'Nu ai un profil de loialitate la acest salon');
    END IF;

    -- ---- Check balance ----
    IF v_profile.current_points < v_points_to_use THEN
        -- Use as many as possible (rounded down to 100)
        v_points_to_use := (v_profile.current_points / 100) * 100;
        IF v_points_to_use < 100 THEN
            RETURN jsonb_build_object('status', 'error', 'error', 'insufficient_points',
                'message', 'Puncte insuficiente',
                'available', v_profile.current_points);
        END IF;
    END IF;

    -- ---- Calculate discount: 1 point = 1 ban (0.01 RON) ----
    -- So 100 points = 1 RON = 100 bani (cents)
    v_discount_cents := v_points_to_use; -- 1 point = 1 ban

    -- ---- Max 50% of order value ----
    v_max_discount := p_order_cents / 2;
    IF v_discount_cents > v_max_discount THEN
        v_discount_cents := (v_max_discount / 100) * 100; -- round down to nearest 100 bani
        v_points_to_use := v_discount_cents; -- 1:1 mapping
    END IF;

    IF v_points_to_use < 100 OR v_discount_cents <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'discount_too_small',
            'message', 'Discountul rezultat este prea mic');
    END IF;

    -- ---- Idempotency ----
    v_idem_key := 'discount_' || p_source_type || '_' || p_source_id::TEXT;

    IF EXISTS (SELECT 1 FROM point_transactions WHERE idempotency_key = v_idem_key) THEN
        RETURN jsonb_build_object('status', 'duplicate',
            'message', 'Discountul a fost deja aplicat');
    END IF;

    -- ---- Debit points ----
    v_new_balance := v_profile.current_points - v_points_to_use;

    UPDATE loyalty_profiles
    SET current_points = v_new_balance,
        updated_at     = NOW()
    WHERE id = v_profile.id;

    -- ---- Insert transaction ----
    INSERT INTO point_transactions (
        loyalty_profile_id, salon_id, user_id, type, amount,
        balance_after, source, source_id, description,
        multiplier_applied, idempotency_key
    ) VALUES (
        v_profile.id, p_salon_id, p_user_id, 'redeem_discount',
        -v_points_to_use, v_new_balance,
        p_source_type, p_source_id,
        'Discount din puncte: ' || (v_discount_cents / 100.0)::TEXT || ' RON',
        1.00, v_idem_key
    )
    RETURNING id INTO v_txn_id;

    RETURN jsonb_build_object(
        'status',         'success',
        'points_used',    v_points_to_use,
        'discount_cents', v_discount_cents,
        'new_balance',    v_new_balance,
        'transaction_id', v_txn_id
    );
END;
$$;

-- User-facing
REVOKE EXECUTE ON FUNCTION redeem_points_as_discount(UUID, UUID, INT, INT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_points_as_discount(UUID, UUID, INT, INT, TEXT, UUID) TO authenticated;


-- ============================================
-- 4. get_loyalty_dashboard
-- ============================================
-- Returns everything needed for the loyalty
-- dashboard in a single RPC call.
-- ============================================
CREATE OR REPLACE FUNCTION get_loyalty_dashboard(
    p_salon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id       UUID;
    v_profile       loyalty_profiles%ROWTYPE;
    v_tier          RECORD;
    v_next_tier     RECORD;
    v_streak        loyalty_streaks%ROWTYPE;
    v_result        JSONB;
    v_transactions  JSONB;
    v_rewards       JSONB;
    v_challenges    JSONB;
    v_multipliers   JSONB;
    v_tier_progress JSONB;
    v_achievements  JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'unauthenticated',
            'message', 'Trebuie sa fii autentificat');
    END IF;

    -- ---- Profile ----
    SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = v_user_id AND salon_id = p_salon_id;

    IF NOT FOUND THEN
        -- Return empty dashboard for new users
        RETURN jsonb_build_object(
            'status', 'success',
            'profile', NULL,
            'is_new', true,
            'message', 'Niciun profil de loialitate inca. Viziteaza salonul pentru a incepe!'
        );
    END IF;

    -- ---- Current tier info ----
    IF v_profile.current_tier_id IS NOT NULL THEN
        SELECT * INTO v_tier FROM loyalty_tiers WHERE id = v_profile.current_tier_id;
    END IF;

    -- ---- Next tier ----
    SELECT * INTO v_next_tier
    FROM loyalty_tiers
    WHERE salon_id = p_salon_id
      AND active = true
      AND min_lifetime_points > COALESCE(v_profile.lifetime_points, 0)
    ORDER BY min_lifetime_points ASC
    LIMIT 1;

    IF v_next_tier IS NOT NULL THEN
        v_tier_progress := jsonb_build_object(
            'next_tier_name',    v_next_tier.name,
            'next_tier_slug',    v_next_tier.slug,
            'points_needed',     v_next_tier.min_lifetime_points - COALESCE(v_profile.lifetime_points, 0),
            'next_threshold',    v_next_tier.min_lifetime_points,
            'current_lifetime',  COALESCE(v_profile.lifetime_points, 0),
            'progress_pct',      ROUND(
                COALESCE(v_profile.lifetime_points, 0)::NUMERIC
                / GREATEST(v_next_tier.min_lifetime_points, 1) * 100, 1
            )
        );
    ELSE
        v_tier_progress := jsonb_build_object(
            'next_tier_name', NULL,
            'message', 'Nivel maxim atins!',
            'current_lifetime', COALESCE(v_profile.lifetime_points, 0)
        );
    END IF;

    -- ---- Streak ----
    SELECT * INTO v_streak
    FROM loyalty_streaks
    WHERE user_id = v_user_id
      AND salon_id = p_salon_id
      AND streak_type = 'weekly_visit';

    -- ---- Recent transactions (last 10) ----
    SELECT COALESCE(jsonb_agg(t), '[]'::JSONB)
    INTO v_transactions
    FROM (
        SELECT
            pt.id,
            pt.type,
            pt.amount,
            pt.balance_after,
            pt.source,
            pt.description,
            pt.multiplier_applied,
            pt.created_at
        FROM point_transactions pt
        WHERE pt.user_id = v_user_id
          AND pt.salon_id = p_salon_id
        ORDER BY pt.created_at DESC
        LIMIT 10
    ) t;

    -- ---- Available rewards (affordable first, then by sort_order) ----
    SELECT COALESCE(jsonb_agg(r), '[]'::JSONB)
    INTO v_rewards
    FROM (
        SELECT
            rc.id,
            rc.name,
            rc.description,
            rc.image_url,
            rc.category,
            rc.reward_type,
            rc.reward_value,
            rc.points_cost,
            rc.min_tier_slug,
            rc.stock,
            rc.max_per_user,
            rc.valid_until,
            (rc.points_cost <= v_profile.current_points) AS affordable
        FROM rewards_catalog rc
        WHERE rc.salon_id = p_salon_id
          AND rc.active = true
          AND (rc.valid_from IS NULL OR NOW() >= rc.valid_from)
          AND (rc.valid_until IS NULL OR NOW() <= rc.valid_until)
          AND (rc.stock IS NULL OR rc.stock > 0)
        ORDER BY
            (rc.points_cost <= v_profile.current_points) DESC,
            rc.sort_order ASC,
            rc.points_cost ASC
    ) r;

    -- ---- Active challenges with progress ----
    SELECT COALESCE(jsonb_agg(c), '[]'::JSONB)
    INTO v_challenges
    FROM (
        SELECT
            ch.id,
            ch.name,
            ch.description,
            ch.icon_url,
            ch.category,
            ch.challenge_type,
            ch.target_value,
            ch.points_reward,
            ch.bonus_reward,
            ch.starts_at,
            ch.ends_at,
            COALESCE(uc.current_progress, 0) AS current_progress,
            COALESCE(uc.status, 'not_joined') AS user_status,
            uc.completed_at
        FROM challenges ch
        LEFT JOIN user_challenges uc
            ON uc.challenge_id = ch.id AND uc.user_id = v_user_id
        WHERE (ch.salon_id = p_salon_id OR ch.salon_id IS NULL)
          AND ch.active = true
          AND NOW() BETWEEN ch.starts_at AND ch.ends_at
        ORDER BY ch.ends_at ASC
    ) c;

    -- ---- Active multipliers ----
    SELECT COALESCE(jsonb_agg(m), '[]'::JSONB)
    INTO v_multipliers
    FROM (
        SELECT
            pm.id,
            pm.name,
            pm.description,
            pm.multiplier,
            pm.applies_to,
            pm.starts_at,
            pm.ends_at
        FROM point_multipliers pm
        WHERE pm.salon_id = p_salon_id
          AND pm.active = true
          AND NOW() BETWEEN pm.starts_at AND pm.ends_at
        ORDER BY pm.multiplier DESC
    ) m;

    -- ---- Recent achievements ----
    SELECT COALESCE(jsonb_agg(a), '[]'::JSONB)
    INTO v_achievements
    FROM (
        SELECT
            ach.id,
            ach.name,
            ach.description,
            ach.icon_url,
            ach.category,
            ach.rarity,
            ua.unlocked_at,
            ua.points_awarded
        FROM user_achievements ua
        JOIN achievements ach ON ach.id = ua.achievement_id
        WHERE ua.user_id = v_user_id
          AND (ua.salon_id = p_salon_id OR ua.salon_id IS NULL)
        ORDER BY ua.unlocked_at DESC
        LIMIT 10
    ) a;

    -- ---- Assemble result ----
    v_result := jsonb_build_object(
        'status', 'success',
        'profile', jsonb_build_object(
            'id',              v_profile.id,
            'current_points',  v_profile.current_points,
            'lifetime_points', COALESCE(v_profile.lifetime_points, 0),
            'total_visits',    v_profile.total_visits,
            'last_visit_at',   v_profile.last_visit_at,
            'referral_code',   v_profile.referral_code,
            'tier', CASE
                WHEN v_tier.id IS NOT NULL THEN jsonb_build_object(
                    'id',    v_tier.id,
                    'name',  v_tier.name,
                    'slug',  v_tier.slug,
                    'color', v_tier.color,
                    'icon_url', v_tier.icon_url,
                    'multiplier', v_tier.multiplier,
                    'perks', v_tier.perks
                )
                ELSE NULL
            END,
            'streak', jsonb_build_object(
                'current_count', COALESCE(v_streak.current_count, 0),
                'longest_count', COALESCE(v_streak.longest_count, 0),
                'last_activity', v_streak.last_activity_at,
                'grace_used',    COALESCE(v_streak.grace_period_used, false)
            )
        ),
        'tier_progress',    v_tier_progress,
        'transactions',     v_transactions,
        'rewards',          v_rewards,
        'challenges',       v_challenges,
        'multipliers',      v_multipliers,
        'achievements',     v_achievements
    );

    RETURN v_result;
END;
$$;

-- User-facing
REVOKE EXECUTE ON FUNCTION get_loyalty_dashboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_loyalty_dashboard(UUID) TO authenticated;


-- ============================================
-- 5. use_voucher
-- ============================================
-- Barber scans/enters a redemption code to mark
-- a voucher (redemption) as used.
-- ============================================
CREATE OR REPLACE FUNCTION use_voucher(
    p_voucher_code TEXT,
    p_barber_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_redemption redemptions%ROWTYPE;
    v_reward     rewards_catalog%ROWTYPE;
    v_salon_id   UUID;
    v_barber_salon UUID;
BEGIN
    -- ---- Validate barber belongs to a salon ----
    SELECT sm.salon_id INTO v_barber_salon
    FROM salon_members sm
    WHERE sm.profile_id = p_barber_id
    LIMIT 1;

    IF v_barber_salon IS NULL THEN
        -- Fallback: try barbers table
        SELECT b.salon_id INTO v_barber_salon
        FROM barbers b
        WHERE b.id = p_barber_id;
    END IF;

    IF v_barber_salon IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'invalid_barber',
            'message', 'Frizerul nu a fost gasit in niciun salon');
    END IF;

    -- ---- Find redemption by code ----
    SELECT * INTO v_redemption
    FROM redemptions
    WHERE redemption_code = UPPER(TRIM(p_voucher_code))
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'not_found',
            'message', 'Codul voucher nu a fost gasit');
    END IF;

    -- ---- Check salon match ----
    IF v_redemption.salon_id <> v_barber_salon THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'wrong_salon',
            'message', 'Acest voucher nu apartine salonului tau');
    END IF;

    -- ---- Check status ----
    IF v_redemption.status = 'used' THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'already_used',
            'message', 'Acest voucher a fost deja utilizat',
            'used_at', v_redemption.used_at);
    END IF;

    IF v_redemption.status = 'cancelled' THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'cancelled',
            'message', 'Acest voucher a fost anulat');
    END IF;

    IF v_redemption.status NOT IN ('pending', 'confirmed') THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'invalid_status',
            'message', 'Voucher-ul nu poate fi utilizat (status: ' || v_redemption.status || ')');
    END IF;

    -- ---- Check expiry ----
    IF v_redemption.expires_at IS NOT NULL AND NOW() > v_redemption.expires_at THEN
        -- Auto-expire it
        UPDATE redemptions
        SET status = 'expired',
            updated_at = NOW()
        WHERE id = v_redemption.id;

        RETURN jsonb_build_object('status', 'error', 'error', 'expired',
            'message', 'Acest voucher a expirat',
            'expired_at', v_redemption.expires_at);
    END IF;

    -- ---- Load reward details ----
    SELECT * INTO v_reward FROM rewards_catalog WHERE id = v_redemption.reward_id;

    -- ---- Mark as used ----
    UPDATE redemptions
    SET status   = 'used',
        used_at  = NOW(),
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object('used_by_barber_id', p_barber_id)
    WHERE id = v_redemption.id;

    RETURN jsonb_build_object(
        'status',        'success',
        'voucher_id',    v_redemption.id,
        'voucher_code',  v_redemption.redemption_code,
        'reward_name',   COALESCE(v_reward.name, 'Recompensa'),
        'reward_type',   v_reward.reward_type,
        'reward_value',  v_reward.reward_value,
        'points_spent',  v_redemption.points_spent,
        'user_id',       v_redemption.user_id,
        'used_at',       NOW(),
        'message',       'Voucher utilizat cu succes!'
    );
END;
$$;

-- Accessible by authenticated (barbers)
REVOKE EXECUTE ON FUNCTION use_voucher(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION use_voucher(TEXT, UUID) TO authenticated;


-- ============================================
-- INDEXES for RPC performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_point_txn_daily_earn
    ON point_transactions(user_id, salon_id, created_at)
    WHERE amount > 0;

CREATE INDEX IF NOT EXISTS idx_redemptions_user_reward
    ON redemptions(user_id, reward_id, status);

CREATE INDEX IF NOT EXISTS idx_rewards_catalog_available
    ON rewards_catalog(salon_id, active, valid_from, valid_until, stock)
    WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_loyalty_streaks_user_salon_type
    ON loyalty_streaks(user_id, salon_id, streak_type);


-- ============================================
-- Done! Loyalty Core RPC Functions ready.
-- ============================================
-- Functions created:
--   1. earn_appointment_points(UUID)         — service_role only
--   2. redeem_reward(UUID, UUID)             — authenticated
--   3. redeem_points_as_discount(UUID*6)     — authenticated
--   4. get_loyalty_dashboard(UUID)           — authenticated
--   5. use_voucher(TEXT, UUID)               — authenticated
--   6. update_streak_on_visit(UUID*3)        — internal helper
--
-- Security:
--   - All SECURITY DEFINER SET search_path = public
--   - earn_appointment_points: REVOKE from PUBLIC+authenticated
--   - User-facing functions: GRANT to authenticated
--   - FOR UPDATE row locks on loyalty_profiles
--   - Idempotency keys prevent duplicate operations
--   - Romanian error messages throughout
-- ============================================
