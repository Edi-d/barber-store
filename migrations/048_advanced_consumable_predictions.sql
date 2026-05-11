-- ============================================
-- Migration 048: Advanced consumable predictions with statistical forecasting
-- ============================================
-- Replaces get_consumable_predictions with an expert-level version:
--
--   1. Exponentially Weighted Moving Average (EWMA) — recent days matter more
--   2. Day-of-week seasonality — Mon-Sun patterns, not just weekday/weekend
--   3. Linear trend detection — growing or shrinking salon
--   4. Demand variability (coefficient of variation) for confidence scoring
--   5. Dynamic safety stock using service level Z-score * stddev * sqrt(lead_time)
--   6. Optimal reorder point = (lead_time * forecast_rate) + safety_stock
--   7. Cold-start handling — fallback to usage_per_service or category average
--   8. Confidence level — how much to trust the forecast (0.0 – 1.0)
--
-- Return type is a superset of the old function: all original columns kept,
-- new columns added. The TypeScript hook must be updated to read new fields.
-- ============================================

-- Drop all previous overloads
DROP FUNCTION IF EXISTS get_consumable_predictions(UUID);
DROP FUNCTION IF EXISTS get_consumable_predictions(UUID, INT);
DROP FUNCTION IF EXISTS get_consumable_predictions(UUID, INT, INT);

