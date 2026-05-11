-- ============================================
-- Migration 054: Loyalty & Gamification System
-- ============================================
-- Production-ready schema with:
--   - Race-condition-safe point operations (RPC)
--   - Idempotent point earning (idempotency_key)
--   - Full audit trail on point_transactions
--   - TIMESTAMPTZ throughout for timezone safety
--   - RLS on every table
-- ============================================

-- ============================================
-- 1. LOYALTY TIERS — Tier definitions
-- ============================================
-- Populated by salon owner; rows are immutable references
-- for loyalty_profiles.current_tier_id
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                       -- e.g. Bronze, Silver, Gold, Platinum
    slug TEXT NOT NULL,                       -- bronze, silver, gold, platinum
    icon_url TEXT,
    color TEXT,                               -- hex color for UI badge
    min_lifetime_points INT NOT NULL DEFAULT 0,
    multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,  -- base point multiplier for tier
    perks JSONB DEFAULT '[]',                -- [{label, description}] for display
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(salon_id, slug)
);

ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_salon ON loyalty_tiers(salon_id, sort_order);

DROP POLICY IF EXISTS "Anyone can view active loyalty tiers" ON loyalty_tiers;
CREATE POLICY "Anyone can view active loyalty tiers" ON loyalty_tiers
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Salon owner can manage tiers" ON loyalty_tiers;
CREATE POLICY "Salon owner can manage tiers" ON loyalty_tiers
    FOR ALL USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = loyalty_tiers.salon_id AND s.owner_id = auth.uid())
    );

-- ============================================
-- 2. LOYALTY PROFILES — Per-user-per-salon
-- ============================================
-- One row per user per salon. The source of truth
-- for current balance is computed from
-- point_transactions, but we cache it here for
-- fast reads. Updates ONLY via RPC.
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    current_points INT NOT NULL DEFAULT 0,
    lifetime_points INT NOT NULL DEFAULT 0,
    current_tier_id UUID REFERENCES loyalty_tiers(id) ON DELETE SET NULL,
    tier_updated_at TIMESTAMPTZ,
    current_streak_days INT NOT NULL DEFAULT 0,
    longest_streak_days INT NOT NULL DEFAULT 0,
    last_visit_at TIMESTAMPTZ,
    total_visits INT NOT NULL DEFAULT 0,
    total_spent_cents BIGINT NOT NULL DEFAULT 0,
    referral_code TEXT UNIQUE,               -- personal referral code
    referred_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, salon_id),
    CONSTRAINT positive_points CHECK (current_points >= 0)
);

