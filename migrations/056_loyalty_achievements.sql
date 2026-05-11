-- ============================================
-- Migration 056: Achievements & Challenges
-- ============================================
-- Gamification layer on top of the loyalty system:
--   - Achievement badges (global + per-salon)
--   - Time-limited challenges (weekly/monthly/special)
--   - User progress tracking & reward claiming
--   - 15 seeded starter achievements (Romanian)
--   - Full RLS: users see own, salon staff see salon's
-- ============================================

-- ============================================
-- 1. ACHIEVEMENTS — Badge definitions
-- ============================================
-- salon_id NULL = global achievement available everywhere.
-- condition_type + condition_value encode the unlock rule
-- so the client/backend can evaluate without hardcoding.
-- ============================================
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('milestone','exploration','behavior','social','secret','seasonal')),
    rarity TEXT NOT NULL CHECK (rarity IN ('common','rare','epic','legendary')),
    icon_url TEXT,
    points_reward INT NOT NULL DEFAULT 0,
    condition_type TEXT NOT NULL,                 -- e.g. visit_count, service_variety, streak_length, referral_count, review_count, time_based
    condition_value JSONB NOT NULL,               -- e.g. {"count": 5} or {"services": 3}
    is_secret BOOLEAN NOT NULL DEFAULT FALSE,
    salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,  -- NULL = global
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_achievements_salon ON achievements(salon_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category, rarity);
CREATE INDEX IF NOT EXISTS idx_achievements_condition ON achievements(condition_type);
CREATE INDEX IF NOT EXISTS idx_achievements_active ON achievements(active) WHERE active = TRUE;

-- Anyone can see non-secret active achievements (or all if they earned them)
DROP POLICY IF EXISTS "Anyone can view public achievements" ON achievements;
CREATE POLICY "Anyone can view public achievements" ON achievements
    FOR SELECT USING (
        active = TRUE AND is_secret = FALSE
    );

