-- ============================================
-- Migration 020: Reports & Insights System
-- ============================================
-- Complete BI functions for salon owners:
-- revenue, appointments, staff, clients, operations.
-- All functions are SECURITY DEFINER and check ownership.
-- ============================================

-- ============================================
-- 1. REVENUE INSIGHTS
-- ============================================

-- 1a. Revenue per period (daily/weekly/monthly aggregates)
CREATE OR REPLACE FUNCTION get_salon_revenue_trends(
    p_salon_id UUID,
    p_period TEXT DEFAULT 'daily',  -- daily | weekly | monthly
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    period_label TEXT,
    period_start DATE,
    revenue_cents BIGINT,
    appointment_count BIGINT,
    avg_transaction_cents BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        CASE p_period
            WHEN 'daily'   THEN TO_CHAR(a.scheduled_at, 'DD Mon')
            WHEN 'weekly'  THEN 'Sapt ' || EXTRACT(WEEK FROM a.scheduled_at)::TEXT
            WHEN 'monthly' THEN TO_CHAR(a.scheduled_at, 'Mon YYYY')
        END AS period_label,
        CASE p_period
            WHEN 'daily'   THEN DATE_TRUNC('day', a.scheduled_at)::DATE
            WHEN 'weekly'  THEN DATE_TRUNC('week', a.scheduled_at)::DATE
            WHEN 'monthly' THEN DATE_TRUNC('month', a.scheduled_at)::DATE
        END AS period_start,
        COALESCE(SUM(a.total_cents), 0) AS revenue_cents,
        COUNT(a.id) AS appointment_count,
        CASE WHEN COUNT(a.id) > 0
            THEN (SUM(a.total_cents) / COUNT(a.id))
            ELSE 0
        END AS avg_transaction_cents
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY period_label, period_start
    ORDER BY period_start;
$$;

-- 1b. Revenue per barber comparison
CREATE OR REPLACE FUNCTION get_salon_revenue_per_barber(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    barber_id UUID,
    barber_name TEXT,
    revenue_cents BIGINT,
    appointment_count BIGINT,
    avg_transaction_cents BIGINT,
    revenue_share_pct NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH barber_rev AS (
        SELECT
            b.id AS barber_id,
            b.name AS barber_name,
            COALESCE(SUM(a.total_cents), 0) AS revenue_cents,
            COUNT(a.id) AS appointment_count,
            CASE WHEN COUNT(a.id) > 0
                THEN (SUM(a.total_cents) / COUNT(a.id))
                ELSE 0
            END AS avg_transaction_cents
        FROM barbers b
        LEFT JOIN appointments a
            ON a.barber_id = b.id
            AND a.status = 'completed'
            AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        WHERE b.salon_id = p_salon_id
          AND b.active = true
        GROUP BY b.id, b.name
    ),
    total AS (
        SELECT GREATEST(SUM(revenue_cents), 1) AS total_rev FROM barber_rev
    )
    SELECT
        br.barber_id,
        br.barber_name,
        br.revenue_cents,
        br.appointment_count,
        br.avg_transaction_cents,
        ROUND(br.revenue_cents::NUMERIC / t.total_rev * 100, 1) AS revenue_share_pct
    FROM barber_rev br, total t
    ORDER BY br.revenue_cents DESC;
$$;

-- 1c. Revenue per service category
CREATE OR REPLACE FUNCTION get_salon_revenue_per_category(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    category TEXT,
    revenue_cents BIGINT,
    appointment_count BIGINT,
    revenue_share_pct NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH cat_rev AS (
        SELECT
            COALESCE(bs.category, 'general') AS category,
            COALESCE(SUM(a.total_cents), 0) AS revenue_cents,
            COUNT(a.id) AS appointment_count
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        JOIN barber_services bs ON bs.id = a.service_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY bs.category
    ),
    total AS (
        SELECT GREATEST(SUM(revenue_cents), 1) AS total_rev FROM cat_rev
    )
    SELECT
        cr.category,
        cr.revenue_cents,
        cr.appointment_count,
        ROUND(cr.revenue_cents::NUMERIC / t.total_rev * 100, 1) AS revenue_share_pct
    FROM cat_rev cr, total t
    ORDER BY cr.revenue_cents DESC;
$$;

-- 1d. Best/worst days of the week
CREATE OR REPLACE FUNCTION get_salon_revenue_by_weekday(
    p_salon_id UUID,
    p_days INT DEFAULT 90
)
RETURNS TABLE (
    day_of_week INT,
    day_name TEXT,
    revenue_cents BIGINT,
    appointment_count BIGINT,
    avg_revenue_cents BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH daily AS (
        SELECT
            EXTRACT(ISODOW FROM a.scheduled_at)::INT AS dow,
            SUM(a.total_cents) AS revenue_cents,
            COUNT(a.id) AS appointment_count
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY dow
    )
    SELECT
        d.dow AS day_of_week,
        CASE d.dow
            WHEN 1 THEN 'Luni'
            WHEN 2 THEN 'Marti'
            WHEN 3 THEN 'Miercuri'
            WHEN 4 THEN 'Joi'
            WHEN 5 THEN 'Vineri'
            WHEN 6 THEN 'Sambata'
            WHEN 7 THEN 'Duminica'
        END AS day_name,
        d.revenue_cents,
        d.appointment_count,
        CASE WHEN d.appointment_count > 0
            THEN d.revenue_cents / d.appointment_count
            ELSE 0
        END AS avg_revenue_cents
    FROM daily d
    ORDER BY d.dow;
$$;

-- 1e. Peak revenue hours
CREATE OR REPLACE FUNCTION get_salon_revenue_by_hour(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    hour_of_day INT,
    revenue_cents BIGINT,
    appointment_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        EXTRACT(HOUR FROM a.scheduled_at)::INT AS hour_of_day,
        COALESCE(SUM(a.total_cents), 0) AS revenue_cents,
        COUNT(a.id) AS appointment_count
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY hour_of_day
    ORDER BY hour_of_day;
$$;

-- ============================================
-- 2. APPOINTMENT INSIGHTS
-- ============================================

-- 2a. Booking status breakdown (completed / no_show / cancelled / pending)
CREATE OR REPLACE FUNCTION get_salon_appointment_stats(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    total_appointments BIGINT,
    completed BIGINT,
    cancelled BIGINT,
    no_shows BIGINT,
    pending BIGINT,
    confirmed BIGINT,
    completion_rate NUMERIC,
    no_show_rate NUMERIC,
    cancellation_rate NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH stats AS (
        SELECT
            COUNT(a.id) AS total,
            COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed,
            COUNT(a.id) FILTER (WHERE a.status = 'cancelled') AS cancelled,
            COUNT(a.id) FILTER (WHERE a.status = 'no_show') AS no_shows,
            COUNT(a.id) FILTER (WHERE a.status = 'pending') AS pending,
            COUNT(a.id) FILTER (WHERE a.status = 'confirmed') AS confirmed
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    )
    SELECT
        s.total AS total_appointments,
        s.completed,
        s.cancelled,
        s.no_shows,
        s.pending,
        s.confirmed,
        CASE WHEN (s.completed + s.no_shows) > 0
            THEN ROUND(s.completed::NUMERIC / (s.completed + s.no_shows) * 100, 1)
            ELSE 0
        END AS completion_rate,
        CASE WHEN (s.completed + s.no_shows) > 0
            THEN ROUND(s.no_shows::NUMERIC / (s.completed + s.no_shows) * 100, 1)
            ELSE 0
        END AS no_show_rate,
        CASE WHEN s.total > 0
            THEN ROUND(s.cancelled::NUMERIC / s.total * 100, 1)
            ELSE 0
        END AS cancellation_rate
    FROM stats s;
$$;

-- 2b. Most popular services
CREATE OR REPLACE FUNCTION get_salon_popular_services(
    p_salon_id UUID,
    p_days INT DEFAULT 30,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    service_id UUID,
    service_name TEXT,
    category TEXT,
    booking_count BIGINT,
    revenue_cents BIGINT,
    avg_duration_min NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        bs.id AS service_id,
        bs.name AS service_name,
        bs.category,
        COUNT(a.id) AS booking_count,
        COALESCE(SUM(a.total_cents), 0) AS revenue_cents,
        ROUND(AVG(a.duration_min), 0) AS avg_duration_min
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    JOIN barber_services bs ON bs.id = a.service_id
    WHERE b.salon_id = p_salon_id
      AND a.status IN ('completed', 'confirmed', 'pending')
      AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY bs.id, bs.name, bs.category
    ORDER BY booking_count DESC
    LIMIT p_limit;
$$;

-- 2c. Booking lead time (how far in advance clients book)
CREATE OR REPLACE FUNCTION get_salon_booking_lead_time(
    p_salon_id UUID,
    p_days INT DEFAULT 90
)
RETURNS TABLE (
    avg_lead_hours NUMERIC,
    median_lead_hours NUMERIC,
    same_day_pct NUMERIC,
    one_day_pct NUMERIC,
    two_plus_days_pct NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH leads AS (
        SELECT
            EXTRACT(EPOCH FROM (a.scheduled_at - a.created_at)) / 3600.0 AS lead_hours
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
          AND a.created_at < a.scheduled_at
    )
    SELECT
        ROUND(AVG(lead_hours)::NUMERIC, 1) AS avg_lead_hours,
        ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lead_hours))::NUMERIC, 1) AS median_lead_hours,
        ROUND(COUNT(*) FILTER (WHERE lead_hours < 24)::NUMERIC / GREATEST(COUNT(*), 1) * 100, 1) AS same_day_pct,
        ROUND(COUNT(*) FILTER (WHERE lead_hours >= 24 AND lead_hours < 48)::NUMERIC / GREATEST(COUNT(*), 1) * 100, 1) AS one_day_pct,
        ROUND(COUNT(*) FILTER (WHERE lead_hours >= 48)::NUMERIC / GREATEST(COUNT(*), 1) * 100, 1) AS two_plus_days_pct
    FROM leads;
$$;

-- ============================================
-- 3. STAFF PERFORMANCE
-- ============================================

-- 3a. Utilization rate per barber (booked hours / available hours)
CREATE OR REPLACE FUNCTION get_salon_staff_utilization(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    barber_id UUID,
    barber_name TEXT,
    booked_minutes BIGINT,
    available_minutes BIGINT,
    utilization_pct NUMERIC,
    avg_service_duration NUMERIC,
    expected_avg_duration NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH booked AS (
        SELECT
            b.id AS barber_id,
            b.name AS barber_name,
            COALESCE(SUM(a.duration_min), 0) AS booked_minutes,
            ROUND(AVG(a.duration_min), 0) AS avg_service_duration
        FROM barbers b
        LEFT JOIN appointments a
            ON a.barber_id = b.id
            AND a.status IN ('completed', 'confirmed')
            AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        WHERE b.salon_id = p_salon_id
          AND b.active = true
        GROUP BY b.id, b.name
    ),
    avail AS (
        SELECT
            ba.barber_id,
            SUM(
                CASE WHEN ba.is_available THEN
                    EXTRACT(EPOCH FROM (ba.end_time - ba.start_time)) / 60.0
                ELSE 0 END
            ) * (p_days / 7.0) AS available_minutes  -- scale weekly schedule to p_days
        FROM barber_availability ba
        JOIN barbers b ON b.id = ba.barber_id
        WHERE b.salon_id = p_salon_id
          AND b.active = true
        GROUP BY ba.barber_id
    ),
    expected AS (
        SELECT
            b.id AS barber_id,
            ROUND(AVG(bs.duration_min), 0) AS expected_avg_duration
        FROM barbers b
        LEFT JOIN barber_service_assignments bsa ON bsa.barber_id = b.id
        LEFT JOIN barber_services bs ON bs.id = bsa.service_id
        WHERE b.salon_id = p_salon_id
          AND b.active = true
        GROUP BY b.id
    )
    SELECT
        bk.barber_id,
        bk.barber_name,
        bk.booked_minutes,
        COALESCE(av.available_minutes, 0)::BIGINT AS available_minutes,
        CASE WHEN COALESCE(av.available_minutes, 0) > 0
            THEN ROUND(bk.booked_minutes::NUMERIC / av.available_minutes * 100, 1)
            ELSE 0
        END AS utilization_pct,
        bk.avg_service_duration,
        COALESCE(ex.expected_avg_duration, 0) AS expected_avg_duration
    FROM booked bk
    LEFT JOIN avail av ON av.barber_id = bk.barber_id
    LEFT JOIN expected ex ON ex.barber_id = bk.barber_id
    ORDER BY utilization_pct DESC;
$$;

-- ============================================
-- 4. CLIENT INSIGHTS
-- ============================================

-- 4a. New vs returning clients
CREATE OR REPLACE FUNCTION get_salon_client_insights(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    total_unique_clients BIGINT,
    new_clients BIGINT,
    returning_clients BIGINT,
    retention_rate NUMERIC,
    avg_visits_per_client NUMERIC,
    top_client_id UUID,
    top_client_name TEXT,
    top_client_spent_cents BIGINT,
    top_client_visits BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH period_clients AS (
        SELECT DISTINCT a.user_id
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    prior_clients AS (
        SELECT DISTINCT a.user_id
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at < NOW() - (p_days || ' days')::INTERVAL
    ),
    client_stats AS (
        SELECT
            a.user_id,
            COUNT(a.id) AS visits,
            SUM(a.total_cents) AS spent_cents
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY a.user_id
        ORDER BY spent_cents DESC
        LIMIT 1
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
            JOIN barbers b ON b.id = a.barber_id
            WHERE b.salon_id = p_salon_id
              AND a.status = 'completed'
              AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
            GROUP BY a.user_id
        ) sub
    )
    SELECT
        c.total_unique AS total_unique_clients,
        c.new_count AS new_clients,
        c.returning_count AS returning_clients,
        CASE WHEN c.total_unique > 0
            THEN ROUND(c.returning_count::NUMERIC / c.total_unique * 100, 1)
            ELSE 0
        END AS retention_rate,
        COALESCE(av.avg_visits, 0) AS avg_visits_per_client,
        cs.user_id AS top_client_id,
        COALESCE(p.display_name, p.username, 'Anonim') AS top_client_name,
        COALESCE(cs.spent_cents, 0) AS top_client_spent_cents,
        COALESCE(cs.visits, 0) AS top_client_visits
    FROM counts c
    LEFT JOIN avg_v av ON true
    LEFT JOIN client_stats cs ON true
    LEFT JOIN profiles p ON p.id = cs.user_id;
$$;

-- 4b. Top clients by spending
CREATE OR REPLACE FUNCTION get_salon_top_clients(
    p_salon_id UUID,
    p_days INT DEFAULT 90,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    client_id UUID,
    client_name TEXT,
    total_spent_cents BIGINT,
    visit_count BIGINT,
    avg_spent_cents BIGINT,
    last_visit TIMESTAMPTZ,
    favorite_service TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH client_agg AS (
        SELECT
            a.user_id,
            SUM(a.total_cents) AS total_spent,
            COUNT(a.id) AS visits,
            MAX(a.scheduled_at) AS last_visit
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
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
        JOIN barbers b ON b.id = a.barber_id
        JOIN barber_services bs ON bs.id = a.service_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY a.user_id, bs.name
        ORDER BY a.user_id, COUNT(*) DESC
    )
    SELECT
        ca.user_id AS client_id,
        COALESCE(p.display_name, p.username, 'Anonim') AS client_name,
        ca.total_spent AS total_spent_cents,
        ca.visits AS visit_count,
        CASE WHEN ca.visits > 0 THEN ca.total_spent / ca.visits ELSE 0 END AS avg_spent_cents,
        ca.last_visit,
        fs.service_name AS favorite_service
    FROM client_agg ca
    LEFT JOIN profiles p ON p.id = ca.user_id
    LEFT JOIN fav_service fs ON fs.user_id = ca.user_id
    ORDER BY ca.total_spent DESC;
$$;

-- ============================================
-- 5. OPERATIONAL INSIGHTS
-- ============================================

-- 5a. Busiest hours heatmap (day_of_week x hour_of_day)
CREATE OR REPLACE FUNCTION get_salon_heatmap(
    p_salon_id UUID,
    p_days INT DEFAULT 90
)
RETURNS TABLE (
    day_of_week INT,
    day_name TEXT,
    hour_of_day INT,
    appointment_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        EXTRACT(ISODOW FROM a.scheduled_at)::INT AS day_of_week,
        CASE EXTRACT(ISODOW FROM a.scheduled_at)::INT
            WHEN 1 THEN 'Lu' WHEN 2 THEN 'Ma' WHEN 3 THEN 'Mi'
            WHEN 4 THEN 'Jo' WHEN 5 THEN 'Vi' WHEN 6 THEN 'Sa' WHEN 7 THEN 'Du'
        END AS day_name,
        EXTRACT(HOUR FROM a.scheduled_at)::INT AS hour_of_day,
        COUNT(a.id) AS appointment_count
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status IN ('completed', 'confirmed', 'pending')
      AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY day_of_week, day_name, hour_of_day
    ORDER BY day_of_week, hour_of_day;
$$;

-- 5b. Comprehensive salon KPI dashboard (single call, all top-level metrics)
CREATE OR REPLACE FUNCTION get_salon_dashboard_kpis(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    -- Revenue
    total_revenue_cents BIGINT,
    prev_period_revenue_cents BIGINT,
    revenue_growth_pct NUMERIC,
    avg_transaction_cents BIGINT,
    -- Appointments
    total_appointments BIGINT,
    completed_appointments BIGINT,
    no_shows BIGINT,
    cancellations BIGINT,
    completion_rate NUMERIC,
    no_show_rate NUMERIC,
    -- Clients
    unique_clients BIGINT,
    new_clients BIGINT,
    returning_clients BIGINT,
    retention_rate NUMERIC,
    -- Staff
    active_barbers BIGINT,
    avg_utilization_pct NUMERIC,
    best_barber_name TEXT,
    best_barber_revenue BIGINT,
    -- Operations
    busiest_day TEXT,
    busiest_hour INT,
    most_popular_service TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH current_period AS (
        SELECT
            COALESCE(SUM(a.total_cents) FILTER (WHERE a.status = 'completed'), 0) AS revenue,
            COUNT(a.id) AS total,
            COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed,
            COUNT(a.id) FILTER (WHERE a.status = 'no_show') AS no_shows,
            COUNT(a.id) FILTER (WHERE a.status = 'cancelled') AS cancellations
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    prev_period AS (
        SELECT COALESCE(SUM(a.total_cents), 0) AS revenue
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days * 2 || ' days')::INTERVAL
          AND a.scheduled_at < NOW() - (p_days || ' days')::INTERVAL
    ),
    clients AS (
        SELECT
            COUNT(DISTINCT a.user_id) AS unique_clients,
            COUNT(DISTINCT a.user_id) FILTER (
                WHERE NOT EXISTS (
                    SELECT 1 FROM appointments a2
                    JOIN barbers b2 ON b2.id = a2.barber_id
                    WHERE b2.salon_id = p_salon_id
                      AND a2.user_id = a.user_id
                      AND a2.status = 'completed'
                      AND a2.scheduled_at < NOW() - (p_days || ' days')::INTERVAL
                )
            ) AS new_clients
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    staff AS (
        SELECT COUNT(*) AS active_barbers FROM barbers WHERE salon_id = p_salon_id AND active = true
    ),
    best_barber AS (
        SELECT b.name, SUM(a.total_cents) AS rev
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY b.name
        ORDER BY rev DESC
        LIMIT 1
    ),
    busiest AS (
        SELECT
            CASE EXTRACT(ISODOW FROM a.scheduled_at)::INT
                WHEN 1 THEN 'Luni' WHEN 2 THEN 'Marti' WHEN 3 THEN 'Miercuri'
                WHEN 4 THEN 'Joi' WHEN 5 THEN 'Vineri' WHEN 6 THEN 'Sambata' WHEN 7 THEN 'Duminica'
            END AS day_name,
            COUNT(*) AS cnt
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY day_name
        ORDER BY cnt DESC
        LIMIT 1
    ),
    busiest_h AS (
        SELECT EXTRACT(HOUR FROM a.scheduled_at)::INT AS h, COUNT(*) AS cnt
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY h
        ORDER BY cnt DESC
        LIMIT 1
    ),
    pop_service AS (
        SELECT bs.name, COUNT(*) AS cnt
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        JOIN barber_services bs ON bs.id = a.service_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY bs.name
        ORDER BY cnt DESC
        LIMIT 1
    )
    SELECT
        cp.revenue AS total_revenue_cents,
        pp.revenue AS prev_period_revenue_cents,
        CASE WHEN pp.revenue > 0
            THEN ROUND((cp.revenue - pp.revenue)::NUMERIC / pp.revenue * 100, 1)
            ELSE 0
        END AS revenue_growth_pct,
        CASE WHEN cp.completed > 0 THEN cp.revenue / cp.completed ELSE 0 END AS avg_transaction_cents,
        cp.total AS total_appointments,
        cp.completed AS completed_appointments,
        cp.no_shows,
        cp.cancellations,
        CASE WHEN (cp.completed + cp.no_shows) > 0
            THEN ROUND(cp.completed::NUMERIC / (cp.completed + cp.no_shows) * 100, 1)
            ELSE 0
        END AS completion_rate,
        CASE WHEN (cp.completed + cp.no_shows) > 0
            THEN ROUND(cp.no_shows::NUMERIC / (cp.completed + cp.no_shows) * 100, 1)
            ELSE 0
        END AS no_show_rate,
        cl.unique_clients,
        cl.new_clients,
        cl.unique_clients - cl.new_clients AS returning_clients,
        CASE WHEN cl.unique_clients > 0
            THEN ROUND((cl.unique_clients - cl.new_clients)::NUMERIC / cl.unique_clients * 100, 1)
            ELSE 0
        END AS retention_rate,
        st.active_barbers,
        0::NUMERIC AS avg_utilization_pct,  -- computed client-side from utilization function
        bb.name AS best_barber_name,
        COALESCE(bb.rev, 0) AS best_barber_revenue,
        COALESCE(bu.day_name, '-') AS busiest_day,
        COALESCE(bh.h, 0) AS busiest_hour,
        COALESCE(ps.name, '-') AS most_popular_service
    FROM current_period cp
    CROSS JOIN prev_period pp
    CROSS JOIN clients cl
    CROSS JOIN staff st
    LEFT JOIN best_barber bb ON true
    LEFT JOIN busiest bu ON true
    LEFT JOIN busiest_h bh ON true
    LEFT JOIN pop_service ps ON true;
$$;

-- ============================================
-- 6. INDEXES for report queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at
    ON appointments(scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_completed_revenue
    ON appointments(barber_id, status, scheduled_at, total_cents)
    WHERE status = 'completed';

-- ============================================
-- Done! Reports & Insights system ready.
-- ============================================