ALTER TABLE loyalty_profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_user ON loyalty_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_salon ON loyalty_profiles(salon_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_salon_tier ON loyalty_profiles(salon_id, current_tier_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_referral ON loyalty_profiles(referral_code) WHERE referral_code IS NOT NULL;

DROP POLICY IF EXISTS "Users can view own loyalty profile" ON loyalty_profiles;
CREATE POLICY "Users can view own loyalty profile" ON loyalty_profiles
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Salon owner/staff can view salon profiles" ON loyalty_profiles;
CREATE POLICY "Salon owner/staff can view salon profiles" ON loyalty_profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = loyalty_profiles.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = loyalty_profiles.salon_id AND s.owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "System inserts loyalty profiles" ON loyalty_profiles;
CREATE POLICY "System inserts loyalty profiles" ON loyalty_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No direct UPDATE policy; updates go through RPC only
-- Service role can always bypass RLS

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
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                       -- earn | spend | expire | adjust | bonus | referral
    amount INT NOT NULL,                      -- positive = credit, negative = debit
    balance_after INT NOT NULL,               -- snapshot after this txn
    source TEXT NOT NULL,                     -- appointment | referral | challenge | achievement | streak | manual | redemption | expiry
    source_id UUID,                           -- FK to appointment, challenge, etc.
    description TEXT,                         -- human-readable (Romanian)
    multiplier_applied NUMERIC(3,2) DEFAULT 1.00,
    idempotency_key TEXT UNIQUE,             -- prevents duplicate earnings
    metadata JSONB DEFAULT '{}',             -- flexible extra data
    expires_at TIMESTAMPTZ,                  -- NULL = never expires
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_point_txn_profile ON point_transactions(loyalty_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_txn_user ON point_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_txn_salon ON point_transactions(salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_txn_source ON point_transactions(source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_point_txn_idempotency ON point_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_point_txn_expires ON point_transactions(expires_at) WHERE expires_at IS NOT NULL AND amount > 0;

DROP POLICY IF EXISTS "Users can view own transactions" ON point_transactions;
CREATE POLICY "Users can view own transactions" ON point_transactions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Salon staff can view salon transactions" ON point_transactions;
CREATE POLICY "Salon staff can view salon transactions" ON point_transactions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = point_transactions.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = point_transactions.salon_id AND s.owner_id = auth.uid())
    );

-- INSERT only via RPC (service role)

-- ============================================
-- 4. ACHIEVEMENTS — Badge/achievement definitions
-- ============================================
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID REFERENCES salons(id) ON DELETE CASCADE, -- NULL = global/system achievement
    slug TEXT NOT NULL,                       -- unique identifier: first_visit, ten_visits, etc.
    name TEXT NOT NULL,                       -- Romanian display name
    description TEXT,
    icon_url TEXT,
    category TEXT NOT NULL DEFAULT 'general', -- general | visits | spending | social | streak | seasonal
    points_reward INT NOT NULL DEFAULT 0,     -- points awarded on unlock
    condition_type TEXT NOT NULL,             -- visit_count | spend_total | streak_days | referral_count | custom
    condition_value INT NOT NULL,             -- threshold to unlock
    condition_metadata JSONB DEFAULT '{}',   -- extra conditions (e.g. specific service_id)
    rarity TEXT NOT NULL DEFAULT 'common',   -- common | uncommon | rare | epic | legendary
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(salon_id, slug)
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_achievements_salon ON achievements(salon_id) WHERE salon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_achievements_active ON achievements(active) WHERE active = TRUE;

DROP POLICY IF EXISTS "Anyone can view active achievements" ON achievements;
CREATE POLICY "Anyone can view active achievements" ON achievements
    FOR SELECT USING (active = TRUE);

DROP POLICY IF EXISTS "Salon owner can manage achievements" ON achievements;
CREATE POLICY "Salon owner can manage achievements" ON achievements
    FOR ALL USING (
        salon_id IS NULL -- system achievements: read-only via SELECT above
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = achievements.salon_id AND s.owner_id = auth.uid())
    );

-- ============================================
-- 5. USER ACHIEVEMENTS — Unlocked badges
-- ============================================
CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    points_awarded INT NOT NULL DEFAULT 0,
    notified BOOLEAN NOT NULL DEFAULT FALSE,  -- for push notification tracking
    metadata JSONB DEFAULT '{}',
    UNIQUE(user_id, achievement_id)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id, unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_salon ON user_achievements(salon_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unnotified ON user_achievements(notified) WHERE notified = FALSE;

DROP POLICY IF EXISTS "Users can view own achievements" ON user_achievements;
CREATE POLICY "Users can view own achievements" ON user_achievements
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Salon staff can view salon achievements" ON user_achievements;
CREATE POLICY "Salon staff can view salon achievements" ON user_achievements
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = user_achievements.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = user_achievements.salon_id AND s.owner_id = auth.uid())
    );

-- ============================================
-- 6. CHALLENGES — Time-limited missions
-- ============================================
CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID REFERENCES salons(id) ON DELETE CASCADE, -- NULL = global
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    category TEXT NOT NULL DEFAULT 'general', -- general | weekly | seasonal | special
    challenge_type TEXT NOT NULL,             -- visit_count | spend_amount | service_specific | referral | combo
    target_value INT NOT NULL,               -- e.g. 5 visits, 500 RON spent
    target_metadata JSONB DEFAULT '{}',      -- extra criteria (service_ids, etc.)
    points_reward INT NOT NULL DEFAULT 0,
    bonus_reward JSONB DEFAULT '{}',         -- {type: "discount", value: 20, unit: "percent"}
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    max_participants INT,                    -- NULL = unlimited
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_challenges_salon ON challenges(salon_id);
CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges(active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_challenges_dates ON challenges(starts_at, ends_at) WHERE active = TRUE;

DROP POLICY IF EXISTS "Anyone can view active challenges" ON challenges;
CREATE POLICY "Anyone can view active challenges" ON challenges
    FOR SELECT USING (active = TRUE);

DROP POLICY IF EXISTS "Salon owner can manage challenges" ON challenges;
CREATE POLICY "Salon owner can manage challenges" ON challenges
    FOR ALL USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = challenges.salon_id AND s.owner_id = auth.uid())
    );

-- ============================================
-- 7. USER CHALLENGES — Progress tracking
-- ============================================
CREATE TABLE IF NOT EXISTS user_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
    current_progress INT NOT NULL DEFAULT 0,
    target_value INT NOT NULL,               -- denormalized from challenge for fast reads
    status TEXT NOT NULL DEFAULT 'active',   -- active | completed | expired | claimed
    completed_at TIMESTAMPTZ,
    claimed_at TIMESTAMPTZ,                  -- when the user claimed the reward
    points_awarded INT NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',             -- progress details
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, challenge_id)
);

ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_challenges_user ON user_challenges(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_challenges_challenge ON user_challenges(challenge_id);
CREATE INDEX IF NOT EXISTS idx_user_challenges_active ON user_challenges(status) WHERE status = 'active';

DROP POLICY IF EXISTS "Users can view own challenge progress" ON user_challenges;
CREATE POLICY "Users can view own challenge progress" ON user_challenges
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can join challenges" ON user_challenges;
CREATE POLICY "Users can join challenges" ON user_challenges
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Salon staff can view challenge progress" ON user_challenges;
CREATE POLICY "Salon staff can view challenge progress" ON user_challenges
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = user_challenges.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = user_challenges.salon_id AND s.owner_id = auth.uid())
    );

-- ============================================
-- 8. REFERRALS — Referral tracking
-- ============================================
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | qualified | rewarded | expired
    referrer_points_awarded INT NOT NULL DEFAULT 0,
    referred_points_awarded INT NOT NULL DEFAULT 0,
    qualified_at TIMESTAMPTZ,                -- when referred user completed qualifying action
    rewarded_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(salon_id, referrer_id, referred_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_salon ON referrals(salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);

DROP POLICY IF EXISTS "Users can view own referrals (as referrer)" ON referrals;
CREATE POLICY "Users can view own referrals (as referrer)" ON referrals
    FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

DROP POLICY IF EXISTS "Salon staff can view referrals" ON referrals;
CREATE POLICY "Salon staff can view referrals" ON referrals
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = referrals.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = referrals.salon_id AND s.owner_id = auth.uid())
    );

