-- ============================================================================
-- Migration 070: XP Reward from Static JSON Catalog
-- ============================================================================
-- Products are now served from a static JSON catalog on the client side.
-- This migration:
--   1. Creates spend_xp_on_reward() — deducts XP and logs the transaction
--      using product metadata passed from the client (SKU, name, brand).
--   2. Drops the now-unused xp_reward_products, user_xp_orders tables and
--      the purchase_with_xp() function.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ============================================================================
-- 1. NEW RPC: spend_xp_on_reward
-- ============================================================================
CREATE OR REPLACE FUNCTION spend_xp_on_reward(
    p_user_id      UUID,
    p_salon_id     UUID,
    p_xp_cost      INT,
    p_product_sku  TEXT,
    p_product_name TEXT,
    p_product_brand TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_xp_record  user_shop_xp%ROWTYPE;
    v_remaining  INT;
BEGIN
    -- Validate cost
    IF p_xp_cost IS NULL OR p_xp_cost <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Costul XP trebuie să fie mai mare decât 0.'
        );
    END IF;

    -- Lock user XP row to prevent race conditions
    SELECT * INTO v_xp_record
    FROM user_shop_xp
    WHERE user_id = p_user_id
      AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Nu ai XP disponibil pentru acest salon.'
        );
    END IF;

    -- Check sufficient balance
    IF v_xp_record.current_xp < p_xp_cost THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', FORMAT(
                'XP insuficient. Ai %s XP, dar produsul costă %s XP.',
                v_xp_record.current_xp, p_xp_cost
            )
        );
    END IF;

    -- Deduct XP
    UPDATE user_shop_xp
    SET current_xp = current_xp - p_xp_cost
    WHERE id = v_xp_record.id;

    v_remaining := v_xp_record.current_xp - p_xp_cost;

    -- Log transaction
    INSERT INTO shop_xp_transactions (
        user_id, salon_id, amount, type, source, reference_id, description
    ) VALUES (
        p_user_id,
        p_salon_id,
        -p_xp_cost,
        'spent',
        'product_redeem',
        NULL,
        FORMAT('Produs revendicat: %s (%s) — %s XP', p_product_name, p_product_brand, p_xp_cost)
    );

    RETURN jsonb_build_object(
        'success',       true,
        'remaining_xp',  v_remaining,
        'product_sku',   p_product_sku,
        'product_name',  p_product_name,
        'product_brand', p_product_brand,
        'xp_spent',      p_xp_cost
    );
END;
$$;


-- ============================================================================
-- 2. DROP old DB-product-based function & tables
-- ============================================================================
-- Drop purchase_with_xp (replaced by spend_xp_on_reward)
DROP FUNCTION IF EXISTS purchase_with_xp(UUID, UUID);

-- Drop tables (order matters because of FK: user_xp_orders → xp_reward_products)
DROP TABLE IF EXISTS user_xp_orders;
DROP TABLE IF EXISTS xp_reward_products;

-- Clean up orphaned helper functions / triggers from dropped tables
DROP FUNCTION IF EXISTS update_xp_reward_products_updated_at() CASCADE;


-- ============================================================================
-- 3. Update get_user_xp_summary to remove user_xp_orders dependency
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_xp_summary(
    p_user_id  UUID,
    p_salon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_xp_record     user_shop_xp%ROWTYPE;
    v_current_level xp_level_thresholds%ROWTYPE;
    v_next_level    xp_level_thresholds%ROWTYPE;
    v_progress      NUMERIC;
    v_recent_txns   JSONB;
BEGIN
    -- Get or create user XP record
    INSERT INTO user_shop_xp (user_id, salon_id, current_xp, total_xp_earned, level)
    VALUES (p_user_id, p_salon_id, 0, 0, 1)
    ON CONFLICT (user_id, salon_id) DO NOTHING;

    SELECT * INTO v_xp_record
    FROM user_shop_xp
    WHERE user_id = p_user_id AND salon_id = p_salon_id;

    -- Get current level info
    SELECT * INTO v_current_level
    FROM xp_level_thresholds
    WHERE level = v_xp_record.level;

    -- Get next level info
    SELECT * INTO v_next_level
    FROM xp_level_thresholds
    WHERE level = v_xp_record.level + 1;

    -- Calculate progress to next level
    IF v_next_level.level IS NOT NULL AND v_current_level.level IS NOT NULL THEN
        v_progress := LEAST(100, ROUND(
            (v_xp_record.total_xp_earned - v_current_level.xp_required)::NUMERIC /
            NULLIF(v_next_level.xp_required - v_current_level.xp_required, 0)::NUMERIC * 100
        , 1));
    ELSE
        v_progress := 100; -- max level reached
    END IF;

    -- Recent transactions (last 10)
    SELECT COALESCE(jsonb_agg(t), '[]'::JSONB) INTO v_recent_txns
    FROM (
        SELECT id, amount, type, source, description, created_at
        FROM shop_xp_transactions
        WHERE user_id = p_user_id AND salon_id = p_salon_id
        ORDER BY created_at DESC
        LIMIT 10
    ) t;

    RETURN jsonb_build_object(
        'current_xp', v_xp_record.current_xp,
        'total_xp_earned', v_xp_record.total_xp_earned,
        'level', v_xp_record.level,
        'level_title', COALESCE(v_current_level.title, 'Începător'),
        'level_perks', COALESCE(v_current_level.perks, '[]'::JSONB),
        'next_level', v_next_level.level,
        'next_level_title', v_next_level.title,
        'next_level_xp_required', v_next_level.xp_required,
        'progress_percent', COALESCE(v_progress, 100),
        'recent_transactions', v_recent_txns
    );
END;
$$;
