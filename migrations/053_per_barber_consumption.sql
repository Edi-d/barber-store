-- ============================================
-- Migration 053: Per-Barber Consumption Analytics
-- ============================================
-- Two functions that break down consumable usage and cost
-- per barber, enabling salon owners to identify outliers
-- and optimise product allocation.
-- ============================================

-- ============================================
-- 1. get_barber_consumption_stats
--    Returns per-barber, per-consumable usage with
--    deviation from the salon-wide average.
-- ============================================
DROP FUNCTION IF EXISTS get_barber_consumption_stats(UUID, INT);

CREATE OR REPLACE FUNCTION get_barber_consumption_stats(
    p_salon_id UUID,
    p_days    INT DEFAULT 30
)
RETURNS TABLE (
    barber_id               UUID,
    barber_name             TEXT,
    consumable_id           UUID,
    consumable_name         TEXT,
    consumable_unit         TEXT,
    total_usage             NUMERIC,
    appointment_count       BIGINT,
    avg_usage_per_appointment NUMERIC,
    deviation_from_mean     NUMERIC   -- percentage: +20 means 20 % above average
)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
    WITH completed AS (
        -- All completed appointments for this salon in the period
        SELECT a.id AS appointment_id,
               a.barber_id
        FROM   appointments a
        JOIN   barbers b ON b.id = a.barber_id
        WHERE  b.salon_id    = p_salon_id
          AND  a.status       = 'completed'
          AND  a.scheduled_at::DATE >= CURRENT_DATE - p_days
    ),

    -- Per-barber, per-consumable aggregates
    barber_usage AS (
        SELECT c.barber_id,
               csu.consumable_id,
               SUM(csu.usage_amount)            AS total_usage,
               COUNT(DISTINCT c.appointment_id) AS appointment_count
        FROM   completed c
        JOIN   appointment_services aps ON aps.appointment_id = c.appointment_id
        JOIN   consumable_service_usage csu ON csu.service_id = aps.service_id
        GROUP  BY c.barber_id, csu.consumable_id
    ),

    -- Salon-wide average usage per appointment for each consumable
    salon_avg AS (
        SELECT csu.consumable_id,
               SUM(csu.usage_amount)::NUMERIC
                   / NULLIF(COUNT(DISTINCT c.appointment_id), 0) AS avg_per_appt
        FROM   completed c
        JOIN   appointment_services aps ON aps.appointment_id = c.appointment_id
        JOIN   consumable_service_usage csu ON csu.service_id = aps.service_id
        GROUP  BY csu.consumable_id
    )

    SELECT bu.barber_id,
           b.name                                             AS barber_name,
           bu.consumable_id,
           sc.name                                            AS consumable_name,
           sc.unit                                            AS consumable_unit,
           ROUND(bu.total_usage, 2)                           AS total_usage,
           bu.appointment_count,
           ROUND(bu.total_usage / NULLIF(bu.appointment_count, 0), 4)
                                                              AS avg_usage_per_appointment,
           -- Deviation: ((barber_avg / salon_avg) - 1) * 100
           ROUND(
               (
                   (bu.total_usage / NULLIF(bu.appointment_count, 0))
                   / NULLIF(sa.avg_per_appt, 0)
                   - 1
               ) * 100,
               2
           )                                                  AS deviation_from_mean
    FROM   barber_usage bu
    JOIN   barbers            b  ON b.id  = bu.barber_id
    JOIN   salon_consumables  sc ON sc.id = bu.consumable_id
    LEFT JOIN salon_avg       sa ON sa.consumable_id = bu.consumable_id
    WHERE  sc.active = TRUE
    ORDER  BY b.name, sc.name;
$$;

COMMENT ON FUNCTION get_barber_consumption_stats(UUID, INT) IS
    'Returns per-barber, per-consumable usage over the last p_days with '
    'deviation from the salon-wide mean, helping owners spot over-/under-use.';


-- ============================================
-- 2. get_barber_cost_breakdown
--    Returns total consumable cost per barber,
--    sorted highest-cost first.
-- ============================================
DROP FUNCTION IF EXISTS get_barber_cost_breakdown(UUID, INT);

CREATE OR REPLACE FUNCTION get_barber_cost_breakdown(
    p_salon_id UUID,
    p_days    INT DEFAULT 30
)
RETURNS TABLE (
    barber_id                UUID,
    barber_name              TEXT,
    total_cost_cents         NUMERIC,
    appointment_count        BIGINT,
    cost_per_appointment_cents NUMERIC
)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
    WITH completed AS (
        SELECT a.id AS appointment_id,
               a.barber_id
        FROM   appointments a
        JOIN   barbers b ON b.id = a.barber_id
        WHERE  b.salon_id    = p_salon_id
          AND  a.status       = 'completed'
          AND  a.scheduled_at::DATE >= CURRENT_DATE - p_days
    ),

    barber_costs AS (
        SELECT c.barber_id,
               SUM(csu.usage_amount * COALESCE(sc.unit_cost_cents, 0))
                                                AS total_cost,
               COUNT(DISTINCT c.appointment_id) AS appointment_count
        FROM   completed c
        JOIN   appointment_services aps ON aps.appointment_id = c.appointment_id
        JOIN   consumable_service_usage csu ON csu.service_id = aps.service_id
        JOIN   salon_consumables sc ON sc.id = csu.consumable_id
                                    AND sc.active = TRUE
        GROUP  BY c.barber_id
    )

    SELECT bc.barber_id,
           b.name                                              AS barber_name,
           ROUND(bc.total_cost, 0)                             AS total_cost_cents,
           bc.appointment_count,
           ROUND(bc.total_cost / NULLIF(bc.appointment_count, 0), 2)
                                                               AS cost_per_appointment_cents
    FROM   barber_costs bc
    JOIN   barbers b ON b.id = bc.barber_id
    ORDER  BY bc.total_cost DESC;
$$;

COMMENT ON FUNCTION get_barber_cost_breakdown(UUID, INT) IS
    'Returns total consumable cost per barber over the last p_days, '
    'sorted highest-cost first, for salon cost-attribution dashboards.';