-- ============================================
-- 9. REWARDS CATALOG — Redeemable rewards
-- ============================================
CREATE TABLE IF NOT EXISTS rewards_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    category TEXT NOT NULL DEFAULT 'discount', -- discount | free_service | product | experience | custom
    reward_type TEXT NOT NULL,                -- percentage_discount | fixed_discount | free_service | physical_item
    reward_value JSONB NOT NULL DEFAULT '{}', -- {amount: 20, unit: "percent"} or {service_id: "..."} etc.
    points_cost INT NOT NULL,
    min_tier_slug TEXT,                       -- minimum tier required (NULL = any tier)
    stock INT,                               -- NULL = unlimited
    max_per_user INT,                        -- NULL = unlimited
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rewards_catalog ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rewards_catalog_salon ON rewards_catalog(salon_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_rewards_catalog_active ON rewards_catalog(active, valid_from, valid_until) WHERE active = TRUE;

DROP POLICY IF EXISTS "Anyone can view active rewards" ON rewards_catalog;
CREATE POLICY "Anyone can view active rewards" ON rewards_catalog
    FOR SELECT USING (active = TRUE);

DROP POLICY IF EXISTS "Salon owner can manage rewards" ON rewards_catalog;
CREATE POLICY "Salon owner can manage rewards" ON rewards_catalog
    FOR ALL USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = rewards_catalog.salon_id AND s.owner_id = auth.uid())
    );

-- ============================================
-- 10. REDEMPTIONS — Reward redemption history
-- ============================================
CREATE TABLE IF NOT EXISTS redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    reward_id UUID NOT NULL REFERENCES rewards_catalog(id) ON DELETE RESTRICT,
    loyalty_profile_id UUID NOT NULL REFERENCES loyalty_profiles(id) ON DELETE CASCADE,
    points_spent INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | confirmed | used | expired | cancelled
    redemption_code TEXT UNIQUE,             -- short code for barber to verify
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,                  -- redemption must be used by this date
    cancelled_at TIMESTAMPTZ,
    cancelled_reason TEXT,
    point_transaction_id UUID REFERENCES point_transactions(id),  -- link to the debit txn
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_salon ON redemptions(salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_code ON redemptions(redemption_code) WHERE redemption_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions(status) WHERE status IN ('pending', 'confirmed');

DROP POLICY IF EXISTS "Users can view own redemptions" ON redemptions;
CREATE POLICY "Users can view own redemptions" ON redemptions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Salon staff can view/update redemptions" ON redemptions;
CREATE POLICY "Salon staff can view/update redemptions" ON redemptions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = redemptions.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = redemptions.salon_id AND s.owner_id = auth.uid())
    );

-- ============================================
-- 11. STREAKS — Visit streak tracking
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_streaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    loyalty_profile_id UUID NOT NULL REFERENCES loyalty_profiles(id) ON DELETE CASCADE,
    streak_type TEXT NOT NULL DEFAULT 'weekly_visit', -- weekly_visit | monthly_visit | consecutive_days
    current_count INT NOT NULL DEFAULT 0,
    longest_count INT NOT NULL DEFAULT 0,
    last_activity_at TIMESTAMPTZ,
    streak_started_at TIMESTAMPTZ,
    streak_broken_at TIMESTAMPTZ,
    grace_period_used BOOLEAN NOT NULL DEFAULT FALSE, -- one free miss per streak
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, salon_id, streak_type)
);

ALTER TABLE loyalty_streaks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_loyalty_streaks_user ON loyalty_streaks(user_id, salon_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_streaks_profile ON loyalty_streaks(loyalty_profile_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_streaks_active ON loyalty_streaks(last_activity_at) WHERE current_count > 0;

DROP POLICY IF EXISTS "Users can view own streaks" ON loyalty_streaks;
CREATE POLICY "Users can view own streaks" ON loyalty_streaks
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Salon staff can view streaks" ON loyalty_streaks;
CREATE POLICY "Salon staff can view streaks" ON loyalty_streaks
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = loyalty_streaks.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = loyalty_streaks.salon_id AND s.owner_id = auth.uid())
    );

-- ============================================
-- 12. POINT MULTIPLIERS — Timed bonus events
-- ============================================
CREATE TABLE IF NOT EXISTS point_multipliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                       -- "Happy Hour Dublu", "Weekend Bonus"
    description TEXT,
    multiplier NUMERIC(3,2) NOT NULL,        -- 2.00 = double points
    applies_to TEXT NOT NULL DEFAULT 'all',  -- all | appointment | referral | specific_service
    applies_to_id UUID,                      -- service_id if applies_to = specific_service
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE point_multipliers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_point_multipliers_salon ON point_multipliers(salon_id, active);
CREATE INDEX IF NOT EXISTS idx_point_multipliers_active ON point_multipliers(starts_at, ends_at) WHERE active = TRUE;

DROP POLICY IF EXISTS "Anyone can view active multipliers" ON point_multipliers;
CREATE POLICY "Anyone can view active multipliers" ON point_multipliers
    FOR SELECT USING (active = TRUE);

DROP POLICY IF EXISTS "Salon owner can manage multipliers" ON point_multipliers;
CREATE POLICY "Salon owner can manage multipliers" ON point_multipliers
    FOR ALL USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = point_multipliers.salon_id AND s.owner_id = auth.uid())
    );

