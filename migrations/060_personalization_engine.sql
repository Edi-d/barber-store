-- ============================================================================
-- Migration 060: Personalization Engine V1
-- ============================================================================
-- Adds loyalty points, user segments, churn scoring, reward preferences,
-- communication preferences, and all the scaffolding needed for a
-- heuristic-based personalization system in PostgreSQL.
-- V1: rule-based heuristics. V2 path: swap scoring functions for ML models.
-- ============================================================================

-- ─── 1. LOYALTY POINTS LEDGER ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS loyalty_points (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id    UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    amount      INT NOT NULL,                     -- positive = earn, negative = redeem
    reason      TEXT NOT NULL,                     -- 'appointment_completed' | 'referral' | 'review' | 'streak_bonus' | 'redemption' | 'bonus_offer' | 'social_share'
    reference_id UUID,                             -- FK to appointment, order, etc.
    meta        JSONB DEFAULT '{}',                -- extra context (service name, barber name, etc.)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loyalty_points_user_salon ON loyalty_points(user_id, salon_id, created_at DESC);
CREATE INDEX idx_loyalty_points_user_balance ON loyalty_points(user_id, salon_id);

ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own points" ON loyalty_points
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert points" ON loyalty_points
    FOR INSERT WITH CHECK (true);

-- ─── 2. LOYALTY BALANCE MATERIALIZED VIEW ──────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS loyalty_balances AS
SELECT
    user_id,
    salon_id,
    SUM(amount) AS balance,
    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total_earned,
    SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS total_redeemed,
    COUNT(*) FILTER (WHERE reason = 'appointment_completed') AS completed_appointments,
    MAX(created_at) AS last_activity
FROM loyalty_points
GROUP BY user_id, salon_id;

CREATE UNIQUE INDEX idx_loyalty_balances_pk ON loyalty_balances(user_id, salon_id);

-- ─── 3. USER PROFILE SIGNALS (computed behavioral data) ────────────────────

CREATE TABLE IF NOT EXISTS user_personalization (
    user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id            UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,

    -- Visit cadence
    avg_days_between_visits  NUMERIC(5,1),       -- e.g. 21.3 days
    stddev_visit_interval    NUMERIC(5,1),        -- consistency measure
    last_visit_at            TIMESTAMPTZ,
    next_visit_predicted     TIMESTAMPTZ,         -- avg_days after last_visit
    total_visits             INT DEFAULT 0,

    -- Spending
    avg_spend_cents          INT DEFAULT 0,
    total_spend_cents        BIGINT DEFAULT 0,
    max_spend_cents          INT DEFAULT 0,
    min_spend_cents          INT DEFAULT 0,

    -- Preferred barber
    preferred_barber_id      UUID REFERENCES barbers(id),
    barber_loyalty_pct       NUMERIC(4,1),         -- % of visits with preferred barber

    -- Preferred services
    top_services             UUID[] DEFAULT '{}',  -- ordered by frequency
    service_diversity_score  NUMERIC(3,2),          -- 0-1: 0=always same, 1=tries everything

    -- Time preferences
    preferred_day_of_week    INT,                   -- 0=Sun..6=Sat
    preferred_hour           INT,                   -- 0-23
    preferred_time_slot      TEXT,                   -- 'morning' | 'afternoon' | 'evening'

    -- Churn risk
    churn_risk_score         NUMERIC(3,2) DEFAULT 0, -- 0-1: 0=loyal, 1=about to leave
    churn_risk_level         TEXT DEFAULT 'low',      -- 'low' | 'medium' | 'high' | 'critical'
    days_overdue             INT DEFAULT 0,           -- days past predicted next visit

    -- Reward preferences (learned from redemption history)
    reward_preference        TEXT DEFAULT 'discount',  -- 'discount' | 'free_service' | 'product' | 'experience'

    -- Segment
    segment                  TEXT DEFAULT 'new',       -- 'new' | 'regular' | 'loyal' | 'vip' | 'at_risk' | 'dormant' | 'lost'
    segment_updated_at       TIMESTAMPTZ DEFAULT NOW(),

    -- Communication
    best_notification_hour   INT DEFAULT 10,           -- hour of day when user most responsive
    best_notification_day    INT DEFAULT 1,            -- day of week when user most responsive
    notification_frequency   TEXT DEFAULT 'normal',    -- 'minimal' | 'normal' | 'frequent'

    -- Timestamps
    computed_at              TIMESTAMPTZ DEFAULT NOW(),
    created_at               TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (user_id, salon_id)
);

ALTER TABLE user_personalization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own personalization" ON user_personalization
    FOR SELECT USING (auth.uid() = user_id);
-- Salon owners can view their clients' personalization data
CREATE POLICY "Salon owners can view client personalization" ON user_personalization
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid())
    );
CREATE POLICY "System can upsert personalization" ON user_personalization
    FOR ALL WITH CHECK (true);

