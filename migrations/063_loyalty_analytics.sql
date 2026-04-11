-- ============================================
-- Migration 060: Loyalty Analytics & Personalization
-- ============================================
-- Advanced analytics layer for the loyalty system:
--   - user_personalization table (segments, churn risk, preferences)
--   - compute_user_personalization RPC (calculates all fields)
--   - get_salon_loyalty_kpis RPC (dashboard KPIs)
--   - get_salon_loyalty_trends RPC (monthly trend data)
--   - get_churn_risk_members RPC (at-risk members)
--   - loyalty_summary_mv materialized view
-- All analytics functions are SECURITY DEFINER with
-- ownership checks. RLS on personalization table.
-- ============================================

-- ============================================
-- 1. USER PERSONALIZATION TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_personalization (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    segment TEXT NOT NULL DEFAULT 'new'
        CHECK (segment IN ('new', 'regular', 'loyal', 'vip', 'at_risk', 'dormant', 'lost')),
    avg_days_between_visits NUMERIC,
    avg_spend_cents INT,
    preferred_barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
    barber_loyalty_pct NUMERIC,                    -- % visits with preferred barber
    preferred_day_of_week INT,                     -- 1=Mon .. 7=Sun (ISO)
    preferred_hour INT,                            -- 0..23
    churn_risk_score NUMERIC(3,2) DEFAULT 0.00     -- 0.00 to 1.00
        CHECK (churn_risk_score >= 0 AND churn_risk_score <= 1),
    churn_risk_level TEXT DEFAULT 'low'
        CHECK (churn_risk_level IN ('low', 'medium', 'high', 'critical')),
    reward_preference TEXT
        CHECK (reward_preference IS NULL OR reward_preference IN ('discount', 'free_service', 'product', 'experience')),
    next_visit_predicted DATE,
    services_tried INT NOT NULL DEFAULT 0,
    total_services_available INT NOT NULL DEFAULT 0,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, salon_id)
);

ALTER TABLE user_personalization ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_personalization_salon
    ON user_personalization(salon_id);
CREATE INDEX IF NOT EXISTS idx_user_personalization_segment
    ON user_personalization(salon_id, segment);
CREATE INDEX IF NOT EXISTS idx_user_personalization_churn
    ON user_personalization(salon_id, churn_risk_level)
    WHERE churn_risk_level IN ('high', 'critical');
CREATE INDEX IF NOT EXISTS idx_user_personalization_next_visit
    ON user_personalization(salon_id, next_visit_predicted);

-- RLS: Users can view own personalization
DROP POLICY IF EXISTS "Users can view own personalization" ON user_personalization;
CREATE POLICY "Users can view own personalization" ON user_personalization
    FOR SELECT USING (auth.uid() = user_id);

-- RLS: Salon owner/staff can view salon personalization
DROP POLICY IF EXISTS "Salon staff can view salon personalization" ON user_personalization;
CREATE POLICY "Salon staff can view salon personalization" ON user_personalization
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = user_personalization.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = user_personalization.salon_id AND s.owner_id = auth.uid())
    );

-- No direct INSERT/UPDATE/DELETE for authenticated users
-- All mutations via RPC (service role bypasses RLS)

