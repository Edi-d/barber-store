-- ============================================================
-- Migration 109: Marketplace Catalog (Professional + Consumer)
-- ============================================================
-- Two-section marketplace:
--   - 'professional' (salon_only = TRUE)  — salons buy with credit
--   - 'consumer'    (salon_only = FALSE) — clients + salons buy
--                                          with Stripe
--
-- Salon-side orders are paid via salon_marketplace_wallet
-- (migration 108); client-side orders via Stripe.
--
-- Additive only: no ALTER on any existing table.
-- All INSERTs for orders / items / shipments happen via RPC /
-- edge functions (no INSERT policy for authenticated).
--
-- DIVE:
--  - marketplace_sections   = categorie de nivel 0 (pro/consumer)
--  - marketplace_categories = categorii/ subcategorii
--  - marketplace_products   = SKU-urile din catalog
--  - marketplace_orders     = comenzile (Stripe sau credit salon)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. marketplace_sections — top-level marketplace split
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_sections (
    code       TEXT PRIMARY KEY,
    title_ro   TEXT NOT NULL,
    salon_only BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT marketplace_sections_code_check
        CHECK (code IN ('professional', 'consumer'))
);

INSERT INTO marketplace_sections (code, title_ro, salon_only)
VALUES
    ('professional', 'Profesional',  TRUE),
    ('consumer',     'Consumator',   FALSE)
ON CONFLICT (code) DO UPDATE
    SET title_ro   = EXCLUDED.title_ro,
        salon_only = EXCLUDED.salon_only;