-- ─── 4. REWARDS CATALOG ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rewards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id        UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    type            TEXT NOT NULL,                  -- 'discount_pct' | 'discount_fixed' | 'free_service' | 'free_product' | 'experience'
    value           INT,                            -- discount % or price_cents
    point_cost      INT NOT NULL,                   -- how many points to redeem
    base_point_cost INT NOT NULL,                   -- original cost before dynamic pricing
    service_id      UUID REFERENCES barber_services(id), -- if type = 'free_service'
    product_id      UUID REFERENCES products(id),         -- if type = 'free_product'
    min_tier        TEXT DEFAULT 'new',              -- minimum segment required
    max_redemptions INT,                             -- NULL = unlimited
    current_redemptions INT DEFAULT 0,
    active          BOOLEAN DEFAULT TRUE,
    image_url       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rewards_salon ON rewards(salon_id) WHERE active = true;

ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active rewards" ON rewards
    FOR SELECT USING (active = true);
CREATE POLICY "Salon owner can manage rewards" ON rewards
    FOR ALL USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid())
    );

-- ─── 5. REWARD REDEMPTIONS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reward_redemptions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reward_id   UUID NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
    salon_id    UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    points_spent INT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'used' | 'expired' | 'cancelled'
    code        TEXT NOT NULL,                       -- short redemption code (e.g. "TAPZI-A3X9")
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reward_redemptions_user ON reward_redemptions(user_id, created_at DESC);
CREATE INDEX idx_reward_redemptions_code ON reward_redemptions(code);

ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemptions" ON reward_redemptions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Salon owners can view redemptions" ON reward_redemptions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid())
    );
CREATE POLICY "System can manage redemptions" ON reward_redemptions
    FOR ALL WITH CHECK (true);

-- ─── 6. NOTIFICATION LOG (for learning optimal timing) ─────────────────────

CREATE TABLE IF NOT EXISTS notification_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id        UUID REFERENCES salons(id) ON DELETE SET NULL,
    type            TEXT NOT NULL,                   -- 'visit_reminder' | 'churn_retention' | 'reward_available' | 'streak_reminder' | 'recommendation'
    channel         TEXT NOT NULL DEFAULT 'push',    -- 'push' | 'sms' | 'email' | 'in_app'
    title           TEXT,
    body            TEXT,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opened_at       TIMESTAMPTZ,                     -- NULL = not opened
    acted_on_at     TIMESTAMPTZ,                     -- NULL = no action taken
    action_type     TEXT,                             -- 'booked' | 'redeemed' | 'dismissed' | NULL
    meta            JSONB DEFAULT '{}'
);

CREATE INDEX idx_notification_log_user ON notification_log(user_id, sent_at DESC);
CREATE INDEX idx_notification_log_effectiveness ON notification_log(type, sent_at)
    WHERE opened_at IS NOT NULL;

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification log" ON notification_log
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert notification log" ON notification_log
    FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update notification log" ON notification_log
    FOR UPDATE WITH CHECK (true);

-- ─── 7. PUSH TOKENS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token       TEXT NOT NULL,
    platform    TEXT NOT NULL DEFAULT 'expo',       -- 'expo' | 'apns' | 'fcm'
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
);

CREATE INDEX idx_push_tokens_user ON push_tokens(user_id) WHERE active = true;

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push tokens" ON push_tokens
    FOR ALL USING (auth.uid() = user_id);

