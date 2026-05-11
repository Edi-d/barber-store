-- ============================================================
-- Migration 134: Marketplace product variants
-- ============================================================
-- Variants extend a base product with size/color/scent/pack-size
-- (or any other attribute combination). They optionally override
-- price and stock from the parent product; when override columns
-- are NULL the variant inherits the base values.
--
-- - `attributes` is a free-form JSON map (e.g. {"size":"M",
--   "color":"Black"}) so the UI can render variant pickers
--   without a rigid attribute table.
-- - `sku` is unique when present (NULL is allowed for variants
--   that share the parent SKU).
-- - Catalog is platform-managed: only service_role writes.
-- - Public read is filtered on `active = TRUE` to keep the API
--   surface small.
-- ============================================================

CREATE TABLE IF NOT EXISTS marketplace_product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
    sku TEXT,
    name TEXT NOT NULL,                    -- "250ml" or "Black, M"
    price_cents_override INTEGER,          -- NULL = inherit base product price
    stock_qty_override INTEGER,            -- NULL = inherit base
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product
    ON marketplace_product_variants(product_id, sort_order)
    WHERE active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variant_sku
    ON marketplace_product_variants(sku)
    WHERE sku IS NOT NULL;

ALTER TABLE marketplace_product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Variants public read" ON marketplace_product_variants;
CREATE POLICY "Variants public read"
    ON marketplace_product_variants FOR SELECT
    USING (active = TRUE);

DROP POLICY IF EXISTS "Admin manages variants" ON marketplace_product_variants;
CREATE POLICY "Admin manages variants"
    ON marketplace_product_variants FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION update_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_variants_updated_at ON marketplace_product_variants;
CREATE TRIGGER trg_variants_updated_at
    BEFORE UPDATE ON marketplace_product_variants
    FOR EACH ROW EXECUTE FUNCTION update_variants_updated_at();

-- ============================================================
-- Done — 134_marketplace_product_variants.sql
-- ============================================================
