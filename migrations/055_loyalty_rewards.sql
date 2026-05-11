-- ============================================
-- Migration 055: Enhanced Rewards & Redemptions
-- ============================================
-- Extends rewards_catalog from 054 with:
--   - Granular category & linked service/product/discount
--   - Tier-gated rewards (required_tier)
--   - Inventory tracking (total_inventory, redeemed_count)
--   - Voucher validity window
-- Adds loyalty_vouchers table to replace
-- the simpler redemptions flow with a full
-- voucher lifecycle (active → used → expired).
-- Includes seed template function.
-- ============================================


-- ============================================
-- 1. ALTER rewards_catalog — Add new columns
-- ============================================
-- Existing columns from 054: id, salon_id, name,
--   description, image_url, category, reward_type,
--   reward_value, points_cost, min_tier_slug, stock,
--   max_per_user, valid_from, valid_until, active,
--   sort_order, created_at, updated_at
-- ============================================

-- Expand category CHECK to include new values
-- (054 had DEFAULT 'discount'; we broaden the allowed set)
ALTER TABLE rewards_catalog
    DROP CONSTRAINT IF EXISTS rewards_catalog_category_check;

DO $$ BEGIN
    ALTER TABLE rewards_catalog
        ADD CONSTRAINT rewards_catalog_category_check
        CHECK (category IN ('service', 'product', 'experience', 'discount', 'free_service', 'custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- real_value_cents: display "valoare X RON" on the card
ALTER TABLE rewards_catalog ADD COLUMN IF NOT EXISTS real_value_cents INT;

-- required_tier: tier slug gate (clipper, blade, sharp, maestru)
ALTER TABLE rewards_catalog ADD COLUMN IF NOT EXISTS required_tier TEXT DEFAULT 'clipper';

DO $$ BEGIN
    ALTER TABLE rewards_catalog
        ADD CONSTRAINT rewards_catalog_required_tier_check
        CHECK (required_tier IN ('clipper', 'blade', 'sharp', 'maestru'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Inventory tracking
ALTER TABLE rewards_catalog ADD COLUMN IF NOT EXISTS total_inventory INT;       -- NULL = unlimited
ALTER TABLE rewards_catalog ADD COLUMN IF NOT EXISTS redeemed_count INT NOT NULL DEFAULT 0;

-- Linked entities
ALTER TABLE rewards_catalog ADD COLUMN IF NOT EXISTS service_id UUID;
ALTER TABLE rewards_catalog ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE rewards_catalog ADD COLUMN IF NOT EXISTS discount_percent INT;

-- FK constraints (safe: skip if already exists)
DO $$ BEGIN
    ALTER TABLE rewards_catalog
        ADD CONSTRAINT rewards_catalog_service_id_fkey
        FOREIGN KEY (service_id) REFERENCES barber_services(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE rewards_catalog
        ADD CONSTRAINT rewards_catalog_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Voucher validity window (days from redemption)
ALTER TABLE rewards_catalog ADD COLUMN IF NOT EXISTS voucher_validity_days INT DEFAULT 30;

-- Additional indexes on new columns
CREATE INDEX IF NOT EXISTS idx_rewards_catalog_category ON rewards_catalog(salon_id, category) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_rewards_catalog_tier ON rewards_catalog(required_tier) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_rewards_catalog_service ON rewards_catalog(service_id) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rewards_catalog_product ON rewards_catalog(product_id) WHERE product_id IS NOT NULL;


-- ============================================
-- 2. LOYALTY VOUCHERS — Claimed reward codes
-- ============================================
-- Replaces/extends the simpler redemptions table
-- with a full voucher lifecycle. Each voucher has
-- a unique 8-char code, expiry, and usage tracking.
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    reward_id UUID NOT NULL REFERENCES rewards_catalog(id) ON DELETE RESTRICT,
    transaction_id UUID REFERENCES point_transactions(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    points_spent INT NOT NULL,
    used_at TIMESTAMPTZ,
    used_by_barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT loyalty_vouchers_status_check
        CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
    CONSTRAINT loyalty_vouchers_points_positive
        CHECK (points_spent > 0)
);

-- Unique code constraint (safe idempotent)
DO $$ BEGIN
    ALTER TABLE loyalty_vouchers
        ADD CONSTRAINT loyalty_vouchers_code_key UNIQUE (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE loyalty_vouchers ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_vouchers_user ON loyalty_vouchers(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_vouchers_salon ON loyalty_vouchers(salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_vouchers_reward ON loyalty_vouchers(reward_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_vouchers_code ON loyalty_vouchers(code) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_loyalty_vouchers_expires ON loyalty_vouchers(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_loyalty_vouchers_txn ON loyalty_vouchers(transaction_id) WHERE transaction_id IS NOT NULL;

-- ============================================
-- RLS — loyalty_vouchers
-- ============================================

-- Users can see their own vouchers
DROP POLICY IF EXISTS "Users can view own vouchers" ON loyalty_vouchers;
CREATE POLICY "Users can view own vouchers" ON loyalty_vouchers
    FOR SELECT USING (auth.uid() = user_id);

-- Salon staff can view vouchers for their salon
DROP POLICY IF EXISTS "Salon staff can view salon vouchers" ON loyalty_vouchers;
CREATE POLICY "Salon staff can view salon vouchers" ON loyalty_vouchers
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = loyalty_vouchers.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = loyalty_vouchers.salon_id AND s.owner_id = auth.uid())
    );

-- Salon staff can UPDATE vouchers (mark as used)
DROP POLICY IF EXISTS "Salon staff can update salon vouchers" ON loyalty_vouchers;
CREATE POLICY "Salon staff can update salon vouchers" ON loyalty_vouchers
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = loyalty_vouchers.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = loyalty_vouchers.salon_id AND s.owner_id = auth.uid())
    );

-- INSERT only via RPC (see redeem_reward_voucher below)

-- ============================================
-- RLS — rewards_catalog (supplement 054 policies)
-- ============================================
-- 054 already has "Anyone can view active rewards" (SELECT)
-- and "Salon owner can manage rewards" (ALL).
-- We add explicit INSERT/UPDATE/DELETE for clarity.

DROP POLICY IF EXISTS "Salon owner can insert rewards" ON rewards_catalog;
CREATE POLICY "Salon owner can insert rewards" ON rewards_catalog
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Salon owner can update rewards" ON rewards_catalog;
CREATE POLICY "Salon owner can update rewards" ON rewards_catalog
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = rewards_catalog.salon_id AND s.owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Salon owner can delete rewards" ON rewards_catalog;
CREATE POLICY "Salon owner can delete rewards" ON rewards_catalog
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = rewards_catalog.salon_id AND s.owner_id = auth.uid())
    );

-- Public can SELECT active rewards (already exists from 054, re-stated for safety)
DROP POLICY IF EXISTS "Public can view active rewards" ON rewards_catalog;
CREATE POLICY "Public can view active rewards" ON rewards_catalog
    FOR SELECT USING (active = TRUE);


-- ============================================
-- 3. HELPER — Generate 8-char alphanumeric code
-- ============================================
CREATE OR REPLACE FUNCTION generate_voucher_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I for clarity
    v_code TEXT := '';
    v_i INT;
BEGIN
    FOR v_i IN 1..8 LOOP
        v_code := v_code || SUBSTR(v_chars, FLOOR(RANDOM() * LENGTH(v_chars) + 1)::INT, 1);
    END LOOP;
    RETURN v_code;
END;
$$;


-- ============================================
-- 4. RPC — redeem_reward_voucher
-- ============================================
-- Atomic: validate → debit points → create voucher
-- → update inventory. Returns voucher details.
-- ============================================
CREATE OR REPLACE FUNCTION redeem_reward_voucher(
    p_user_id UUID,
    p_salon_id UUID,
    p_reward_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile loyalty_profiles%ROWTYPE;
    v_reward rewards_catalog%ROWTYPE;
    v_settings loyalty_settings%ROWTYPE;
    v_new_balance INT;
    v_txn_id UUID;
    v_voucher_id UUID;
    v_voucher_code TEXT;
    v_expires_at TIMESTAMPTZ;
    v_user_voucher_count INT;
    v_tier_slug TEXT;
    v_attempts INT := 0;
BEGIN
    -- Lock profile
    SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = p_user_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_profile', 'message', 'Profil de loialitate inexistent');
    END IF;

    -- Get reward (lock row to prevent oversell)
    SELECT * INTO v_reward
    FROM rewards_catalog
    WHERE id = p_reward_id AND salon_id = p_salon_id AND active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'reward_not_found', 'message', 'Recompensa nu a fost gasita');
    END IF;

    -- Check validity window
    IF v_reward.valid_from IS NOT NULL AND NOW() < v_reward.valid_from THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_yet_valid', 'message', 'Recompensa nu este inca disponibila');
    END IF;
    IF v_reward.valid_until IS NOT NULL AND NOW() > v_reward.valid_until THEN
        RETURN jsonb_build_object('success', false, 'error', 'expired', 'message', 'Recompensa a expirat');
    END IF;

    -- Check required tier (compare tier rank using hardcoded order)
    IF v_reward.required_tier IS NOT NULL AND v_reward.required_tier != 'clipper' THEN
        IF (CASE COALESCE(v_profile.tier, 'clipper')
                WHEN 'clipper' THEN 1 WHEN 'blade' THEN 2
                WHEN 'sharp' THEN 3 WHEN 'maestru' THEN 4 ELSE 1 END)
           < (CASE v_reward.required_tier
                WHEN 'clipper' THEN 1 WHEN 'blade' THEN 2
                WHEN 'sharp' THEN 3 WHEN 'maestru' THEN 4 ELSE 1 END)
        THEN
            RETURN jsonb_build_object('success', false, 'error', 'tier_too_low', 'message', 'Nivel de loialitate insuficient');
        END IF;
    END IF;

    -- Check balance
    IF v_profile.current_points < v_reward.points_cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'insufficient_points',
            'message', 'Puncte insuficiente',
            'required', v_reward.points_cost,
            'available', v_profile.current_points
        );
    END IF;

    -- Check inventory
    IF v_reward.total_inventory IS NOT NULL AND v_reward.redeemed_count >= v_reward.total_inventory THEN
        RETURN jsonb_build_object('success', false, 'error', 'out_of_stock', 'message', 'Stoc epuizat');
    END IF;

    -- Check max per user
    IF v_reward.max_per_user IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_voucher_count
        FROM loyalty_vouchers
        WHERE user_id = p_user_id AND reward_id = p_reward_id AND status != 'cancelled';

        IF v_user_voucher_count >= v_reward.max_per_user THEN
            RETURN jsonb_build_object('success', false, 'error', 'max_reached', 'message', 'Ai atins limita de revendicari pentru aceasta recompensa');
        END IF;
    END IF;

    -- Debit points
    v_new_balance := v_profile.current_points - v_reward.points_cost;

    UPDATE loyalty_profiles
    SET current_points = v_new_balance,
        updated_at = NOW()
    WHERE id = v_profile.id;

    -- Insert point transaction
    INSERT INTO point_transactions (
        loyalty_profile_id, salon_id, user_id, type, amount,
        balance_after, source, source_id, description, idempotency_key
    ) VALUES (
        v_profile.id, p_salon_id, p_user_id, 'spend', -v_reward.points_cost,
        v_new_balance, 'redemption', p_reward_id,
        'Voucher: ' || v_reward.name,
        'voucher_' || p_user_id || '_' || p_reward_id || '_' || EXTRACT(EPOCH FROM NOW())::TEXT
    )
    RETURNING id INTO v_txn_id;

    -- Generate unique voucher code (retry on collision)
    LOOP
        v_voucher_code := generate_voucher_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM loyalty_vouchers WHERE code = v_voucher_code);
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'Could not generate unique voucher code after 10 attempts';
        END IF;
    END LOOP;

    -- Calculate expiry
    v_expires_at := NOW() + (COALESCE(v_reward.voucher_validity_days, 30) || ' days')::INTERVAL;

    -- Insert voucher
    INSERT INTO loyalty_vouchers (
        user_id, salon_id, reward_id, transaction_id,
        code, points_spent, expires_at
    ) VALUES (
        p_user_id, p_salon_id, p_reward_id, v_txn_id,
        v_voucher_code, v_reward.points_cost, v_expires_at
    )
    RETURNING id INTO v_voucher_id;

    -- Update inventory counter
    UPDATE rewards_catalog
    SET redeemed_count = redeemed_count + 1,
        updated_at = NOW()
    WHERE id = p_reward_id;

    -- Also decrement legacy stock if present
    IF v_reward.stock IS NOT NULL THEN
        UPDATE rewards_catalog SET stock = stock - 1 WHERE id = p_reward_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_voucher_id,
        'voucher_code', v_voucher_code,
        'reward_name', v_reward.name,
        'points_spent', v_reward.points_cost,
        'new_balance', v_new_balance,
        'expires_at', v_expires_at
    );
END;
$$;


-- ============================================
-- 5. RPC — use_voucher (barber scans/enters code)
-- ============================================
CREATE OR REPLACE FUNCTION use_loyalty_voucher(
    p_voucher_code TEXT,
    p_barber_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_voucher loyalty_vouchers%ROWTYPE;
    v_reward rewards_catalog%ROWTYPE;
BEGIN
    -- Find and lock voucher
    SELECT * INTO v_voucher
    FROM loyalty_vouchers
    WHERE code = UPPER(TRIM(p_voucher_code))
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'Codul voucherului nu a fost gasit');
    END IF;

    -- Check status
    IF v_voucher.status = 'used' THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_used', 'message', 'Voucherul a fost deja utilizat');
    END IF;
    IF v_voucher.status = 'expired' THEN
        RETURN jsonb_build_object('success', false, 'error', 'expired', 'message', 'Voucherul a expirat');
    END IF;
    IF v_voucher.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'cancelled', 'message', 'Voucherul a fost anulat');
    END IF;

    -- Check expiry
    IF v_voucher.expires_at < NOW() THEN
        UPDATE loyalty_vouchers SET status = 'expired' WHERE id = v_voucher.id;
        RETURN jsonb_build_object('success', false, 'error', 'expired', 'message', 'Voucherul a expirat');
    END IF;

    -- Verify the caller is staff at this salon
    IF NOT (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = v_voucher.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = v_voucher.salon_id AND s.owner_id = auth.uid())
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'Nu ai permisiunea sa utilizezi acest voucher');
    END IF;

    -- Get reward info for response
    SELECT * INTO v_reward FROM rewards_catalog WHERE id = v_voucher.reward_id;

    -- Mark as used
    UPDATE loyalty_vouchers
    SET status = 'used',
        used_at = NOW(),
        used_by_barber_id = p_barber_id
    WHERE id = v_voucher.id;

    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_voucher.id,
        'reward_name', v_reward.name,
        'reward_category', v_reward.category,
        'discount_percent', v_reward.discount_percent,
        'service_id', v_reward.service_id,
        'product_id', v_reward.product_id,
        'user_id', v_voucher.user_id,
        'used_at', NOW()
    );