-- ─── 8. USER NOTIFICATION PREFERENCES ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_notification_prefs (
    user_id             UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    visit_reminders     BOOLEAN DEFAULT TRUE,
    promotional         BOOLEAN DEFAULT TRUE,
    reward_alerts       BOOLEAN DEFAULT TRUE,
    streak_reminders    BOOLEAN DEFAULT TRUE,
    quiet_hours_start   TIME DEFAULT '22:00',
    quiet_hours_end     TIME DEFAULT '08:00',
    max_per_week        INT DEFAULT 5,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own prefs" ON user_notification_prefs
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS: Personalization Computation Engine
-- ============================================================================

-- ─── F1. COMPUTE USER PERSONALIZATION (per user+salon) ─────────────────────
-- Call this after each completed appointment or periodically via cron.

CREATE OR REPLACE FUNCTION compute_user_personalization(
    p_user_id UUID,
    p_salon_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_visits RECORD;
    v_spending RECORD;
    v_barber RECORD;
    v_services UUID[];
    v_service_count INT;
    v_unique_services INT;
    v_preferred_dow INT;
    v_preferred_hour INT;
    v_avg_interval NUMERIC;
    v_stddev_interval NUMERIC;
    v_last_visit TIMESTAMPTZ;
    v_next_predicted TIMESTAMPTZ;
    v_churn_score NUMERIC;
    v_churn_level TEXT;
    v_days_overdue INT;
    v_segment TEXT;
    v_reward_pref TEXT;
    v_total_visits INT;
BEGIN
    -- Visit stats
    SELECT
        COUNT(*) AS cnt,
        MAX(scheduled_at) AS last_visit,
        AVG(EXTRACT(EPOCH FROM (scheduled_at - LAG(scheduled_at) OVER (ORDER BY scheduled_at))) / 86400) AS avg_interval,
        STDDEV(EXTRACT(EPOCH FROM (scheduled_at - LAG(scheduled_at) OVER (ORDER BY scheduled_at))) / 86400) AS stddev_interval,
        MODE() WITHIN GROUP (ORDER BY EXTRACT(DOW FROM scheduled_at)::INT) AS preferred_dow,
        MODE() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM scheduled_at)::INT) AS preferred_hour
    INTO v_visits
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.user_id = p_user_id
      AND b.salon_id = p_salon_id
      AND a.status = 'completed';

    v_total_visits := COALESCE(v_visits.cnt, 0);

    IF v_total_visits = 0 THEN
        -- No visits, set as new user and return
        INSERT INTO user_personalization (user_id, salon_id, segment, computed_at)
        VALUES (p_user_id, p_salon_id, 'new', NOW())
        ON CONFLICT (user_id, salon_id)
        DO UPDATE SET segment = 'new', computed_at = NOW();
        RETURN;
    END IF;

    v_last_visit := v_visits.last_visit;
    v_avg_interval := COALESCE(v_visits.avg_interval, 30);
    v_stddev_interval := COALESCE(v_visits.stddev_interval, 7);
    v_preferred_dow := v_visits.preferred_dow;
    v_preferred_hour := v_visits.preferred_hour;

    -- Predict next visit
    v_next_predicted := v_last_visit + (v_avg_interval || ' days')::INTERVAL;

    -- Spending stats
    SELECT
        COALESCE(AVG(a.total_cents), 0)::INT,
        COALESCE(SUM(a.total_cents), 0)::BIGINT,
        COALESCE(MAX(a.total_cents), 0)::INT,
        COALESCE(MIN(a.total_cents), 0)::INT
    INTO v_spending
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.user_id = p_user_id
      AND b.salon_id = p_salon_id
      AND a.status = 'completed';

    -- Preferred barber (most visited)
    SELECT
        a.barber_id,
        ROUND(COUNT(*)::NUMERIC / v_total_visits * 100, 1) AS loyalty_pct
    INTO v_barber
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.user_id = p_user_id
      AND b.salon_id = p_salon_id
      AND a.status = 'completed'
    GROUP BY a.barber_id
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- Top services
    SELECT
        ARRAY_AGG(service_id ORDER BY cnt DESC),
        COUNT(DISTINCT service_id),
        COUNT(*)
    INTO v_services, v_unique_services, v_service_count
    FROM (
        SELECT a.service_id, COUNT(*) AS cnt
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE a.user_id = p_user_id
          AND b.salon_id = p_salon_id
          AND a.status = 'completed'
        GROUP BY a.service_id
    ) sub;

    -- ─── CHURN RISK SCORING (V1 Heuristic) ────────────────────────────────
    -- Formula: weighted sum of signals, normalized to 0-1
    --   - Days overdue (past predicted visit): heaviest weight
    --   - Decreasing visit frequency: medium weight
    --   - Last visit recency: medium weight
    --   - Low barber loyalty (switching): light weight

    v_days_overdue := GREATEST(0,
        EXTRACT(EPOCH FROM (NOW() - v_next_predicted)) / 86400
    )::INT;

    v_churn_score := LEAST(1.0,
        -- Days overdue component (0-0.5)
        LEAST(0.5, v_days_overdue::NUMERIC / (v_avg_interval * 2) * 0.5)
        -- Recency component (0-0.3)
        + LEAST(0.3, EXTRACT(EPOCH FROM (NOW() - v_last_visit)) / 86400 / (v_avg_interval * 3) * 0.3)
        -- Low loyalty component (0-0.2)
        + CASE WHEN COALESCE(v_barber.loyalty_pct, 100) < 40 THEN 0.1 ELSE 0 END
        + CASE WHEN v_total_visits <= 2 AND EXTRACT(EPOCH FROM (NOW() - v_last_visit)) / 86400 > 45 THEN 0.1 ELSE 0 END
    );

    v_churn_level := CASE
        WHEN v_churn_score >= 0.75 THEN 'critical'
        WHEN v_churn_score >= 0.50 THEN 'high'
        WHEN v_churn_score >= 0.25 THEN 'medium'
        ELSE 'low'
    END;

    -- ─── SEGMENT ASSIGNMENT (V1 Rules) ─────────────────────────────────────
    v_segment := CASE
        WHEN v_churn_score >= 0.75 AND v_total_visits >= 3 THEN 'at_risk'
        WHEN EXTRACT(EPOCH FROM (NOW() - v_last_visit)) / 86400 > v_avg_interval * 4 THEN 'lost'
        WHEN EXTRACT(EPOCH FROM (NOW() - v_last_visit)) / 86400 > v_avg_interval * 2.5 THEN 'dormant'
        WHEN v_total_visits >= 20 OR (v_total_visits >= 10 AND v_spending.avg >= 15000) THEN 'vip'
        WHEN v_total_visits >= 8 OR (v_total_visits >= 5 AND v_barber.loyalty_pct >= 70) THEN 'loyal'
        WHEN v_total_visits >= 3 THEN 'regular'
        ELSE 'new'
    END;

    -- ─── REWARD PREFERENCE (from redemption history) ───────────────────────
    SELECT COALESCE(
        (SELECT r.type
         FROM reward_redemptions rr
         JOIN rewards r ON r.id = rr.reward_id
         WHERE rr.user_id = p_user_id AND rr.salon_id = p_salon_id
         GROUP BY r.type
         ORDER BY COUNT(*) DESC
         LIMIT 1),
        'discount_pct'
    ) INTO v_reward_pref;

    -- Map reward type to preference category
    v_reward_pref := CASE
        WHEN v_reward_pref IN ('discount_pct', 'discount_fixed') THEN 'discount'
        WHEN v_reward_pref = 'free_service' THEN 'free_service'
        WHEN v_reward_pref = 'free_product' THEN 'product'
        WHEN v_reward_pref = 'experience' THEN 'experience'
        ELSE 'discount'
    END;

    -- ─── UPSERT ────────────────────────────────────────────────────────────
    INSERT INTO user_personalization (
        user_id, salon_id,
        avg_days_between_visits, stddev_visit_interval, last_visit_at,
        next_visit_predicted, total_visits,
        avg_spend_cents, total_spend_cents, max_spend_cents, min_spend_cents,
        preferred_barber_id, barber_loyalty_pct,
        top_services, service_diversity_score,
        preferred_day_of_week, preferred_hour, preferred_time_slot,
        churn_risk_score, churn_risk_level, days_overdue,
        reward_preference, segment, segment_updated_at,
        computed_at
    ) VALUES (
        p_user_id, p_salon_id,
        v_avg_interval, v_stddev_interval, v_last_visit,
        v_next_predicted, v_total_visits,
        v_spending.avg, v_spending.sum, v_spending.max, v_spending.min,
        v_barber.barber_id, v_barber.loyalty_pct,
        v_services, CASE WHEN v_service_count > 0 THEN v_unique_services::NUMERIC / v_service_count ELSE 0 END,
        v_preferred_dow, v_preferred_hour,
        CASE
            WHEN v_preferred_hour < 12 THEN 'morning'
            WHEN v_preferred_hour < 17 THEN 'afternoon'
            ELSE 'evening'
        END,
        v_churn_score, v_churn_level, v_days_overdue,
        v_reward_pref, v_segment, NOW(),
        NOW()
    )
    ON CONFLICT (user_id, salon_id) DO UPDATE SET
        avg_days_between_visits = EXCLUDED.avg_days_between_visits,
        stddev_visit_interval = EXCLUDED.stddev_visit_interval,
        last_visit_at = EXCLUDED.last_visit_at,
        next_visit_predicted = EXCLUDED.next_visit_predicted,
        total_visits = EXCLUDED.total_visits,
        avg_spend_cents = EXCLUDED.avg_spend_cents,
        total_spend_cents = EXCLUDED.total_spend_cents,
        max_spend_cents = EXCLUDED.max_spend_cents,
        min_spend_cents = EXCLUDED.min_spend_cents,
        preferred_barber_id = EXCLUDED.preferred_barber_id,
        barber_loyalty_pct = EXCLUDED.barber_loyalty_pct,
        top_services = EXCLUDED.top_services,
        service_diversity_score = EXCLUDED.service_diversity_score,
        preferred_day_of_week = EXCLUDED.preferred_day_of_week,
        preferred_hour = EXCLUDED.preferred_hour,
        preferred_time_slot = EXCLUDED.preferred_time_slot,
        churn_risk_score = EXCLUDED.churn_risk_score,
        churn_risk_level = EXCLUDED.churn_risk_level,
        days_overdue = EXCLUDED.days_overdue,
        reward_preference = EXCLUDED.reward_preference,
        segment = EXCLUDED.segment,
        segment_updated_at = CASE
            WHEN user_personalization.segment != EXCLUDED.segment THEN NOW()
            ELSE user_personalization.segment_updated_at
        END,
        computed_at = NOW();
