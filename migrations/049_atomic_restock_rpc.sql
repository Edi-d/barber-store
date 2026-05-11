-- ============================================
-- Migration 049: Atomic stock RPCs
-- ============================================
-- Replaces non-atomic client-side insert+update
-- with server-side plpgsql transactions.
-- ============================================

-- ============================================
-- 1. restock_consumable
-- ============================================
CREATE OR REPLACE FUNCTION restock_consumable(
    p_consumable_id UUID,
    p_amount NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows INT;
BEGIN
    -- Update stock with relative increment
    UPDATE salon_consumables
       SET current_stock = current_stock + p_amount
     WHERE id = p_consumable_id
       AND active = TRUE;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        RAISE EXCEPTION 'Consumable % not found or inactive', p_consumable_id;
    END IF;

    -- Log the restock
    INSERT INTO consumable_stock_logs (consumable_id, change_amount, change_type, notes, created_by)
    VALUES (p_consumable_id, p_amount, 'restock', p_notes, auth.uid());
END;
$$;

-- ============================================
-- 2. adjust_consumable_stock
-- ============================================
CREATE OR REPLACE FUNCTION adjust_consumable_stock(
    p_consumable_id UUID,
    p_new_stock NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current NUMERIC;
    v_diff NUMERIC;
BEGIN
    -- Lock the row to prevent races
    SELECT current_stock INTO v_current
      FROM salon_consumables
     WHERE id = p_consumable_id
       AND active = TRUE
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Consumable % not found or inactive', p_consumable_id;
    END IF;

    v_diff := p_new_stock - v_current;

    -- Log the correction
    INSERT INTO consumable_stock_logs (consumable_id, change_amount, change_type, notes, created_by)
    VALUES (p_consumable_id, v_diff, 'correction', p_notes, auth.uid());

    -- Set the new stock
    UPDATE salon_consumables
       SET current_stock = p_new_stock
     WHERE id = p_consumable_id;
END;
$$;

-- ============================================
-- 3. add_consumable_with_initial_stock
-- ============================================
CREATE OR REPLACE FUNCTION add_consumable_with_initial_stock(
    p_salon_id UUID,
    p_product_sku TEXT DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT NULL,
    p_category TEXT DEFAULT 'general',
    p_unit TEXT DEFAULT 'buc',
    p_unit_cost_cents INT DEFAULT NULL,
    p_initial_stock NUMERIC DEFAULT 0,
    p_min_stock_threshold NUMERIC DEFAULT 0,
    p_image_url TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS salon_consumables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row salon_consumables;
BEGIN
    -- Insert the consumable
    INSERT INTO salon_consumables (
        salon_id, product_sku, name, brand, category,
        unit, unit_cost_cents, current_stock, min_stock_threshold,
        image_url, notes, active
    ) VALUES (
        p_salon_id, p_product_sku, p_name, p_brand, p_category,
        p_unit, p_unit_cost_cents, p_initial_stock, p_min_stock_threshold,
        p_image_url, p_notes, TRUE
    )
    RETURNING * INTO v_row;

    -- Log the initial stock if > 0
    IF p_initial_stock > 0 THEN
        INSERT INTO consumable_stock_logs (consumable_id, change_amount, change_type, notes, created_by)
        VALUES (v_row.id, p_initial_stock, 'initial', p_notes, auth.uid());
    END IF;

    RETURN v_row;
END;
$$;