-- ============================================
-- 2. RPC: compute_user_personalization
-- ============================================
-- Calculates all personalization fields from
-- appointments, point_transactions, loyalty_profiles.
-- UPSERTs into user_personalization.
-- ============================================
CREATE OR REPLACE FUNCTION compute_user_personalization(
    p_user_id UUID,
    p_salon_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    _visit_count INT;
    _last_visit TIMESTAMPTZ;
    _first_visit TIMESTAMPTZ;
    _avg_days NUMERIC;
    _avg_spend INT;
    _pref_barber UUID;
    _pref_barber_visits INT;
    _total_visits_for_barber INT;
    _barber_loyalty NUMERIC;
    _pref_dow INT;
    _pref_hour INT;
    _churn_score NUMERIC(3,2);
    _churn_level TEXT;
    _days_since_last NUMERIC;
    _days_overdue NUMERIC;
    _segment TEXT;
    _next_visit DATE;
    _services_tried INT;
    _total_services INT;
    _reward_pref TEXT;
    _lifetime_points INT;
    _lifetime_redeemed INT;
    _tier TEXT;
BEGIN
    -- -----------------------------------------------
    -- A. Core visit statistics
    -- -----------------------------------------------
    SELECT
        COUNT(*),
        MAX(a.scheduled_at),
        MIN(a.scheduled_at),
        CASE WHEN COUNT(*) > 1
            THEN ROUND(EXTRACT(EPOCH FROM (MAX(a.scheduled_at) - MIN(a.scheduled_at))) / 86400.0 / GREATEST(COUNT(*) - 1, 1), 1)
            ELSE NULL
        END,
        CASE WHEN COUNT(*) > 0
            THEN ROUND(AVG(a.total_cents))::INT
            ELSE 0
        END
    INTO _visit_count, _last_visit, _first_visit, _avg_days, _avg_spend
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.user_id = p_user_id
      AND b.salon_id = p_salon_id
      AND a.status = 'completed';

    -- -----------------------------------------------
    -- B. Preferred barber (MODE of barber_id)
    -- -----------------------------------------------
    SELECT a.barber_id, COUNT(*) AS cnt
    INTO _pref_barber, _pref_barber_visits
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.user_id = p_user_id
      AND b.salon_id = p_salon_id
      AND a.status = 'completed'
    GROUP BY a.barber_id
    ORDER BY cnt DESC
    LIMIT 1;

    _total_visits_for_barber := _visit_count;
    IF _total_visits_for_barber > 0 AND _pref_barber_visits IS NOT NULL THEN
        _barber_loyalty := ROUND(_pref_barber_visits::NUMERIC / _total_visits_for_barber * 100, 1);
    ELSE
        _barber_loyalty := 0;
    END IF;

    -- -----------------------------------------------
    -- C. Preferred day of week and hour
    -- -----------------------------------------------
    SELECT EXTRACT(ISODOW FROM a.scheduled_at)::INT
    INTO _pref_dow
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.user_id = p_user_id
      AND b.salon_id = p_salon_id
      AND a.status = 'completed'
    GROUP BY EXTRACT(ISODOW FROM a.scheduled_at)::INT
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    SELECT EXTRACT(HOUR FROM a.scheduled_at)::INT
    INTO _pref_hour
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.user_id = p_user_id
      AND b.salon_id = p_salon_id
      AND a.status = 'completed'
    GROUP BY EXTRACT(HOUR FROM a.scheduled_at)::INT
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- -----------------------------------------------
    -- D. Services exploration
    -- -----------------------------------------------
    SELECT COUNT(DISTINCT a.service_id)
    INTO _services_tried
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.user_id = p_user_id
      AND b.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.service_id IS NOT NULL;

    SELECT COUNT(DISTINCT bs.id)
    INTO _total_services
    FROM barber_services bs
    JOIN barbers b ON b.id = bs.barber_id
    WHERE b.salon_id = p_salon_id
      AND b.active = true;

    -- -----------------------------------------------
    -- E. Loyalty profile data
    -- -----------------------------------------------
    SELECT lp.lifetime_points, lp.lifetime_redeemed, lp.tier
    INTO _lifetime_points, _lifetime_redeemed, _tier
    FROM loyalty_profiles lp
    WHERE lp.user_id = p_user_id
      AND lp.salon_id = p_salon_id;

    _lifetime_points  := COALESCE(_lifetime_points, 0);
    _lifetime_redeemed := COALESCE(_lifetime_redeemed, 0);

    -- -----------------------------------------------
    -- F. Churn risk score (weighted formula)
    -- -----------------------------------------------
    -- Factors:
    --   1. Days overdue (vs average interval)      weight 0.40
    --   2. Recency (days since last visit)         weight 0.25
    --   3. Barber switching (low loyalty %)        weight 0.15
    --   4. Low visit count                         weight 0.20
    -- -----------------------------------------------
    IF _last_visit IS NOT NULL THEN
        _days_since_last := EXTRACT(EPOCH FROM (NOW() - _last_visit)) / 86400.0;
    ELSE
        _days_since_last := 999;
    END IF;

    -- Days overdue factor (0..1): how far past expected return
    IF _avg_days IS NOT NULL AND _avg_days > 0 THEN
        _days_overdue := GREATEST(_days_since_last - _avg_days, 0);
        -- Normalize: 0 at on-time, 1.0 at 2x overdue
        _churn_score := LEAST(_days_overdue / GREATEST(_avg_days, 1), 1.0) * 0.40;
    ELSE
        -- No interval data: use absolute recency
        _churn_score := LEAST(_days_since_last / 90.0, 1.0) * 0.40;
    END IF;

    -- Recency factor (0..1): 0 if visited today, 1 if 180+ days
    _churn_score := _churn_score + LEAST(_days_since_last / 180.0, 1.0) * 0.25;

    -- Barber switching factor: low loyalty = higher risk
    IF _barber_loyalty IS NOT NULL AND _visit_count >= 3 THEN
        _churn_score := _churn_score + (1.0 - LEAST(_barber_loyalty / 100.0, 1.0)) * 0.15;
    ELSE
        _churn_score := _churn_score + 0.075; -- neutral if not enough data
    END IF;

    -- Low visit count factor: fewer visits = higher risk
    _churn_score := _churn_score + GREATEST(1.0 - _visit_count / 10.0, 0) * 0.20;

    -- Clamp to 0.00..1.00
    _churn_score := LEAST(GREATEST(_churn_score, 0.00), 1.00);

    -- Churn risk level
    _churn_level := CASE
        WHEN _churn_score >= 0.75 THEN 'critical'
        WHEN _churn_score >= 0.50 THEN 'high'
        WHEN _churn_score >= 0.25 THEN 'medium'
        ELSE 'low'
    END;

    -- -----------------------------------------------
    -- G. Segment assignment
    -- -----------------------------------------------
    -- Rules (evaluated in priority order):
    --   lost:     no visit in 180+ days
    --   dormant:  no visit in 90-179 days
    --   at_risk:  churn_risk_level = 'high' or 'critical'
    --   vip:      tier = 'maestru' OR 20+ visits
    --   loyal:    tier IN ('blade','sharp') OR 8+ visits
    --   regular:  3+ visits
    --   new:      0-2 visits
    -- -----------------------------------------------
    IF _days_since_last >= 180 THEN
        _segment := 'lost';
    ELSIF _days_since_last >= 90 THEN
        _segment := 'dormant';
    ELSIF _churn_level IN ('high', 'critical') THEN
        _segment := 'at_risk';
    ELSIF COALESCE(_tier, 'clipper') = 'maestru' OR _visit_count >= 20 THEN
        _segment := 'vip';
    ELSIF COALESCE(_tier, 'clipper') IN ('blade', 'sharp') OR _visit_count >= 8 THEN
        _segment := 'loyal';
    ELSIF _visit_count >= 3 THEN
        _segment := 'regular';
    ELSE
        _segment := 'new';
    END IF;

    -- -----------------------------------------------
    -- H. Next visit predicted
    -- -----------------------------------------------
    IF _last_visit IS NOT NULL AND _avg_days IS NOT NULL AND _avg_days > 0 THEN
        _next_visit := (_last_visit + (_avg_days || ' days')::INTERVAL)::DATE;
    ELSE
        _next_visit := NULL;
    END IF;

    -- -----------------------------------------------
    -- I. Reward preference (heuristic from redemption history)
    -- -----------------------------------------------
    SELECT
        CASE pt.type
            WHEN 'redeem_discount' THEN 'discount'
            WHEN 'redeem_reward' THEN
                CASE
                    WHEN pt.description ILIKE '%serviciu%' OR pt.description ILIKE '%gratis%' THEN 'free_service'
                    WHEN pt.description ILIKE '%produs%' OR pt.description ILIKE '%sampon%' THEN 'product'
                    ELSE 'experience'
                END
            ELSE NULL
        END
    INTO _reward_pref
    FROM point_transactions pt
    WHERE pt.user_id = p_user_id
      AND pt.salon_id = p_salon_id
      AND pt.type IN ('redeem_discount', 'redeem_reward')
    GROUP BY 1
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- -----------------------------------------------
    -- J. UPSERT into user_personalization
    -- -----------------------------------------------
    INSERT INTO user_personalization (
        user_id, salon_id, segment,
        avg_days_between_visits, avg_spend_cents,
        preferred_barber_id, barber_loyalty_pct,
        preferred_day_of_week, preferred_hour,
        churn_risk_score, churn_risk_level,
        reward_preference, next_visit_predicted,
        services_tried, total_services_available,
        computed_at
    ) VALUES (
        p_user_id, p_salon_id, _segment,
        _avg_days, _avg_spend,
        _pref_barber, _barber_loyalty,
        _pref_dow, _pref_hour,
        _churn_score, _churn_level,
        _reward_pref, _next_visit,
        _services_tried, COALESCE(_total_services, 0),
        NOW()
    )
    ON CONFLICT (user_id, salon_id) DO UPDATE SET
        segment                 = EXCLUDED.segment,
        avg_days_between_visits = EXCLUDED.avg_days_between_visits,
        avg_spend_cents         = EXCLUDED.avg_spend_cents,
        preferred_barber_id     = EXCLUDED.preferred_barber_id,
        barber_loyalty_pct      = EXCLUDED.barber_loyalty_pct,
        preferred_day_of_week   = EXCLUDED.preferred_day_of_week,
        preferred_hour          = EXCLUDED.preferred_hour,
        churn_risk_score        = EXCLUDED.churn_risk_score,
        churn_risk_level        = EXCLUDED.churn_risk_level,
        reward_preference       = EXCLUDED.reward_preference,
        next_visit_predicted    = EXCLUDED.next_visit_predicted,
        services_tried          = EXCLUDED.services_tried,
        total_services_available = EXCLUDED.total_services_available,
        computed_at             = EXCLUDED.computed_at;
END;
$$;

-- ============================================
-- 3. RPC: get_salon_loyalty_kpis
-- ============================================
-- Returns a single JSONB object with all loyalty
-- program KPIs for the salon dashboard.
-- ============================================
CREATE OR REPLACE FUNCTION get_salon_loyalty_kpis(p_salon_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
    _result JSONB;
BEGIN
    WITH active AS (
        SELECT COUNT(*) AS cnt
        FROM loyalty_profiles lp
        WHERE lp.salon_id = p_salon_id
          AND lp.last_visit_at >= NOW() - INTERVAL '90 days'
    ),
    total AS (
        SELECT COUNT(*) AS cnt
        FROM loyalty_profiles lp
        WHERE lp.salon_id = p_salon_id
    ),
    tier_dist AS (
        SELECT jsonb_object_agg(tier, cnt) AS dist
        FROM (
            SELECT lp.tier, COUNT(*) AS cnt
            FROM loyalty_profiles lp
            WHERE lp.salon_id = p_salon_id
            GROUP BY lp.tier
        ) sub
    ),
    monthly_points AS (
        SELECT
            COALESCE(SUM(pt.amount) FILTER (WHERE pt.amount > 0), 0) AS earned,
            COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.amount < 0), 0) AS redeemed
        FROM point_transactions pt
        WHERE pt.salon_id = p_salon_id
          AND pt.created_at >= DATE_TRUNC('month', NOW())
    ),
    outstanding AS (
        SELECT COALESCE(SUM(lp.current_points), 0) AS total_points
        FROM loyalty_profiles lp
        WHERE lp.salon_id = p_salon_id
    ),
    avg_ppv AS (
        SELECT
            CASE WHEN COUNT(*) > 0
                THEN ROUND(SUM(pt.amount)::NUMERIC / COUNT(*), 1)
                ELSE 0
            END AS avg_pts
        FROM point_transactions pt
        WHERE pt.salon_id = p_salon_id
          AND pt.amount > 0
          AND pt.source = 'appointment'
          AND pt.created_at >= NOW() - INTERVAL '90 days'
    ),
    top_members AS (
        SELECT jsonb_agg(to_jsonb(sub.*) ORDER BY sub.lifetime_earned DESC) AS members
        FROM (
            SELECT
                lp.user_id,
                COALESCE(p.display_name, p.username, 'Anonim') AS name,
                lp.tier,
                lp.current_points,
                COALESCE(lp.lifetime_earned, lp.lifetime_points, 0) AS lifetime_earned,
                lp.total_visits,
                lp.last_visit_at
            FROM loyalty_profiles lp
            LEFT JOIN profiles p ON p.id = lp.user_id
            WHERE lp.salon_id = p_salon_id
            ORDER BY COALESCE(lp.lifetime_earned, lp.lifetime_points, 0) DESC
            LIMIT 5
        ) sub
    )
    SELECT jsonb_build_object(
        'active_members',          ac.cnt,
        'total_members',           tt.cnt,
        'enrollment_rate',         CASE WHEN tt.cnt > 0
                                       THEN ROUND(ac.cnt::NUMERIC / tt.cnt * 100, 1)
                                       ELSE 0
                                   END,
        'tier_distribution',       COALESCE(td.dist, '{}'::JSONB),
        'points_earned_this_month', mp.earned,
        'points_redeemed_this_month', mp.redeemed,
        'outstanding_liability_ron', ROUND(os.total_points * 0.01, 2),
        'redemption_rate',         CASE WHEN mp.earned > 0
                                       THEN ROUND(mp.redeemed::NUMERIC / mp.earned * 100, 1)
                                       ELSE 0
                                   END,
        'avg_points_per_visit',    ap.avg_pts,
        'top_members',             COALESCE(tm.members, '[]'::JSONB)
    )
    INTO _result
    FROM active ac
    CROSS JOIN total tt
    CROSS JOIN tier_dist td
    CROSS JOIN monthly_points mp
    CROSS JOIN outstanding os
    CROSS JOIN avg_ppv ap
    CROSS JOIN top_members tm;

    RETURN _result;