END;
$$;

-- ─── F2. AWARD POINTS FOR APPOINTMENT ──────────────────────────────────────
-- Call this when an appointment is marked 'completed'.

CREATE OR REPLACE FUNCTION award_appointment_points(
    p_appointment_id UUID
)
RETURNS INT  -- returns points awarded
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_appt RECORD;
    v_salon_id UUID;
    v_base_points INT;
    v_streak_bonus INT := 0;
    v_barber_loyalty_bonus INT := 0;
    v_total_points INT;
    v_consecutive_visits INT;
    v_pers RECORD;
BEGIN
    -- Get appointment details
    SELECT a.*, b.salon_id
    INTO v_appt
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.id = p_appointment_id AND a.status = 'completed';

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    v_salon_id := v_appt.salon_id;

    -- Check if points already awarded
    IF EXISTS (
        SELECT 1 FROM loyalty_points
        WHERE reference_id = p_appointment_id AND reason = 'appointment_completed'
    ) THEN
        RETURN 0;
    END IF;

    -- Base points: 1 point per RON spent (100 bani = 1 RON)
    v_base_points := GREATEST(1, v_appt.total_cents / 100);

    -- Streak bonus: consecutive visits within expected window
    SELECT total_visits, avg_days_between_visits
    INTO v_pers
    FROM user_personalization
    WHERE user_id = v_appt.user_id AND salon_id = v_salon_id;

    IF v_pers IS NOT NULL AND v_pers.total_visits >= 3 THEN
        -- Count consecutive on-time visits (within 1.3x avg interval)
        SELECT COUNT(*) INTO v_consecutive_visits
        FROM (
            SELECT
                scheduled_at,
                LAG(scheduled_at) OVER (ORDER BY scheduled_at) AS prev_visit,
                EXTRACT(EPOCH FROM (scheduled_at - LAG(scheduled_at) OVER (ORDER BY scheduled_at))) / 86400 AS gap
            FROM appointments a2
            JOIN barbers b2 ON b2.id = a2.barber_id
            WHERE a2.user_id = v_appt.user_id
              AND b2.salon_id = v_salon_id
              AND a2.status = 'completed'
            ORDER BY scheduled_at DESC
            LIMIT 10
        ) sub
        WHERE gap IS NOT NULL AND gap <= COALESCE(v_pers.avg_days_between_visits, 30) * 1.3;

        -- Streak bonus: 10% per consecutive visit, max 50%
        v_streak_bonus := LEAST(
            v_base_points / 2,
            v_base_points * LEAST(v_consecutive_visits, 5) / 10
        );
    END IF;

    -- Barber loyalty bonus: 10% if visiting preferred barber
    IF v_pers IS NOT NULL AND v_appt.barber_id = v_pers.preferred_barber_id THEN
        v_barber_loyalty_bonus := v_base_points / 10;
    END IF;

    v_total_points := v_base_points + v_streak_bonus + v_barber_loyalty_bonus;

    -- Insert points
    INSERT INTO loyalty_points (user_id, salon_id, amount, reason, reference_id, meta)
    VALUES (
        v_appt.user_id,
        v_salon_id,
        v_total_points,
        'appointment_completed',
        p_appointment_id,
        jsonb_build_object(
            'base', v_base_points,
            'streak_bonus', v_streak_bonus,
            'barber_loyalty_bonus', v_barber_loyalty_bonus,
            'service_id', v_appt.service_id,
            'barber_id', v_appt.barber_id
        )
    );

    -- Recompute personalization
    PERFORM compute_user_personalization(v_appt.user_id, v_salon_id);

    -- Refresh balance
    REFRESH MATERIALIZED VIEW CONCURRENTLY loyalty_balances;

    RETURN v_total_points;
