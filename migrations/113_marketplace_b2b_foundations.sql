-- ============================================================
-- Migration 113: Marketplace B2B Foundations
-- ============================================================
-- Adds tables/columns required by the salon-first marketplace UX:
--   1. salon_billing_details            — CUI/firma data per salon
--   2. marketplace_product_pricing_tiers — volume discount per SKU
--   3. marketplace_recurring_lists      — "Lista mea" recurring shopping
--   4. marketplace_recurring_list_items — items inside a recurring list
--   5. marketplace_stock_notifications  — notify-when-back-in-stock subs
--   6. marketplace_orders.* fiscal columns — invoice snapshot at checkout
--   7. marketplace_settings (KV)        — free-shipping threshold etc.
--
-- Additive only: no destructive ALTER on existing data.
-- All RPC bodies live in 114_marketplace_b2b_rpcs.sql.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. salon_billing_details — fiscal data for invoices
-- ============================================================
-- One row per salon. Owner-only RW. Auto-loaded into checkout
-- as the default fiscal block when the salon is the buyer (or
-- the salon owner is purchasing as a client, optional).
-- ============================================================
CREATE TABLE IF NOT EXISTS salon_billing_details (
    salon_id           UUID PRIMARY KEY REFERENCES salons(id) ON DELETE CASCADE,
    company_name       TEXT NOT NULL,
    fiscal_code        TEXT NOT NULL,             -- CUI / CIF (e.g. "RO12345678")
    registration_no    TEXT,                      -- nr. registru comertului (J40/...)
    is_vat_payer       BOOLEAN NOT NULL DEFAULT FALSE,
    iban               TEXT,
    bank_name          TEXT,
    -- Sediul social
    address_line1      TEXT NOT NULL,
    address_line2      TEXT,
    city               TEXT NOT NULL,
    county             TEXT NOT NULL,
    postal_code        TEXT,
    country            CHAR(2) NOT NULL DEFAULT 'RO',
    -- Contact for invoice delivery
    contact_email      TEXT,
    contact_phone      TEXT,
    -- E-Factura SPV opt-in (Romania)
    efactura_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT salon_billing_details_company_name_len  CHECK (length(trim(company_name)) >= 2),
    CONSTRAINT salon_billing_details_fiscal_code_len   CHECK (length(trim(fiscal_code)) >= 2)
);

ALTER TABLE salon_billing_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salon_billing_details_select ON salon_billing_details;
CREATE POLICY salon_billing_details_select ON salon_billing_details
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = salon_billing_details.salon_id
                   AND s.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_members sm
                    WHERE sm.salon_id = salon_billing_details.salon_id
                      AND sm.profile_id = auth.uid())
    );

DROP POLICY IF EXISTS salon_billing_details_owner_write ON salon_billing_details;
CREATE POLICY salon_billing_details_owner_write ON salon_billing_details
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = salon_billing_details.salon_id
                   AND s.owner_id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = salon_billing_details.salon_id
                   AND s.owner_id = auth.uid())
    );

DROP TRIGGER IF EXISTS trg_salon_billing_details_updated_at ON salon_billing_details;
CREATE TRIGGER trg_salon_billing_details_updated_at
    BEFORE UPDATE ON salon_billing_details
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();


-- ============================================================
-- 2. marketplace_product_pricing_tiers — volume discounts
-- ============================================================
-- Each tier defines: starting at min_qty, the unit price drops to
-- price_cents. Effective price = the price_cents of the highest
-- matching tier (smallest price for the qty bought).
-- Example for product X (base price 3200):
--   min_qty=5  price_cents=2900
--   min_qty=10 price_cents=2600
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_product_pricing_tiers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
    min_qty      INT NOT NULL,
    price_cents  INT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mppt_min_qty_positive   CHECK (min_qty > 1),
    CONSTRAINT mppt_price_positive     CHECK (price_cents > 0),
    CONSTRAINT mppt_unique_min_qty     UNIQUE (product_id, min_qty)
);

CREATE INDEX IF NOT EXISTS idx_mppt_product_minqty
    ON marketplace_product_pricing_tiers(product_id, min_qty);

ALTER TABLE marketplace_product_pricing_tiers ENABLE ROW LEVEL SECURITY;

-- Visible to anyone who can see the parent product (RLS on products
-- already restricts the professional section to salons).
DROP POLICY IF EXISTS mppt_select ON marketplace_product_pricing_tiers;
CREATE POLICY mppt_select ON marketplace_product_pricing_tiers
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM marketplace_products p
             WHERE p.id = marketplace_product_pricing_tiers.product_id
               AND p.is_active = TRUE
        )
    );

