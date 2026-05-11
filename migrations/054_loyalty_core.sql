-- ============================================
-- Migration 054: Loyalty Core System
-- ============================================
-- Production-ready loyalty schema with:
--   - Per-salon settings (points_per_ron, tiers, expiry)
--   - Per-user-per-salon loyalty profiles with streaks
--   - Immutable point_transactions audit log
--   - Idempotent point earning (idempotency_key)
--   - Optimistic locking on loyalty_profiles (version)
--   - RLS: users read own, staff read salon, no direct writes
--   - Referral code auto-generation trigger
--   - Immutability trigger on point_transactions
-- ============================================

-- ============================================
-- 1. LOYALTY SETTINGS — Per-salon configuration
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_settings (
    salon_id UUID PRIMARY KEY REFERENCES salons(id) ON DELETE CASCADE,
    points_per_ron INT NOT NULL DEFAULT 10,             -- 10 points per 1 RON spent
    welcome_bonus INT NOT NULL DEFAULT 50,              -- points on first profile creation
    referral_bonus_referrer INT NOT NULL DEFAULT 150,   -- points for the referrer
    referral_bonus_referee INT NOT NULL DEFAULT 200,    -- points for the referred user
    points_expire_months INT NOT NULL DEFAULT 12,       -- points expire after N months
    max_daily_earn INT NOT NULL DEFAULT 5000,           -- daily earn cap
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE loyalty_settings ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone can read (needed for client to know if loyalty is enabled)
DROP POLICY IF EXISTS "Anyone can view loyalty settings" ON loyalty_settings;
CREATE POLICY "Anyone can view loyalty settings" ON loyalty_settings
    FOR SELECT USING (true);

-- RLS: Only salon owner can manage settings
DROP POLICY IF EXISTS "Salon owner can manage loyalty settings" ON loyalty_settings;
CREATE POLICY "Salon owner can manage loyalty settings" ON loyalty_settings
    FOR ALL USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = loyalty_settings.salon_id AND s.owner_id = auth.uid())
    );

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_loyalty_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_loyalty_settings_updated_at ON loyalty_settings;
CREATE TRIGGER trg_loyalty_settings_updated_at
    BEFORE UPDATE ON loyalty_settings
    FOR EACH ROW EXECUTE FUNCTION update_loyalty_settings_updated_at();

-- ============================================
-- 2. LOYALTY PROFILES — Per-user-per-salon
-- ============================================
-- One row per user per salon. Source of truth for
-- current balance. Updates ONLY via RPC (service role).
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    current_points INT NOT NULL DEFAULT 0,
    lifetime_earned INT NOT NULL DEFAULT 0,
    lifetime_redeemed INT NOT NULL DEFAULT 0,
    tier TEXT NOT NULL DEFAULT 'clipper',
    tier_since TIMESTAMPTZ DEFAULT NOW(),
    total_visits INT NOT NULL DEFAULT 0,
    last_visit_at TIMESTAMPTZ,
    referral_code TEXT UNIQUE,
    streak_count INT NOT NULL DEFAULT 0,
    longest_streak INT NOT NULL DEFAULT 0,
    streak_last_visit TIMESTAMPTZ,
    frozen BOOLEAN NOT NULL DEFAULT FALSE,
    frozen_reason TEXT,
    version INT NOT NULL DEFAULT 1,                    -- optimistic locking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, salon_id),
    CONSTRAINT positive_current_points CHECK (current_points >= 0),
    CONSTRAINT valid_tier CHECK (tier IN ('clipper', 'blade', 'sharp', 'maestru'))
);

ALTER TABLE loyalty_profiles ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_user ON loyalty_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_salon ON loyalty_profiles(salon_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_salon_tier ON loyalty_profiles(salon_id, tier);
CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_referral ON loyalty_profiles(referral_code) WHERE referral_code IS NOT NULL;

-- RLS: Users can view own loyalty profile
DROP POLICY IF EXISTS "Users can view own loyalty profile" ON loyalty_profiles;
CREATE POLICY "Users can view own loyalty profile" ON loyalty_profiles
    FOR SELECT USING (auth.uid() = user_id);

-- RLS: Salon owner/staff can view salon profiles
DROP POLICY IF EXISTS "Salon owner/staff can view salon profiles" ON loyalty_profiles;
CREATE POLICY "Salon owner/staff can view salon profiles" ON loyalty_profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = loyalty_profiles.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = loyalty_profiles.salon_id AND s.owner_id = auth.uid())
    );

-- No direct INSERT/UPDATE/DELETE for authenticated users
-- All mutations go through RPC (service role bypasses RLS)

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_loyalty_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_loyalty_profiles_updated_at ON loyalty_profiles;
CREATE TRIGGER trg_loyalty_profiles_updated_at
    BEFORE UPDATE ON loyalty_profiles
    FOR EACH ROW EXECUTE FUNCTION update_loyalty_profiles_updated_at();

-- ============================================
-- 2a. Auto-generate referral code on INSERT
-- ============================================
-- Generates a unique 8-char alphanumeric code
-- Format: first 3 chars of user's username + 5 random chars
-- Falls back to fully random if no username available
-- ============================================
CREATE OR REPLACE FUNCTION generate_loyalty_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    _code TEXT;
    _prefix TEXT;
    _attempts INT := 0;