END;
$$;

-- ─── F3. REDEEM REWARD ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION redeem_reward(
    p_user_id UUID,
    p_reward_id UUID
)
RETURNS JSONB  -- { success, code, points_spent, error }
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reward RECORD;
    v_balance INT;
    v_code TEXT;
    v_redemption_id UUID;
BEGIN
    -- Get reward details
    SELECT * INTO v_reward FROM rewards WHERE id = p_reward_id AND active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recompensa nu a fost gasita');
    END IF;

    -- Check max redemptions
    IF v_reward.max_redemptions IS NOT NULL AND v_reward.current_redemptions >= v_reward.max_redemptions THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recompensa nu mai este disponibila');
    END IF;

    -- Check balance
    SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM loyalty_points
    WHERE user_id = p_user_id AND salon_id = v_reward.salon_id;

    IF v_balance < v_reward.point_cost THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Puncte insuficiente. Ai ' || v_balance || ', ai nevoie de ' || v_reward.point_cost
        );
    END IF;

    -- Generate unique code
    v_code := 'TAPZI-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 4));

    -- Create redemption
    INSERT INTO reward_redemptions (user_id, reward_id, salon_id, points_spent, code, expires_at)
    VALUES (p_user_id, p_reward_id, v_reward.salon_id, v_reward.point_cost, v_code, NOW() + INTERVAL '30 days')
    RETURNING id INTO v_redemption_id;

    -- Deduct points
    INSERT INTO loyalty_points (user_id, salon_id, amount, reason, reference_id, meta)
    VALUES (
        p_user_id,
        v_reward.salon_id,
        -v_reward.point_cost,
        'redemption',
        v_redemption_id,
        jsonb_build_object('reward_name', v_reward.name, 'reward_type', v_reward.type)
    );

    -- Increment redemption counter
    UPDATE rewards SET current_redemptions = current_redemptions + 1 WHERE id = p_reward_id;

    -- Refresh balance
    REFRESH MATERIALIZED VIEW CONCURRENTLY loyalty_balances;

    RETURN jsonb_build_object(
        'success', true,
        'code', v_code,
        'points_spent', v_reward.point_cost,
        'expires_at', (NOW() + INTERVAL '30 days')::TEXT
    );