-- No INSERT/UPDATE/DELETE for authenticated (admin/seed only).


-- ============================================================
-- 3. marketplace_recurring_lists — "Lista mea" per salon
-- ============================================================
-- Salons curate a recurring shopping list (default: one per salon
-- named "Lista mea saptamanala"). The list holds product+qty pairs
-- that can be added to the cart in one tap.
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_recurring_lists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id    UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'Lista mea',
    is_default  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mrl_name_len CHECK (length(trim(name)) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_mrl_salon ON marketplace_recurring_lists(salon_id);

-- Only one default list per salon (the one auto-created on first add).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mrl_salon_default
    ON marketplace_recurring_lists(salon_id)
    WHERE is_default = TRUE;

ALTER TABLE marketplace_recurring_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mrl_select ON marketplace_recurring_lists;
CREATE POLICY mrl_select ON marketplace_recurring_lists
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = marketplace_recurring_lists.salon_id
                   AND s.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_members sm
                    WHERE sm.salon_id = marketplace_recurring_lists.salon_id
                      AND sm.profile_id = auth.uid())
    );

DROP POLICY IF EXISTS mrl_owner_write ON marketplace_recurring_lists;
CREATE POLICY mrl_owner_write ON marketplace_recurring_lists
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = marketplace_recurring_lists.salon_id
                   AND s.owner_id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = marketplace_recurring_lists.salon_id
                   AND s.owner_id = auth.uid())
    );

DROP TRIGGER IF EXISTS trg_mrl_updated_at ON marketplace_recurring_lists;
CREATE TRIGGER trg_mrl_updated_at
    BEFORE UPDATE ON marketplace_recurring_lists
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();


-- ============================================================
-- 4. marketplace_recurring_list_items
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_recurring_list_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id       UUID NOT NULL REFERENCES marketplace_recurring_lists(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
    qty           INT NOT NULL DEFAULT 1,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mrli_qty_positive CHECK (qty > 0),
    CONSTRAINT mrli_unique_product UNIQUE (list_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_mrli_list ON marketplace_recurring_list_items(list_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mrli_product ON marketplace_recurring_list_items(product_id);

ALTER TABLE marketplace_recurring_list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mrli_select ON marketplace_recurring_list_items;
CREATE POLICY mrli_select ON marketplace_recurring_list_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM marketplace_recurring_lists l
             WHERE l.id = marketplace_recurring_list_items.list_id
               AND (
                    EXISTS (SELECT 1 FROM salons s WHERE s.id = l.salon_id AND s.owner_id = auth.uid())
                 OR EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = l.salon_id AND sm.profile_id = auth.uid())
               )
        )
    );

DROP POLICY IF EXISTS mrli_owner_write ON marketplace_recurring_list_items;
CREATE POLICY mrli_owner_write ON marketplace_recurring_list_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM marketplace_recurring_lists l
             JOIN salons s ON s.id = l.salon_id
             WHERE l.id = marketplace_recurring_list_items.list_id
               AND s.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM marketplace_recurring_lists l
             JOIN salons s ON s.id = l.salon_id
             WHERE l.id = marketplace_recurring_list_items.list_id
               AND s.owner_id = auth.uid()
        )
    );

DROP TRIGGER IF EXISTS trg_mrli_updated_at ON marketplace_recurring_list_items;
CREATE TRIGGER trg_mrli_updated_at
    BEFORE UPDATE ON marketplace_recurring_list_items
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();


-- ============================================================
-- 5. marketplace_stock_notifications — notify when back in stock
-- ============================================================
-- Subscriber gets a push (via existing notifications system) when
-- the product transitions from stock_qty=0 to stock_qty>0.
-- Idempotent (one row per product+subscriber, deduped on insert).
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_stock_notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id     UUID REFERENCES salons(id) ON DELETE SET NULL,
    notified_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT msn_unique_product_user UNIQUE (product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_msn_product_unnotified
    ON marketplace_stock_notifications(product_id)
    WHERE notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_msn_user
    ON marketplace_stock_notifications(user_id, created_at DESC);

ALTER TABLE marketplace_stock_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS msn_select ON marketplace_stock_notifications;
CREATE POLICY msn_select ON marketplace_stock_notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS msn_insert ON marketplace_stock_notifications;
CREATE POLICY msn_insert ON marketplace_stock_notifications
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS msn_delete ON marketplace_stock_notifications;
CREATE POLICY msn_delete ON marketplace_stock_notifications
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());


