-- ============================================================
-- Migration 136: Sale price + scheduling window for marketplace
-- ============================================================
-- Adds three columns to `marketplace_products`:
--
--   - sale_price_cents      Effective price during a campaign.
--                            NULL when no sale is configured.
--   - sale_starts_at        NULL means "active immediately
--                            once sale_price_cents is set".
--   - sale_ends_at          NULL means "active until cleared".
--
-- And `description_sections` JSONB for richer PDPs, with the
-- shape:
--   [{ "type": "overview"|"ingredients"|"how_to_use"|"faqs",
--      "title": "...", "body": "..." }]
--
-- The helper `marketplace_product_effective_price(product_id)`
-- returns the active price (sale if the window is currently
-- open, otherwise the base `price_cents`). It is STABLE so
-- query planners can fold it into expression indexes if needed.
-- ============================================================

ALTER TABLE marketplace_products
    ADD COLUMN IF NOT EXISTS sale_price_cents INTEGER,
    ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS description_sections JSONB
        NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
    ALTER TABLE marketplace_products
        ADD CONSTRAINT marketplace_products_sale_price_nonneg
        CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_products_active_sale_window
    ON marketplace_products(sale_starts_at, sale_ends_at)
    WHERE sale_price_cents IS NOT NULL;

-- ============================================================
-- marketplace_product_effective_price(product_id)
-- ------------------------------------------------------------
-- Returns the price that should currently be charged. Falls
-- back to the base `price_cents` outside the configured sale
-- window or when no sale is configured.
-- ============================================================
CREATE OR REPLACE FUNCTION marketplace_product_effective_price(p_product_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $$
    SELECT CASE
        WHEN sale_price_cents IS NOT NULL
            AND (sale_starts_at IS NULL OR sale_starts_at <= NOW())
            AND (sale_ends_at IS NULL OR sale_ends_at > NOW())
        THEN sale_price_cents
        ELSE price_cents
    END
    FROM marketplace_products
    WHERE id = p_product_id;
$$;

-- ============================================================
-- Done — 136_marketplace_product_sale_window.sql
-- ============================================================