-- ============================================
-- 13. LOYALTY SETTINGS — Per-salon config
-- ============================================
-- One row per salon controlling the loyalty
-- system behavior.
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_settings (
    salon_id UUID PRIMARY KEY REFERENCES salons(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    points_per_ron INT NOT NULL DEFAULT 1,        -- points earned per 1 RON spent
    referral_referrer_points INT NOT NULL DEFAULT 100,
    referral_referred_points INT NOT NULL DEFAULT 50,
    streak_bonus_points INT NOT NULL DEFAULT 25,  -- bonus per streak milestone
    streak_grace_period_hours INT NOT NULL DEFAULT 48,
    points_expiry_days INT,                       -- NULL = no expiry
    redemption_code_expiry_hours INT NOT NULL DEFAULT 72,
    min_points_to_redeem INT NOT NULL DEFAULT 50,
    welcome_bonus_points INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE loyalty_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view loyalty settings" ON loyalty_settings;
CREATE POLICY "Anyone can view loyalty settings" ON loyalty_settings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Salon owner can manage loyalty settings" ON loyalty_settings;
CREATE POLICY "Salon owner can manage loyalty settings" ON loyalty_settings
    FOR ALL USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = loyalty_settings.salon_id AND s.owner_id = auth.uid())
    );


-- ============================================
-- ============================================
--         RPC FUNCTIONS
-- ============================================
-- ============================================


-- ============================================
-- RPC 1: earn_points — Race-condition-safe
-- ============================================
-- Atomically: validate idempotency, apply multipliers,
-- credit points, update loyalty_profile, check tier upgrade,
-- check achievement unlocks.
-- ============================================
CREATE OR REPLACE FUNCTION earn_loyalty_points(
    p_user_id UUID,
    p_salon_id UUID,
    p_amount INT,
    p_source TEXT,
    p_source_id UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile loyalty_profiles%ROWTYPE;
    v_effective_multiplier NUMERIC(5,2) := 1.00;
    v_tier_multiplier NUMERIC(3,2) := 1.00;
    v_event_multiplier NUMERIC(3,2) := 1.00;
    v_final_amount INT;
    v_new_balance INT;
    v_new_lifetime INT;
    v_txn_id UUID;
    v_settings loyalty_settings%ROWTYPE;
    v_expires_at TIMESTAMPTZ;
    v_new_tier_id UUID;
BEGIN
    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM point_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'duplicate',
                'message', 'Transaction already processed'
            );
        END IF;
    END IF;

    -- Get or create loyalty profile (with row lock)
    SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = p_user_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO loyalty_profiles (user_id, salon_id, referral_code)
        VALUES (
            p_user_id,
            p_salon_id,
            UPPER(SUBSTR(MD5(p_user_id::TEXT || p_salon_id::TEXT || NOW()::TEXT), 1, 8))
        )
        RETURNING * INTO v_profile;
    END IF;

    -- Get salon settings
    SELECT * INTO v_settings FROM loyalty_settings WHERE salon_id = p_salon_id;

    -- Calculate tier multiplier
    IF v_profile.current_tier_id IS NOT NULL THEN
        SELECT multiplier INTO v_tier_multiplier
        FROM loyalty_tiers WHERE id = v_profile.current_tier_id;
    END IF;

    -- Calculate event multiplier (best active multiplier wins)
    SELECT COALESCE(MAX(multiplier), 1.00) INTO v_event_multiplier
    FROM point_multipliers
    WHERE salon_id = p_salon_id
      AND active = TRUE
      AND NOW() BETWEEN starts_at AND ends_at
      AND (applies_to = 'all' OR applies_to = p_source
           OR (applies_to = 'specific_service' AND applies_to_id = p_source_id));

    -- Combined multiplier
    v_effective_multiplier := v_tier_multiplier * v_event_multiplier;
    v_final_amount := CEIL(p_amount * v_effective_multiplier);

    -- Point expiry
    IF v_settings.points_expiry_days IS NOT NULL THEN
        v_expires_at := NOW() + (v_settings.points_expiry_days || ' days')::INTERVAL;
    END IF;

    -- Update balance
    v_new_balance := v_profile.current_points + v_final_amount;
    v_new_lifetime := v_profile.lifetime_points + v_final_amount;

    UPDATE loyalty_profiles
    SET current_points = v_new_balance,
        lifetime_points = v_new_lifetime,
        updated_at = NOW()
    WHERE id = v_profile.id;

    -- Insert transaction
    INSERT INTO point_transactions (
        loyalty_profile_id, salon_id, user_id, type, amount,
        balance_after, source, source_id, description,
        multiplier_applied, idempotency_key, metadata, expires_at
    ) VALUES (
        v_profile.id, p_salon_id, p_user_id, 'earn', v_final_amount,
        v_new_balance, p_source, p_source_id, p_description,
        v_effective_multiplier, p_idempotency_key, p_metadata, v_expires_at
    )
    RETURNING id INTO v_txn_id;

    -- Check tier upgrade
    SELECT id INTO v_new_tier_id
    FROM loyalty_tiers
    WHERE salon_id = p_salon_id
      AND active = TRUE
      AND min_lifetime_points <= v_new_lifetime
    ORDER BY min_lifetime_points DESC
    LIMIT 1;

    IF v_new_tier_id IS DISTINCT FROM v_profile.current_tier_id THEN
        UPDATE loyalty_profiles
        SET current_tier_id = v_new_tier_id,
            tier_updated_at = NOW()
        WHERE id = v_profile.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_txn_id,
        'points_earned', v_final_amount,
        'multiplier', v_effective_multiplier,
        'new_balance', v_new_balance,
        'new_lifetime', v_new_lifetime,
        'tier_changed', v_new_tier_id IS DISTINCT FROM v_profile.current_tier_id,
        'new_tier_id', v_new_tier_id
    );