END;
$$;


-- ============================================
-- 6. RPC — cancel_voucher (user cancels, gets refund)
-- ============================================
CREATE OR REPLACE FUNCTION cancel_loyalty_voucher(
    p_voucher_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_voucher loyalty_vouchers%ROWTYPE;
    v_profile loyalty_profiles%ROWTYPE;
    v_new_balance INT;
    v_txn_id UUID;
BEGIN
    -- Lock voucher
    SELECT * INTO v_voucher
    FROM loyalty_vouchers
    WHERE id = p_voucher_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'Voucherul nu a fost gasit');
    END IF;

    IF v_voucher.status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'message', 'Voucherul nu poate fi anulat (status: ' || v_voucher.status || ')');
    END IF;

    -- Lock profile
    SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = p_user_id AND salon_id = v_voucher.salon_id
    FOR UPDATE;

    -- Refund points
    v_new_balance := v_profile.current_points + v_voucher.points_spent;

    UPDATE loyalty_profiles
    SET current_points = v_new_balance,
        updated_at = NOW()
    WHERE id = v_profile.id;

    -- Record refund transaction
    INSERT INTO point_transactions (
        loyalty_profile_id, salon_id, user_id, type, amount,
        balance_after, source, source_id, description
    ) VALUES (
        v_profile.id, v_voucher.salon_id, p_user_id, 'adjust', v_voucher.points_spent,
        v_new_balance, 'redemption', v_voucher.reward_id,
        'Rambursare voucher anulat: ' || v_voucher.code
    )
    RETURNING id INTO v_txn_id;

    -- Mark voucher as cancelled
    UPDATE loyalty_vouchers
    SET status = 'cancelled'
    WHERE id = p_voucher_id;

    -- Restore inventory
    UPDATE rewards_catalog
    SET redeemed_count = GREATEST(redeemed_count - 1, 0),
        updated_at = NOW()
    WHERE id = v_voucher.reward_id;

    RETURN jsonb_build_object(
        'success', true,
        'refunded_points', v_voucher.points_spent,
        'new_balance', v_new_balance
    );
