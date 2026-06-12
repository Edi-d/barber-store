-- ============================================================================
-- Migration 146: Record the selected courier + its fee on client orders
-- ============================================================================
-- The checkout now lets the buyer pick a courier from the nopCommerce list
-- (/api/ShippingMethodInfo/GetShippingMethodInfos) and the chosen method's fee
-- drives the displayed total. Until now place_marketplace_order() hardcoded
-- shipping to 0, so the recorded order disagreed with what the buyer saw.
--
-- This migration:
--   1. Adds marketplace_orders.shipping_method (TEXT) to persist which courier
--      was chosen (nop shipping_method_system_name / display_name).
--   2. Replaces place_marketplace_order() with two extra trailing params:
--        p_shipping_cents  — the chosen courier's fee in cents (clamped >= 0)
--        p_shipping_method — the chosen courier label
--      Both default (0 / NULL) so older callers keep working, but the app now
--      always sends them. shipping_cents/total_cents fold in the fee.
--
-- DEPLOY NOTE: ship this together with the app change in lib/marketplace-orders.ts
-- (placeMarketplaceClientOrder now sends p_shipping_cents/p_shipping_method). If
-- the app rolls out before this migration, PostgREST can't resolve the 7-arg
-- function and client checkout fails — apply this first.
-- ============================================================================

-- ── 1. Persist the chosen courier ──────────────────────────────────────────
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS shipping_method TEXT;