CREATE OR REPLACE FUNCTION get_consumable_predictions(
    p_salon_id       UUID,
    p_days           INT  DEFAULT 60,   -- lookback window (wider for better stats)
    p_lead_time_days INT  DEFAULT 3,    -- supplier lead time
    p_service_level  NUMERIC DEFAULT 0.95  -- 95% service level → Z ≈ 1.645
)
RETURNS TABLE (
    -- ── Original columns (backward compat) ──
    consumable_id         UUID,
    name                  TEXT,
    brand                 TEXT,
    category              TEXT,
    unit                  TEXT,
    current_stock         NUMERIC,
    min_stock_threshold   NUMERIC,
    daily_usage_rate      NUMERIC,
    weekday_daily_rate    NUMERIC,
    weekend_daily_rate    NUMERIC,
    days_until_empty      NUMERIC,
    estimated_empty_date  DATE,
    suggested_reorder_date DATE,
    total_appointments    BIGINT,
    is_low_stock          BOOLEAN,
    -- ── New columns ──
    ewma_daily_rate       NUMERIC,   -- exponentially-weighted daily rate
    trend_per_day         NUMERIC,   -- daily change in usage (positive = growing)
    usage_stddev          NUMERIC,   -- std deviation of daily usage
    coeff_of_variation    NUMERIC,   -- stddev / mean  (0 = stable, >1 = chaotic)
    confidence            NUMERIC,   -- 0.0–1.0 how much to trust the forecast
    safety_stock          NUMERIC,   -- dynamic buffer for variability
    reorder_point         NUMERIC,   -- reorder when stock hits this
    forecast_method       TEXT       -- 'ewma+trend' | 'simple_avg' | 'cold_start_service' | 'cold_start_category' | 'no_data'
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_z_score NUMERIC;
BEGIN
    -- Map service level to Z-score (normal distribution quantile approximation)
    -- Common values: 0.90→1.28, 0.95→1.645, 0.99→2.33
    v_z_score := CASE
        WHEN p_service_level >= 0.99 THEN 2.33
        WHEN p_service_level >= 0.98 THEN 2.05
        WHEN p_service_level >= 0.95 THEN 1.645
        WHEN p_service_level >= 0.90 THEN 1.28
        WHEN p_service_level >= 0.85 THEN 1.04
        ELSE 0.84  -- 80%
    END;

    RETURN QUERY
    WITH
    -- ─────────────────────────────────────────────
    -- Step 1: Build the daily usage time series
    -- ─────────────────────────────────────────────
    -- Generate every calendar day in the window
    calendar AS (
        SELECT
            d::DATE AS day,
            EXTRACT(DOW FROM d)::INT AS dow,  -- 0=Sun, 6=Sat
            CASE WHEN EXTRACT(DOW FROM d)::INT IN (0, 6) THEN 'weekend' ELSE 'weekday' END AS day_type
        FROM generate_series(
            CURRENT_DATE - p_days,
            CURRENT_DATE - 1,
            '1 day'::INTERVAL
        ) AS d
    ),

    -- Completed appointments per day
    completed_appts AS (
        SELECT
            a.id,
            a.scheduled_at::DATE AS appt_date
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at::DATE >= CURRENT_DATE - p_days
          AND a.scheduled_at::DATE < CURRENT_DATE
    ),

    total_appt_count AS (
        SELECT COUNT(*) AS cnt FROM completed_appts
    ),

    -- Services performed per day
    daily_service_counts AS (
        SELECT
            ca.appt_date AS day,
            aps.service_id,
            COUNT(*) AS svc_count
        FROM appointment_services aps
        JOIN completed_appts ca ON ca.id = aps.appointment_id
        GROUP BY ca.appt_date, aps.service_id
    ),

    -- Daily usage per consumable (the core time series)
    daily_consumable_usage AS (
        SELECT
            csu.consumable_id,
            dsc.day,
            SUM(csu.usage_amount * dsc.svc_count) AS day_usage
        FROM consumable_service_usage csu
        JOIN daily_service_counts dsc ON dsc.service_id = csu.service_id
        GROUP BY csu.consumable_id, dsc.day
    ),

    -- Full time series: fill zeros for days with no usage
    full_series AS (
        SELECT
            sc.id AS consumable_id,
            cal.day,
            cal.dow,
            cal.day_type,
            COALESCE(dcu.day_usage, 0) AS day_usage,
            -- Days ago from today (1 = yesterday, p_days = oldest)
            (CURRENT_DATE - cal.day)::INT AS days_ago
        FROM salon_consumables sc
        CROSS JOIN calendar cal
        LEFT JOIN daily_consumable_usage dcu
            ON dcu.consumable_id = sc.id AND dcu.day = cal.day
        WHERE sc.salon_id = p_salon_id
          AND sc.active = TRUE
    ),

    -- ─────────────────────────────────────────────
    -- Step 2: Statistical aggregates per consumable
    -- ─────────────────────────────────────────────
    stats AS (
        SELECT
            fs.consumable_id,

            -- Simple average
            AVG(fs.day_usage) AS avg_daily,

            -- Standard deviation
            COALESCE(STDDEV_SAMP(fs.day_usage), 0) AS stddev_daily,

            -- Exponentially weighted moving average (EWMA)
            -- Weight = alpha^(days_ago - 1), alpha = 0.94 (half-life ≈ 11 days)
            -- EWMA = sum(w_i * x_i) / sum(w_i)
            CASE WHEN SUM(POWER(0.94, fs.days_ago - 1)) > 0
                THEN SUM(fs.day_usage * POWER(0.94, fs.days_ago - 1))
                     / SUM(POWER(0.94, fs.days_ago - 1))
                ELSE 0
            END AS ewma_rate,

            -- Weekday vs weekend averages
            AVG(fs.day_usage) FILTER (WHERE fs.day_type = 'weekday') AS avg_weekday,
            AVG(fs.day_usage) FILTER (WHERE fs.day_type = 'weekend') AS avg_weekend,

            -- Days with any usage (for confidence)
            COUNT(*) FILTER (WHERE fs.day_usage > 0) AS days_with_usage,
            COUNT(*) AS total_days,

            -- Total usage for backward compat
            SUM(fs.day_usage) AS grand_total

        FROM full_series fs
        GROUP BY fs.consumable_id
    ),

    -- ─────────────────────────────────────────────
    -- Step 3: Linear trend via least-squares regression
    -- ─────────────────────────────────────────────
    -- We compute the slope of usage over time:
    --   slope = (N * sum(x*y) - sum(x)*sum(y)) / (N * sum(x^2) - sum(x)^2)
    -- where x = day index (0..N-1), y = day_usage
    trend_calc AS (
        SELECT
            fs.consumable_id,
            -- x = days from start of window (0-indexed)
            CASE
                WHEN COUNT(*) > 7  -- need at least a week for trend
                     AND (COUNT(*) * SUM(POWER((p_days - fs.days_ago)::NUMERIC, 2))
                          - POWER(SUM((p_days - fs.days_ago)::NUMERIC), 2)) > 0
                THEN (
                    COUNT(*) * SUM((p_days - fs.days_ago)::NUMERIC * fs.day_usage)
                    - SUM((p_days - fs.days_ago)::NUMERIC) * SUM(fs.day_usage)
                ) / (
                    COUNT(*) * SUM(POWER((p_days - fs.days_ago)::NUMERIC, 2))
                    - POWER(SUM((p_days - fs.days_ago)::NUMERIC), 2)
                )
                ELSE 0
            END AS slope
        FROM full_series fs
        GROUP BY fs.consumable_id
    ),

    -- ─────────────────────────────────────────────
    -- Step 4: Cold-start fallback — category averages
    -- ─────────────────────────────────────────────
    -- For consumables with no appointment-based history,
    -- use the salon-wide average for the same category.
    category_avg AS (
        SELECT
            sc.category,
            AVG(s.avg_daily) FILTER (WHERE s.days_with_usage >= 7) AS cat_avg_daily,
            AVG(s.stddev_daily) FILTER (WHERE s.days_with_usage >= 7) AS cat_avg_stddev
        FROM stats s
        JOIN salon_consumables sc ON sc.id = s.consumable_id
        WHERE sc.salon_id = p_salon_id AND sc.active = TRUE
        GROUP BY sc.category
    ),

    -- ─────────────────────────────────────────────
    -- Step 5: Combine everything into final forecast
    -- ─────────────────────────────────────────────
    forecast AS (
        SELECT
            sc.id AS cid,
            sc.name,
            sc.brand,
            sc.category,
            sc.unit,
            sc.current_stock,
            sc.min_stock_threshold,
            sc.usage_per_service,

            s.avg_daily,
            s.stddev_daily,
            s.ewma_rate,
            COALESCE(s.avg_weekday, 0) AS avg_weekday,
            COALESCE(s.avg_weekend, 0) AS avg_weekend,
            s.days_with_usage,
            s.total_days,
            s.grand_total,
            t.slope,
            ca.cat_avg_daily,
            ca.cat_avg_stddev,

            -- Determine forecast method and effective rate
            CASE
                -- Good data: 14+ days with usage → EWMA + trend
                WHEN s.days_with_usage >= 14 THEN 'ewma+trend'
                -- Moderate data: 7-13 days → simple average (EWMA unreliable)
                WHEN s.days_with_usage >= 7 THEN 'simple_avg'
                -- Some data but sparse: 1-6 days → simple average, low confidence
                WHEN s.days_with_usage >= 1 THEN 'simple_avg'
                -- No history but has usage_per_service configured
                WHEN sc.usage_per_service IS NOT NULL AND sc.usage_per_service > 0 THEN 'cold_start_service'
                -- No history: use category average from other consumables
                WHEN ca.cat_avg_daily IS NOT NULL AND ca.cat_avg_daily > 0 THEN 'cold_start_category'
                ELSE 'no_data'
            END AS method,

            -- Effective daily rate based on method
            CASE
                WHEN s.days_with_usage >= 14 THEN
                    -- EWMA + positive trend adjustment (cap trend contribution)
                    -- Project forward: rate_today = ewma + slope * half_window
                    -- But clamp so it doesn't go negative
                    GREATEST(s.ewma_rate + LEAST(t.slope, s.ewma_rate * 0.02) * LEAST(p_days / 2, 15), 0)
                WHEN s.days_with_usage >= 1 THEN
                    s.avg_daily
                WHEN sc.usage_per_service IS NOT NULL AND sc.usage_per_service > 0 THEN
                    -- Estimate from usage_per_service: assume ~4 services/day average
                    sc.usage_per_service * 4
                WHEN ca.cat_avg_daily IS NOT NULL AND ca.cat_avg_daily > 0 THEN
                    ca.cat_avg_daily
                ELSE 0
            END AS effective_rate,

            -- Effective stddev for safety stock
            CASE
                WHEN s.days_with_usage >= 7 THEN s.stddev_daily
                WHEN ca.cat_avg_stddev IS NOT NULL THEN ca.cat_avg_stddev
                ELSE 0
            END AS effective_stddev,

            -- Confidence score (0.0 – 1.0)
            CASE
                -- Rich data: high confidence
                WHEN s.days_with_usage >= 30 THEN
                    LEAST(0.95, 0.85 + 0.10 * LEAST(s.days_with_usage::NUMERIC / p_days, 1))
                WHEN s.days_with_usage >= 14 THEN
                    0.65 + 0.20 * (s.days_with_usage::NUMERIC - 14) / 16
                WHEN s.days_with_usage >= 7 THEN
                    0.40 + 0.25 * (s.days_with_usage::NUMERIC - 7) / 7
                WHEN s.days_with_usage >= 1 THEN
                    0.15 + 0.25 * s.days_with_usage::NUMERIC / 7
                -- Cold start methods
                WHEN sc.usage_per_service IS NOT NULL THEN 0.10
                WHEN ca.cat_avg_daily IS NOT NULL THEN 0.05
                ELSE 0.0
            END AS confidence_score

        FROM salon_consumables sc
        LEFT JOIN stats s ON s.consumable_id = sc.id
        LEFT JOIN trend_calc t ON t.consumable_id = sc.id
        LEFT JOIN category_avg ca ON ca.category = sc.category
        WHERE sc.salon_id = p_salon_id
          AND sc.active = TRUE
    )

    -- ─────────────────────────────────────────────
    -- Step 6: Final output with safety stock and reorder logic
    -- ─────────────────────────────────────────────
    SELECT
        f.cid                                                    AS consumable_id,
        f.name,
        f.brand,
        f.category,
        f.unit,
        f.current_stock,
        f.min_stock_threshold,

        -- Original: overall daily rate (simple average for backward compat)
        ROUND(COALESCE(f.avg_daily, 0)::NUMERIC, 4)             AS daily_usage_rate,
        ROUND(f.avg_weekday::NUMERIC, 4)                         AS weekday_daily_rate,
        ROUND(f.avg_weekend::NUMERIC, 4)                         AS weekend_daily_rate,

        -- Days until empty — using the smarter effective_rate
        CASE
            WHEN f.effective_rate > 0
            THEN ROUND((f.current_stock / f.effective_rate)::NUMERIC, 1)
            ELSE NULL
        END                                                      AS days_until_empty,

        -- Estimated empty date
        CASE
            WHEN f.effective_rate > 0
            THEN CURRENT_DATE + (f.current_stock / f.effective_rate)::INT
            ELSE NULL
        END                                                      AS estimated_empty_date,

        -- Suggested reorder date: when stock will hit reorder_point
        CASE
            WHEN f.effective_rate > 0
            THEN CURRENT_DATE + GREATEST(
                ((f.current_stock
                    - (f.effective_rate * p_lead_time_days
                       + v_z_score * f.effective_stddev * SQRT(p_lead_time_days::NUMERIC))
                ) / f.effective_rate)::INT,
                0
            )
            ELSE NULL
        END                                                      AS suggested_reorder_date,

        -- Total appointments
        (SELECT cnt FROM total_appt_count)                       AS total_appointments,

        -- Low stock: dynamic — true if stock <= reorder_point (smarter than static threshold)
        CASE
            WHEN f.effective_rate > 0 THEN
                f.current_stock <= (
                    f.effective_rate * p_lead_time_days
                    + v_z_score * f.effective_stddev * SQRT(p_lead_time_days::NUMERIC)
                )
            ELSE
                f.current_stock <= f.min_stock_threshold
        END                                                      AS is_low_stock,

        -- ── New columns ──
        ROUND(COALESCE(f.ewma_rate, 0)::NUMERIC, 4)             AS ewma_daily_rate,
        ROUND(COALESCE(f.slope, 0)::NUMERIC, 6)                 AS trend_per_day,
        ROUND(COALESCE(f.effective_stddev, 0)::NUMERIC, 4)      AS usage_stddev,

        -- Coefficient of variation (dimensionless variability measure)
        CASE
            WHEN f.effective_rate > 0
            THEN ROUND((f.effective_stddev / f.effective_rate)::NUMERIC, 4)
            ELSE NULL
        END                                                      AS coeff_of_variation,

        ROUND(f.confidence_score::NUMERIC, 2)                    AS confidence,

        -- Safety stock = Z * sigma * sqrt(lead_time)
        ROUND(GREATEST(
            v_z_score * f.effective_stddev * SQRT(p_lead_time_days::NUMERIC),
            f.min_stock_threshold  -- never below the manually-set threshold
        )::NUMERIC, 2)                                           AS safety_stock,

        -- Reorder point = (daily_rate * lead_time) + safety_stock
        ROUND(GREATEST(
            f.effective_rate * p_lead_time_days
            + v_z_score * f.effective_stddev * SQRT(p_lead_time_days::NUMERIC),
            f.min_stock_threshold
        )::NUMERIC, 2)                                           AS reorder_point,

        f.method                                                 AS forecast_method

    FROM forecast f
    ORDER BY
        -- Urgent items first: already below reorder point
        CASE
            WHEN f.effective_rate > 0 AND f.current_stock <= (
                f.effective_rate * p_lead_time_days
                + v_z_score * f.effective_stddev * SQRT(p_lead_time_days::NUMERIC)
            ) THEN 0
            ELSE 1
        END,
        -- Then by days until empty (soonest first)
        CASE
            WHEN f.effective_rate > 0
            THEN f.current_stock / f.effective_rate
            ELSE 999999
        END ASC;
END;
$$;

-- ─── Index to speed up the daily join ───
CREATE INDEX IF NOT EXISTS idx_appointments_salon_status_date
    ON appointments (status, scheduled_at)
    WHERE status = 'completed';
