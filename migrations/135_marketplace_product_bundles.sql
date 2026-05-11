-- ============================================================
-- Migration 135: Marketplace product bundles
-- ============================================================
-- A bundle is a fixed-price set of products (optionally pinned
-- to a specific variant per item). Bundles have their own
-- visibility window (`starts_at` / `ends_at`) so admins can
-- schedule promotions without flipping `active` manually.
--
-- The companion view `v_marketplace_bundles_with_savings`
-- pre-computes the savings vs. the sum of item prices so the
-- UI can show "Economisesti X RON" without running the math
-- client-side.
--
-- Catalog is platform-managed: writes restricted to service_role.
-- ============================================================

CREATE TABLE IF NOT EXISTS marketplace_product_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RON',
    cover_image_url TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_bundles_price_nonneg CHECK (price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_bundles_active_window
    ON marketplace_product_bundles(active, starts_at, ends_at)
    WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS marketplace_product_bundle_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id UUID NOT NULL REFERENCES marketplace_product_bundles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES marketplace_product_variants(id) ON DELETE SET NULL,
    qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
    UNIQUE (bundle_id, product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle
    ON marketplace_product_bundle_items(bundle_id);

ALTER TABLE marketplace_product_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_product_bundle_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bundles public read" ON marketplace_product_bundles;
CREATE POLICY "Bundles public read"
    ON marketplace_product_bundles FOR SELECT
    USING (
        active = TRUE
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (ends_at IS NULL OR ends_at > NOW())
    );

DROP POLICY IF EXISTS "Bundle items public read" ON marketplace_product_bundle_items;
CREATE POLICY "Bundle items public read"
    ON marketplace_product_bundle_items FOR SELECT
    USING (TRUE);

DROP POLICY IF EXISTS "Admin manages bundles" ON marketplace_product_bundles;
CREATE POLICY "Admin manages bundles"
    ON marketplace_product_bundles FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin manages bundle items" ON marketplace_product_bundle_items;
CREATE POLICY "Admin manages bundle items"
    ON marketplace_product_bundle_items FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS trg_marketplace_bundles_updated_at ON marketplace_product_bundles;
CREATE TRIGGER trg_marketplace_bundles_updated_at
    BEFORE UPDATE ON marketplace_product_bundles
    FOR EACH ROW EXECUTE FUNCTION update_variants_updated_at();

-- ============================================================
-- v_marketplace_bundles_with_savings — display helper
-- ============================================================
-- Sums per-item base prices (snapshotted from marketplace_products)
-- and exposes the delta to the bundle price as `savings_cents`.
-- Bundles with no items return 0 / 0 so the UI can render them
-- without special-casing.
-- ============================================================
CREATE OR REPLACE VIEW v_marketplace_bundles_with_savings AS
SELECT
    b.*,
    COALESCE(SUM(p.price_cents * bi.qty), 0)::INTEGER AS items_total_cents,
    GREATEST(
        0,
        COALESCE(SUM(p.price_cents * bi.qty), 0) - b.price_cents
    )::INTEGER AS savings_cents
FROM marketplace_product_bundles b
LEFT JOIN marketplace_product_bundle_items bi ON bi.bundle_id = b.id
LEFT JOIN marketplace_products p ON p.id = bi.product_id
GROUP BY b.id;

-- ============================================================
-- Done — 135_marketplace_product_bundles.sql
-- ============================================================