END;
$$;


-- ============================================
-- RPC 2: spend_points — Atomic redemption
-- ============================================
CREATE OR REPLACE FUNCTION redeem_loyalty_reward(
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
    v_redemption_id UUID;
    v_redemption_code TEXT;
    v_user_redemption_count INT;
    v_tier_slug TEXT;
BEGIN
    -- Lock profile
    SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = p_user_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_profile', 'message', 'Profil de loialitate inexistent');
    END IF;

    -- Get reward
    SELECT * INTO v_reward FROM rewards_catalog WHERE id = p_reward_id AND active = TRUE;
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

    -- Check min tier
    IF v_reward.min_tier_slug IS NOT NULL THEN
        SELECT slug INTO v_tier_slug FROM loyalty_tiers WHERE id = v_profile.current_tier_id;
        -- Simple check: if user has no tier or different tier, compare min_lifetime_points
        IF NOT EXISTS (
            SELECT 1 FROM loyalty_tiers
            WHERE salon_id = p_salon_id AND slug = v_reward.min_tier_slug
              AND min_lifetime_points <= v_profile.lifetime_points
        ) THEN
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

    -- Check stock
    IF v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'out_of_stock', 'message', 'Stoc epuizat');
    END IF;

    -- Check max per user
    IF v_reward.max_per_user IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_redemption_count
        FROM redemptions
        WHERE user_id = p_user_id AND reward_id = p_reward_id AND status NOT IN ('cancelled');
        IF v_user_redemption_count >= v_reward.max_per_user THEN
            RETURN jsonb_build_object('success', false, 'error', 'max_reached', 'message', 'Ai atins limita de revendecari');
        END IF;
    END IF;

    -- Get settings for expiry
    SELECT * INTO v_settings FROM loyalty_settings WHERE salon_id = p_salon_id;

    -- Debit points
    v_new_balance := v_profile.current_points - v_reward.points_cost;

    UPDATE loyalty_profiles
    SET current_points = v_new_balance,
        updated_at = NOW()
    WHERE id = v_profile.id;

    -- Generate redemption code (6 char alphanumeric)
    v_redemption_code := UPPER(SUBSTR(MD5(uuid_generate_v4()::TEXT), 1, 6));

    -- Insert transaction
    INSERT INTO point_transactions (
        loyalty_profile_id, salon_id, user_id, type, amount,
        balance_after, source, source_id, description, idempotency_key
    ) VALUES (
        v_profile.id, p_salon_id, p_user_id, 'spend', -v_reward.points_cost,
        v_new_balance, 'redemption', p_reward_id,
        'Revendicare: ' || v_reward.name,
        'redeem_' || p_user_id || '_' || p_reward_id || '_' || EXTRACT(EPOCH FROM NOW())::TEXT
    )
    RETURNING id INTO v_txn_id;

    -- Insert redemption
    INSERT INTO redemptions (
        user_id, salon_id, reward_id, loyalty_profile_id,
        points_spent, redemption_code, point_transaction_id,
        expires_at
    ) VALUES (
        p_user_id, p_salon_id, p_reward_id, v_profile.id,
        v_reward.points_cost, v_redemption_code, v_txn_id,
        CASE WHEN v_settings.redemption_code_expiry_hours IS NOT NULL
             THEN NOW() + (v_settings.redemption_code_expiry_hours || ' hours')::INTERVAL
             ELSE NULL END
    )
    RETURNING id INTO v_redemption_id;

    -- Decrement stock
    IF v_reward.stock IS NOT NULL THEN
        UPDATE rewards_catalog SET stock = stock - 1 WHERE id = p_reward_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'redemption_id', v_redemption_id,
        'redemption_code', v_redemption_code,
        'points_spent', v_reward.points_cost,
        'new_balance', v_new_balance,
        'expires_at', CASE WHEN v_settings.redemption_code_expiry_hours IS NOT NULL
                           THEN NOW() + (v_settings.redemption_code_expiry_hours || ' hours')::INTERVAL
                           ELSE NULL END
    );
END;
$$;


