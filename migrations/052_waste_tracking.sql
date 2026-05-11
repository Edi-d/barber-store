-- ============================================
-- Migration 052: Waste / Loss Tracking
-- ============================================
-- Extends the consumable stock system with waste
-- reason codes, a logging RPC, and a summary function.
-- Idempotent: safe to re-run multiple times.
-- ============================================

-- ============================================
-- 1. Expand change_type CHECK constraint
-- ============================================
ALTER TABLE consumable_stock_logs DROP CONSTRAINT IF EXISTS chk_change_type_valid;
ALTER TABLE consumable_stock_logs DROP CONSTRAINT IF EXISTS chk_change_type;

ALTER TABLE consumable_stock_logs ADD CONSTRAINT chk_change_type
    CHECK (change_type IN (
        'restock', 'usage', 'adjustment', 'correction', 'initial', 'reversal',
        'waste_expired', 'waste_spill', 'waste_training', 'waste_other'
    ));

-- ============================================
-- 2. Index for waste-specific queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_consumable_stock_logs_waste
    ON consumable_stock_logs(consumable_id, created_at DESC)
    WHERE change_type LIKE 'waste_%';

-- ============================================
-- 3. RPC: log_consumable_waste
-- ============================================
CREATE OR REPLACE FUNCTION log_consumable_waste(
    p_consumable_id UUID,
    p_amount NUMERIC,
    p_reason TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
    v_salon_id UUID;
    v_current_stock NUMERIC;
BEGIN
    -- Validate reason
    IF p_reason NOT IN ('waste_expired', 'waste_spill', 'waste_training', 'waste_other') THEN
        RAISE EXCEPTION 'Invalid waste reason: %. Must be one of: waste_expired, waste_spill, waste_training, waste_other', p_reason;
    END IF;

    -- Validate amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Waste amount must be greater than zero';
    END IF;

    -- Lock the consumable row and fetch current stock + salon
    SELECT sc.salon_id, sc.current_stock
      INTO v_salon_id, v_current_stock
      FROM salon_consumables sc
     WHERE sc.id = p_consumable_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Consumable not found: %', p_consumable_id;
    END IF;

    -- Verify caller is the salon owner
    IF NOT EXISTS (
        SELECT 1 FROM salons s
         WHERE s.id = v_salon_id AND s.owner_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Permission denied: only salon owner can log waste';
    END IF;

    -- Insert the stock log (negative amount)
    INSERT INTO consumable_stock_logs (consumable_id, change_amount, change_type, notes, created_by)
    VALUES (p_consumable_id, -ABS(p_amount), p_reason, p_notes, auth.uid())
    RETURNING id INTO v_log_id;

    -- Decrease stock, floored at zero
    UPDATE salon_consumables
       SET current_stock = GREATEST(0, current_stock - ABS(p_amount))
     WHERE id = p_consumable_id;

    RETURN v_log_id;
END;
$$;

-- Grant execute to authenticated users (RLS-like access checked inside the function)
GRANT EXECUTE ON FUNCTION log_consumable_waste(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- ============================================
-- 4. Function: get_waste_summary
-- ============================================
CREATE OR REPLACE FUNCTION get_waste_summary(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    consumable_id UUID,
    consumable_name TEXT,
    unit TEXT,
    total_waste NUMERIC,
    waste_expired NUMERIC,
    waste_spill NUMERIC,
    waste_training NUMERIC,
    waste_other NUMERIC,
    total_usage NUMERIC,
    waste_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
BEGIN
    -- Verify caller is salon owner or member
    IF NOT EXISTS (
        SELECT 1 FROM salons s WHERE s.id = p_salon_id AND s.owner_id = auth.uid()
    ) AND NOT EXISTS (
        SELECT 1 FROM salon_members sm WHERE sm.salon_id = p_salon_id AND sm.profile_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Permission denied: you do not have access to this salon';
    END IF;

    RETURN QUERY
    WITH logs AS (
        SELECT
            csl.consumable_id,
            csl.change_type,
            csl.change_amount
        FROM consumable_stock_logs csl
        JOIN salon_consumables sc ON sc.id = csl.consumable_id
        WHERE sc.salon_id = p_salon_id
          AND csl.created_at >= v_cutoff
    ),
    per_consumable AS (
        SELECT
            sc.id AS cid,
            sc.name AS cname,
            sc.unit AS cunit,
            -- Waste totals (change_amount is negative, so we ABS it)
            COALESCE(SUM(ABS(l.change_amount)) FILTER (WHERE l.change_type LIKE 'waste_%'), 0) AS total_waste,
            COALESCE(SUM(ABS(l.change_amount)) FILTER (WHERE l.change_type = 'waste_expired'), 0) AS waste_expired,
            COALESCE(SUM(ABS(l.change_amount)) FILTER (WHERE l.change_type = 'waste_spill'), 0) AS waste_spill,
            COALESCE(SUM(ABS(l.change_amount)) FILTER (WHERE l.change_type = 'waste_training'), 0) AS waste_training,
            COALESCE(SUM(ABS(l.change_amount)) FILTER (WHERE l.change_type = 'waste_other'), 0) AS waste_other,
            -- Normal usage (change_type = 'usage', also negative)
            COALESCE(SUM(ABS(l.change_amount)) FILTER (WHERE l.change_type = 'usage'), 0) AS total_usage
        FROM salon_consumables sc
        LEFT JOIN logs l ON l.consumable_id = sc.id
        WHERE sc.salon_id = p_salon_id
          AND sc.active = TRUE
        GROUP BY sc.id, sc.name, sc.unit
    )
    SELECT
        pc.cid,
        pc.cname,
        pc.cunit,
        pc.total_waste,
        pc.waste_expired,
        pc.waste_spill,
        pc.waste_training,
        pc.waste_other,
        pc.total_usage,
        CASE
            WHEN (pc.total_usage + pc.total_waste) > 0
            THEN ROUND(pc.total_waste * 100.0 / (pc.total_usage + pc.total_waste), 2)
            ELSE 0
        END AS waste_rate
    FROM per_consumable pc
    ORDER BY pc.total_waste DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_waste_summary(UUID, INT) TO authenticated;

-- ============================================
-- 5. Function: get_waste_summary_by_reason
--    Overall salon-level waste grouped by reason
-- ============================================
CREATE OR REPLACE FUNCTION get_waste_summary_by_reason(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    reason TEXT,
    total_amount NUMERIC,
    total_cost_cents BIGINT,
    log_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
BEGIN
    -- Verify caller is salon owner or member
    IF NOT EXISTS (
        SELECT 1 FROM salons s WHERE s.id = p_salon_id AND s.owner_id = auth.uid()
    ) AND NOT EXISTS (
        SELECT 1 FROM salon_members sm WHERE sm.salon_id = p_salon_id AND sm.profile_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Permission denied: you do not have access to this salon';
    END IF;

    RETURN QUERY
    SELECT
        csl.change_type AS reason,
        COALESCE(SUM(ABS(csl.change_amount)), 0) AS total_amount,
        COALESCE(SUM(ABS(csl.change_amount) * COALESCE(sc.unit_cost_cents, 0))::BIGINT, 0) AS total_cost_cents,
        COUNT(*) AS log_count
    FROM consumable_stock_logs csl
    JOIN salon_consumables sc ON sc.id = csl.consumable_id
    WHERE sc.salon_id = p_salon_id
      AND csl.change_type LIKE 'waste_%'
      AND csl.created_at >= v_cutoff
    GROUP BY csl.change_type
    ORDER BY total_amount DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_waste_summary_by_reason(UUID, INT) TO authenticated;