-- ============================================================
-- 6. marketplace_orders — billing snapshot columns
-- ============================================================
-- Snapshot the salon's billing details at checkout time so
-- invoices remain valid even if the salon updates its CUI later.
-- All columns nullable for backward compatibility.
-- ============================================================
ALTER TABLE marketplace_orders
    ADD COLUMN IF NOT EXISTS billing_company_name      TEXT,
    ADD COLUMN IF NOT EXISTS billing_fiscal_code       TEXT,
    ADD COLUMN IF NOT EXISTS billing_registration_no   TEXT,
    ADD COLUMN IF NOT EXISTS billing_is_vat_payer      BOOLEAN,
    ADD COLUMN IF NOT EXISTS billing_address_line1     TEXT,
    ADD COLUMN IF NOT EXISTS billing_address_line2     TEXT,
    ADD COLUMN IF NOT EXISTS billing_city              TEXT,
    ADD COLUMN IF NOT EXISTS billing_county            TEXT,
    ADD COLUMN IF NOT EXISTS billing_postal_code       TEXT,
    ADD COLUMN IF NOT EXISTS billing_country           CHAR(2),
    ADD COLUMN IF NOT EXISTS billing_contact_email     TEXT,
    ADD COLUMN IF NOT EXISTS billing_contact_phone     TEXT,
    -- Track if and when an invoice was generated/sent to ANAF e-Factura
    ADD COLUMN IF NOT EXISTS invoice_number            TEXT,
    ADD COLUMN IF NOT EXISTS invoice_issued_at         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS efactura_submitted_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_invoice
    ON marketplace_orders(invoice_number)
    WHERE invoice_number IS NOT NULL;


-- ============================================================
-- 7. marketplace_settings — KV for tunables (free-shipping etc)
-- ============================================================
-- Exposed read-only to all authenticated. Write via service_role.
-- Seeded with default thresholds so the cart UI works right away.
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE marketplace_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_settings_select ON marketplace_settings;
CREATE POLICY marketplace_settings_select ON marketplace_settings
    FOR SELECT TO authenticated USING (true);

INSERT INTO marketplace_settings (key, value, description) VALUES
    ('free_shipping_threshold_cents_client', '15000',
        'Pragul (in bani) peste care livrarea e gratuita pentru clienti.'),
    ('free_shipping_threshold_cents_salon',  '30000',
        'Pragul pentru saloane (B2B) peste care livrarea e gratuita.'),
    ('default_shipping_cost_cents',          '1500',
        'Cost livrare standard (curier) cand subtotalul e sub prag.'),
    ('vat_rate_percent',                     '19',
        'TVA aplicabil produselor marketplace (RO standard).'),
    ('reorder_reminder_days',                '28',
        'Numar de zile dupa care propunem un reorder pe baza istoricului.')
ON CONFLICT (key) DO NOTHING;

DROP TRIGGER IF EXISTS trg_marketplace_settings_updated_at ON marketplace_settings;
CREATE TRIGGER trg_marketplace_settings_updated_at
    BEFORE UPDATE ON marketplace_settings
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();


-- ============================================================
-- 8. View: salon order summary with item count + spend month
-- ============================================================
-- Convenience view used by the spending dashboard. RLS inherits
-- from the underlying tables (orders + items).
-- ============================================================
CREATE OR REPLACE VIEW marketplace_salon_order_summary AS
SELECT
    o.id,
    o.order_number,
    o.buyer_salon_id           AS salon_id,
    o.status,
    o.placed_at,
    o.total_cents,
    o.subtotal_cents,
    o.shipping_cents,
    o.voucher_discount_cents,
    o.payment_method,
    o.invoice_number,
    o.invoice_issued_at,
    COALESCE((
        SELECT SUM(i.qty)::INT
          FROM marketplace_order_items i
         WHERE i.order_id = o.id
    ), 0) AS item_count,
    COALESCE((
        SELECT COUNT(*)::INT
          FROM marketplace_order_items i
         WHERE i.order_id = o.id
    ), 0) AS line_count
  FROM marketplace_orders o
 WHERE o.buyer_type = 'salon';

COMMIT;

-- ============================================================
-- Done — 113_marketplace_b2b_foundations.sql
-- ============================================================
-- Tables added:
--   - salon_billing_details
--   - marketplace_product_pricing_tiers
--   - marketplace_recurring_lists
--   - marketplace_recurring_list_items
--   - marketplace_stock_notifications
--   - marketplace_settings (seeded)
--
-- Columns added:
--   - marketplace_orders: billing_*, invoice_*, efactura_submitted_at
--
-- Views:
--   - marketplace_salon_order_summary
--
-- All tables have RLS, salon-owner write where applicable.
-- RPC bodies are in 114_marketplace_b2b_rpcs.sql.
-- ============================================================
