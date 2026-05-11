-- ============================================
-- Migration 057: Referral System
-- ============================================
-- Production-ready referral schema with:
--   - Collision-resistant code generation (TAPZI-XXXXX)
--   - Anti-abuse: device fingerprinting, rate limiting
--   - Idempotent point awarding via idempotency_key
--   - Auto-qualification trigger on appointment complete
--   - Full RLS on every table
-- ============================================
-- NOTE: Depends on 054_loyalty_gamification.sql
--       (loyalty_profiles, point_transactions, loyalty_settings,
--        earn_loyalty_points RPC, referrals table)
-- This migration REPLACES the basic referrals table from 054
-- with a proper two-table system (referral_codes + referral_claims).
-- ============================================


-- ============================================
-- 0. DROP OLD REFERRALS TABLE FROM 054
-- ============================================
-- The old referrals table was a simpler model. We migrate to
-- a two-table design for proper code management and claim tracking.
-- ============================================
DROP TABLE IF EXISTS referrals CASCADE;


-- ============================================
-- 1. REFERRAL_CODES — One per user per salon
-- ============================================
-- Each user gets a unique TAPZI-XXXXX code per salon.
-- Code is generated on first access via RPC.
-- ============================================
CREATE TABLE IF NOT EXISTS referral_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    max_uses INT NOT NULL DEFAULT 50,
    uses_count INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, salon_id),
    CONSTRAINT referral_codes_code_unique UNIQUE (code),
    CONSTRAINT referral_codes_uses_non_negative CHECK (uses_count >= 0),
    CONSTRAINT referral_codes_max_uses_positive CHECK (max_uses > 0)
);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_salon ON referral_codes(salon_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_active ON referral_codes(active) WHERE active = TRUE;

-- RLS: users see own codes
DROP POLICY IF EXISTS "Users can view own referral code" ON referral_codes;
CREATE POLICY "Users can view own referral code" ON referral_codes
    FOR SELECT USING (auth.uid() = user_id);

-- RLS: salon staff can view salon's codes
DROP POLICY IF EXISTS "Salon staff can view referral codes" ON referral_codes;
CREATE POLICY "Salon staff can view referral codes" ON referral_codes
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = referral_codes.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = referral_codes.salon_id AND s.owner_id = auth.uid())
    );

-- No direct INSERT/UPDATE from client; all via RPC


-- ============================================
-- 2. REFERRAL_CLAIMS — Lifecycle tracking
-- ============================================
-- Tracks each referral from pending -> qualified -> rewarded.
-- One claim per referee per salon (cannot be referred twice at same salon).
-- ============================================
CREATE TABLE IF NOT EXISTS referral_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
    referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'qualified', 'rewarded', 'rejected')),
    referee_device_fingerprint TEXT,
    referrer_device_fingerprint TEXT,
    qualification_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    referrer_points_awarded INT NOT NULL DEFAULT 0,
    referee_points_awarded INT NOT NULL DEFAULT 0,
    rewarded_at TIMESTAMPTZ,
    rejected_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(referee_id, salon_id)
);

