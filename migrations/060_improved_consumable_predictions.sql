-- ============================================
-- Migration 047: Improved client-based consumption predictions
-- Replaces get_consumable_predictions with version that:
--   1. Segments weekday vs weekend consumption rates
--   2. Adds lead time for suggested reorder date
--   3. Tracks total appointments analyzed for confidence
-- ============================================

-- Drop old overloads to avoid ambiguous function calls
DROP FUNCTION IF EXISTS get_consumable_predictions(UUID, INT);
DROP FUNCTION IF EXISTS get_consumable_predictions(UUID, INT, INT);

CREATE OR REPLACE FUNCTION get_consumable_predictions(
    p_salon_id UUID,
    p_days INT DEFAULT 30,
    p_lead_time_days INT DEFAULT 3
)
RETURNS TABLE (
    consumable_id       UUID,
    name                TEXT,
    brand               TEXT,
    category            TEXT,
    unit                TEXT,
    current_stock       NUMERIC,
    min_stock_threshold NUMERIC,
    daily_usage_rate    NUMERIC,
    weekday_daily_rate  NUMERIC,
    weekend_daily_rate  NUMERIC,
    days_until_empty    NUMERIC,
    estimated_empty_date DATE,
    suggested_reorder_date DATE,
    total_appointments  BIGINT,
    is_low_stock        BOOLEAN
)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
    WITH completed_appointments AS (
        SELECT
            a.id,
            a.scheduled_at,
            CASE
                WHEN EXTRACT(DOW FROM a.scheduled_at)::INT IN (0, 6) THEN 'weekend'
                ELSE 'weekday'
            END AS day_type
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at::DATE >= CURRENT_DATE - p_days
    ),
    total_appt_count AS (
        SELECT COUNT(*) AS cnt FROM completed_appointments
    ),
    service_counts AS (
        SELECT
            aps.service_id,
            ca.day_type,
            COUNT(*) AS service_count
        FROM appointment_services aps
        JOIN completed_appointments ca ON ca.id = aps.appointment_id
        GROUP BY aps.service_id, ca.day_type
    ),
    usage_by_type AS (
        SELECT
            csu.consumable_id,
            sc2.day_type,
            SUM(csu.usage_amount * sc2.service_count) AS total_used
        FROM consumable_service_usage csu
        JOIN service_counts sc2 ON sc2.service_id = csu.service_id
        GROUP BY csu.consumable_id, sc2.day_type
    ),
    -- Count actual weekdays and weekend days in the window
    day_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE EXTRACT(DOW FROM d)::INT NOT IN (0, 6)) AS weekday_count,
            COUNT(*) FILTER (WHERE EXTRACT(DOW FROM d)::INT IN (0, 6)) AS weekend_count
        FROM generate_series(
            CURRENT_DATE - p_days,
            CURRENT_DATE - 1,
            '1 day'::INTERVAL
        ) AS d
    ),
    consumption_rates AS (
        SELECT
            sc.id AS cid,
            COALESCE(SUM(ubt.total_used) FILTER (WHERE ubt.day_type = 'weekday'), 0) AS weekday_total,
            COALESCE(SUM(ubt.total_used) FILTER (WHERE ubt.day_type = 'weekend'), 0) AS weekend_total,
            COALESCE(SUM(ubt.total_used), 0) AS grand_total
        FROM salon_consumables sc
        LEFT JOIN usage_by_type ubt ON ubt.consumable_id = sc.id
        WHERE sc.salon_id = p_salon_id
          AND sc.active = TRUE
        GROUP BY sc.id
    )
    SELECT
        sc.id AS consumable_id,
        sc.name,
        sc.brand,
        sc.category,
        sc.unit,
        sc.current_stock,
        sc.min_stock_threshold,
        -- Overall daily rate
        ROUND(COALESCE(cr.grand_total / NULLIF(p_days, 0), 0)::NUMERIC, 4) AS daily_usage_rate,
        -- Weekday daily rate
        ROUND(COALESCE(cr.weekday_total / NULLIF((SELECT weekday_count FROM day_counts), 0), 0)::NUMERIC, 4) AS weekday_daily_rate,
        -- Weekend daily rate
        ROUND(COALESCE(cr.weekend_total / NULLIF((SELECT weekend_count FROM day_counts), 0), 0)::NUMERIC, 4) AS weekend_daily_rate,
        -- Days until empty
        CASE
            WHEN cr.grand_total = 0 THEN NULL
            ELSE ROUND((sc.current_stock / (cr.grand_total / NULLIF(p_days, 0)))::NUMERIC, 1)
        END AS days_until_empty,
        -- Estimated empty date
        CASE
            WHEN cr.grand_total = 0 THEN NULL
            ELSE CURRENT_DATE + (sc.current_stock / (cr.grand_total / NULLIF(p_days, 0)))::INT
        END AS estimated_empty_date,
        -- Suggested reorder date (empty date minus lead time)
        CASE
            WHEN cr.grand_total = 0 THEN NULL
            ELSE CURRENT_DATE + (sc.current_stock / (cr.grand_total / NULLIF(p_days, 0)))::INT - p_lead_time_days
        END AS suggested_reorder_date,
        -- Total appointments analyzed
        (SELECT cnt FROM total_appt_count) AS total_appointments,
        -- Low stock flag
        sc.current_stock <= sc.min_stock_threshold AS is_low_stock
    FROM salon_consumables sc
    JOIN consumption_rates cr ON cr.cid = sc.id
    WHERE sc.salon_id = p_salon_id
      AND sc.active = TRUE
    ORDER BY
        sc.current_stock <= sc.min_stock_threshold DESC,
        CASE
            WHEN cr.grand_total = 0 THEN 999999
            ELSE sc.current_stock / (cr.grand_total / NULLIF(p_days, 0))
        END ASC;
$$;
