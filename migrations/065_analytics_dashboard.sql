-- ============================================
-- Migration 065: Analytics Dashboard RPCs
-- ============================================
-- Three SECURITY DEFINER functions for the smart
-- dashboard: health score, barber performance card,
-- and revenue forecast.
-- ============================================

-- ============================================
-- 1. SALON HEALTH SCORE (0-100)
-- ============================================
-- Weighted composite:
--   revenue_trend  30%
--   retention      25%
--   occupancy      25%
--   satisfaction   20%
-- ============================================

CREATE OR REPLACE FUNCTION get_salon_health_score(p_salon_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
    v_revenue_this     BIGINT;
    v_revenue_last     BIGINT;
    v_revenue_score    NUMERIC;
    v_revenue_pct      NUMERIC;

    v_total_clients    BIGINT;
    v_repeat_clients   BIGINT;
    v_retention_pct    NUMERIC;
    v_retention_score  NUMERIC;

    v_available_hours  NUMERIC;
    v_booked_hours     NUMERIC;
    v_occupancy_pct    NUMERIC;
    v_occupancy_score  NUMERIC;

    v_satisfaction_avg NUMERIC;
    v_satisfaction_sc  NUMERIC;

    v_health           NUMERIC;
BEGIN
    -- Security: caller must be a salon member
    IF NOT EXISTS (
        SELECT 1 FROM salon_members
        WHERE salon_id = p_salon_id AND profile_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('error', 'unauthorized');
    END IF;

    -- ── Revenue trend ───────────────────────────────────────
    SELECT COALESCE(SUM(a.total_cents), 0) INTO v_revenue_this
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at >= DATE_TRUNC('month', NOW());

    SELECT COALESCE(SUM(a.total_cents), 0) INTO v_revenue_last
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
      AND a.scheduled_at < DATE_TRUNC('month', NOW());

    IF v_revenue_last > 0 THEN
        v_revenue_pct := ROUND(((v_revenue_this::NUMERIC - v_revenue_last) / v_revenue_last) * 100, 1);
    ELSE
        v_revenue_pct := CASE WHEN v_revenue_this > 0 THEN 100 ELSE 0 END;
    END IF;

    -- Score: 50 baseline, +/-50 capped by pct change
    v_revenue_score := GREATEST(0, LEAST(100,
        50 + LEAST(50, GREATEST(-50, v_revenue_pct))
    ));

    -- ── Retention (>1 visit in last 90 days) ────────────────
    SELECT COUNT(DISTINCT a.user_id) INTO v_total_clients
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at >= NOW() - INTERVAL '90 days';

    SELECT COUNT(*) INTO v_repeat_clients
    FROM (
        SELECT a.user_id
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - INTERVAL '90 days'
        GROUP BY a.user_id
        HAVING COUNT(*) > 1
    ) sub;

    v_retention_pct := CASE WHEN v_total_clients > 0
        THEN ROUND((v_repeat_clients::NUMERIC / v_total_clients) * 100, 1)
        ELSE 0
    END;
    v_retention_score := LEAST(100, v_retention_pct);

    -- ── Occupancy ───────────────────────────────────────────
    -- Available hours from barber_availability for active barbers
    SELECT COALESCE(SUM(
        EXTRACT(EPOCH FROM (ba.end_time - ba.start_time)) / 3600.0
    ), 0) INTO v_available_hours
    FROM barber_availability ba
    JOIN barbers b ON b.id = ba.barber_id
    WHERE b.salon_id = p_salon_id
      AND b.active = true
      AND ba.is_available = true;

    -- Weekly available hours -> scale to ~30 days (4.3 weeks)
    v_available_hours := v_available_hours * 4.3;

    -- Booked hours in last 30 days
    SELECT COALESCE(SUM(a.duration_min::NUMERIC / 60.0), 0) INTO v_booked_hours
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status IN ('completed', 'confirmed', 'pending')
      AND a.scheduled_at >= NOW() - INTERVAL '30 days';

    v_occupancy_pct := CASE WHEN v_available_hours > 0
        THEN ROUND((v_booked_hours / v_available_hours) * 100, 1)
        ELSE 0
    END;
    v_occupancy_score := LEAST(100, v_occupancy_pct);

    -- ── Satisfaction ────────────────────────────────────────
    -- Use avg from loyalty_profiles total_visits as proxy, or default 75
    SELECT COALESCE(AVG(
        CASE WHEN lp.total_visits > 0 THEN
            LEAST(100, 50 + lp.total_visits * 5)
        ELSE 75 END
    ), 75) INTO v_satisfaction_avg
    FROM loyalty_profiles lp
    WHERE lp.salon_id = p_salon_id;

    v_satisfaction_sc := LEAST(100, ROUND(v_satisfaction_avg, 1));

    -- ── Composite health score ──────────────────────────────
    v_health := ROUND(
        v_revenue_score * 0.30 +
        v_retention_score * 0.25 +
        v_occupancy_score * 0.25 +
        v_satisfaction_sc * 0.20
    , 0);

    RETURN jsonb_build_object(
        'health_score',        v_health,
        'revenue_score',       ROUND(v_revenue_score, 0),
        'retention_score',     ROUND(v_retention_score, 0),
        'occupancy_score',     ROUND(v_occupancy_score, 0),
        'satisfaction_score',  ROUND(v_satisfaction_sc, 0),
        'revenue_total',       v_revenue_this,
        'revenue_change_pct',  v_revenue_pct,
        'retention_pct',       v_retention_pct,
        'occupancy_pct',       v_occupancy_pct
    );
END;
$$;


-- ============================================
-- 2. BARBER PERFORMANCE CARD
-- ============================================

CREATE OR REPLACE FUNCTION get_barber_performance_card(
    p_barber_id UUID,
    p_salon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
    v_result         JSONB;

    -- Barber metrics
    v_total_appt     BIGINT;
    v_completed      BIGINT;
    v_revenue        BIGINT;
    v_noshow         BIGINT;
    v_unique_clients BIGINT;
    v_rebook         BIGINT;
    v_rebook_rate    NUMERIC;
    v_noshow_rate    NUMERIC;

    v_available_hrs  NUMERIC;
    v_booked_hrs     NUMERIC;
    v_occupancy_pct  NUMERIC;
    v_rev_per_hour   NUMERIC;

    v_avg_rating     NUMERIC;
    v_top_service    TEXT;
    v_upsell_count   BIGINT;
    v_upsell_rate    NUMERIC;

    -- Salon averages
    v_salon_barbers  BIGINT;
    v_salon_avg_rev  NUMERIC;
    v_salon_avg_occ  NUMERIC;
    v_salon_avg_reb  NUMERIC;
    v_salon_avg_rat  NUMERIC;
    v_salon_avg_nos  NUMERIC;
BEGIN
    -- Security check
    IF NOT EXISTS (
        SELECT 1 FROM salon_members
        WHERE salon_id = p_salon_id AND profile_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('error', 'unauthorized');
    END IF;

    -- Verify barber belongs to salon
    IF NOT EXISTS (
        SELECT 1 FROM barbers
        WHERE id = p_barber_id AND salon_id = p_salon_id
    ) THEN
        RETURN jsonb_build_object('error', 'barber_not_in_salon');
    END IF;

    -- ── Barber appointment stats (last 30 days) ─────────────
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE a.status = 'completed'),
        COALESCE(SUM(a.total_cents) FILTER (WHERE a.status = 'completed'), 0),
        COUNT(*) FILTER (WHERE a.status = 'no_show')
    INTO v_total_appt, v_completed, v_revenue, v_noshow
    FROM appointments a
    WHERE a.barber_id = p_barber_id
      AND a.scheduled_at >= NOW() - INTERVAL '30 days';

    -- Unique clients
    SELECT COUNT(DISTINCT a.user_id) INTO v_unique_clients
    FROM appointments a
    WHERE a.barber_id = p_barber_id
      AND a.status = 'completed'
      AND a.scheduled_at >= NOW() - INTERVAL '30 days';

    -- Rebook rate: clients with >1 completed visit in 90 days
    SELECT COUNT(*) INTO v_rebook
    FROM (
        SELECT a.user_id
        FROM appointments a
        WHERE a.barber_id = p_barber_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - INTERVAL '90 days'
        GROUP BY a.user_id
        HAVING COUNT(*) > 1
    ) sub;

    v_rebook_rate := CASE WHEN v_unique_clients > 0
        THEN ROUND((v_rebook::NUMERIC / v_unique_clients) * 100, 1)
        ELSE 0
    END;

    v_noshow_rate := CASE WHEN v_total_appt > 0
        THEN ROUND((v_noshow::NUMERIC / v_total_appt) * 100, 1)
        ELSE 0
    END;

    -- ── Occupancy ───────────────────────────────────────────
    SELECT COALESCE(SUM(
        EXTRACT(EPOCH FROM (ba.end_time - ba.start_time)) / 3600.0
    ), 0) * 4.3 INTO v_available_hrs
    FROM barber_availability ba
    WHERE ba.barber_id = p_barber_id
      AND ba.is_available = true;

    SELECT COALESCE(SUM(a.duration_min::NUMERIC / 60.0), 0) INTO v_booked_hrs
    FROM appointments a
    WHERE a.barber_id = p_barber_id
      AND a.status IN ('completed', 'confirmed', 'pending')
      AND a.scheduled_at >= NOW() - INTERVAL '30 days';

    v_occupancy_pct := CASE WHEN v_available_hrs > 0
        THEN ROUND((v_booked_hrs / v_available_hrs) * 100, 1)
        ELSE 0
    END;

    v_rev_per_hour := CASE WHEN v_booked_hrs > 0
        THEN ROUND(v_revenue::NUMERIC / v_booked_hrs / 100, 0)
        ELSE 0
    END;

    -- ── Rating (from barbers table) ─────────────────────────
    SELECT COALESCE(b.rating_avg, 0) INTO v_avg_rating
    FROM barbers b WHERE b.id = p_barber_id;

    -- ── Top service ─────────────────────────────────────────
    SELECT bs.name INTO v_top_service
    FROM appointments a
    JOIN barber_services bs ON bs.id = a.service_id
    WHERE a.barber_id = p_barber_id
      AND a.status = 'completed'
      AND a.scheduled_at >= NOW() - INTERVAL '30 days'
    GROUP BY bs.name
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- ── Upsell rate (multi-service appointments) ────────────
    SELECT COUNT(*) INTO v_upsell_count
    FROM appointments a
    WHERE a.barber_id = p_barber_id
      AND a.status = 'completed'
      AND a.scheduled_at >= NOW() - INTERVAL '30 days'
      AND EXISTS (
          SELECT 1 FROM appointment_services aps
          WHERE aps.appointment_id = a.id
          HAVING COUNT(*) > 1
      );

    v_upsell_rate := CASE WHEN v_completed > 0
        THEN ROUND((v_upsell_count::NUMERIC / v_completed) * 100, 1)
        ELSE 0
    END;

    -- ── Salon averages ──────────────────────────────────────
    SELECT COUNT(*) INTO v_salon_barbers
    FROM barbers WHERE salon_id = p_salon_id AND active = true;

    IF v_salon_barbers > 0 THEN
        SELECT
            COALESCE(AVG(sub.rev), 0),
            COALESCE(AVG(sub.occ), 0),
            COALESCE(AVG(sub.reb), 0),
            COALESCE(AVG(sub.rat), 0),
            COALESCE(AVG(sub.nos), 0)
        INTO v_salon_avg_rev, v_salon_avg_occ, v_salon_avg_reb, v_salon_avg_rat, v_salon_avg_nos
        FROM (
            SELECT
                b2.id,
                COALESCE(SUM(a2.total_cents) FILTER (WHERE a2.status = 'completed'), 0)::NUMERIC AS rev,
                CASE WHEN COALESCE(SUM(
                    EXTRACT(EPOCH FROM (ba2.end_time - ba2.start_time)) / 3600.0
                ), 0) * 4.3 > 0 THEN
                    ROUND(
                        COALESCE(SUM(a2.duration_min::NUMERIC / 60.0) FILTER (WHERE a2.status IN ('completed','confirmed','pending')), 0)
                        / (COALESCE(SUM(EXTRACT(EPOCH FROM (ba2.end_time - ba2.start_time)) / 3600.0), 0) * 4.3)
                        * 100, 1
                    )
                ELSE 0 END AS occ,
                0::NUMERIC AS reb,
                COALESCE(b2.rating_avg, 0)::NUMERIC AS rat,
                CASE WHEN COUNT(a2.id) > 0
                    THEN ROUND(COUNT(a2.id) FILTER (WHERE a2.status = 'no_show')::NUMERIC / COUNT(a2.id) * 100, 1)
                    ELSE 0
                END AS nos
            FROM barbers b2
            LEFT JOIN appointments a2 ON a2.barber_id = b2.id
                AND a2.scheduled_at >= NOW() - INTERVAL '30 days'
            LEFT JOIN barber_availability ba2 ON ba2.barber_id = b2.id AND ba2.is_available = true
            WHERE b2.salon_id = p_salon_id AND b2.active = true
            GROUP BY b2.id, b2.rating_avg
        ) sub;
    ELSE
        v_salon_avg_rev := 0;
        v_salon_avg_occ := 0;
        v_salon_avg_reb := 0;
        v_salon_avg_rat := 0;
        v_salon_avg_nos := 0;
    END IF;

    RETURN jsonb_build_object(
        'occupancy_pct',      v_occupancy_pct,
        'revenue_per_hour',   v_rev_per_hour,
        'rebook_rate',        v_rebook_rate,
        'avg_rating',         v_avg_rating,
        'upsell_rate',        v_upsell_rate,
        'top_service_name',   COALESCE(v_top_service, 'N/A'),
        'noshow_rate',        v_noshow_rate,
        'revenue_total',      v_revenue,
        'appointments_total', v_total_appt,
        'clients_unique',     v_unique_clients,
        -- Diffs vs salon average
        'occupancy_diff',     ROUND(v_occupancy_pct - v_salon_avg_occ, 1),
        'revenue_diff',       ROUND(v_revenue::NUMERIC - v_salon_avg_rev, 0),
        'rebook_diff',        ROUND(v_rebook_rate - v_salon_avg_reb, 1),
        'rating_diff',        ROUND(v_avg_rating - v_salon_avg_rat, 2),
        'noshow_diff',        ROUND(v_noshow_rate - v_salon_avg_nos, 1)
    );
END;
$$;


-- ============================================
-- 3. REVENUE FORECAST
-- ============================================

CREATE OR REPLACE FUNCTION get_revenue_forecast(
    p_salon_id UUID,
    p_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
    v_day           DATE;
    v_dow           INT;
    v_confirmed_rev BIGINT;
    v_predicted_rev NUMERIC;
    v_slots_avail   INT;
    v_slots_booked  INT;
    v_occ_pct       NUMERIC;
    v_days_arr      JSONB := '[]'::JSONB;
    v_total_fc      NUMERIC := 0;
    v_last_total    BIGINT;
    v_alerts        JSONB := '[]'::JSONB;
    v_i             INT;
BEGIN
    -- Security check
    IF NOT EXISTS (
        SELECT 1 FROM salon_members
        WHERE salon_id = p_salon_id AND profile_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('error', 'unauthorized');
    END IF;

    -- ── Last period total (same length, ending yesterday) ───
    SELECT COALESCE(SUM(a.total_cents), 0) INTO v_last_total
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at >= (CURRENT_DATE - p_days)::TIMESTAMPTZ
      AND a.scheduled_at < CURRENT_DATE::TIMESTAMPTZ;

    -- ── Day-by-day forecast ─────────────────────────────────
    FOR v_i IN 0..(p_days - 1) LOOP
        v_day := CURRENT_DATE + v_i;
        v_dow := EXTRACT(DOW FROM v_day)::INT;  -- 0=Sunday

        -- Confirmed revenue (booked appointments for this day)
        SELECT COALESCE(SUM(a.total_cents), 0) INTO v_confirmed_rev
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status IN ('confirmed', 'pending')
          AND a.scheduled_at::DATE = v_day;

        -- Historical avg revenue for this day-of-week (last 12 weeks)
        SELECT COALESCE(AVG(daily_rev), 0) INTO v_predicted_rev
        FROM (
            SELECT SUM(a.total_cents) AS daily_rev
            FROM appointments a
            JOIN barbers b ON b.id = a.barber_id
            WHERE b.salon_id = p_salon_id
              AND a.status = 'completed'
              AND EXTRACT(DOW FROM a.scheduled_at) = v_dow
              AND a.scheduled_at >= NOW() - INTERVAL '84 days'
              AND a.scheduled_at < CURRENT_DATE::TIMESTAMPTZ
            GROUP BY a.scheduled_at::DATE
        ) hist;

        -- Available slots: count of available barbers * avg slots per day
        -- Approximate: each available barber has slots based on their hours
        SELECT
            COALESCE(SUM(
                FLOOR(EXTRACT(EPOCH FROM (ba.end_time - ba.start_time)) / 1800)
            ), 0)::INT
        INTO v_slots_avail
        FROM barber_availability ba
        JOIN barbers b ON b.id = ba.barber_id
        WHERE b.salon_id = p_salon_id
          AND b.active = true
          AND ba.is_available = true
          AND ba.day_of_week = v_dow;

        -- Booked slots for this day
        SELECT COUNT(*) INTO v_slots_booked
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status IN ('confirmed', 'pending')
          AND a.scheduled_at::DATE = v_day;

        v_occ_pct := CASE WHEN v_slots_avail > 0
            THEN ROUND((v_slots_booked::NUMERIC / v_slots_avail) * 100, 1)
            ELSE 0
        END;

        -- Use the higher of confirmed or predicted as forecast
        v_total_fc := v_total_fc + GREATEST(v_confirmed_rev, v_predicted_rev);

        v_days_arr := v_days_arr || jsonb_build_object(
            'date',              v_day,
            'confirmed_revenue', v_confirmed_rev,
            'predicted_revenue', ROUND(v_predicted_rev, 0),
            'slots_available',   v_slots_avail,
            'slots_booked',      v_slots_booked,
            'occupancy_pct',     v_occ_pct
        );

        -- Low occupancy alert
        IF v_occ_pct < 50 AND v_slots_avail > 0 THEN
            v_alerts := v_alerts || jsonb_build_object(
                'date',         v_day,
                'occupancy_pct', v_occ_pct,
                'slots_open',   v_slots_avail - v_slots_booked
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'days',                  v_days_arr,
        'total_forecast',        ROUND(v_total_fc, 0),
        'comparison_last_period', v_last_total,
        'low_occupancy_alerts',  v_alerts
    );
END;
$$;