BEGIN
    IF NEW.referral_code IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Try to get a prefix from the user's username
    SELECT UPPER(LEFT(REGEXP_REPLACE(p.username, '[^a-zA-Z0-9]', '', 'g'), 3))
    INTO _prefix
    FROM profiles p
    WHERE p.id = NEW.user_id;

    IF _prefix IS NULL OR LENGTH(_prefix) < 2 THEN
        _prefix := '';
    END IF;

    LOOP
        _code := _prefix || UPPER(SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 8 - LENGTH(_prefix)));
        _attempts := _attempts + 1;

        -- Check uniqueness
        IF NOT EXISTS (SELECT 1 FROM loyalty_profiles WHERE referral_code = _code) THEN
            NEW.referral_code := _code;
            RETURN NEW;
        END IF;

        -- Safety valve
        IF _attempts > 10 THEN
            NEW.referral_code := UPPER(SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT || NEW.id::TEXT), 1, 10));
            RETURN NEW;
        END IF;
    END LOOP;
END; $$;

DROP TRIGGER IF EXISTS trg_loyalty_profiles_referral_code ON loyalty_profiles;
CREATE TRIGGER trg_loyalty_profiles_referral_code
    BEFORE INSERT ON loyalty_profiles
    FOR EACH ROW EXECUTE FUNCTION generate_loyalty_referral_code();

-- ============================================
-- 3. POINT TRANSACTIONS — Immutable audit log
-- ============================================
-- Every point change (earn, spend, expire, adjust)
-- is an append-only row. Never UPDATE or DELETE.
-- idempotency_key prevents double-earning.
-- ============================================
CREATE TABLE IF NOT EXISTS point_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loyalty_profile_id UUID NOT NULL REFERENCES loyalty_profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount INT NOT NULL,                               -- positive = earn, negative = spend/expire
    balance_after INT NOT NULL,                        -- snapshot after this txn
    multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
    source_type TEXT,                                  -- appointment, order, referral, manual, system
    source_id UUID,                                    -- FK to appointment, order, etc.
    description TEXT,                                  -- human-readable (Romanian)
    granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = system
    idempotency_key TEXT UNIQUE,                       -- prevents duplicate operations
    expires_at TIMESTAMPTZ,                            -- NULL = never expires
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_type CHECK (type IN (
        'earn_appointment', 'earn_referral', 'earn_bonus', 'earn_action',
        'redeem_discount', 'redeem_reward',
        'expiry', 'correction',
        'admin_grant', 'admin_revoke'
    )),
    CONSTRAINT valid_source_type CHECK (
        source_type IS NULL OR source_type IN ('appointment', 'order', 'referral', 'manual', 'system')
    )
);

ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_point_txn_profile ON point_transactions(loyalty_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_txn_user ON point_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_txn_salon ON point_transactions(salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_txn_source ON point_transactions(source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_point_txn_idempotency ON point_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_point_txn_expires ON point_transactions(expires_at) WHERE expires_at IS NOT NULL AND amount > 0;
CREATE INDEX IF NOT EXISTS idx_point_txn_granted_by ON point_transactions(granted_by) WHERE granted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_point_txn_created ON point_transactions(created_at DESC);

-- RLS: Users can view own transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON point_transactions;
CREATE POLICY "Users can view own transactions" ON point_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- RLS: Salon owner/staff can view salon transactions
DROP POLICY IF EXISTS "Salon staff can view salon transactions" ON point_transactions;
CREATE POLICY "Salon staff can view salon transactions" ON point_transactions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = point_transactions.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = point_transactions.salon_id AND s.owner_id = auth.uid())
    );

-- No direct INSERT/UPDATE/DELETE for authenticated users
-- All mutations go through RPC (service role bypasses RLS)

-- ============================================
-- 3a. IMMUTABILITY TRIGGER — Prevent UPDATE/DELETE
-- ============================================
-- point_transactions is an append-only audit log.
-- This trigger hard-blocks any UPDATE or DELETE attempt.
-- ============================================
CREATE OR REPLACE FUNCTION prevent_point_transaction_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'point_transactions is immutable: % operations are not allowed', TG_OP;
    RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_point_transactions_immutable_update ON point_transactions;
CREATE TRIGGER trg_point_transactions_immutable_update
    BEFORE UPDATE ON point_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_point_transaction_mutation();

DROP TRIGGER IF EXISTS trg_point_transactions_immutable_delete ON point_transactions;
CREATE TRIGGER trg_point_transactions_immutable_delete
    BEFORE DELETE ON point_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_point_transaction_mutation();

-- ============================================
-- Done! Loyalty Core system ready.
-- ============================================
-- Tables created:
--   - loyalty_settings (per-salon config)
--   - loyalty_profiles (per-user-per-salon)
--   - point_transactions (immutable audit log)
--
-- Triggers:
--   - Auto updated_at on loyalty_settings, loyalty_profiles
--   - Auto referral_code generation on loyalty_profiles INSERT
--   - Immutability enforcement on point_transactions
--
-- Security:
--   - RLS enabled on all tables
--   - Users SELECT own data only
--   - Salon staff SELECT salon data
--   - No direct INSERT/UPDATE/DELETE for authenticated
--   - All mutations via RPC (service role)
-- ============================================
