-- ============================================================
-- Migration 133: Multi-image support for marketplace products
-- ============================================================
-- Foundation for the Marketplace Maturity plan (#4).
--
-- The current `marketplace_products` table (mig 109) stores
-- images inline as a JSONB string array. To unlock per-image
-- metadata (alt text, ordering, dimensions, storage path for
-- cleanup), we move galleries to a dedicated relation.
--
-- The legacy `images` JSONB column on `marketplace_products`
-- is kept as a denormalized snapshot for read paths that have
-- not yet migrated. Backfill copies the first image of each
-- product into this table at sort_order = 0 so existing PDPs
-- keep working unchanged.
--
-- Catalog is platform-managed: writes are restricted to the
-- service_role (admin/edge functions). Reads are public.
--
-- A 8-image-per-product cap is enforced via a BEFORE INSERT
-- trigger that takes a transaction-scoped advisory lock on the
-- product_id to serialize concurrent inserts (otherwise two
-- inserts could each pass the COUNT check and both write).
-- ============================================================

CREATE TABLE IF NOT EXISTS marketplace_product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    storage_path TEXT,                       -- relative path inside the bucket for cleanup on delete
    alt_text TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    width INTEGER,
    height INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
    ON marketplace_product_images(product_id, sort_order);

ALTER TABLE marketplace_product_images ENABLE ROW LEVEL SECURITY;

-- Public read (catalog browse)
DROP POLICY IF EXISTS "Product images public read" ON marketplace_product_images;
CREATE POLICY "Product images public read"
    ON marketplace_product_images FOR SELECT USING (TRUE);

-- The catalog is platform-managed; only service_role writes.
DROP POLICY IF EXISTS "Admin manages product images" ON marketplace_product_images;
CREATE POLICY "Admin manages product images"
    ON marketplace_product_images FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 8-image-per-product cap
-- ============================================================
-- The advisory lock is keyed off product_id (md5'd to a bigint)
-- and held for the rest of the transaction, so two parallel
-- inserts on the same product serialize through the COUNT check.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_product_images_cap()
RETURNS TRIGGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(
        ('x' || substr(md5(NEW.product_id::text), 1, 16))::bit(64)::bigint
    );
    SELECT COUNT(*) INTO v_count
        FROM marketplace_product_images
        WHERE product_id = NEW.product_id;
    IF v_count >= 8 THEN
        RAISE EXCEPTION 'Product gallery is limited to 8 images (product_id=%).', NEW.product_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketplace_product_images_cap ON marketplace_product_images;
CREATE TRIGGER trg_marketplace_product_images_cap
    BEFORE INSERT ON marketplace_product_images
    FOR EACH ROW EXECUTE FUNCTION enforce_product_images_cap();

-- ============================================================
-- Backfill — copy the first image of each product into the
-- new table at sort_order = 0. The legacy `images` column on
-- marketplace_products is a JSONB string array (mig 109), so
-- we extract element 0. Skips products with empty galleries.
-- ============================================================
INSERT INTO marketplace_product_images (product_id, image_url, sort_order)
SELECT
    p.id,
    p.images->>0 AS image_url,
    0
FROM marketplace_products p
WHERE p.images IS NOT NULL
  AND jsonb_typeof(p.images) = 'array'
  AND jsonb_array_length(p.images) > 0
  AND p.images->>0 IS NOT NULL
  AND length(p.images->>0) > 0
ON CONFLICT DO NOTHING;

-- ============================================================
-- Done — 133_marketplace_product_images.sql
-- ============================================================