-- ── 2. RPC: place_marketplace_order (client) — now shipping-aware ───────────
-- Items snapshot shape (JSONB array):
--   { "nop_product_id": text, "sku": text?, "title": text,
--     "qty": int, "unit_price_cents": int }
-- Shipping shape (JSONB):
--   { "name","phone","email","address_line1","city","county","postal","notes" }
DROP FUNCTION IF EXISTS place_marketplace_order(JSONB, TEXT, JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS place_marketplace_order(JSONB, TEXT, JSONB, TEXT, TEXT, INT, TEXT);
CREATE OR REPLACE FUNCTION place_marketplace_order(
    p_items          JSONB,
    p_payment_method TEXT,
    p_shipping       JSONB,
    p_voucher_code   TEXT DEFAULT NULL,
    p_section        TEXT DEFAULT 'consumer',
    p_shipping_cents INT  DEFAULT 0,
    p_shipping_method TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid          UUID := auth.uid();
    v_item         JSONB;
    v_qty          INT;
    v_unit         INT;
    v_subtotal     INT := 0;
    v_shipping     INT := 0;
    v_discount     INT := 0;
    v_total        INT;
    v_order_id     UUID;
    v_order_number TEXT;
    v_attempts     INT := 0;
    v_status       TEXT;
    v_paid_at      TIMESTAMPTZ;
    v_voucher      loyalty_vouchers%ROWTYPE;
    v_section      TEXT := COALESCE(p_section, 'consumer');
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('status','error','error','not_authenticated','message','Autentifică-te pentru a comanda.');
    END IF;

    IF p_payment_method NOT IN ('cod', 'stripe') THEN
        RETURN jsonb_build_object('status','error','error','bad_payment_method','message','Metodă de plată invalidă.');
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('status','error','error','empty_cart','message','Coșul este gol.');
    END IF;

    IF v_section NOT IN ('professional','consumer') THEN
        v_section := 'consumer';
    END IF;

    -- Price from client snapshots (nop is the source of truth for price).
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty  := (v_item->>'qty')::INT;
        v_unit := (v_item->>'unit_price_cents')::INT;
        IF v_qty IS NULL OR v_qty <= 0 OR v_unit IS NULL OR v_unit < 0 THEN
            RETURN jsonb_build_object('status','error','error','invalid_item','message','Produs invalid în coș.');
        END IF;
        v_subtotal := v_subtotal + (v_unit * v_qty);
    END LOOP;

    IF v_subtotal <= 0 THEN
        RETURN jsonb_build_object('status','error','error','empty_cart','message','Coșul este gol.');
    END IF;

    -- Shipping = the courier fee chosen at checkout (nop is the source of truth
    -- for the courier list + flat price, same trust model as item prices). Clamp
    -- defensively; a missing value falls back to free.
    v_shipping := GREATEST(0, COALESCE(p_shipping_cents, 0));

    -- Optional voucher (client-owned, active, not expired, marketplace-eligible).
    IF p_voucher_code IS NOT NULL AND length(trim(p_voucher_code)) > 0 THEN
        SELECT * INTO v_voucher
        FROM loyalty_vouchers
        WHERE code = upper(trim(p_voucher_code))
          AND user_id = v_uid
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
          AND scope IN ('all', 'marketplace')
        FOR UPDATE;

        IF FOUND THEN
            v_discount := LEAST(COALESCE(v_voucher.value_cents, 0), v_subtotal);
        END IF;
    END IF;

    v_total := GREATEST(0, v_subtotal + v_shipping - v_discount);

    -- Stripe is mocked: a 'stripe' order lands paid; 'cod' stays 'placed'.
    IF p_payment_method = 'stripe' THEN
        v_status := 'paid';
        v_paid_at := NOW();
    ELSE
        v_status := 'placed';
        v_paid_at := NULL;
    END IF;

    -- Unique order number (retry on collision).
    LOOP
        v_order_number := 'MK-' || EXTRACT(YEAR FROM NOW())::TEXT || '-'
            || LPAD(FLOOR(RANDOM() * 1000000)::INT::TEXT, 6, '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM marketplace_orders WHERE order_number = v_order_number);
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'Could not generate unique order_number';
        END IF;
    END LOOP;

    INSERT INTO marketplace_orders (
        order_number, buyer_type, buyer_user_id, section, status, payment_method,
        subtotal_cents, shipping_cents, total_cents,
        voucher_code, voucher_discount_cents,
        shipping_method,
        shipping_name, shipping_phone, shipping_email,
        shipping_address_line1, shipping_city, shipping_county,
        shipping_postal_code, shipping_notes,
        placed_at, paid_at
    ) VALUES (
        v_order_number, 'client', v_uid, v_section, v_status, p_payment_method,
        v_subtotal, v_shipping, v_total,
        CASE WHEN v_discount > 0 THEN upper(trim(p_voucher_code)) ELSE NULL END,
        v_discount,
        NULLIF(p_shipping_method,''),
        NULLIF(p_shipping->>'name',''), NULLIF(p_shipping->>'phone',''), NULLIF(p_shipping->>'email',''),
        NULLIF(p_shipping->>'address_line1',''), NULLIF(p_shipping->>'city',''), NULLIF(p_shipping->>'county',''),
        NULLIF(p_shipping->>'postal',''), NULLIF(p_shipping->>'notes',''),
        NOW(), v_paid_at
    )
    RETURNING id INTO v_order_id;

    -- Snapshotted line items (nop reference, no marketplace_products FK).
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty  := (v_item->>'qty')::INT;
        v_unit := (v_item->>'unit_price_cents')::INT;
        INSERT INTO marketplace_order_items (
            order_id, product_id, nop_product_id, sku_snapshot, title_snapshot,
            qty, unit_price_cents, line_total_cents
        ) VALUES (
            v_order_id,
            NULL,
            v_item->>'nop_product_id',
            COALESCE(NULLIF(v_item->>'sku',''), v_item->>'nop_product_id', 'nop'),
            COALESCE(NULLIF(v_item->>'title',''), 'Produs'),
            v_qty, v_unit, v_unit * v_qty
        );
    END LOOP;

    -- Burn the voucher if applied.
    IF v_discount > 0 THEN
        UPDATE loyalty_vouchers
           SET status = 'used', used_at = NOW(), redeemed_order_id = v_order_id
         WHERE id = v_voucher.id;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total_cents', v_total
    );
END;
$$;

REVOKE ALL ON FUNCTION place_marketplace_order(JSONB, TEXT, JSONB, TEXT, TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION place_marketplace_order(JSONB, TEXT, JSONB, TEXT, TEXT, INT, TEXT) TO authenticated;

-- ============================================================================
-- Done — 146_marketplace_shipping_method.sql
-- ============================================================================