END;
$$;


-- ============================================
-- 7. CRON HELPER — expire_stale_vouchers
-- ============================================
-- Call via pg_cron or Supabase Edge Function
-- on a daily schedule.
-- ============================================
CREATE OR REPLACE FUNCTION expire_stale_vouchers()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE loyalty_vouchers
    SET status = 'expired'
    WHERE status = 'active' AND expires_at < NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ============================================
-- 8. SEED — Default rewards template
-- ============================================
-- Inserts default rewards for ALL existing salons
-- that don't already have rewards. Safe to re-run.
-- ============================================
CREATE OR REPLACE FUNCTION seed_default_rewards()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_salon RECORD;
    v_count INT := 0;
BEGIN
    FOR v_salon IN
        SELECT id FROM salons
        WHERE NOT EXISTS (
            SELECT 1 FROM rewards_catalog rc WHERE rc.salon_id = salons.id
        )
    LOOP
        INSERT INTO rewards_catalog (salon_id, category, name, description, points_cost, real_value_cents, required_tier, discount_percent, sort_order, active)
        VALUES
            -- Service rewards
            (v_salon.id, 'service', 'Spalat par gratuit',
                'Spalare profesionala cu produse premium inclusa',
                200, 2000, 'clipper', NULL, 1, TRUE),

            (v_salon.id, 'service', 'Ceara/styling gratuit',
                'Finisare cu ceara sau produs de styling la alegere',
                300, 3000, 'clipper', NULL, 2, TRUE),

            (v_salon.id, 'service', 'Aranjat barba gratuit',
                'Aranjare si conturare barba profesionala',
                500, 4000, 'clipper', NULL, 3, TRUE),

            -- Experience rewards
            (v_salon.id, 'experience', 'Prosop cald + masaj',
                'Experienta relaxanta cu prosop cald si masaj facial',
                400, 3500, 'clipper', NULL, 4, TRUE),

            -- Discount rewards
            (v_salon.id, 'discount', '10% reducere',
                '10% reducere la orice serviciu din salon',
                800, NULL, 'blade', 10, 5, TRUE),

            (v_salon.id, 'discount', '20% reducere',
                '20% reducere la orice serviciu din salon',
                1500, NULL, 'sharp', 20, 6, TRUE),

            -- Premium service reward
            (v_salon.id, 'service', 'Tuns clasic gratuit',
                'Un tuns clasic complet, gratuit, oferit de salon',
                2500, 6000, 'blade', NULL, 7, TRUE);

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- Execute seed for all existing salons
SELECT seed_default_rewards();