ALTER TABLE marketplace_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_sections_select ON marketplace_sections;
CREATE POLICY marketplace_sections_select ON marketplace_sections
    FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 2. marketplace_categories — tree of categories per section
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section     TEXT NOT NULL REFERENCES marketplace_sections(code) ON DELETE RESTRICT,
    parent_id   UUID REFERENCES marketplace_categories(id) ON DELETE SET NULL,
    slug        TEXT NOT NULL,
    title_ro    TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_categories_section_slug_unique UNIQUE (section, slug)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_categories_section
    ON marketplace_categories(section, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_marketplace_categories_parent
    ON marketplace_categories(parent_id)
    WHERE parent_id IS NOT NULL;

ALTER TABLE marketplace_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_categories_select ON marketplace_categories;
CREATE POLICY marketplace_categories_select ON marketplace_categories
    FOR SELECT TO authenticated
    USING (
        is_active = TRUE AND (
            -- consumer section is public to all authenticated users
            section = 'consumer'
            -- professional section only for salon owners / members
            OR EXISTS (SELECT 1 FROM salons s WHERE s.owner_id = auth.uid())
            OR EXISTS (SELECT 1 FROM salon_members sm WHERE sm.profile_id = auth.uid())
        )
    );

DROP TRIGGER IF EXISTS trg_marketplace_categories_updated_at ON marketplace_categories;
CREATE TRIGGER trg_marketplace_categories_updated_at
    BEFORE UPDATE ON marketplace_categories
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ============================================================
-- 3. marketplace_products — SKU catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_products (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku            TEXT UNIQUE NOT NULL,
    name           TEXT NOT NULL,
    description    TEXT,
    brand          TEXT,
    category_id    UUID REFERENCES marketplace_categories(id) ON DELETE SET NULL,
    section        TEXT NOT NULL REFERENCES marketplace_sections(code) ON DELETE RESTRICT,
    price_cents    INT NOT NULL,
    cost_cents     INT,
    currency       CHAR(3) NOT NULL DEFAULT 'RON',
    stock_qty      INT NOT NULL DEFAULT 0,
    low_stock_at   INT NOT NULL DEFAULT 5,
    images         JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_products_price_positive CHECK (price_cents > 0),
    CONSTRAINT marketplace_products_stock_nonneg   CHECK (stock_qty >= 0),
    CONSTRAINT marketplace_products_low_stock_nonneg CHECK (low_stock_at >= 0)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_section_active_cat
    ON marketplace_products(section, is_active, category_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_category
    ON marketplace_products(category_id)
    WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_products_low_stock
    ON marketplace_products(stock_qty)
    WHERE is_active = TRUE;

ALTER TABLE marketplace_products ENABLE ROW LEVEL SECURITY;

-- RLS: consumer section is public; professional section only for salons.
DROP POLICY IF EXISTS marketplace_products_select ON marketplace_products;
CREATE POLICY marketplace_products_select ON marketplace_products
    FOR SELECT TO authenticated
    USING (
        is_active = TRUE AND (
            section = 'consumer'
            OR EXISTS (SELECT 1 FROM salons s WHERE s.owner_id = auth.uid())
            OR EXISTS (SELECT 1 FROM salon_members sm WHERE sm.profile_id = auth.uid())
        )
    );

DROP TRIGGER IF EXISTS trg_marketplace_products_updated_at ON marketplace_products;
CREATE TRIGGER trg_marketplace_products_updated_at
    BEFORE UPDATE ON marketplace_products
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ============================================================
-- 4. marketplace_orders — order header
-- ============================================================
-- DIVE: o comanda este fie a unui CLIENT (Stripe), fie a unui
-- SALON (credit marketplace). Constrangerea de mai jos forteaza
-- coerenta intre buyer_type, buyer_*_id si payment_method.
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_orders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number            TEXT UNIQUE NOT NULL,
    buyer_type              TEXT NOT NULL,
    buyer_user_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
    buyer_salon_id          UUID REFERENCES salons(id)   ON DELETE SET NULL,
    section                 TEXT NOT NULL REFERENCES marketplace_sections(code) ON DELETE RESTRICT,
    status                  TEXT NOT NULL DEFAULT 'placed',
    payment_method          TEXT NOT NULL,
    subtotal_cents          INT NOT NULL,
    shipping_cents          INT NOT NULL DEFAULT 0,
    tax_cents               INT NOT NULL DEFAULT 0,
    total_cents             INT NOT NULL,
    voucher_code            TEXT,
    voucher_discount_cents  INT NOT NULL DEFAULT 0,
    stripe_session_id       TEXT UNIQUE,
    stripe_payment_intent   TEXT,
    credit_ledger_id        UUID REFERENCES salon_marketplace_credit_ledger(id) ON DELETE SET NULL,
    xp_awarded              INT NOT NULL DEFAULT 0,
    shipping_name           TEXT,
    shipping_phone          TEXT,
    shipping_email          TEXT,
    shipping_address_line1  TEXT,
    shipping_address_line2  TEXT,
    shipping_city           TEXT,
    shipping_county         TEXT,
    shipping_postal_code    TEXT,
    shipping_country        CHAR(2) DEFAULT 'RO',
    shipping_notes          TEXT,
    placed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at                 TIMESTAMPTZ,
    shipped_at              TIMESTAMPTZ,
    delivered_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_orders_buyer_type_check CHECK (buyer_type IN ('client', 'salon')),
    CONSTRAINT marketplace_orders_status_check CHECK (status IN (
        'placed', 'paid', 'preparing', 'shipped', 'delivered',
        'cancelled', 'returned', 'refunded'
    )),
    CONSTRAINT marketplace_orders_payment_method_check
        CHECK (payment_method IN ('stripe', 'marketplace_credit')),
    CONSTRAINT marketplace_orders_subtotal_nonneg CHECK (subtotal_cents >= 0),
    CONSTRAINT marketplace_orders_shipping_nonneg CHECK (shipping_cents >= 0),
    CONSTRAINT marketplace_orders_tax_nonneg      CHECK (tax_cents      >= 0),
    CONSTRAINT marketplace_orders_total_nonneg    CHECK (total_cents    >= 0),
    CONSTRAINT marketplace_orders_voucher_disc_nonneg CHECK (voucher_discount_cents >= 0),
    CONSTRAINT marketplace_orders_buyer_coherence CHECK (
        (buyer_type = 'client'
            AND buyer_user_id IS NOT NULL
            AND payment_method = 'stripe')
        OR
        (buyer_type = 'salon'
            AND buyer_salon_id IS NOT NULL
            AND payment_method = 'marketplace_credit')
    )
);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer_user
    ON marketplace_orders(buyer_user_id, placed_at DESC)
    WHERE buyer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer_salon
    ON marketplace_orders(buyer_salon_id, placed_at DESC)
    WHERE buyer_salon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_status
    ON marketplace_orders(status, placed_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_section_status
    ON marketplace_orders(section, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_stripe_session
    ON marketplace_orders(stripe_session_id)
    WHERE stripe_session_id IS NOT NULL;

ALTER TABLE marketplace_orders ENABLE ROW LEVEL SECURITY;

-- RLS: buyer (client) OR salon owner/members
DROP POLICY IF EXISTS marketplace_orders_select ON marketplace_orders;
CREATE POLICY marketplace_orders_select ON marketplace_orders
    FOR SELECT TO authenticated
    USING (
        (buyer_type = 'client' AND buyer_user_id = auth.uid())
        OR (buyer_type = 'salon' AND (
            EXISTS (SELECT 1 FROM salons s
                     WHERE s.id = marketplace_orders.buyer_salon_id
                       AND s.owner_id = auth.uid())
            OR EXISTS (SELECT 1 FROM salon_members sm
                        WHERE sm.salon_id = marketplace_orders.buyer_salon_id
                          AND sm.profile_id = auth.uid())
        ))
    );

-- No direct INSERT/UPDATE/DELETE for authenticated users.
-- Orders are created via RPC / edge function (Stripe webhook).

DROP TRIGGER IF EXISTS trg_marketplace_orders_updated_at ON marketplace_orders;
CREATE TRIGGER trg_marketplace_orders_updated_at
    BEFORE UPDATE ON marketplace_orders
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ============================================================
-- 5. marketplace_order_items — order lines (snapshotted)
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_order_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id          UUID NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
    product_id        UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE RESTRICT,
    sku_snapshot      TEXT NOT NULL,
    title_snapshot    TEXT NOT NULL,
    qty               INT NOT NULL,
    unit_price_cents  INT NOT NULL,
    line_total_cents  INT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_order_items_qty_positive CHECK (qty > 0),
    CONSTRAINT marketplace_order_items_unit_price_nonneg CHECK (unit_price_cents >= 0),
    CONSTRAINT marketplace_order_items_line_total_nonneg CHECK (line_total_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_order
    ON marketplace_order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_product
    ON marketplace_order_items(product_id);

ALTER TABLE marketplace_order_items ENABLE ROW LEVEL SECURITY;

-- RLS: visible iff the parent order is visible to the user.
DROP POLICY IF EXISTS marketplace_order_items_select ON marketplace_order_items;
CREATE POLICY marketplace_order_items_select ON marketplace_order_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM marketplace_orders o
             WHERE o.id = marketplace_order_items.order_id
               AND (
                    (o.buyer_type = 'client' AND o.buyer_user_id = auth.uid())
                 OR (o.buyer_type = 'salon' AND (
                        EXISTS (SELECT 1 FROM salons s
                                 WHERE s.id = o.buyer_salon_id
                                   AND s.owner_id = auth.uid())
                     OR EXISTS (SELECT 1 FROM salon_members sm
                                 WHERE sm.salon_id = o.buyer_salon_id
                                   AND sm.profile_id = auth.uid())
                    ))
               )
        )
    );

-- ============================================================
-- 6. marketplace_shipments — shipping lifecycle
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_shipments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
    carrier         TEXT NOT NULL DEFAULT 'manual',
    tracking_number TEXT,
    tracking_url    TEXT,
    shipped_at      TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_shipments_order
    ON marketplace_shipments(order_id);

ALTER TABLE marketplace_shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_shipments_select ON marketplace_shipments;
CREATE POLICY marketplace_shipments_select ON marketplace_shipments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM marketplace_orders o
             WHERE o.id = marketplace_shipments.order_id
               AND (
                    (o.buyer_type = 'client' AND o.buyer_user_id = auth.uid())
                 OR (o.buyer_type = 'salon' AND (
                        EXISTS (SELECT 1 FROM salons s
                                 WHERE s.id = o.buyer_salon_id
                                   AND s.owner_id = auth.uid())
                     OR EXISTS (SELECT 1 FROM salon_members sm
                                 WHERE sm.salon_id = o.buyer_salon_id
                                   AND sm.profile_id = auth.uid())
                    ))
               )
        )
    );

DROP TRIGGER IF EXISTS trg_marketplace_shipments_updated_at ON marketplace_shipments;
CREATE TRIGGER trg_marketplace_shipments_updated_at
    BEFORE UPDATE ON marketplace_shipments
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ============================================================
-- 7. marketplace_inventory_adjustments — stock audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_inventory_adjustments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
    delta       INT NOT NULL,
    reason      TEXT NOT NULL,
    order_id    UUID REFERENCES marketplace_orders(id) ON DELETE SET NULL,
    admin_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_inventory_adjustments_reason_check
        CHECK (reason IN ('restock', 'order', 'return', 'correction', 'damage'))
);