END;
$$;

-- ─── F4. DYNAMIC REWARD PRICING ────────────────────────────────────────────
-- Adjusts point_cost based on demand. Call periodically (e.g. daily cron).

CREATE OR REPLACE FUNCTION adjust_reward_pricing()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE rewards r SET point_cost = CASE
        -- High demand (>80% redeemed): increase price by 20%
        WHEN r.max_redemptions IS NOT NULL
             AND r.current_redemptions::NUMERIC / r.max_redemptions > 0.8
        THEN LEAST(r.base_point_cost * 2, (r.base_point_cost * 1.2)::INT)

        -- Medium demand (>50% redeemed): increase by 10%
        WHEN r.max_redemptions IS NOT NULL
             AND r.current_redemptions::NUMERIC / r.max_redemptions > 0.5
        THEN LEAST(r.base_point_cost * 2, (r.base_point_cost * 1.1)::INT)

        -- Low demand: popular rewards redeemed many times recently get +15%
        WHEN (SELECT COUNT(*) FROM reward_redemptions rr
              WHERE rr.reward_id = r.id AND rr.created_at > NOW() - INTERVAL '7 days') > 10
        THEN LEAST(r.base_point_cost * 2, (r.base_point_cost * 1.15)::INT)

        -- Very low demand: discount by 10% to attract redemptions
        WHEN (SELECT COUNT(*) FROM reward_redemptions rr
              WHERE rr.reward_id = r.id AND rr.created_at > NOW() - INTERVAL '30 days') = 0
             AND r.created_at < NOW() - INTERVAL '14 days'
        THEN GREATEST(r.base_point_cost / 2, (r.base_point_cost * 0.9)::INT)

        -- Normal: revert to base
        ELSE r.base_point_cost
    END
    WHERE r.active = true;
END;
$$;

-- ─── F5. SERVICE RECOMMENDATIONS ───────────────────────────────────────────
-- Returns recommended services the user hasn't tried yet, ranked by
-- popularity among similar users (same segment + preferred barber).