ALTER TABLE referral_claims ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_claims_code ON referral_claims(referral_code_id);
CREATE INDEX IF NOT EXISTS idx_referral_claims_referrer ON referral_claims(referrer_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_claims_referee ON referral_claims(referee_id);
CREATE INDEX IF NOT EXISTS idx_referral_claims_salon ON referral_claims(salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_claims_status ON referral_claims(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_referral_claims_qualification ON referral_claims(qualification_appointment_id) WHERE qualification_appointment_id IS NOT NULL;

-- RLS: users see claims where they are referrer or referee
DROP POLICY IF EXISTS "Users can view own referral claims" ON referral_claims;
CREATE POLICY "Users can view own referral claims" ON referral_claims
    FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

-- RLS: salon staff can view salon's claims
DROP POLICY IF EXISTS "Salon staff can view referral claims" ON referral_claims;
CREATE POLICY "Salon staff can view referral claims" ON referral_claims
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = referral_claims.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = referral_claims.salon_id AND s.owner_id = auth.uid())
    );

-- No direct INSERT/UPDATE from client; all via RPC


-- ============================================
-- 3. HELPER: generate_referral_code()
-- ============================================
-- Generates a TAPZI-XXXXX code using md5 + random().
-- Collision-resistant: UNIQUE constraint is the safety net,
-- but md5(uuid || random || clock) gives ~1.1B combinations.
-- ============================================
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_code TEXT;
    v_attempts INT := 0;
BEGIN
    LOOP
        v_attempts := v_attempts + 1;
        -- Take 5 chars from md5 of high-entropy input, uppercased
        -- md5 returns 32 hex chars; we pick a random offset for variety
        v_code := 'TAPZI-' || UPPER(
            SUBSTR(
                MD5(uuid_generate_v4()::TEXT || random()::TEXT || clock_timestamp()::TEXT),
                1 + (floor(random() * 20))::INT,
                5
            )
        );
        -- Verify no collision (UNIQUE constraint is backup)
        IF NOT EXISTS (SELECT 1 FROM referral_codes WHERE code = v_code) THEN
            RETURN v_code;
        END IF;
        -- Safety valve: after 10 attempts, use full uuid substring
        IF v_attempts >= 10 THEN
            v_code := 'TAPZI-' || UPPER(SUBSTR(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 5));
            RETURN v_code;
        END IF;
    END LOOP;
END;
$$;


-- ============================================
-- 4. RPC: get_or_create_referral_code
-- ============================================
-- Returns the user's referral code for a salon,
-- creating one if it doesn't exist.
-- ============================================
CREATE OR REPLACE FUNCTION get_or_create_referral_code(
    p_salon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_code referral_codes%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    -- Try to get existing code
    SELECT * INTO v_code
    FROM referral_codes
    WHERE user_id = v_user_id AND salon_id = p_salon_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'code', v_code.code,
            'uses_count', v_code.uses_count,
            'max_uses', v_code.max_uses,
            'active', v_code.active
        );
    END IF;

    -- Create new code
    INSERT INTO referral_codes (user_id, salon_id, code)
    VALUES (v_user_id, p_salon_id, generate_referral_code())
    ON CONFLICT (user_id, salon_id) DO NOTHING
    RETURNING * INTO v_code;

    -- Handle race condition: another request created it first
    IF NOT FOUND THEN
        SELECT * INTO v_code
        FROM referral_codes
        WHERE user_id = v_user_id AND salon_id = p_salon_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'code', v_code.code,
        'uses_count', v_code.uses_count,
        'max_uses', v_code.max_uses,
        'active', v_code.active
    );
END;
$$;


-- ============================================
-- 5. RPC: claim_referral_code
-- ============================================
-- Called by the referee when entering a referral code.
-- Validates everything, creates a pending claim.
-- ============================================
CREATE OR REPLACE FUNCTION claim_referral_code(
    p_code TEXT,
    p_salon_id UUID,
    p_device_fingerprint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_referee_id UUID := auth.uid();
    v_code_row referral_codes%ROWTYPE;
    v_claims_last_24h INT;
    v_device_flag BOOLEAN := FALSE;
    v_claim_id UUID;
BEGIN
    -- ---- Auth check ----
    IF v_referee_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    -- ---- Validate code exists and is active ----
    SELECT * INTO v_code_row
    FROM referral_codes
    WHERE code = UPPER(TRIM(p_code))
      AND salon_id = p_salon_id
    FOR UPDATE;  -- lock to prevent race conditions on uses_count

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_code',
            'message', 'Codul de referral nu a fost gasit'
        );
    END IF;

    IF NOT v_code_row.active THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'code_inactive',
            'message', 'Acest cod de referral nu mai este activ'
        );
    END IF;

    -- ---- Prevent self-referral ----
    IF v_code_row.user_id = v_referee_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'self_referral',
            'message', 'Nu poti folosi propriul cod de referral'
        );
    END IF;

    -- ---- Check max uses ----
    IF v_code_row.uses_count >= v_code_row.max_uses THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'max_uses_reached',
            'message', 'Acest cod de referral a atins limita maxima de utilizari'
        );
    END IF;

    -- ---- Check duplicate claim (referee at this salon) ----
    IF EXISTS (
        SELECT 1 FROM referral_claims
        WHERE referee_id = v_referee_id AND salon_id = p_salon_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'already_claimed',
            'message', 'Ai folosit deja un cod de referral la acest salon'
        );
    END IF;

    -- ---- Rate limit: max 5 claims per referrer per 24h ----
    SELECT COUNT(*) INTO v_claims_last_24h
    FROM referral_claims
    WHERE referrer_id = v_code_row.user_id
      AND created_at > NOW() - INTERVAL '24 hours';

    IF v_claims_last_24h >= 5 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'rate_limited',
            'message', 'Prea multe referral-uri in ultimele 24 de ore. Incearca mai tarziu.'
        );
    END IF;

    -- ---- Device fingerprint cross-check ----
    -- Flag (don't block) if the same device was used by the referrer
    -- or by another referee. This is for audit, not hard blocking.
    IF p_device_fingerprint IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM referral_claims
            WHERE referrer_device_fingerprint = p_device_fingerprint
              AND referrer_id = v_code_row.user_id
              AND salon_id = p_salon_id
            LIMIT 1
        )
        OR EXISTS (
            SELECT 1 FROM referral_claims
            WHERE referee_device_fingerprint = p_device_fingerprint
              AND referee_id != v_referee_id
              AND salon_id = p_salon_id
            LIMIT 1
        ) THEN
            v_device_flag := TRUE;
        END IF;
    END IF;

    -- ---- Create the pending claim ----
    INSERT INTO referral_claims (
        referral_code_id,
        referrer_id,
        referee_id,
        salon_id,
        status,
        referee_device_fingerprint
    )
    VALUES (
        v_code_row.id,
        v_code_row.user_id,
        v_referee_id,
        p_salon_id,
        'pending',
        p_device_fingerprint
    )
    RETURNING id INTO v_claim_id;

    -- ---- Increment uses_count ----
    UPDATE referral_codes
    SET uses_count = uses_count + 1
    WHERE id = v_code_row.id;

    RETURN jsonb_build_object(
        'success', true,
        'claim_id', v_claim_id,
        'referrer_name', (SELECT display_name FROM profiles WHERE id = v_code_row.user_id),
        'device_flagged', v_device_flag,
        'message', 'Codul de referral a fost aplicat cu succes! Programeaza o vizita pentru a primi punctele.'
    );
