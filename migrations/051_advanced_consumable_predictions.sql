-- ============================================
-- Migration 051: Advanced consumable predictions with EWMA + trend
-- Replaces get_consumable_predictions with a statistically robust version:
--   1. Per-day time series from completed appointments
--   2. EWMA (alpha=0.94, ~11-day half-life) for recency-weighted rate
--   3. Least-squares linear trend (slope capped at 2% of EWMA/day)
--   4. Dynamic safety stock via Z-score * stddev * sqrt(lead_time)
--   5. Confidence scoring based on data availability
--   6. Cold-start fallbacks: usage_per_service -> category average -> no_data
-- Backward compatible: all original columns preserved, new columns appended
-- ============================================

-- Performance index for the daily time-series query
CREATE INDEX IF NOT EXISTS idx_appointments_salon_status_date
    ON appointments(barber_id, status, scheduled_at)
    WHERE status = 'completed';

-- Drop all previous overloads
DROP FUNCTION IF EXISTS get_consumable_predictions(UUID, INT);
DROP FUNCTION IF EXISTS get_consumable_predictions(UUID, INT, INT);
DROP FUNCTION IF EXISTS get_consumable_predictions(UUID, INT, INT, NUMERIC);

CREATE OR REPLACE FUNCTION get_consumable_predictions(
    p_salon_id       UUID,
    p_days           INT     DEFAULT 60,
    p_lead_time_days INT     DEFAULT 3,
    p_service_level  NUMERIC DEFAULT 0.95
)
RETURNS TABLE (
    -- Original columns (backward compatible)
    consumable_id          UUID,
    name                   TEXT,
    brand                  TEXT,
    category               TEXT,
    unit                   TEXT,
    current_stock          NUMERIC,
    min_stock_threshold    NUMERIC,
    daily_usage_rate       NUMERIC,
    weekday_daily_rate     NUMERIC,
    weekend_daily_rate     NUMERIC,
    days_until_empty       NUMERIC,
    estimated_empty_date   DATE,
    suggested_reorder_date DATE,
    total_appointments     BIGINT,
    is_low_stock           BOOLEAN,
    -- New columns
    ewma_daily_rate        NUMERIC,
    trend_per_day          NUMERIC,
    usage_stddev           NUMERIC,
    coeff_of_variation     NUMERIC,
    confidence             NUMERIC,
    safety_stock           NUMERIC,
    reorder_point          NUMERIC,
    forecast_method        TEXT,
    suggested_order_quantity NUMERIC
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_alpha        NUMERIC := 0.94;
    v_z_score      NUMERIC;
    v_window_start DATE    := CURRENT_DATE - p_days;
    v_window_end   DATE    := CURRENT_DATE - 1;
BEGIN
    -- Map service_level to Z-score (one-tailed normal quantiles)
    v_z_score := CASE
        WHEN p_service_level >= 0.99  THEN 2.326
        WHEN p_service_level >= 0.975 THEN 1.960
        WHEN p_service_level >= 0.95  THEN 1.645
        WHEN p_service_level >= 0.90  THEN 1.282
        WHEN p_service_level >= 0.85  THEN 1.036
        WHEN p_service_level >= 0.80  THEN 0.842
        ELSE 0.675
    END;

    RETURN QUERY
    WITH
    -- -----------------------------------------------
    -- 1. Calendar of every day in the analysis window
    -- -----------------------------------------------
    calendar AS (
        SELECT d::DATE AS day_date,
               (d::DATE - v_window_start) AS day_index,  -- 0-based for regression
               CASE WHEN EXTRACT(DOW FROM d)::INT IN (0, 6) THEN 'weekend' ELSE 'weekday' END AS day_type
        FROM generate_series(v_window_start, v_window_end, '1 day'::INTERVAL) AS d
    ),

    day_type_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE day_type = 'weekday') AS weekday_count,
            COUNT(*) FILTER (WHERE day_type = 'weekend') AS weekend_count,
            COUNT(*) AS total_days
        FROM calendar
    ),

    -- -----------------------------------------------
    -- 2. All salon barbers (for joining appointments)
    -- -----------------------------------------------
    salon_barbers AS (
        SELECT id FROM barbers WHERE salon_id = p_salon_id
    ),

    -- -----------------------------------------------
    -- 3. Completed appointments in window with date
    -- -----------------------------------------------
    completed_appts AS (
        SELECT
            a.id,
            a.scheduled_at::DATE AS appt_date
        FROM appointments a
        WHERE a.barber_id IN (SELECT id FROM salon_barbers)
          AND a.status = 'completed'
          AND a.scheduled_at::DATE >= v_window_start
          AND a.scheduled_at::DATE <= v_window_end
    ),

    total_appt_count AS (
        SELECT COUNT(*) AS cnt FROM completed_appts
    ),

    -- -----------------------------------------------
    -- 4. Per-consumable per-day usage from appointments
    -- -----------------------------------------------
    daily_consumption AS (
        SELECT
            csu.consumable_id,
            sub.appt_date AS day_date,
            SUM(csu.usage_amount * sub.svc_count) AS daily_used
        FROM consumable_service_usage csu
        JOIN (
            SELECT aps.service_id, ca2.appt_date, COUNT(*) AS svc_count
            FROM appointment_services aps
            JOIN completed_appts ca2 ON ca2.id = aps.appointment_id
            GROUP BY aps.service_id, ca2.appt_date
        ) sub ON sub.service_id = csu.service_id
        GROUP BY csu.consumable_id, sub.appt_date
    ),

    -- -----------------------------------------------
    -- 5. Cross join: every consumable x every calendar day
    --    Fill zeros for days with no usage
    -- -----------------------------------------------
    full_series AS (
        SELECT
            sc.id AS consumable_id,
            cal.day_date,
            cal.day_index,
            cal.day_type,
            COALESCE(dc.daily_used, 0) AS daily_used
        FROM salon_consumables sc
        CROSS JOIN calendar cal
        LEFT JOIN daily_consumption dc
            ON dc.consumable_id = sc.id AND dc.day_date = cal.day_date
        WHERE sc.salon_id = p_salon_id AND sc.active = TRUE
    ),

    -- -----------------------------------------------
    -- 6. Count days with actual usage per consumable
    -- -----------------------------------------------
    data_quality AS (
        SELECT
            fs.consumable_id,
            COUNT(*) FILTER (WHERE fs.daily_used > 0) AS days_with_usage,
            COUNT(*) AS total_series_days,
            SUM(fs.daily_used) AS total_used
        FROM full_series fs
        GROUP BY fs.consumable_id
    ),

    -- -----------------------------------------------
    -- 7. EWMA calculation via recursive-like ordered aggregation
    --    alpha=0.94 means new observation gets 94% weight
    --    Uses the standard iterative formula via window function trick:
    --    EWMA_t = alpha * x_t + (1 - alpha) * EWMA_{t-1}
    --    Implemented as weighted sum: sum( alpha * (1-alpha)^(N-1-i) * x_i )
    -- -----------------------------------------------
    ewma_calc AS (
        SELECT
            fs.consumable_id,
            -- EWMA: weight each day by alpha * (1-alpha)^(days_from_end)
            -- days_from_end = max(day_index) - day_index for this consumable
            SUM(
                fs.daily_used * v_alpha * POWER(1.0 - v_alpha, max_idx.max_di - fs.day_index)
            ) / NULLIF(
                SUM(v_alpha * POWER(1.0 - v_alpha, max_idx.max_di - fs.day_index)),
                0
            ) AS ewma_rate
        FROM full_series fs
        JOIN (
            SELECT fs2.consumable_id, MAX(fs2.day_index) AS max_di
            FROM full_series fs2
            GROUP BY fs2.consumable_id
        ) max_idx ON max_idx.consumable_id = fs.consumable_id
        GROUP BY fs.consumable_id
    ),

    -- -----------------------------------------------
    -- 8. Linear trend via least-squares regression
    --    slope = (n*sum(x*y) - sum(x)*sum(y)) / (n*sum(x^2) - sum(x)^2)
    -- -----------------------------------------------
    trend_calc AS (
        SELECT
            fs.consumable_id,
            CASE
                WHEN dq.days_with_usage >= 7
                    AND ((COUNT(*)::NUMERIC * SUM(fs.day_index::NUMERIC * fs.daily_used)
                         - SUM(fs.day_index::NUMERIC) * SUM(fs.daily_used))
                        / NULLIF(COUNT(*)::NUMERIC * SUM(fs.day_index::NUMERIC * fs.day_index::NUMERIC)
                                 - POWER(SUM(fs.day_index::NUMERIC), 2), 0)) IS NOT NULL
                THEN
                    (COUNT(*)::NUMERIC * SUM(fs.day_index::NUMERIC * fs.daily_used)
                     - SUM(fs.day_index::NUMERIC) * SUM(fs.daily_used))
                    / NULLIF(COUNT(*)::NUMERIC * SUM(fs.day_index::NUMERIC * fs.day_index::NUMERIC)
                             - POWER(SUM(fs.day_index::NUMERIC), 2), 0)
                ELSE 0
            END AS raw_slope
        FROM full_series fs
        JOIN data_quality dq ON dq.consumable_id = fs.consumable_id
        GROUP BY fs.consumable_id, dq.days_with_usage
    ),

    -- -----------------------------------------------
    -- 9. Stddev of daily usage
    -- -----------------------------------------------
    stddev_calc AS (
        SELECT
            fs.consumable_id,
            COALESCE(STDDEV_SAMP(fs.daily_used), 0) AS usage_std
        FROM full_series fs
        GROUP BY fs.consumable_id
    ),

    -- -----------------------------------------------
    -- 10. Weekday / weekend split rates
    -- -----------------------------------------------
    day_type_usage AS (
        SELECT
            fs.consumable_id,
            SUM(fs.daily_used) FILTER (WHERE fs.day_type = 'weekday') AS weekday_total,
            SUM(fs.daily_used) FILTER (WHERE fs.day_type = 'weekend') AS weekend_total
        FROM full_series fs
        GROUP BY fs.consumable_id
    ),

    -- -----------------------------------------------
    -- 11. Category averages for cold-start fallback
    -- -----------------------------------------------
    category_averages AS (
        SELECT
            sc.category,
            AVG(CASE WHEN dq.total_series_days > 0 THEN dq.total_used / dq.total_series_days ELSE 0 END) AS cat_avg_rate
        FROM salon_consumables sc
        JOIN data_quality dq ON dq.consumable_id = sc.id
        WHERE sc.salon_id = p_salon_id
          AND sc.active = TRUE
          AND dq.days_with_usage >= 7  -- only include items with real data
        GROUP BY sc.category
    ),

    -- -----------------------------------------------
    -- 12. Assemble all metrics per consumable
    -- -----------------------------------------------
    assembled AS (
        SELECT
            sc.id AS cid,
            sc.name,
            sc.brand,
            sc.category,
            sc.unit,
            sc.current_stock,
            sc.min_stock_threshold,
            sc.usage_per_service,

            dq.days_with_usage,
            dq.total_series_days,
            dq.total_used,

            -- Simple average
            CASE WHEN dq.total_series_days > 0
                THEN dq.total_used / dq.total_series_days
                ELSE 0
            END AS simple_avg_rate,

            COALESCE(ec.ewma_rate, 0) AS ewma_rate,

            -- Capped slope: |slope| <= 0.02 * ewma_rate
            CASE
                WHEN dq.days_with_usage < 7 THEN 0
                WHEN ec.ewma_rate > 0 THEN
                    GREATEST(-0.02 * ec.ewma_rate,
                        LEAST(0.02 * ec.ewma_rate, tc.raw_slope))
                ELSE 0
            END AS capped_slope,

            sc2.usage_std,

            dtu.weekday_total,
            dtu.weekend_total,

            COALESCE(ca.cat_avg_rate, 0) AS cat_avg_rate

        FROM salon_consumables sc
        JOIN data_quality dq ON dq.consumable_id = sc.id
        LEFT JOIN ewma_calc ec ON ec.consumable_id = sc.id
        LEFT JOIN trend_calc tc ON tc.consumable_id = sc.id
        LEFT JOIN stddev_calc sc2 ON sc2.consumable_id = sc.id
        LEFT JOIN day_type_usage dtu ON dtu.consumable_id = sc.id
        LEFT JOIN category_averages ca ON ca.category = sc.category
        WHERE sc.salon_id = p_salon_id AND sc.active = TRUE
    ),

    -- -----------------------------------------------
    -- 13. Final calculations
    -- -----------------------------------------------
    final AS (
        SELECT
            a.*,

            -- Forecast method selection
            CASE
                WHEN a.days_with_usage >= 14 AND a.capped_slope <> 0 THEN 'ewma_trend'
                WHEN a.days_with_usage >= 7  THEN 'ewma_only'
                WHEN a.days_with_usage >= 1  THEN 'simple_average'
                WHEN a.usage_per_service IS NOT NULL AND a.usage_per_service > 0 THEN 'usage_per_service'
                WHEN a.cat_avg_rate > 0      THEN 'category_average'
                ELSE 'no_data'
            END AS f_method,

            -- Effective daily rate
            CASE
                WHEN a.days_with_usage >= 14 AND a.capped_slope <> 0
                    THEN GREATEST(a.ewma_rate + a.capped_slope * (a.total_series_days * 0.5), 0)
                WHEN a.days_with_usage >= 7
                    THEN a.ewma_rate
                WHEN a.days_with_usage >= 1
                    THEN a.simple_avg_rate
                WHEN a.usage_per_service IS NOT NULL AND a.usage_per_service > 0
                    THEN a.usage_per_service * 0.5  -- conservative: assume ~0.5 services/day as baseline
                WHEN a.cat_avg_rate > 0
                    THEN a.cat_avg_rate
                ELSE 0
            END AS eff_rate,

            -- Confidence score
            CASE
                WHEN a.days_with_usage >= 30 THEN 0.85 + LEAST(0.10, (a.days_with_usage - 30.0) / 200.0)
                WHEN a.days_with_usage >= 14 THEN 0.65 + (a.days_with_usage - 14.0) / 16.0 * 0.20
                WHEN a.days_with_usage >= 7  THEN 0.40 + (a.days_with_usage - 7.0)  / 7.0  * 0.25
                WHEN a.days_with_usage >= 1  THEN 0.15 + (a.days_with_usage - 1.0)  / 6.0  * 0.25
                WHEN a.usage_per_service IS NOT NULL AND a.usage_per_service > 0 THEN 0.10
                WHEN a.cat_avg_rate > 0 THEN 0.05
                ELSE 0.00
            END AS f_confidence,

            -- Coefficient of variation
            CASE
                WHEN a.simple_avg_rate > 0 THEN a.usage_std / a.simple_avg_rate
                ELSE 0
            END AS cv

        FROM assembled a
    )

    SELECT
        f.cid                    AS consumable_id,
        f.name,
        f.brand,
        f.category,
        f.unit,
        f.current_stock,
        f.min_stock_threshold,

        -- daily_usage_rate (backward compat: overall simple average)
        ROUND(f.simple_avg_rate, 4)                          AS daily_usage_rate,

        -- weekday / weekend rates
        ROUND(COALESCE(f.weekday_total / NULLIF(dtc.weekday_count, 0), 0)::NUMERIC, 4) AS weekday_daily_rate,
        ROUND(COALESCE(f.weekend_total / NULLIF(dtc.weekend_count, 0), 0)::NUMERIC, 4) AS weekend_daily_rate,

        -- days_until_empty (uses effective rate now)
        CASE WHEN f.eff_rate > 0
            THEN ROUND((f.current_stock / f.eff_rate)::NUMERIC, 1)
            ELSE NULL
        END                                                  AS days_until_empty,

        -- estimated_empty_date
        CASE WHEN f.eff_rate > 0
            THEN CURRENT_DATE + (f.current_stock / f.eff_rate)::INT
            ELSE NULL
        END                                                  AS estimated_empty_date,

        -- suggested_reorder_date
        CASE WHEN f.eff_rate > 0
            THEN CURRENT_DATE + GREATEST((f.current_stock / f.eff_rate)::INT - p_lead_time_days, 0)
            ELSE NULL
        END                                                  AS suggested_reorder_date,

        -- total_appointments
        (SELECT cnt FROM total_appt_count)                   AS total_appointments,

        -- is_low_stock
        f.current_stock <= f.min_stock_threshold             AS is_low_stock,

        -- === New columns ===
        ROUND(f.ewma_rate, 4)                                AS ewma_daily_rate,
        ROUND(f.capped_slope, 6)                             AS trend_per_day,
        ROUND(f.usage_std, 4)                                AS usage_stddev,
        ROUND(f.cv, 4)                                       AS coeff_of_variation,
        ROUND(f.f_confidence, 2)                             AS confidence,

        -- safety_stock = Z * stddev * sqrt(lead_time), floored at min_stock_threshold
        ROUND(GREATEST(
            v_z_score * f.usage_std * SQRT(p_lead_time_days::NUMERIC),
            f.min_stock_threshold
        ), 2)                                                AS safety_stock,

        -- reorder_point = (effective_rate * lead_time) + safety_stock
        ROUND(
            f.eff_rate * p_lead_time_days
            + GREATEST(
                v_z_score * f.usage_std * SQRT(p_lead_time_days::NUMERIC),
                f.min_stock_threshold
            ), 2
        )                                                    AS reorder_point,

        f.f_method                                           AS forecast_method,

        -- suggested_order_quantity: enough to cover lead_time + 30 days, minus current stock, plus safety
        ROUND(GREATEST(
            f.eff_rate * (p_lead_time_days + 30)
            + GREATEST(
                v_z_score * f.usage_std * SQRT(p_lead_time_days::NUMERIC),
                f.min_stock_threshold
            )
            - f.current_stock,
            0
        ), 2)                                                AS suggested_order_quantity

    FROM final f
    CROSS JOIN day_type_counts dtc
    ORDER BY
        f.current_stock <= f.min_stock_threshold DESC,
        CASE WHEN f.eff_rate > 0
            THEN f.current_stock / f.eff_rate
            ELSE 999999
        END ASC;
END;
$$;