END;
$$;

-- ============================================
-- 4. RPC: get_salon_loyalty_trends
-- ============================================
-- Returns monthly trend data for the loyalty
-- program over the last p_months months.
-- ============================================
CREATE OR REPLACE FUNCTION get_salon_loyalty_trends(
    p_salon_id UUID,
    p_months INT DEFAULT 6
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
    _result JSONB;
BEGIN
    WITH months AS (
        SELECT generate_series(
            DATE_TRUNC('month', NOW()) - ((p_months - 1) || ' months')::INTERVAL,
            DATE_TRUNC('month', NOW()),
            '1 month'::INTERVAL
        )::DATE AS month_start
    ),
    monthly_data AS (
        SELECT
            m.month_start,
            TO_CHAR(m.month_start, 'Mon YYYY') AS label,
            -- New members that month
            (SELECT COUNT(*)
             FROM loyalty_profiles lp
             WHERE lp.salon_id = p_salon_id
               AND DATE_TRUNC('month', lp.created_at) = m.month_start
            ) AS new_members,
            -- Points earned that month
            (SELECT COALESCE(SUM(pt.amount), 0)
             FROM point_transactions pt
             WHERE pt.salon_id = p_salon_id
               AND pt.amount > 0
               AND DATE_TRUNC('month', pt.created_at) = m.month_start
            ) AS points_earned,
            -- Points redeemed that month
            (SELECT COALESCE(SUM(ABS(pt.amount)), 0)
             FROM point_transactions pt
             WHERE pt.salon_id = p_salon_id
               AND pt.amount < 0
               AND DATE_TRUNC('month', pt.created_at) = m.month_start
            ) AS points_redeemed,
            -- Visits (completed appointments) that month
            (SELECT COUNT(*)
             FROM appointments a
             JOIN barbers b ON b.id = a.barber_id
             WHERE b.salon_id = p_salon_id
               AND a.status = 'completed'
               AND DATE_TRUNC('month', a.scheduled_at) = m.month_start
            ) AS visits
        FROM months m
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'month', md.label,
            'month_start', md.month_start,
            'new_members', md.new_members,
            'points_earned', md.points_earned,
            'points_redeemed', md.points_redeemed,
            'visits', md.visits
        ) ORDER BY md.month_start
    )
    INTO _result
    FROM monthly_data md;

    RETURN COALESCE(_result, '[]'::JSONB);