CREATE INDEX IF NOT EXISTS idx_marketplace_inv_adj_product
    ON marketplace_inventory_adjustments(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_inv_adj_order
    ON marketplace_inventory_adjustments(order_id)
    WHERE order_id IS NOT NULL;

ALTER TABLE marketplace_inventory_adjustments ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for authenticated — only service_role reads/writes.

-- ============================================================
-- 8. Deferred FK: salon_marketplace_credit_ledger.order_id
-- ============================================================
-- The ledger (108) references orders, but orders table did not
-- exist yet. Add the FK now. Idempotent via DO block.
-- ============================================================
DO $$ BEGIN
    ALTER TABLE salon_marketplace_credit_ledger
        ADD CONSTRAINT smcl_order_fk
        FOREIGN KEY (order_id)
        REFERENCES marketplace_orders(id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- ============================================================
-- Done — 109_marketplace_catalog.sql
-- ============================================================
-- Tables:
--   - marketplace_sections         (2 seeded: professional, consumer)
--   - marketplace_categories       (tree)
--   - marketplace_products         (SKUs)
--   - marketplace_orders           (Stripe | marketplace_credit)
--   - marketplace_order_items
--   - marketplace_shipments
--   - marketplace_inventory_adjustments
--
-- Cross-migration:
--   - FK salon_marketplace_credit_ledger.order_id -> marketplace_orders.id
--
-- RLS:
--   - Products: consumer section public; professional section salons only
--   - Orders / items / shipments: buyer (user or salon) visibility
--   - No direct writes for authenticated; RPC / edge fn / webhook only
-- ============================================================