CREATE OR REPLACE FUNCTION get_service_recommendations(
    p_user_id UUID,
    p_salon_id UUID,
    p_limit INT DEFAULT 3
)
RETURNS TABLE (
    service_id UUID,
    service_name TEXT,
    price_cents INT,
    reason TEXT,
    bonus_points INT,
    score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER STABLE
AS $$
DECLARE
    v_pers RECORD;
    v_tried_services UUID[];
BEGIN
    -- Get user's personalization
    SELECT * INTO v_pers FROM user_personalization
    WHERE user_id = p_user_id AND salon_id = p_salon_id;

    -- Get services user has already tried
    SELECT ARRAY_AGG(DISTINCT a.service_id)
    INTO v_tried_services
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.user_id = p_user_id AND b.salon_id = p_salon_id AND a.status = 'completed';

    v_tried_services := COALESCE(v_tried_services, '{}');

    RETURN QUERY
    SELECT
        bs.id AS service_id,
        bs.name AS service_name,
        bs.price_cents,
        CASE
            -- Same category as user's favorites
            WHEN bs.category = (
                SELECT bs2.category FROM barber_services bs2
                WHERE bs2.id = v_pers.top_services[1]
            ) THEN 'Popular in categoria ta preferata'
            -- Budget-friendly
            WHEN bs.price_cents <= COALESCE(v_pers.avg_spend_cents, 10000) * 1.2
            THEN 'Se potriveste bugetului tau'
            -- Popular overall
            ELSE 'Popular printre clientii saloanului'
        END AS reason,
        -- Bonus points for trying new services (20% of base price points)
        GREATEST(1, bs.price_cents / 500)::INT AS bonus_points,
        -- Scoring: popularity among similar segment + price proximity + category match
        (
            (SELECT COUNT(*) FROM appointments a2
             JOIN barbers b2 ON b2.id = a2.barber_id
             JOIN user_personalization up ON up.user_id = a2.user_id AND up.salon_id = b2.salon_id
             WHERE a2.service_id = bs.id
               AND b2.salon_id = p_salon_id
               AND a2.status = 'completed'
               AND up.segment = COALESCE(v_pers.segment, 'new')
            )::NUMERIC * 2
            + CASE WHEN bs.price_cents BETWEEN
                COALESCE(v_pers.min_spend_cents, 0) AND
                COALESCE(v_pers.max_spend_cents, 99999)
              THEN 3 ELSE 0 END
            + CASE WHEN bs.category = (
                SELECT bs3.category FROM barber_services bs3
                WHERE bs3.id = v_pers.top_services[1]
              ) THEN 2 ELSE 0 END
        ) AS score
    FROM barber_services bs
    WHERE bs.salon_id = p_salon_id
      AND bs.active = true
      AND bs.id != ALL(v_tried_services)
    ORDER BY score DESC
    LIMIT p_limit;
END;
$$;

-- ─── F6. NEXT BEST ACTION ─────────────────────────────────────────────────
-- Returns the single most impactful action/message to show this user.

CREATE OR REPLACE FUNCTION get_next_best_action(
    p_user_id UUID,
    p_salon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER STABLE
AS $$
DECLARE
    v_pers RECORD;
    v_balance INT;
    v_upcoming RECORD;
    v_best_reward RECORD;
BEGIN
    SELECT * INTO v_pers FROM user_personalization
    WHERE user_id = p_user_id AND salon_id = p_salon_id;

    -- Get balance
    SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM loyalty_points WHERE user_id = p_user_id AND salon_id = p_salon_id;

    -- Check for upcoming appointment
    SELECT * INTO v_upcoming
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.user_id = p_user_id AND b.salon_id = p_salon_id
      AND a.status IN ('pending', 'confirmed')
      AND a.scheduled_at > NOW()
    ORDER BY a.scheduled_at ASC
    LIMIT 1;

    -- Priority 1: CRITICAL churn — retention offer
    IF v_pers IS NOT NULL AND v_pers.churn_risk_level = 'critical' AND v_upcoming IS NULL THEN
        RETURN jsonb_build_object(
            'action', 'retention_offer',
            'priority', 1,
            'title', 'Ne lipsesti!',
            'message', 'Au trecut ' || v_pers.days_overdue || ' zile de la ultima vizita. Rezerva acum si primesti puncte bonus duble!',
            'cta', 'Rezerva cu bonus',
            'bonus_multiplier', 2,
            'segment', v_pers.segment
        );
    END IF;

    -- Priority 2: HIGH churn — gentle reminder
    IF v_pers IS NOT NULL AND v_pers.churn_risk_level = 'high' AND v_upcoming IS NULL THEN
        RETURN jsonb_build_object(
            'action', 'visit_reminder',
            'priority', 2,
            'title', 'E timpul pentru o tunsoare?',
            'message', 'De obicei ne vizitezi la fiecare ' || ROUND(v_pers.avg_days_between_visits) || ' zile. Hai sa-ti facem o programare!',
            'cta', 'Programeaza-te',
            'segment', v_pers.segment
        );
    END IF;

    -- Priority 3: Can redeem a reward
    SELECT r.* INTO v_best_reward
    FROM rewards r
    WHERE r.salon_id = p_salon_id AND r.active = true
      AND r.point_cost <= v_balance
      AND (r.max_redemptions IS NULL OR r.current_redemptions < r.max_redemptions)
    ORDER BY
        -- Prefer user's reward type preference
        CASE WHEN r.type = v_pers.reward_preference THEN 0 ELSE 1 END,
        r.point_cost DESC
    LIMIT 1;

    IF v_best_reward IS NOT NULL THEN
        RETURN jsonb_build_object(
            'action', 'reward_available',
            'priority', 3,
            'title', 'Ai o recompensa disponibila!',
            'message', 'Poti folosi ' || v_best_reward.point_cost || ' puncte pentru: ' || v_best_reward.name,
            'cta', 'Revendica',
            'reward_id', v_best_reward.id,
            'points_needed', v_best_reward.point_cost,
            'balance', v_balance
        );
    END IF;

    -- Priority 4: Approaching next predicted visit — proactive booking
    IF v_pers IS NOT NULL AND v_pers.next_visit_predicted IS NOT NULL
       AND v_pers.next_visit_predicted BETWEEN NOW() AND NOW() + INTERVAL '5 days'
       AND v_upcoming IS NULL
    THEN
        RETURN jsonb_build_object(
            'action', 'proactive_booking',
            'priority', 4,
            'title', 'Programeaza-ti vizita',
            'message', 'E cam timpul pentru urmatoarea tunsoare. Vrei sa te programezi la ' ||
                COALESCE((SELECT name FROM barbers WHERE id = v_pers.preferred_barber_id), 'frizerul tau preferat') || '?',
            'cta', 'Vezi disponibilitatea',
            'preferred_barber_id', v_pers.preferred_barber_id,
            'suggested_date', v_pers.next_visit_predicted::TEXT
        );
    END IF;

    -- Priority 5: Service recommendation (explore new services)
    IF v_pers IS NOT NULL AND v_pers.service_diversity_score < 0.4 AND v_pers.total_visits >= 3 THEN
        RETURN jsonb_build_object(
            'action', 'service_recommendation',
            'priority', 5,
            'title', 'Incearca ceva nou',
            'message', 'Ai puncte bonus daca incerci un serviciu nou! Descoperim impreuna?',
            'cta', 'Vezi recomandari',
            'diversity_score', v_pers.service_diversity_score
        );
    END IF;

    -- Priority 6: Points progress — motivate earning
    IF v_pers IS NOT NULL AND v_balance > 0 THEN
        SELECT r.* INTO v_best_reward
        FROM rewards r
        WHERE r.salon_id = p_salon_id AND r.active = true
          AND r.point_cost > v_balance
        ORDER BY r.point_cost ASC
        LIMIT 1;

        IF v_best_reward IS NOT NULL THEN
            RETURN jsonb_build_object(
                'action', 'points_progress',
                'priority', 6,
                'title', 'Inca ' || (v_best_reward.point_cost - v_balance) || ' puncte',
                'message', 'Mai ai nevoie de ' || (v_best_reward.point_cost - v_balance) || ' puncte pentru ' || v_best_reward.name || '!',
                'cta', 'Cum castig puncte',
                'balance', v_balance,
                'target', v_best_reward.point_cost,
                'reward_name', v_best_reward.name
            );
        END IF;
    END IF;

    -- Default: Welcome / generic
    RETURN jsonb_build_object(
        'action', 'welcome',
        'priority', 99,
        'title', 'Bine ai venit!',
        'message', 'Castiga puncte la fiecare vizita si deblochezi recompense exclusive.',
        'cta', 'Descopera recompense',
        'balance', v_balance
    );
END;
$$;

-- ─── F7. BATCH COMPUTE ALL USERS (for cron job) ───────────────────────────

CREATE OR REPLACE FUNCTION batch_compute_personalization()
RETURNS INT  -- number of users processed
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT := 0;
    v_rec RECORD;
BEGIN
    FOR v_rec IN
        SELECT DISTINCT a.user_id, b.salon_id
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE a.status = 'completed'
          AND b.salon_id IS NOT NULL
    LOOP
        PERFORM compute_user_personalization(v_rec.user_id, v_rec.salon_id);
        v_count := v_count + 1;
    END LOOP;

    -- Also refresh the materialized view
    REFRESH MATERIALIZED VIEW CONCURRENTLY loyalty_balances;

    RETURN v_count;
END;
$$;

-- ─── F8. GET USERS NEEDING NOTIFICATIONS (for scheduled job) ───────────────
-- Returns users who should receive a visit reminder or retention offer today.

CREATE OR REPLACE FUNCTION get_notification_candidates(
    p_type TEXT DEFAULT 'visit_reminder'  -- 'visit_reminder' | 'churn_retention'
)
RETURNS TABLE (
    user_id UUID,
    salon_id UUID,
    segment TEXT,
    churn_risk_level TEXT,
    days_overdue INT,
    next_visit_predicted TIMESTAMPTZ,
    preferred_barber_id UUID,
    best_notification_hour INT,
    push_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        up.user_id,
        up.salon_id,
        up.segment,
        up.churn_risk_level,
        up.days_overdue,
        up.next_visit_predicted,
        up.preferred_barber_id,
        up.best_notification_hour,
        pt.token AS push_token
    FROM user_personalization up
    JOIN push_tokens pt ON pt.user_id = up.user_id AND pt.active = true
    LEFT JOIN user_notification_prefs unp ON unp.user_id = up.user_id
    WHERE
        -- Must have opted in
        CASE p_type
            WHEN 'visit_reminder' THEN COALESCE(unp.visit_reminders, true)
            WHEN 'churn_retention' THEN COALESCE(unp.promotional, true)
            ELSE true
        END
        -- No upcoming appointment
        AND NOT EXISTS (
            SELECT 1 FROM appointments a
            JOIN barbers b ON b.id = a.barber_id
            WHERE a.user_id = up.user_id AND b.salon_id = up.salon_id
              AND a.status IN ('pending', 'confirmed')
              AND a.scheduled_at > NOW()
        )
        -- Hasn't received this type of notification recently (3-day cooldown)
        AND NOT EXISTS (
            SELECT 1 FROM notification_log nl
            WHERE nl.user_id = up.user_id AND nl.salon_id = up.salon_id
              AND nl.type = p_type
              AND nl.sent_at > NOW() - INTERVAL '3 days'
        )
        -- Weekly limit not exceeded
        AND (
            SELECT COUNT(*) FROM notification_log nl2
            WHERE nl2.user_id = up.user_id
              AND nl2.sent_at > NOW() - INTERVAL '7 days'
        ) < COALESCE(unp.max_per_week, 5)
        -- Type-specific filters
        AND CASE p_type
            WHEN 'visit_reminder' THEN
                up.next_visit_predicted BETWEEN NOW() - INTERVAL '3 days' AND NOW() + INTERVAL '3 days'
            WHEN 'churn_retention' THEN
                up.churn_risk_level IN ('high', 'critical')
            ELSE true
        END
    ORDER BY
        CASE p_type
            WHEN 'churn_retention' THEN up.churn_risk_score
            ELSE up.days_overdue::NUMERIC
        END DESC;
END;
$$;

-- ============================================================================
-- TRIGGER: Auto-award points when appointment completed
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_award_points_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        PERFORM award_appointment_points(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_points_on_complete ON appointments;
CREATE TRIGGER trg_award_points_on_complete
    AFTER UPDATE OF status ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_award_points_on_complete();

-- ============================================================================
-- Done! Personalization engine V1 ready.
-- ============================================================================