END;
$$;


-- ============================================
-- 6. FUNCTION: award_referral_points
-- ============================================
-- Internal helper called by the trigger.
-- Awards points to both referrer and referee
-- using the existing earn_loyalty_points RPC.
-- ============================================
CREATE OR REPLACE FUNCTION award_referral_points(
    p_claim_id UUID,
    p_appointment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_claim referral_claims%ROWTYPE;
    v_settings loyalty_settings%ROWTYPE;
    v_referrer_points INT;
    v_referee_points INT;
    v_result JSONB;
BEGIN
    -- Get the claim (with lock)
    SELECT * INTO v_claim
    FROM referral_claims
    WHERE id = p_claim_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Idempotency: skip if already rewarded
    IF v_claim.status = 'rewarded' THEN
        RETURN;
    END IF;

    -- Get salon loyalty settings for point amounts
    SELECT * INTO v_settings
    FROM loyalty_settings
    WHERE salon_id = v_claim.salon_id;

    -- Use defaults if no settings
    v_referrer_points := COALESCE(v_settings.referral_referrer_points, 100);
    v_referee_points := COALESCE(v_settings.referral_referred_points, 50);

    -- Award points to referrer
    SELECT earn_loyalty_points(
        p_user_id := v_claim.referrer_id,
        p_salon_id := v_claim.salon_id,
        p_amount := v_referrer_points,
        p_source := 'referral',
        p_source_id := p_claim_id,
        p_description := 'Puncte pentru referral acceptat',
        p_idempotency_key := 'referral_referrer_' || p_claim_id::TEXT,
        p_metadata := jsonb_build_object(
            'referee_id', v_claim.referee_id,
            'appointment_id', p_appointment_id
        )
    ) INTO v_result;

    -- Award points to referee
    SELECT earn_loyalty_points(
        p_user_id := v_claim.referee_id,
        p_salon_id := v_claim.salon_id,
        p_amount := v_referee_points,
        p_source := 'referral',
        p_source_id := p_claim_id,
        p_description := 'Puncte de bun-venit prin referral',
        p_idempotency_key := 'referral_referee_' || p_claim_id::TEXT,
        p_metadata := jsonb_build_object(
            'referrer_id', v_claim.referrer_id,
            'appointment_id', p_appointment_id
        )
    ) INTO v_result;

    -- Update claim to rewarded
    UPDATE referral_claims
    SET status = 'rewarded',
        qualification_appointment_id = p_appointment_id,
        referrer_points_awarded = v_referrer_points,
        referee_points_awarded = v_referee_points,
        rewarded_at = NOW()
    WHERE id = p_claim_id;
END;
$$;


-- ============================================
-- 7. TRIGGER: qualify_referral_on_appointment_complete
-- ============================================
-- When appointments.status -> 'completed', check if the
-- user has a pending referral claim at that salon.
-- If yes: qualify it and award points immediately.
-- Uses idempotency keys to prevent double-awarding.
-- ============================================
CREATE OR REPLACE FUNCTION trg_qualify_referral_on_appointment_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_claim referral_claims%ROWTYPE;
BEGIN
    -- Only fire on status change TO 'completed'
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'completed' THEN
        RETURN NEW;  -- already completed, no-op
    END IF;

    -- Check for a pending referral claim for this user + salon
    SELECT * INTO v_claim
    FROM referral_claims
    WHERE referee_id = NEW.user_id
      AND salon_id = NEW.salon_id
      AND status = 'pending'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;  -- no pending referral, nothing to do
    END IF;

    -- Qualify and award
    UPDATE referral_claims
    SET status = 'qualified'
    WHERE id = v_claim.id
      AND status = 'pending';  -- extra safety

    -- Award points to both parties
    PERFORM award_referral_points(v_claim.id, NEW.id);

    RETURN NEW;
END;
$$;

-- Drop and recreate trigger to be idempotent
DROP TRIGGER IF EXISTS qualify_referral_on_appointment_complete ON appointments;
CREATE TRIGGER qualify_referral_on_appointment_complete
    AFTER UPDATE ON appointments
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
    EXECUTE FUNCTION trg_qualify_referral_on_appointment_complete();


-- ============================================
-- 8. RPC: get_my_referral_stats
-- ============================================
-- Returns referral stats for the current user at a salon.
-- ============================================
CREATE OR REPLACE FUNCTION get_my_referral_stats(
    p_salon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_code_row referral_codes%ROWTYPE;
    v_total_claims INT;
    v_pending_claims INT;
    v_rewarded_claims INT;
    v_total_points_earned INT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    -- Get code
    SELECT * INTO v_code_row
    FROM referral_codes
    WHERE user_id = v_user_id AND salon_id = p_salon_id;

    -- Get claim stats
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'pending'),
        COUNT(*) FILTER (WHERE status = 'rewarded'),
        COALESCE(SUM(referrer_points_awarded) FILTER (WHERE status = 'rewarded'), 0)
    INTO v_total_claims, v_pending_claims, v_rewarded_claims, v_total_points_earned
    FROM referral_claims
    WHERE referrer_id = v_user_id AND salon_id = p_salon_id;

    RETURN jsonb_build_object(
        'success', true,
        'code', v_code_row.code,
        'active', COALESCE(v_code_row.active, FALSE),
        'uses_count', COALESCE(v_code_row.uses_count, 0),
        'max_uses', COALESCE(v_code_row.max_uses, 50),
        'total_claims', v_total_claims,
        'pending_claims', v_pending_claims,
        'rewarded_claims', v_rewarded_claims,
        'total_points_earned', v_total_points_earned
    );
END;
$$;


-- ============================================
-- 9. RPC: admin_reject_referral_claim
-- ============================================
-- Salon owner/staff can reject a suspicious claim.
-- ============================================
CREATE OR REPLACE FUNCTION admin_reject_referral_claim(
    p_claim_id UUID,
    p_reason TEXT DEFAULT 'Respins de administrator'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_claim referral_claims%ROWTYPE;
    v_is_staff BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    SELECT * INTO v_claim
    FROM referral_claims
    WHERE id = p_claim_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'claim_not_found');
    END IF;

    -- Check salon access
    SELECT EXISTS (
        SELECT 1 FROM salon_members sm WHERE sm.salon_id = v_claim.salon_id AND sm.profile_id = v_user_id
        UNION ALL
        SELECT 1 FROM salons s WHERE s.id = v_claim.salon_id AND s.owner_id = v_user_id
    ) INTO v_is_staff;

    IF NOT v_is_staff THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    -- Can only reject pending or qualified claims (not already rewarded)
    IF v_claim.status = 'rewarded' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'already_rewarded',
            'message', 'Acest referral a fost deja recompensat'
        );
    END IF;

    IF v_claim.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'already_rejected',
            'message', 'Acest referral a fost deja respins'
        );
    END IF;

    UPDATE referral_claims
    SET status = 'rejected',
        rejected_reason = p_reason
    WHERE id = p_claim_id;

    -- Decrement uses_count on the referral code
    UPDATE referral_codes
    SET uses_count = GREATEST(uses_count - 1, 0)
    WHERE id = v_claim.referral_code_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Referral-ul a fost respins'
    );
END;
$$;


-- ============================================
-- Done.
-- ============================================