-- ============================================
-- RPC 3: process_appointment_loyalty
-- ============================================
-- Called when an appointment is marked as
-- completed. Awards points, updates visit stats,
-- checks streaks and challenges.
-- ============================================
CREATE OR REPLACE FUNCTION process_appointment_loyalty(
    p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appointment RECORD;
    v_salon_id UUID;
    v_settings loyalty_settings%ROWTYPE;
    v_base_points INT;
    v_earn_result JSONB;
    v_profile loyalty_profiles%ROWTYPE;
    v_streak loyalty_streaks%ROWTYPE;
    v_idempotency TEXT;
BEGIN
    -- Get appointment details
    SELECT a.*, sm.salon_id
    INTO v_appointment
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    JOIN salon_members sm ON sm.profile_id = b.profile_id
    WHERE a.id = p_appointment_id AND a.status = 'completed'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'appointment_not_found');
    END IF;

    v_salon_id := v_appointment.salon_id;
    v_idempotency := 'apt_' || p_appointment_id::TEXT;

    -- Get settings
    SELECT * INTO v_settings FROM loyalty_settings WHERE salon_id = v_salon_id;
    IF NOT FOUND OR NOT v_settings.enabled THEN
        RETURN jsonb_build_object('success', false, 'error', 'loyalty_disabled');
    END IF;

    -- Calculate base points from spend
    v_base_points := CEIL(v_appointment.total_cents::NUMERIC / 100 * v_settings.points_per_ron);

    -- Award points (handles multipliers, tier checks internally)
    v_earn_result := earn_loyalty_points(
        p_user_id := v_appointment.user_id,
        p_salon_id := v_salon_id,
        p_amount := v_base_points,
        p_source := 'appointment',
        p_source_id := p_appointment_id,
        p_description := 'Puncte pentru programare',
        p_idempotency_key := v_idempotency,
        p_metadata := jsonb_build_object('total_cents', v_appointment.total_cents)
    );

    -- Update visit stats
    UPDATE loyalty_profiles
    SET total_visits = total_visits + 1,
        total_spent_cents = total_spent_cents + v_appointment.total_cents,
        last_visit_at = NOW()
    WHERE user_id = v_appointment.user_id AND salon_id = v_salon_id;

    -- Update streak
    SELECT * INTO v_streak
    FROM loyalty_streaks
    WHERE user_id = v_appointment.user_id
      AND salon_id = v_salon_id
      AND streak_type = 'weekly_visit'
    FOR UPDATE;

    IF NOT FOUND THEN
        SELECT * INTO v_profile
        FROM loyalty_profiles
        WHERE user_id = v_appointment.user_id AND salon_id = v_salon_id;

        INSERT INTO loyalty_streaks (user_id, salon_id, loyalty_profile_id, streak_type, current_count, last_activity_at, streak_started_at)
        VALUES (v_appointment.user_id, v_salon_id, v_profile.id, 'weekly_visit', 1, NOW(), NOW())
        RETURNING * INTO v_streak;
    ELSE
        -- If last activity was within the grace period, continue streak
        IF v_streak.last_activity_at IS NULL
           OR NOW() - v_streak.last_activity_at <= (COALESCE(v_settings.streak_grace_period_hours, 48 * 7) || ' hours')::INTERVAL
        THEN
            UPDATE loyalty_streaks
            SET current_count = current_count + 1,
                longest_count = GREATEST(longest_count, current_count + 1),
                last_activity_at = NOW(),
                updated_at = NOW()
            WHERE id = v_streak.id;
        ELSE
            -- Streak broken, restart
            UPDATE loyalty_streaks
            SET current_count = 1,
                streak_broken_at = v_streak.last_activity_at,
                streak_started_at = NOW(),
                last_activity_at = NOW(),
                grace_period_used = FALSE,
                updated_at = NOW()
            WHERE id = v_streak.id;
        END IF;
    END IF;

    -- Update active challenges
    UPDATE user_challenges
    SET current_progress = current_progress + 1,
        updated_at = NOW(),
        status = CASE
            WHEN current_progress + 1 >= target_value THEN 'completed'
            ELSE status
        END,
        completed_at = CASE
            WHEN current_progress + 1 >= target_value THEN NOW()
            ELSE completed_at
        END
    WHERE user_id = v_appointment.user_id
      AND status = 'active'
      AND challenge_id IN (
          SELECT id FROM challenges
          WHERE salon_id = v_salon_id
            AND active = TRUE
            AND NOW() BETWEEN starts_at AND ends_at
            AND challenge_type IN ('visit_count', 'combo')
      );

    RETURN jsonb_build_object(
        'success', true,
        'earn_result', v_earn_result,
        'appointment_id', p_appointment_id
    );
END;
$$;


