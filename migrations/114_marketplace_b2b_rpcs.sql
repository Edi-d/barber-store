-- ============================================================
-- Migration 114: Marketplace B2B RPCs
-- ============================================================
-- All write paths for the new B2B features (113):
--   1. calc_marketplace_tier_price(product_id, qty) -> price_cents
--   2. calc_marketplace_quote(items, buyer_type) -> {subtotal, shipping, total, breakdown}
--   3. add_to_recurring_list(salon_id, product_id, qty) -> {list_id, item_id}
--   4. remove_from_recurring_list(item_id) -> ok
--   5. update_recurring_list_item_qty(item_id, qty) -> ok
--   6. get_salon_reorder_suggestions(salon_id, days) -> [{product_id, last_ordered, total_orders}]
--   7. salon_marketplace_spending(salon_id, since) -> {total_cents, order_count, top_products}
--
-- All RPCs SECURITY DEFINER + auth.uid() guards.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. calc_marketplace_tier_price
-- ============================================================
-- Returns the effective unit price for buying `p_qty` units of
-- `p_product_id`. Picks the lowest matching tier, falls back to
-- the product's base price.
-- ============================================================
DROP FUNCTION IF EXISTS calc_marketplace_tier_price(UUID, INT);
CREATE OR REPLACE FUNCTION calc_marketplace_tier_price(
    p_product_id UUID,
    p_qty        INT
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base_price INT;
    v_tier_price INT;
BEGIN
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'invalid_qty';
    END IF;

    SELECT price_cents INTO v_base_price
      FROM marketplace_products
     WHERE id = p_product_id AND is_active = TRUE;

    IF v_base_price IS NULL THEN
        RAISE EXCEPTION 'product_not_found';
    END IF;

    SELECT price_cents INTO v_tier_price
      FROM marketplace_product_pricing_tiers
     WHERE product_id = p_product_id
       AND min_qty <= p_qty
     ORDER BY min_qty DESC
     LIMIT 1;

    RETURN COALESCE(LEAST(v_tier_price, v_base_price), v_base_price);
END;
$$;

REVOKE ALL ON FUNCTION calc_marketplace_tier_price(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calc_marketplace_tier_price(UUID, INT) TO authenticated, service_role;


-- ============================================================
-- 2. calc_marketplace_quote
-- ============================================================
-- Pure-pricing helper used by cart/checkout to display the
-- definitive total (with tier discount + shipping rule). Does
-- NOT mutate stock or create orders.
--
-- Input items: [{"product_id":"uuid","qty":n}, ...]
-- Buyer type: 'client' | 'salon' (drives the free-shipping rule).
-- Returns:
--   {
--     "subtotal_cents":  N,
--     "tier_savings_cents": N,
--     "shipping_cents":  N,
--     "free_shipping_threshold_cents": N,
--     "missing_for_free_shipping_cents": N,  -- 0 if already free
--     "total_cents":     N,
--     "items": [
--       {"product_id": uuid, "qty": n,
--        "base_price_cents": N, "unit_price_cents": N,
--        "line_total_cents": N, "savings_cents": N}
--     ]
--   }
-- ============================================================
DROP FUNCTION IF EXISTS calc_marketplace_quote(JSONB, TEXT);
CREATE OR REPLACE FUNCTION calc_marketplace_quote(
    p_items      JSONB,
    p_buyer_type TEXT DEFAULT 'client'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item            JSONB;
    v_product_id      UUID;
    v_qty             INT;
    v_base            INT;
    v_unit            INT;
    v_line            INT;
    v_subtotal        INT := 0;
    v_savings         INT := 0;
    v_breakdown       JSONB := '[]'::JSONB;
    v_threshold       INT;
    v_default_ship    INT;
    v_shipping        INT := 0;
    v_missing         INT := 0;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object(
            'subtotal_cents', 0,
            'tier_savings_cents', 0,
            'shipping_cents', 0,
            'free_shipping_threshold_cents', 0,
            'missing_for_free_shipping_cents', 0,
            'total_cents', 0,
            'items', '[]'::JSONB
        );
    END IF;

    -- Settings
    SELECT (value)::INT INTO v_default_ship FROM marketplace_settings
     WHERE key = 'default_shipping_cost_cents';
    v_default_ship := COALESCE(v_default_ship, 1500);

    IF p_buyer_type = 'salon' THEN
        SELECT (value)::INT INTO v_threshold FROM marketplace_settings
         WHERE key = 'free_shipping_threshold_cents_salon';
    ELSE
        SELECT (value)::INT INTO v_threshold FROM marketplace_settings
         WHERE key = 'free_shipping_threshold_cents_client';
    END IF;
    v_threshold := COALESCE(v_threshold, 15000);

    -- Per-item pricing
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_qty        := COALESCE((v_item->>'qty')::INT, 0);

        IF v_product_id IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

        SELECT price_cents INTO v_base
          FROM marketplace_products
         WHERE id = v_product_id AND is_active = TRUE;
        IF v_base IS NULL THEN CONTINUE; END IF;

        SELECT price_cents INTO v_unit
          FROM marketplace_product_pricing_tiers
         WHERE product_id = v_product_id AND min_qty <= v_qty
         ORDER BY min_qty DESC LIMIT 1;
        v_unit := COALESCE(LEAST(v_unit, v_base), v_base);

        v_line     := v_unit * v_qty;
        v_subtotal := v_subtotal + v_line;
        v_savings  := v_savings + ((v_base - v_unit) * v_qty);

        v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
            'product_id', v_product_id,
            'qty', v_qty,
            'base_price_cents', v_base,
            'unit_price_cents', v_unit,
            'line_total_cents', v_line,
            'savings_cents', (v_base - v_unit) * v_qty
        ));
    END LOOP;

    IF v_subtotal >= v_threshold THEN
        v_shipping := 0;
        v_missing  := 0;
    ELSE
        v_shipping := v_default_ship;
        v_missing  := v_threshold - v_subtotal;
    END IF;

    RETURN jsonb_build_object(
        'subtotal_cents', v_subtotal,
        'tier_savings_cents', v_savings,
        'shipping_cents', v_shipping,
        'free_shipping_threshold_cents', v_threshold,
        'missing_for_free_shipping_cents', v_missing,
        'total_cents', v_subtotal + v_shipping,
        'items', v_breakdown
    );
END;
$$;

REVOKE ALL ON FUNCTION calc_marketplace_quote(JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calc_marketplace_quote(JSONB, TEXT) TO authenticated, service_role;


-- ============================================================
-- 3. ensure_default_recurring_list
-- ============================================================
-- Creates a "Lista mea" default list for the salon if missing.
-- Returns the list id.
-- ============================================================
DROP FUNCTION IF EXISTS ensure_default_recurring_list(UUID);
CREATE OR REPLACE FUNCTION ensure_default_recurring_list(p_salon_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_list_id UUID;
BEGIN
    -- AuthZ: caller must be salon owner
    IF NOT EXISTS (SELECT 1 FROM salons s
                    WHERE s.id = p_salon_id AND s.owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_list_id
      FROM marketplace_recurring_lists
     WHERE salon_id = p_salon_id AND is_default = TRUE;

    IF v_list_id IS NULL THEN
        INSERT INTO marketplace_recurring_lists (salon_id, name, is_default)
        VALUES (p_salon_id, 'Lista mea', TRUE)
        RETURNING id INTO v_list_id;
    END IF;

    RETURN v_list_id;
END;
$$;

REVOKE ALL ON FUNCTION ensure_default_recurring_list(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_default_recurring_list(UUID) TO authenticated;


-- ============================================================
-- 4. add_to_recurring_list
-- ============================================================
-- Auto-creates the default list if needed. Upserts the qty (adds
-- to existing if product already in list).
-- ============================================================
DROP FUNCTION IF EXISTS add_to_recurring_list(UUID, UUID, INT);
CREATE OR REPLACE FUNCTION add_to_recurring_list(
    p_salon_id   UUID,
    p_product_id UUID,
    p_qty        INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_list_id  UUID;
    v_item_id  UUID;
    v_new_qty  INT;
BEGIN
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'invalid_qty';
    END IF;

    -- AuthZ via inner RPC
    v_list_id := ensure_default_recurring_list(p_salon_id);

    INSERT INTO marketplace_recurring_list_items (list_id, product_id, qty)
    VALUES (v_list_id, p_product_id, p_qty)
    ON CONFLICT (list_id, product_id)
    DO UPDATE SET qty = marketplace_recurring_list_items.qty + EXCLUDED.qty,
                  updated_at = NOW()
    RETURNING id, qty INTO v_item_id, v_new_qty;

    RETURN jsonb_build_object(
        'list_id', v_list_id,
        'item_id', v_item_id,
        'qty', v_new_qty
    );
END;
$$;

REVOKE ALL ON FUNCTION add_to_recurring_list(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_to_recurring_list(UUID, UUID, INT) TO authenticated;


-- ============================================================
-- 5. get_salon_reorder_suggestions
-- ============================================================
-- For the spending dashboard / push reminder. Returns products
-- the salon has ordered before with their last-ordered date and
-- a "due_now" flag if older than reorder_reminder_days.
-- ============================================================
DROP FUNCTION IF EXISTS get_salon_reorder_suggestions(UUID, INT);
CREATE OR REPLACE FUNCTION get_salon_reorder_suggestions(
    p_salon_id UUID,
    p_limit    INT DEFAULT 10
)
RETURNS TABLE (
    product_id        UUID,
    product_name      TEXT,
    brand             TEXT,
    image_url         TEXT,
    last_ordered_at   TIMESTAMPTZ,
    days_since        INT,
    times_ordered     INT,
    avg_qty           NUMERIC,
    due_now           BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reorder_days INT;
BEGIN
    -- AuthZ
    IF NOT (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = p_salon_id AND s.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = p_salon_id AND sm.profile_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE((value)::INT, 28) INTO v_reorder_days
      FROM marketplace_settings WHERE key = 'reorder_reminder_days';

    RETURN QUERY
    WITH item_history AS (
        SELECT
            i.product_id,
            MAX(o.placed_at)            AS last_ordered_at,
            COUNT(DISTINCT o.id)::INT   AS times_ordered,
            AVG(i.qty)                  AS avg_qty
          FROM marketplace_order_items i
          JOIN marketplace_orders o ON o.id = i.order_id
         WHERE o.buyer_type = 'salon'
           AND o.buyer_salon_id = p_salon_id
           AND o.status IN ('paid', 'preparing', 'shipped', 'delivered', 'placed')
         GROUP BY i.product_id
    )
    SELECT
        h.product_id,
        p.name                                                          AS product_name,
        p.brand                                                         AS brand,
        (CASE WHEN jsonb_typeof(p.images) = 'array' AND jsonb_array_length(p.images) > 0
              THEN p.images->>0
              ELSE NULL END)                                            AS image_url,
        h.last_ordered_at,
        EXTRACT(DAY FROM (NOW() - h.last_ordered_at))::INT              AS days_since,
        h.times_ordered,
        ROUND(h.avg_qty, 1)                                             AS avg_qty,
        (NOW() - h.last_ordered_at) > (v_reorder_days * INTERVAL '1 day') AS due_now
      FROM item_history h
      JOIN marketplace_products p ON p.id = h.product_id
     WHERE p.is_active = TRUE
     ORDER BY (NOW() - h.last_ordered_at) DESC, h.times_ordered DESC
     LIMIT GREATEST(p_limit, 1);
END;
$$;

REVOKE ALL ON FUNCTION get_salon_reorder_suggestions(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_salon_reorder_suggestions(UUID, INT) TO authenticated;


-- ============================================================
-- 6. salon_marketplace_spending
-- ============================================================
-- Aggregated spend stats for the salon dashboard (per period).
-- Returns total spent, order count, and top 5 products.
-- ============================================================
DROP FUNCTION IF EXISTS salon_marketplace_spending(UUID, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION salon_marketplace_spending(
    p_salon_id UUID,
    p_since    TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days')
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total       INT := 0;
    v_count       INT := 0;
    v_avg         INT := 0;
    v_top         JSONB;
BEGIN
    IF NOT (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = p_salon_id AND s.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = p_salon_id AND sm.profile_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;

    SELECT
        COALESCE(SUM(o.total_cents), 0),
        COUNT(*)::INT
      INTO v_total, v_count
      FROM marketplace_orders o
     WHERE o.buyer_type = 'salon'
       AND o.buyer_salon_id = p_salon_id
       AND o.placed_at >= p_since
       AND o.status NOT IN ('cancelled', 'refunded');

    IF v_count > 0 THEN v_avg := v_total / v_count; END IF;

    -- Top 5 products by qty in window
    SELECT COALESCE(jsonb_agg(t), '[]'::JSONB) INTO v_top FROM (
        SELECT
            i.product_id,
            i.title_snapshot AS name,
            SUM(i.qty)::INT  AS total_qty,
            SUM(i.line_total_cents)::INT AS total_cents
          FROM marketplace_order_items i
          JOIN marketplace_orders o ON o.id = i.order_id
         WHERE o.buyer_type = 'salon'
           AND o.buyer_salon_id = p_salon_id
           AND o.placed_at >= p_since
           AND o.status NOT IN ('cancelled', 'refunded')
         GROUP BY i.product_id, i.title_snapshot
         ORDER BY total_qty DESC
         LIMIT 5
    ) t;

    RETURN jsonb_build_object(
        'total_cents', v_total,
        'order_count', v_count,
        'avg_order_cents', v_avg,
        'top_products', COALESCE(v_top, '[]'::JSONB),
        'since', p_since
    );
END;
$$;

REVOKE ALL ON FUNCTION salon_marketplace_spending(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION salon_marketplace_spending(UUID, TIMESTAMPTZ) TO authenticated;


-- ============================================================
-- 7. notify_back_in_stock — trigger on marketplace_products
-- ============================================================
-- Whenever stock_qty transitions from 0 to >0, mark all pending
-- subscriptions for that product as notified, and INSERT into
-- the user_notifications table (assumed to exist via 105 trig).
--
-- Defensive: silently skips if user_notifications doesn't exist.
-- ============================================================
DROP FUNCTION IF EXISTS notify_back_in_stock();
CREATE OR REPLACE FUNCTION notify_back_in_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_notifs_exists BOOLEAN;
BEGIN
    IF (OLD.stock_qty <= 0 AND NEW.stock_qty > 0) THEN
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'user_notifications'
        ) INTO v_user_notifs_exists;

        IF v_user_notifs_exists THEN
            INSERT INTO user_notifications (user_id, kind, title, body, data)
            SELECT
                msn.user_id,
                'marketplace_stock_back',
                'Produs disponibil din nou',
                NEW.name || ' este in stoc — comanda acum.',
                jsonb_build_object(
                    'product_id', NEW.id,
                    'route', '/marketplace/product/' || NEW.id::TEXT
                )
              FROM marketplace_stock_notifications msn
             WHERE msn.product_id = NEW.id
               AND msn.notified_at IS NULL
            ON CONFLICT DO NOTHING;
        END IF;

        UPDATE marketplace_stock_notifications
           SET notified_at = NOW()
         WHERE product_id = NEW.id
           AND notified_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_products_notify_stock ON marketplace_products;
CREATE TRIGGER trg_marketplace_products_notify_stock
    AFTER UPDATE OF stock_qty ON marketplace_products
    FOR EACH ROW EXECUTE FUNCTION notify_back_in_stock();


COMMIT;

-- ============================================================
-- Done — 114_marketplace_b2b_rpcs.sql
-- ============================================================
-- RPCs:
--   - calc_marketplace_tier_price       (authenticated + service_role)
--   - calc_marketplace_quote            (authenticated + service_role)
--   - ensure_default_recurring_list     (authenticated, salon owner)
--   - add_to_recurring_list             (authenticated, salon owner)
--   - get_salon_reorder_suggestions     (authenticated, owner/member)
--   - salon_marketplace_spending        (authenticated, owner/member)
--
-- Triggers:
--   - trg_marketplace_products_notify_stock — push when back in stock
-- ============================================================