DROP POLICY IF EXISTS "Users can view secret achievements they earned" ON achievements;
CREATE POLICY "Users can view secret achievements they earned" ON achievements
    FOR SELECT USING (
        is_secret = TRUE
        AND EXISTS (
            SELECT 1 FROM user_achievements ua
            WHERE ua.achievement_id = achievements.id
              AND ua.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Salon owner can manage achievements" ON achievements;
CREATE POLICY "Salon owner can manage achievements" ON achievements
    FOR ALL USING (
        salon_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = achievements.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 2. USER_ACHIEVEMENTS — Unlocked badges
-- ============================================
CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_showcased BOOLEAN NOT NULL DEFAULT FALSE,
    notified BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(user_id, achievement_id)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_salon ON user_achievements(salon_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_showcased ON user_achievements(user_id) WHERE is_showcased = TRUE;

DROP POLICY IF EXISTS "Users can view own achievements" ON user_achievements;
CREATE POLICY "Users can view own achievements" ON user_achievements
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own achievements" ON user_achievements;
CREATE POLICY "Users can update own achievements" ON user_achievements
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Salon staff can view salon achievements" ON user_achievements;
CREATE POLICY "Salon staff can view salon achievements" ON user_achievements
    FOR SELECT USING (
        salon_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = user_achievements.salon_id
              AND s.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "System can insert achievements" ON user_achievements;
CREATE POLICY "System can insert achievements" ON user_achievements
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================
-- 3. CHALLENGES — Time-limited missions
-- ============================================
CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('weekly','monthly','special')),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon_url TEXT,
    condition_type TEXT NOT NULL,
    condition_value JSONB NOT NULL,
    points_reward INT NOT NULL,
    badge_reward_id UUID REFERENCES achievements(id) ON DELETE SET NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('usor','mediu','dificil','expert')),
    max_participants INT,                         -- NULL = unlimited
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT challenge_dates_valid CHECK (ends_at > starts_at)
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_challenges_salon ON challenges(salon_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges(active, starts_at, ends_at) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_challenges_type ON challenges(type);

DROP POLICY IF EXISTS "Anyone can view active challenges" ON challenges;
CREATE POLICY "Anyone can view active challenges" ON challenges
    FOR SELECT USING (active = TRUE);

DROP POLICY IF EXISTS "Salon owner can manage challenges" ON challenges;
CREATE POLICY "Salon owner can manage challenges" ON challenges
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = challenges.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 4. USER_CHALLENGES — Challenge progress
-- ============================================
CREATE TABLE IF NOT EXISTS user_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    progress INT NOT NULL DEFAULT 0,
    target INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','claimed','expired')),
    completed_at TIMESTAMPTZ,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, challenge_id),
    CONSTRAINT progress_non_negative CHECK (progress >= 0),
    CONSTRAINT target_positive CHECK (target > 0)
);

ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_challenges_user ON user_challenges(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_challenges_challenge ON user_challenges(challenge_id);
CREATE INDEX IF NOT EXISTS idx_user_challenges_active ON user_challenges(user_id, status) WHERE status = 'active';

DROP POLICY IF EXISTS "Users can view own challenges" ON user_challenges;
CREATE POLICY "Users can view own challenges" ON user_challenges
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can join challenges" ON user_challenges;
CREATE POLICY "Users can join challenges" ON user_challenges
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own challenge progress" ON user_challenges;
CREATE POLICY "Users can update own challenge progress" ON user_challenges
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Salon staff can view salon challenge progress" ON user_challenges;
CREATE POLICY "Salon staff can view salon challenge progress" ON user_challenges
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM challenges c
            JOIN salons s ON s.id = c.salon_id
            WHERE c.id = user_challenges.challenge_id
              AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 5. HELPER RPC — Award achievement safely
-- ============================================
-- Idempotent: skips if already earned.
-- Awards points to loyalty_profiles if applicable.
-- ============================================
CREATE OR REPLACE FUNCTION award_achievement(
    p_user_id UUID,
    p_achievement_slug TEXT,
    p_salon_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_achievement achievements%ROWTYPE;
    v_already_earned BOOLEAN;
    v_ua_id UUID;
BEGIN
    -- Look up the achievement
    SELECT * INTO v_achievement
    FROM achievements
    WHERE slug = p_achievement_slug AND active = TRUE
    LIMIT 1;

    IF v_achievement.id IS NULL THEN
        RETURN jsonb_build_object('awarded', FALSE, 'reason', 'achievement_not_found');
    END IF;

    -- Idempotency check
    SELECT EXISTS (
        SELECT 1 FROM user_achievements
        WHERE user_id = p_user_id AND achievement_id = v_achievement.id
    ) INTO v_already_earned;

    IF v_already_earned THEN
        RETURN jsonb_build_object('awarded', FALSE, 'reason', 'already_earned');
    END IF;

    -- Award the badge
    INSERT INTO user_achievements (user_id, achievement_id, salon_id)
    VALUES (p_user_id, v_achievement.id, COALESCE(p_salon_id, v_achievement.salon_id))
    RETURNING id INTO v_ua_id;

    -- Award points if any and loyalty profile exists
    IF v_achievement.points_reward > 0 AND p_salon_id IS NOT NULL THEN
        UPDATE loyalty_profiles
        SET current_points = current_points + v_achievement.points_reward,
            lifetime_points = lifetime_points + v_achievement.points_reward,
            updated_at = NOW()
        WHERE user_id = p_user_id AND salon_id = p_salon_id;
    END IF;

    RETURN jsonb_build_object(
        'awarded', TRUE,
        'user_achievement_id', v_ua_id,
        'achievement_name', v_achievement.name,
        'points_reward', v_achievement.points_reward,
        'rarity', v_achievement.rarity
    );
END;
$$;

-- ============================================
-- 6. HELPER RPC — Claim challenge reward
-- ============================================
-- Validates completion, transitions status,
-- awards points and optional badge reward.
-- ============================================
CREATE OR REPLACE FUNCTION claim_challenge_reward(
    p_user_id UUID,
    p_challenge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_uc user_challenges%ROWTYPE;
    v_challenge challenges%ROWTYPE;
    v_badge_result JSONB;
BEGIN
    -- Lock the user_challenge row
    SELECT * INTO v_uc
    FROM user_challenges
    WHERE user_id = p_user_id AND challenge_id = p_challenge_id
    FOR UPDATE;

    IF v_uc.id IS NULL THEN
        RETURN jsonb_build_object('claimed', FALSE, 'reason', 'not_found');
    END IF;

    IF v_uc.status = 'claimed' THEN
        RETURN jsonb_build_object('claimed', FALSE, 'reason', 'already_claimed');
    END IF;

    IF v_uc.status != 'completed' THEN
        RETURN jsonb_build_object('claimed', FALSE, 'reason', 'not_completed');
    END IF;

    -- Get challenge details
    SELECT * INTO v_challenge
    FROM challenges
    WHERE id = p_challenge_id;

    -- Mark as claimed
    UPDATE user_challenges
    SET status = 'claimed', claimed_at = NOW()
    WHERE id = v_uc.id;

    -- Award points
    IF v_challenge.points_reward > 0 THEN
        UPDATE loyalty_profiles
        SET current_points = current_points + v_challenge.points_reward,
            lifetime_points = lifetime_points + v_challenge.points_reward,
            updated_at = NOW()
        WHERE user_id = p_user_id AND salon_id = v_challenge.salon_id;
    END IF;

    -- Award badge if configured
    IF v_challenge.badge_reward_id IS NOT NULL THEN
        SELECT award_achievement(p_user_id, a.slug, v_challenge.salon_id) INTO v_badge_result
        FROM achievements a
        WHERE a.id = v_challenge.badge_reward_id;
    END IF;

    RETURN jsonb_build_object(
        'claimed', TRUE,
        'points_reward', v_challenge.points_reward,
        'badge_result', COALESCE(v_badge_result, '{}'::JSONB)
    );
END;
$$;

-- ============================================
-- 7. SEED DATA — 15 starter achievements
-- ============================================
INSERT INTO achievements (slug, name, description, category, rarity, points_reward, condition_type, condition_value, is_secret, sort_order)
VALUES
    ('prima-tunsoare',
     'Prima Tunsoare',
     'Ai făcut prima vizită la salon. Bine ai venit!',
     'milestone', 'common', 10,
     'visit_count', '{"count": 1}'::JSONB,
     FALSE, 1),

    ('client-fidel',
     'Client Fidel',
     'Ai acumulat 5 vizite. Fidelitatea ta este apreciată!',
     'milestone', 'common', 25,
     'visit_count', '{"count": 5}'::JSONB,
     FALSE, 2),

    ('veteran',
     'Veteran',
     'Ai ajuns la 10 vizite. Ești deja un obișnuit al casei!',
     'milestone', 'rare', 50,
     'visit_count', '{"count": 10}'::JSONB,
     FALSE, 3),

    ('legenda',
     'Legenda',
     'Ai depășit 25 de vizite. Ești o legendă adevărată!',
     'milestone', 'epic', 100,
     'visit_count', '{"count": 25}'::JSONB,
     FALSE, 4),

    ('centenar',
     'Centenar',
     'Ai atins 100 de vizite. Legendele vorbesc despre tine!',
     'milestone', 'legendary', 500,
     'visit_count', '{"count": 100}'::JSONB,
     FALSE, 5),

    ('explorer',
     'Explorer',
     'Ai încercat 3 servicii diferite. Curajul de a explora!',
     'exploration', 'common', 15,
     'service_variety', '{"services": 3}'::JSONB,
     FALSE, 6),

    ('completist',
     'Completist',
     'Ai încercat toate serviciile disponibile. Nimic nu ți-a scăpat!',
     'exploration', 'rare', 75,
     'service_variety', '{"all": true}'::JSONB,
     FALSE, 7),

    ('maestrul-barbii',
     'Maestrul Bărbii',
     'Ai făcut 5 aranjări de barbă. Un adevărat maestru!',
     'exploration', 'common', 20,
     'service_specific', '{"service_type": "beard_trim", "count": 5}'::JSONB,
     FALSE, 8),

    ('matinal',
     'Matinal',
     'Ai făcut 5 programări înainte de ora 11:00. Pasărea de dimineață!',
     'behavior', 'common', 15,
     'time_based', '{"before_hour": 11, "count": 5}'::JSONB,
     FALSE, 9),

    ('nocturn',
     'Nocturn',
     'Ai făcut 5 programări după ora 18:00. Bufnița nopții!',
     'behavior', 'common', 15,
     'time_based', '{"after_hour": 18, "count": 5}'::JSONB,
     FALSE, 10),

    ('punctual-de-elvetia',
     'Punctual de Elveția',
     'Ai ajuns la timp la 10 programări. Ceasul elvețian!',
     'behavior', 'rare', 40,
     'on_time', '{"count": 10}'::JSONB,
     FALSE, 11),

    ('ambasador',
     'Ambasador',
     'Ai recomandat salonul la 3 prieteni. Mulțumim pentru încredere!',
     'social', 'rare', 50,
     'referral_count', '{"count": 3}'::JSONB,
     FALSE, 12),

    ('critic',
     'Critic',
     'Ai lăsat 5 recenzii. Părerea ta contează enorm!',
     'social', 'common', 20,
     'review_count', '{"count": 5}'::JSONB,
     FALSE, 13),

    ('loial',
     'Loial',
     'Ai făcut 10 vizite la același frizer. O legătură specială!',
     'milestone', 'epic', 75,
     'same_barber_visits', '{"count": 10}'::JSONB,
     FALSE, 14),

    ('razboinic-de-weekend',
     'Războinic de Weekend',
     'Ai venit 4 sâmbete la rând. Weekendul e al tău!',
     'secret', 'rare', 60,
     'streak_length', '{"day_of_week": 6, "consecutive": 4}'::JSONB,
     TRUE, 15)

ON CONFLICT (slug) DO NOTHING;