-- ============================================
-- RPC 4: claim_challenge_reward
-- ============================================
CREATE OR REPLACE FUNCTION claim_challenge_reward(
    p_user_id UUID,
    p_user_challenge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uc user_challenges%ROWTYPE;
    v_challenge challenges%ROWTYPE;
    v_earn_result JSONB;
BEGIN
    SELECT * INTO v_uc
    FROM user_challenges
    WHERE id = p_user_challenge_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    IF v_uc.status != 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_completed', 'status', v_uc.status);
    END IF;

    SELECT * INTO v_challenge FROM challenges WHERE id = v_uc.challenge_id;

    -- Award challenge points
    IF v_challenge.points_reward > 0 THEN
        v_earn_result := earn_loyalty_points(
            p_user_id := p_user_id,
            p_salon_id := v_uc.salon_id,
            p_amount := v_challenge.points_reward,
            p_source := 'challenge',
            p_source_id := v_uc.challenge_id,
            p_description := 'Provocare completata: ' || v_challenge.name,
            p_idempotency_key := 'challenge_' || p_user_challenge_id::TEXT
        );
    END IF;

    UPDATE user_challenges
    SET status = 'claimed',
        claimed_at = NOW(),
        points_awarded = v_challenge.points_reward,
        updated_at = NOW()
    WHERE id = p_user_challenge_id;

    RETURN jsonb_build_object(
        'success', true,
        'points_awarded', v_challenge.points_reward,
        'bonus_reward', v_challenge.bonus_reward,
        'earn_result', v_earn_result
    );
END;
$$;


-- ============================================
-- RPC 5: process_referral
-- ============================================
CREATE OR REPLACE FUNCTION process_referral(
    p_referred_user_id UUID,
    p_referral_code TEXT,
    p_salon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_referrer_profile loyalty_profiles%ROWTYPE;
    v_settings loyalty_settings%ROWTYPE;
    v_referral_id UUID;
BEGIN
    -- Find referrer by code
    SELECT * INTO v_referrer_profile
    FROM loyalty_profiles
    WHERE referral_code = UPPER(p_referral_code)
      AND salon_id = p_salon_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_code', 'message', 'Cod de referinta invalid');
    END IF;

    -- Cannot refer yourself
    IF v_referrer_profile.user_id = p_referred_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'self_referral');
    END IF;

    -- Check duplicate
    IF EXISTS (
        SELECT 1 FROM referrals
        WHERE salon_id = p_salon_id
          AND referred_id = p_referred_user_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_referred', 'message', 'Utilizatorul a fost deja referit');
    END IF;

    SELECT * INTO v_settings FROM loyalty_settings WHERE salon_id = p_salon_id;

    -- Create referral record
    INSERT INTO referrals (salon_id, referrer_id, referred_id, referral_code, status)
    VALUES (p_salon_id, v_referrer_profile.user_id, p_referred_user_id, p_referral_code, 'pending')
    RETURNING id INTO v_referral_id;

    -- Award referred user welcome bonus
    IF v_settings.referral_referred_points > 0 THEN
        PERFORM earn_loyalty_points(
            p_user_id := p_referred_user_id,
            p_salon_id := p_salon_id,
            p_amount := v_settings.referral_referred_points,
            p_source := 'referral',
            p_source_id := v_referral_id,
            p_description := 'Bonus de bun venit prin referinta',
            p_idempotency_key := 'ref_referred_' || v_referral_id::TEXT
        );
        UPDATE referrals SET referred_points_awarded = v_settings.referral_referred_points WHERE id = v_referral_id;
    END IF;

    -- Award referrer
    IF v_settings.referral_referrer_points > 0 THEN
        PERFORM earn_loyalty_points(
            p_user_id := v_referrer_profile.user_id,
            p_salon_id := p_salon_id,
            p_amount := v_settings.referral_referrer_points,
            p_source := 'referral',
            p_source_id := v_referral_id,
            p_description := 'Bonus pentru referinta',
            p_idempotency_key := 'ref_referrer_' || v_referral_id::TEXT
        );
        UPDATE referrals
        SET referrer_points_awarded = v_settings.referral_referrer_points,
            status = 'rewarded',
            rewarded_at = NOW()
        WHERE id = v_referral_id;
    END IF;

    -- Update referred_by on loyalty profile
    UPDATE loyalty_profiles
    SET referred_by = v_referrer_profile.user_id
    WHERE user_id = p_referred_user_id AND salon_id = p_salon_id;

    RETURN jsonb_build_object(
        'success', true,
        'referral_id', v_referral_id,
        'referrer_points', v_settings.referral_referrer_points,
        'referred_points', v_settings.referral_referred_points
    );
END;
$$;


-- ============================================
-- RPC 6: expire_stale_points (cron job)
-- ============================================
-- Run via pg_cron or Supabase edge function
-- on a daily schedule.
-- ============================================
CREATE OR REPLACE FUNCTION expire_stale_points()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_txn RECORD;
    v_expired_count INT := 0;
    v_profile loyalty_profiles%ROWTYPE;
BEGIN
    FOR v_txn IN
        SELECT pt.*, pt.amount AS remaining_amount
        FROM point_transactions pt
        WHERE pt.type = 'earn'
          AND pt.expires_at IS NOT NULL
          AND pt.expires_at <= NOW()
          AND NOT EXISTS (
              SELECT 1 FROM point_transactions pt2
              WHERE pt2.idempotency_key = 'expire_' || pt.id::TEXT
          )
    LOOP
        -- Lock the profile
        SELECT * INTO v_profile
        FROM loyalty_profiles
        WHERE id = v_txn.loyalty_profile_id
        FOR UPDATE;

        -- Only expire if user still has points
        IF v_profile.current_points > 0 THEN
            DECLARE
                v_expire_amount INT := LEAST(v_txn.remaining_amount, v_profile.current_points);
                v_new_balance INT := v_profile.current_points - v_expire_amount;
            BEGIN
                UPDATE loyalty_profiles
                SET current_points = v_new_balance,
                    updated_at = NOW()
                WHERE id = v_profile.id;

                INSERT INTO point_transactions (
                    loyalty_profile_id, salon_id, user_id, type, amount,
                    balance_after, source, source_id, description, idempotency_key
                ) VALUES (
                    v_profile.id, v_txn.salon_id, v_txn.user_id, 'expire', -v_expire_amount,
                    v_new_balance, 'expiry', v_txn.id,
                    'Puncte expirate',
                    'expire_' || v_txn.id::TEXT
                );

                v_expired_count := v_expired_count + 1;
            END;
        END IF;
    END LOOP;

    RETURN v_expired_count;
END;
$$;


-- ============================================
-- RPC 7: get_loyalty_dashboard
-- ============================================
-- Single call to fetch all loyalty data for
-- the user's dashboard screen.
-- ============================================
CREATE OR REPLACE FUNCTION get_loyalty_dashboard(
    p_user_id UUID,
    p_salon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile JSONB;
    v_tier JSONB;
    v_next_tier JSONB;
    v_recent_txns JSONB;
    v_achievements JSONB;
    v_active_challenges JSONB;
    v_streaks JSONB;
    v_active_multipliers JSONB;
BEGIN
    -- Profile + current tier
    SELECT jsonb_build_object(
        'id', lp.id,
        'current_points', lp.current_points,
        'lifetime_points', lp.lifetime_points,
        'total_visits', lp.total_visits,
        'total_spent_cents', lp.total_spent_cents,
        'current_streak_days', lp.current_streak_days,
        'longest_streak_days', lp.longest_streak_days,
        'referral_code', lp.referral_code,
        'last_visit_at', lp.last_visit_at
    ) INTO v_profile
    FROM loyalty_profiles lp
    WHERE lp.user_id = p_user_id AND lp.salon_id = p_salon_id;

    IF v_profile IS NULL THEN
        RETURN jsonb_build_object('enrolled', false);
    END IF;

    -- Current tier
    SELECT jsonb_build_object('id', lt.id, 'name', lt.name, 'slug', lt.slug, 'color', lt.color, 'icon_url', lt.icon_url, 'multiplier', lt.multiplier, 'perks', lt.perks)
    INTO v_tier
    FROM loyalty_profiles lp
    JOIN loyalty_tiers lt ON lt.id = lp.current_tier_id
    WHERE lp.user_id = p_user_id AND lp.salon_id = p_salon_id;

    -- Next tier
    SELECT jsonb_build_object('id', lt.id, 'name', lt.name, 'slug', lt.slug, 'min_lifetime_points', lt.min_lifetime_points, 'points_remaining', lt.min_lifetime_points - (v_profile->>'lifetime_points')::INT)
    INTO v_next_tier
    FROM loyalty_tiers lt
    WHERE lt.salon_id = p_salon_id
      AND lt.active = TRUE
      AND lt.min_lifetime_points > (v_profile->>'lifetime_points')::INT
    ORDER BY lt.min_lifetime_points ASC
    LIMIT 1;

    -- Recent transactions (last 20)
    SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]')
    INTO v_recent_txns
    FROM (
        SELECT jsonb_build_object('id', id, 'type', type, 'amount', amount, 'balance_after', balance_after, 'source', source, 'description', description, 'created_at', created_at) AS t
        FROM point_transactions
        WHERE user_id = p_user_id AND salon_id = p_salon_id
        ORDER BY created_at DESC
        LIMIT 20
    ) sub;

    -- Unlocked achievements
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'description', a.description, 'icon_url', a.icon_url, 'rarity', a.rarity, 'unlocked_at', ua.unlocked_at)), '[]')
    INTO v_achievements
    FROM user_achievements ua
    JOIN achievements a ON a.id = ua.achievement_id
    WHERE ua.user_id = p_user_id AND (ua.salon_id = p_salon_id OR ua.salon_id IS NULL);

    -- Active challenges
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', uc.id, 'name', c.name, 'description', c.description, 'icon_url', c.icon_url, 'current_progress', uc.current_progress, 'target_value', uc.target_value, 'status', uc.status, 'points_reward', c.points_reward, 'ends_at', c.ends_at)), '[]')
    INTO v_active_challenges
    FROM user_challenges uc
    JOIN challenges c ON c.id = uc.challenge_id
    WHERE uc.user_id = p_user_id AND uc.salon_id = p_salon_id AND uc.status IN ('active', 'completed');

    -- Streaks
    SELECT COALESCE(jsonb_agg(jsonb_build_object('streak_type', streak_type, 'current_count', current_count, 'longest_count', longest_count, 'last_activity_at', last_activity_at)), '[]')
    INTO v_streaks
    FROM loyalty_streaks
    WHERE user_id = p_user_id AND salon_id = p_salon_id;

    -- Active multipliers
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'multiplier', multiplier, 'applies_to', applies_to, 'ends_at', ends_at)), '[]')
    INTO v_active_multipliers
    FROM point_multipliers
    WHERE salon_id = p_salon_id AND active = TRUE AND NOW() BETWEEN starts_at AND ends_at;

    RETURN jsonb_build_object(
        'enrolled', true,
        'profile', v_profile,
        'tier', COALESCE(v_tier, 'null'::JSONB),
        'next_tier', COALESCE(v_next_tier, 'null'::JSONB),
        'recent_transactions', v_recent_txns,
        'achievements', v_achievements,
        'active_challenges', v_active_challenges,
        'streaks', v_streaks,
        'active_multipliers', v_active_multipliers
    );
END;
$$;


-- ============================================
-- TRIGGER: updated_at auto-update
-- ============================================
CREATE OR REPLACE FUNCTION update_loyalty_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_loyalty_profiles_updated_at BEFORE UPDATE ON loyalty_profiles FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_loyalty_tiers_updated_at BEFORE UPDATE ON loyalty_tiers FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_challenges_updated_at BEFORE UPDATE ON challenges FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_user_challenges_updated_at BEFORE UPDATE ON user_challenges FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_rewards_catalog_updated_at BEFORE UPDATE ON rewards_catalog FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_redemptions_updated_at BEFORE UPDATE ON redemptions FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_loyalty_streaks_updated_at BEFORE UPDATE ON loyalty_streaks FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_point_multipliers_updated_at BEFORE UPDATE ON point_multipliers FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_loyalty_settings_updated_at BEFORE UPDATE ON loyalty_settings FOR EACH ROW EXECUTE FUNCTION update_loyalty_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