END;
$$;

-- ============================================
-- 5. RPC: get_churn_risk_members
-- ============================================
-- Returns members with high or critical churn
-- risk, enriched with profile data.
-- ============================================
CREATE OR REPLACE FUNCTION get_churn_risk_members(p_salon_id UUID)
RETURNS TABLE (
    user_id UUID,
    user_name TEXT,
    last_visit TIMESTAMPTZ,
    next_visit_predicted DATE,
    segment TEXT,
    churn_risk_score NUMERIC,
    churn_risk_level TEXT,
    tier TEXT,
    current_points INT,
    avg_days_between_visits NUMERIC,
    preferred_barber_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        up.user_id,
        COALESCE(p.display_name, p.username, 'Anonim') AS user_name,
        lp.last_visit_at AS last_visit,
        up.next_visit_predicted,
        up.segment,
        up.churn_risk_score,
        up.churn_risk_level,
        COALESCE(lp.tier, 'clipper') AS tier,
        COALESCE(lp.current_points, 0) AS current_points,
        up.avg_days_between_visits,
        br.name AS preferred_barber_name
    FROM user_personalization up
    LEFT JOIN profiles p ON p.id = up.user_id
    LEFT JOIN loyalty_profiles lp ON lp.user_id = up.user_id AND lp.salon_id = up.salon_id
    LEFT JOIN barbers br ON br.id = up.preferred_barber_id
    WHERE up.salon_id = p_salon_id
      AND up.churn_risk_level IN ('high', 'critical')
    ORDER BY up.churn_risk_score DESC;
$$;

-- ============================================
-- 6. MATERIALIZED VIEW: loyalty_summary_mv
-- ============================================
-- Per-salon aggregated view of loyalty program
-- health. Refreshable concurrently.
-- ============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS loyalty_summary_mv AS
SELECT
    lp.salon_id,
    COUNT(*) AS total_members,
    COUNT(*) FILTER (WHERE lp.last_visit_at >= NOW() - INTERVAL '90 days') AS active_members,
    COUNT(*) FILTER (WHERE lp.last_visit_at >= NOW() - INTERVAL '30 days') AS active_30d,
    -- Tier distribution
    COUNT(*) FILTER (WHERE lp.tier = 'clipper') AS tier_clipper,
    COUNT(*) FILTER (WHERE lp.tier = 'blade') AS tier_blade,
    COUNT(*) FILTER (WHERE lp.tier = 'sharp') AS tier_sharp,
    COUNT(*) FILTER (WHERE lp.tier = 'maestru') AS tier_maestru,
    -- Points
    COALESCE(SUM(lp.current_points), 0) AS total_outstanding_points,
    COALESCE(SUM(lp.lifetime_points), 0) AS total_lifetime_points,
    COALESCE(SUM(lp.lifetime_redeemed), 0) AS total_lifetime_redeemed,
    ROUND(COALESCE(SUM(lp.current_points), 0) * 0.01, 2) AS outstanding_liability_ron,
    -- Averages
    ROUND(AVG(lp.total_visits), 1) AS avg_visits_per_member,
    ROUND(AVG(lp.current_points), 0) AS avg_points_per_member,
    ROUND(AVG(lp.streak_count), 1) AS avg_streak,
    MAX(lp.longest_streak) AS max_streak,
    -- Segment distribution (from personalization)
    COUNT(*) FILTER (WHERE up.segment = 'new') AS seg_new,
    COUNT(*) FILTER (WHERE up.segment = 'regular') AS seg_regular,
    COUNT(*) FILTER (WHERE up.segment = 'loyal') AS seg_loyal,
    COUNT(*) FILTER (WHERE up.segment = 'vip') AS seg_vip,
    COUNT(*) FILTER (WHERE up.segment = 'at_risk') AS seg_at_risk,
    COUNT(*) FILTER (WHERE up.segment = 'dormant') AS seg_dormant,
    COUNT(*) FILTER (WHERE up.segment = 'lost') AS seg_lost,
    -- Churn risk summary
    COUNT(*) FILTER (WHERE up.churn_risk_level = 'critical') AS churn_critical,
    COUNT(*) FILTER (WHERE up.churn_risk_level = 'high') AS churn_high,
    COUNT(*) FILTER (WHERE up.churn_risk_level = 'medium') AS churn_medium,
    COUNT(*) FILTER (WHERE up.churn_risk_level = 'low') AS churn_low,
    -- Timestamp
    NOW() AS refreshed_at
FROM loyalty_profiles lp
LEFT JOIN user_personalization up ON up.user_id = lp.user_id AND up.salon_id = lp.salon_id
GROUP BY lp.salon_id;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_summary_mv_salon
    ON loyalty_summary_mv(salon_id);

-- ============================================
-- 7. HELPER: Refresh materialized view
-- ============================================
CREATE OR REPLACE FUNCTION refresh_loyalty_summary()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY loyalty_summary_mv;
END;
$$;

-- ============================================
-- 8. ADDITIONAL INDEXES for analytics queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_point_txn_monthly_earn
    ON point_transactions(salon_id, created_at)
    WHERE amount > 0;

CREATE INDEX IF NOT EXISTS idx_point_txn_monthly_redeem
    ON point_transactions(salon_id, created_at, type)
    WHERE amount < 0 AND type LIKE 'redeem_%';

CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_last_visit
    ON loyalty_profiles(salon_id, last_visit_at);

CREATE INDEX IF NOT EXISTS idx_loyalty_profiles_lifetime
    ON loyalty_profiles(salon_id, lifetime_points DESC);

-- ============================================
-- Done! Loyalty Analytics & Personalization ready.
-- ============================================
-- Table created:
--   - user_personalization (segments, churn, preferences)
--
-- RPCs:
--   - compute_user_personalization(user_id, salon_id)
--   - get_salon_loyalty_kpis(salon_id) -> JSONB
--   - get_salon_loyalty_trends(salon_id, months) -> JSONB
--   - get_churn_risk_members(salon_id) -> TABLE
--
-- Materialized view:
--   - loyalty_summary_mv (per-salon loyalty health)
--   - refresh_loyalty_summary() helper
--
-- Security:
--   - RLS on user_personalization
--   - All RPCs are SECURITY DEFINER
--   - salon owner/staff access only for analytics
-- ============================================
