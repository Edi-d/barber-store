-- ============================================
-- Migration 041: Per-Barber Analytics
-- ============================================
-- Individual barber-level BI functions:
-- revenue, appointments, clients, services,
-- heatmap, performance, and cross-barber comparison.
-- All functions are SECURITY DEFINER and idempotent.
-- ============================================

-- ============================================
-- 1. BARBER REVENUE SUMMARY
-- ============================================
-- Returns total revenue, previous period comparison,
-- growth %, average transaction, and currency.

CREATE OR REPLACE FUNCTION get_barber_revenue_summary(
    p_barber_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    total_revenue BIGINT,
    prev_period_revenue BIGINT,
    growth_pct NUMERIC,
    avg_transaction BIGINT,
    total_appointments_revenue BIGINT,
    currency TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    WITH current_period AS (
        SELECT
            COALESCE(SUM(a.total_cents), 0) AS revenue,
            COUNT(a.id) AS appointment_count
        FROM appointments a
        WHERE a.barber_id = p_barber_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    prev_period AS (
        SELECT COALESCE(SUM(a.total_cents), 0) AS revenue
        FROM appointments a
        WHERE a.barber_id = p_barber_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days * 2 || ' days')::INTERVAL
          AND a.scheduled_at < NOW() - (p_days || ' days')::INTERVAL
    )
    SELECT
        cp.revenue AS total_revenue,
        pp.revenue AS prev_period_revenue,
        CASE WHEN pp.revenue > 0
            THEN ROUND((cp.revenue - pp.revenue)::NUMERIC / pp.revenue * 100, 1)
            ELSE 0
        END AS growth_pct,
        CASE WHEN cp.appointment_count > 0
            THEN cp.revenue / cp.appointment_count
            ELSE 0
        END AS avg_transaction,
        cp.appointment_count AS total_appointments_revenue,
        COALESCE(
            (SELECT a.currency FROM appointments a WHERE a.barber_id = p_barber_id LIMIT 1),
            'RON'
        ) AS currency
    FROM current_period cp
    CROSS JOIN prev_period pp;
$$;

-- ============================================
-- 2. BARBER REVENUE TREND
-- ============================================
-- Daily revenue and appointment count for the barber.

CREATE OR REPLACE FUNCTION get_barber_revenue_trend(
    p_barber_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    day DATE,
    revenue BIGINT,
    appointment_count INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        DATE_TRUNC('day', a.scheduled_at)::DATE AS day,
        COALESCE(SUM(a.total_cents), 0)::BIGINT AS revenue,
        COUNT(a.id)::INT AS appointment_count
    FROM appointments a
    WHERE a.barber_id = p_barber_id
      AND a.status = 'completed'
      AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY day
    ORDER BY day;
$$;

-- ============================================
-- 3. BARBER APPOINTMENT STATS
-- ============================================
-- All appointment metrics for this barber.

CREATE OR REPLACE FUNCTION get_barber_appointment_stats(
    p_barber_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    total BIGINT,
    completed BIGINT,
    cancelled BIGINT,
    no_show BIGINT,
    pending BIGINT,
    completion_rate NUMERIC,
    no_show_rate NUMERIC,
    cancellation_rate NUMERIC,
    avg_duration_min NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    WITH stats AS (
        SELECT
            COUNT(a.id) AS total,
            COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed,
            COUNT(a.id) FILTER (WHERE a.status = 'cancelled') AS cancelled,
            COUNT(a.id) FILTER (WHERE a.status = 'no_show') AS no_show,
            COUNT(a.id) FILTER (WHERE a.status = 'pending') AS pending,
            ROUND(AVG(a.duration_min) FILTER (WHERE a.status = 'completed'), 0) AS avg_dur
        FROM appointments a
        WHERE a.barber_id = p_barber_id
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    )
    SELECT
        s.total,
        s.completed,
        s.cancelled,
        s.no_show,
        s.pending,
        CASE WHEN (s.completed + s.no_show) > 0
            THEN ROUND(s.completed::NUMERIC / (s.completed + s.no_show) * 100, 1)
            ELSE 0
        END AS completion_rate,
        CASE WHEN (s.completed + s.no_show) > 0
            THEN ROUND(s.no_show::NUMERIC / (s.completed + s.no_show) * 100, 1)
            ELSE 0
        END AS no_show_rate,
        CASE WHEN s.total > 0
            THEN ROUND(s.cancelled::NUMERIC / s.total * 100, 1)
            ELSE 0
        END AS cancellation_rate,
        COALESCE(s.avg_dur, 0) AS avg_duration_min
    FROM stats s;
$$;

-- ============================================
-- 4. BARBER TOP SERVICES
-- ============================================
-- Top services by revenue for this barber, ordered DESC.

CREATE OR REPLACE FUNCTION get_barber_top_services(
    p_barber_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    service_id UUID,
    service_name TEXT,
    category TEXT,
    booking_count INT,
    revenue BIGINT,
    avg_duration INT,
    revenue_share NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    WITH svc_rev AS (
        SELECT
            bs.id AS service_id,
            bs.name AS service_name,
            COALESCE(bs.category, 'general') AS category,
            COUNT(a.id)::INT AS booking_count,
            COALESCE(SUM(a.total_cents), 0)::BIGINT AS revenue,
            ROUND(AVG(a.duration_min))::INT AS avg_duration
        FROM appointments a
        JOIN barber_services bs ON bs.id = a.service_id
        WHERE a.barber_id = p_barber_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY bs.id, bs.name, bs.category
    ),
    total AS (
        SELECT GREATEST(SUM(revenue), 1) AS total_rev FROM svc_rev
    )
    SELECT
        sr.service_id,
        sr.service_name,
        sr.category,
        sr.booking_count,
        sr.revenue,
        sr.avg_duration,
        ROUND(sr.revenue::NUMERIC / t.total_rev * 100, 1) AS revenue_share
    FROM svc_rev sr, total t
    ORDER BY sr.revenue DESC;
$$;

-- ============================================
-- 5. BARBER CLIENT STATS
-- ============================================
-- Unique, new, returning clients with retention rate.
-- "new" = first appointment with THIS barber in the period.
-- "returning" = had a previous completed appointment before the period.

CREATE OR REPLACE FUNCTION get_barber_client_stats(
    p_barber_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    unique_clients BIGINT,
    new_clients BIGINT,
    returning_clients BIGINT,
    retention_rate NUMERIC,
    avg_visits_per_client NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    WITH period_clients AS (
        SELECT DISTINCT a.user_id
        FROM appointments a
        WHERE a.barber_id = p_barber_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    prior_clients AS (
        SELECT DISTINCT a.user_id
        FROM appointments a
        WHERE a.barber_id = p_barber_id
          AND a.status = 'completed'
          AND a.scheduled_at < NOW() - (p_days || ' days')::INTERVAL
    ),
    counts AS (
        SELECT
            (SELECT COUNT(*) FROM period_clients) AS total_unique,
            (SELECT COUNT(*) FROM period_clients pc WHERE NOT EXISTS (
                SELECT 1 FROM prior_clients pr WHERE pr.user_id = pc.user_id
            )) AS new_count,
            (SELECT COUNT(*) FROM period_clients pc WHERE EXISTS (
                SELECT 1 FROM prior_clients pr WHERE pr.user_id = pc.user_id
            )) AS returning_count
    ),
    avg_v AS (
        SELECT ROUND(AVG(sub.visits), 1) AS avg_visits FROM (
            SELECT a.user_id, COUNT(a.id) AS visits
            FROM appointments a
            WHERE a.barber_id = p_barber_id
              AND a.status = 'completed'
              AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
            GROUP BY a.user_id
        ) sub
    )
    SELECT
        c.total_unique AS unique_clients,
        c.new_count AS new_clients,
        c.returning_count AS returning_clients,
        CASE WHEN c.total_unique > 0
            THEN ROUND(c.returning_count::NUMERIC / c.total_unique * 100, 1)
            ELSE 0
        END AS retention_rate,
        COALESCE(av.avg_visits, 0) AS avg_visits_per_client
    FROM counts c
    CROSS JOIN avg_v av;
$$;

-- ============================================
-- 6. BARBER TOP CLIENTS
-- ============================================
-- Top clients by spending at this barber.

CREATE OR REPLACE FUNCTION get_barber_top_clients(
    p_barber_id UUID,
    p_days INT DEFAULT 30,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    client_id UUID,
    client_name TEXT,
    client_avatar TEXT,
    total_spent BIGINT,
    visit_count INT,
    last_visit TIMESTAMPTZ,
    favorite_service TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    WITH client_agg AS (
        SELECT
            a.user_id,
            SUM(a.total_cents)::BIGINT AS total_spent,
            COUNT(a.id)::INT AS visits,
            MAX(a.scheduled_at) AS last_visit
        FROM appointments a
        WHERE a.barber_id = p_barber_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY a.user_id
        ORDER BY total_spent DESC
        LIMIT p_limit
    ),
    fav_service AS (
        SELECT DISTINCT ON (a.user_id)
            a.user_id,
            bs.name AS service_name
        FROM appointments a
        JOIN barber_services bs ON bs.id = a.service_id
        WHERE a.barber_id = p_barber_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY a.user_id, bs.name
        ORDER BY a.user_id, COUNT(*) DESC
    )
    SELECT
        ca.user_id AS client_id,
        COALESCE(p.display_name, p.username, 'Anonim') AS client_name,
        p.avatar_url AS client_avatar,
        ca.total_spent,
        ca.visits AS visit_count,
        ca.last_visit,
        COALESCE(fs.service_name, '-') AS favorite_service
    FROM client_agg ca
    LEFT JOIN profiles p ON p.id = ca.user_id
    LEFT JOIN fav_service fs ON fs.user_id = ca.user_id
    ORDER BY ca.total_spent DESC;
$$;

-- ============================================
-- 7. BARBER HEATMAP
-- ============================================
-- Heatmap (day_of_week x hour_of_day) for this barber.

CREATE OR REPLACE FUNCTION get_barber_heatmap(
    p_barber_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    day_of_week INT,
    hour_of_day INT,
    appointment_count INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXTRACT(ISODOW FROM a.scheduled_at)::INT AS day_of_week,
        EXTRACT(HOUR FROM a.scheduled_at)::INT AS hour_of_day,
        COUNT(a.id)::INT AS appointment_count
    FROM appointments a
    WHERE a.barber_id = p_barber_id
      AND a.status IN ('completed', 'confirmed', 'pending')
      AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY day_of_week, hour_of_day
    ORDER BY day_of_week, hour_of_day;
$$;

-- ============================================
-- 8. BARBER PERFORMANCE SUMMARY
-- ============================================
-- Rating, utilization, hours worked/available,
-- and revenue per hour for a single barber.

CREATE OR REPLACE FUNCTION get_barber_performance_summary(
    p_barber_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    rating_avg NUMERIC,
    reviews_count BIGINT,
    utilization_pct NUMERIC,
    hours_worked NUMERIC,
    hours_available NUMERIC,
    revenue_per_hour NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    WITH barber_info AS (
        SELECT
            COALESCE(b.rating_avg, 0) AS rating_avg,
            COALESCE(b.reviews_count, 0)::BIGINT AS reviews_count
        FROM barbers b
        WHERE b.id = p_barber_id
    ),
    booked AS (
        SELECT
            COALESCE(SUM(a.duration_min), 0) AS booked_minutes,
            COALESCE(SUM(a.total_cents), 0) AS total_revenue
        FROM appointments a
        WHERE a.barber_id = p_barber_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    avail AS (
        SELECT
            SUM(
                CASE WHEN ba.is_available THEN
                    EXTRACT(EPOCH FROM (ba.end_time - ba.start_time)) / 60.0
                ELSE 0 END
            ) * (p_days / 7.0) AS available_minutes
        FROM barber_availability ba
        WHERE ba.barber_id = p_barber_id
    )
    SELECT
        bi.rating_avg,
        bi.reviews_count,
        CASE WHEN COALESCE(av.available_minutes, 0) > 0
            THEN ROUND(bk.booked_minutes::NUMERIC / av.available_minutes * 100, 1)
            ELSE 0
        END AS utilization_pct,
        ROUND(bk.booked_minutes::NUMERIC / 60, 1) AS hours_worked,
        ROUND(COALESCE(av.available_minutes, 0)::NUMERIC / 60, 1) AS hours_available,
        CASE WHEN bk.booked_minutes > 0
            THEN ROUND(bk.total_revenue::NUMERIC / (bk.booked_minutes::NUMERIC / 60), 0)
            ELSE 0
        END AS revenue_per_hour
    FROM barber_info bi
    CROSS JOIN booked bk
    CROSS JOIN avail av;
$$;

-- ============================================
-- 9. BARBER COMPARISON
-- ============================================
-- All barbers in the salon compared side by side,
-- ranked by revenue.

CREATE OR REPLACE FUNCTION get_barber_comparison(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    barber_id UUID,
    barber_name TEXT,
    barber_avatar TEXT,
    revenue BIGINT,
    appointments INT,
    completion_rate NUMERIC,
    avg_rating NUMERIC,
    utilization_pct NUMERIC,
    revenue_rank INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    WITH barber_stats AS (
        SELECT
            b.id AS barber_id,
            b.name AS barber_name,
            b.avatar_url AS barber_avatar,
            COALESCE(SUM(a.total_cents) FILTER (WHERE a.status = 'completed'), 0)::BIGINT AS revenue,
            COUNT(a.id)::INT AS appointments,
            COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed,
            COUNT(a.id) FILTER (WHERE a.status = 'no_show') AS no_shows,
            COALESCE(b.rating_avg, 0) AS avg_rating
        FROM barbers b
        LEFT JOIN appointments a
            ON a.barber_id = b.id
            AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        WHERE b.salon_id = p_salon_id
          AND b.active = true
        GROUP BY b.id, b.name, b.avatar_url, b.rating_avg
    ),
    barber_util AS (
        SELECT
            b.id AS barber_id,
            COALESCE(SUM(a.duration_min) FILTER (WHERE a.status IN ('completed', 'confirmed')), 0) AS booked_minutes,
            COALESCE(
                SUM(
                    CASE WHEN ba.is_available THEN
                        EXTRACT(EPOCH FROM (ba.end_time - ba.start_time)) / 60.0
                    ELSE 0 END
                ) * (p_days / 7.0),
                0
            ) AS available_minutes
        FROM barbers b
        LEFT JOIN appointments a
            ON a.barber_id = b.id
            AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        LEFT JOIN barber_availability ba
            ON ba.barber_id = b.id
        WHERE b.salon_id = p_salon_id
          AND b.active = true
        GROUP BY b.id
    )
    SELECT
        bs.barber_id,
        bs.barber_name,
        bs.barber_avatar,
        bs.revenue,
        bs.appointments,
        CASE WHEN (bs.completed + bs.no_shows) > 0
            THEN ROUND(bs.completed::NUMERIC / (bs.completed + bs.no_shows) * 100, 1)
            ELSE 0
        END AS completion_rate,
        bs.avg_rating,
        CASE WHEN COALESCE(bu.available_minutes, 0) > 0
            THEN ROUND(bu.booked_minutes::NUMERIC / bu.available_minutes * 100, 1)
            ELSE 0
        END AS utilization_pct,
        (ROW_NUMBER() OVER (ORDER BY bs.revenue DESC))::INT AS revenue_rank
    FROM barber_stats bs
    LEFT JOIN barber_util bu ON bu.barber_id = bs.barber_id
    ORDER BY bs.revenue DESC;
$$;

-- ============================================
-- 10. INDEXES for per-barber analytics
-- ============================================
-- Composite index on barber_id + status + scheduled_at
-- to accelerate all per-barber filtered queries.

CREATE INDEX IF NOT EXISTS idx_appointments_barber_status_scheduled
    ON appointments(barber_id, status, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_barber_completed_revenue
    ON appointments(barber_id, scheduled_at, total_cents)
    WHERE status = 'completed';

-- ============================================
-- Done! Per-barber analytics system ready.
-- ============================================
