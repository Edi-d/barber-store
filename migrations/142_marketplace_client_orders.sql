-- ============================================================================
-- Migration 142: Client marketplace orders (nop products → Supabase)
-- ============================================================================
-- The catalogue is served from nopCommerce, so cart product IDs are nop IDs
-- (not UUIDs in marketplace_products). The original client checkout relied on a
-- `create-marketplace-checkout` edge function (Stripe) that isn't deployed, and
-- marketplace_order_items.product_id was a NOT NULL FK to marketplace_products
-- — both block storing nop-sourced orders.
--
-- This migration:
--   1. Lets order items store a nop product id (product_id becomes nullable;
--      new nop_product_id TEXT holds the nop reference).
--   2. Adds 'cod' (cash on delivery) as a payment method and lets client orders
--      be paid by 'stripe' OR 'cod'.
--   3. Adds a saved shipping-address book (marketplace_shipping_addresses).
--   4. Adds place_marketplace_order(): an atomic, SECURITY DEFINER RPC that
--      writes the order + snapshotted line items straight into Supabase from the
--      client cart. Stripe is mocked client-side — 'stripe' simply lands 'paid'.
-- ============================================================================

-- ── 1. Order items: allow nop product references ───────────────────────────
ALTER TABLE marketplace_order_items ADD COLUMN IF NOT EXISTS nop_product_id TEXT;
-- Normalize to TEXT: a prior schema may already have this column as INTEGER.
-- nop ids are numeric but local-feed SKUs aren't, so TEXT is the correct type.
-- (integer→text casts cleanly; text→text is a no-op).
ALTER TABLE marketplace_order_items
    ALTER COLUMN nop_product_id TYPE TEXT USING nop_product_id::text;
ALTER TABLE marketplace_order_items ALTER COLUMN product_id DROP NOT NULL;
-- The FK to marketplace_products stays; a NULL product_id satisfies it. Nop
-- lines carry their reference in nop_product_id + the *_snapshot columns.
CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_nop
    ON marketplace_order_items(nop_product_id)
    WHERE nop_product_id IS NOT NULL;

-- ── 2. Payment method: add 'cod', allow client stripe|cod ──────────────────
ALTER TABLE marketplace_orders DROP CONSTRAINT IF EXISTS marketplace_orders_payment_method_check;
ALTER TABLE marketplace_orders ADD CONSTRAINT marketplace_orders_payment_method_check
    CHECK (payment_method IN ('stripe', 'marketplace_credit', 'cod'));

ALTER TABLE marketplace_orders DROP CONSTRAINT IF EXISTS marketplace_orders_buyer_coherence;
ALTER TABLE marketplace_orders ADD CONSTRAINT marketplace_orders_buyer_coherence CHECK (
    (buyer_type = 'client'
        AND buyer_user_id IS NOT NULL
        AND payment_method IN ('stripe', 'cod'))
    OR
    (buyer_type = 'salon'
        AND buyer_salon_id IS NOT NULL
        AND payment_method = 'marketplace_credit')
);

-- ── 3. Saved shipping addresses ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_shipping_addresses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    label          TEXT,
    name           TEXT NOT NULL,
    phone          TEXT NOT NULL,
    email          TEXT,
    address_line1  TEXT NOT NULL,
    city           TEXT NOT NULL,
    county         TEXT NOT NULL,
    postal_code    TEXT NOT NULL,
    country        CHAR(2) NOT NULL DEFAULT 'RO',
    notes          TEXT,
    is_default     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_ship_addr_user
    ON marketplace_shipping_addresses(user_id, is_default DESC, updated_at DESC);

ALTER TABLE marketplace_shipping_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mkt_ship_addr_select ON marketplace_shipping_addresses;
CREATE POLICY mkt_ship_addr_select ON marketplace_shipping_addresses
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS mkt_ship_addr_insert ON marketplace_shipping_addresses;
CREATE POLICY mkt_ship_addr_insert ON marketplace_shipping_addresses
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mkt_ship_addr_update ON marketplace_shipping_addresses;
CREATE POLICY mkt_ship_addr_update ON marketplace_shipping_addresses
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mkt_ship_addr_delete ON marketplace_shipping_addresses;
CREATE POLICY mkt_ship_addr_delete ON marketplace_shipping_addresses
    FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_mkt_ship_addr_updated_at ON marketplace_shipping_addresses;
CREATE TRIGGER trg_mkt_ship_addr_updated_at
    BEFORE UPDATE ON marketplace_shipping_addresses
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ── 4. RPC: place_marketplace_order (client) ───────────────────────────────
-- Items snapshot shape (JSONB array):
--   { "nop_product_id": text, "sku": text?, "title": text,
--     "qty": int, "unit_price_cents": int }
-- Shipping shape (JSONB):
--   { "name","phone","email","address_line1","city","county","postal","notes" }
DROP FUNCTION IF EXISTS place_marketplace_order(JSONB, TEXT, JSONB, TEXT, TEXT);
CREATE OR REPLACE FUNCTION place_marketplace_order(
    p_items          JSONB,
    p_payment_method TEXT,
    p_shipping       JSONB,
    p_voucher_code   TEXT DEFAULT NULL,
    p_section        TEXT DEFAULT 'consumer'
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

    -- Free shipping for now (matches the checkout display).
    v_shipping := 0;

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
        shipping_name, shipping_phone, shipping_email,
        shipping_address_line1, shipping_city, shipping_county,
        shipping_postal_code, shipping_notes,
        placed_at, paid_at
    ) VALUES (
        v_order_number, 'client', v_uid, v_section, v_status, p_payment_method,
        v_subtotal, v_shipping, v_total,
        CASE WHEN v_discount > 0 THEN upper(trim(p_voucher_code)) ELSE NULL END,
        v_discount,
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

REVOKE ALL ON FUNCTION place_marketplace_order(JSONB, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION place_marketplace_order(JSONB, TEXT, JSONB, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Done — 142_marketplace_client_orders.sql
-- ============================================================================
