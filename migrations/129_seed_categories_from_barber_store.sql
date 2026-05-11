-- ============================================================
-- 129_seed_categories_from_barber_store.sql
--
-- Seeds the marketplace_categories tree from barber-store.ro so the
-- mobile app's catalog mirrors the existing web shop the customers are
-- already used to.
--
-- Slugs match barber-store.ro URLs 1:1 (e.g., /masini-de-tuns →
-- slug='masini-de-tuns'), which keeps the future product import
-- straightforward — every product can map by category slug.
--
-- All categories go to section='consumer' (publicly visible to salons
-- AND end customers, matching how the web site treats them — no
-- access gate). If a category later needs to become salon-only, flip
-- via UPDATE rather than re-importing.
--
-- Idempotent: re-running this migration is safe — ON CONFLICT clauses
-- update title/sort_order without losing existing FK references from
-- products that may have been assigned to these categories.
-- ============================================================

BEGIN;

-- ── 1. Top-level (parent) categories ──────────────────────────
INSERT INTO marketplace_categories (section, parent_id, slug, title_ro, sort_order, is_active)
VALUES
    ('consumer', NULL, 'aparatura',           'Aparatura',           10, TRUE),
    ('consumer', NULL, 'foarfeci',            'Foarfeci',            20, TRUE),
    ('consumer', NULL, 'piepteni-si-perii',   'Piepteni si perii',   30, TRUE),
    ('consumer', NULL, 'ingrijirea-parului',  'Ingrijirea parului',  40, TRUE),
    ('consumer', NULL, 'ingrijirea-corpului', 'Ingrijirea corpului', 50, TRUE),
    ('consumer', NULL, 'barba-si-mustata',    'Barba si mustata',    60, TRUE),
    ('consumer', NULL, 'produse-igiena',      'Produse igiena',      70, TRUE)
ON CONFLICT (section, slug) DO UPDATE
    SET title_ro   = EXCLUDED.title_ro,
        sort_order = EXCLUDED.sort_order,
        is_active  = TRUE,
        updated_at = NOW();

-- ── 2. Subcategories (lookup parent by slug for readability) ──
-- We use a single INSERT...SELECT per parent so the file stays scannable.
-- Each child's sort_order matches the order it appears on barber-store.ro.

-- 2a. Aparatura
INSERT INTO marketplace_categories (section, parent_id, slug, title_ro, sort_order)
SELECT 'consumer', p.id, c.slug, c.title_ro, c.sort_order
FROM (VALUES
    ('masini-de-tuns',                    'Masini de tuns',                    10),
    ('masini-de-contur',                  'Masini de contur',                  20),
    ('masini-de-ras',                     'Masini de ras',                     30),
    ('seturi-combo',                      'Seturi Combo',                      40),
    ('aparate-masaj',                     'Aparate masaj',                     50),
    ('uscatoare-par',                     'Uscatoare Par',                     60),
    ('reclame-luminoase',                 'Reclame luminoase',                 70),
    ('cutite-masini-de-tuns',             'Cutite masini de tuns',             80),
    ('lame-ceramice-2',                   'Lame ceramice',                     90),
    ('cutite-pentru-masina-de-contur',    'Cutite masini de contur',          100),
    ('folie-masina-de-ras-2',             'Folie masina de ras',              110),
    ('placi-de-par',                      'Placi de par',                     120),
    ('gratare-masini-de-tuns',            'Gratare',                          130),
    ('accesorii-si-piese-aparatura',      'Accesorii si piese aparatura',     140),
    ('intretinere-aparatura',             'Intretinere aparatura',            150)
) AS c(slug, title_ro, sort_order)
JOIN marketplace_categories p
    ON p.section = 'consumer' AND p.slug = 'aparatura' AND p.parent_id IS NULL
ON CONFLICT (section, slug) DO UPDATE
    SET title_ro   = EXCLUDED.title_ro,
        sort_order = EXCLUDED.sort_order,
        parent_id  = EXCLUDED.parent_id,
        is_active  = TRUE,
        updated_at = NOW();

-- 2b. Foarfeci
INSERT INTO marketplace_categories (section, parent_id, slug, title_ro, sort_order)
SELECT 'consumer', p.id, c.slug, c.title_ro, c.sort_order
FROM (VALUES
    ('foarfeci-tuns',     'Foarfeci Tuns',     10),
    ('foarfeci-filat',    'Foarfeci Filat',    20),
    ('seturi-foarfeci',   'Seturi foarfeci',   30),
    ('borseta-foarfece',  'Borseta foarfece',  40)
) AS c(slug, title_ro, sort_order)
JOIN marketplace_categories p
    ON p.section = 'consumer' AND p.slug = 'foarfeci' AND p.parent_id IS NULL
ON CONFLICT (section, slug) DO UPDATE
    SET title_ro   = EXCLUDED.title_ro,
        sort_order = EXCLUDED.sort_order,
        parent_id  = EXCLUDED.parent_id,
        is_active  = TRUE,
        updated_at = NOW();

-- 2c. Piepteni si perii
INSERT INTO marketplace_categories (section, parent_id, slug, title_ro, sort_order)
SELECT 'consumer', p.id, c.slug, c.title_ro, c.sort_order
FROM (VALUES
    ('piepteni',     'Piepteni',     10),
    ('perii-coafat', 'Perii coafat', 20),
    ('perii-fade',   'Perii fade',   30)
) AS c(slug, title_ro, sort_order)
JOIN marketplace_categories p
    ON p.section = 'consumer' AND p.slug = 'piepteni-si-perii' AND p.parent_id IS NULL
ON CONFLICT (section, slug) DO UPDATE
    SET title_ro   = EXCLUDED.title_ro,
        sort_order = EXCLUDED.sort_order,
        parent_id  = EXCLUDED.parent_id,
        is_active  = TRUE,
        updated_at = NOW();

-- 2d. Ingrijirea parului
INSERT INTO marketplace_categories (section, parent_id, slug, title_ro, sort_order)
SELECT 'consumer', p.id, c.slug, c.title_ro, c.sort_order
FROM (VALUES
    ('ceara-pentru-par',  'Ceara pentru par',   10),
    ('grooming',          'Grooming',           20),
    ('gel-de-par',        'Gel de par',         30),
    ('pudra-volum',       'Pudra Volum',        40),
    ('lotiune-par',       'Lotiune par',        50),
    ('fixative',          'Fixative',           60),
    ('sampon-par',        'Sampon par',         70),
    ('balsam-par',        'Balsam par',         80),
    ('ulei-de-par',       'Ulei de par',        90),
    ('vopsea-de-par',     'Vopsea de par',     100),
    ('colonie',           'Colonie',           110),
    ('tratamente-par',    'Tratamente par',    120),
    ('spray-colorate',    'Spray colorate',    130)
) AS c(slug, title_ro, sort_order)
JOIN marketplace_categories p
    ON p.section = 'consumer' AND p.slug = 'ingrijirea-parului' AND p.parent_id IS NULL
ON CONFLICT (section, slug) DO UPDATE
    SET title_ro   = EXCLUDED.title_ro,
        sort_order = EXCLUDED.sort_order,
        parent_id  = EXCLUDED.parent_id,
        is_active  = TRUE,
        updated_at = NOW();

-- 2e. Ingrijirea corpului
INSERT INTO marketplace_categories (section, parent_id, slug, title_ro, sort_order)
SELECT 'consumer', p.id, c.slug, c.title_ro, c.sort_order
FROM (VALUES
    ('parfumuri',   'Parfumuri',   10),
    ('deodorante',  'Deodorante',  20)
) AS c(slug, title_ro, sort_order)
JOIN marketplace_categories p
    ON p.section = 'consumer' AND p.slug = 'ingrijirea-corpului' AND p.parent_id IS NULL
ON CONFLICT (section, slug) DO UPDATE
    SET title_ro   = EXCLUDED.title_ro,
        sort_order = EXCLUDED.sort_order,
        parent_id  = EXCLUDED.parent_id,
        is_active  = TRUE,
        updated_at = NOW();

-- 2f. Barba si mustata
INSERT INTO marketplace_categories (section, parent_id, slug, title_ro, sort_order)
SELECT 'consumer', p.id, c.slug, c.title_ro, c.sort_order
FROM (VALUES
    ('tratament-barba', 'Tratament barba',  10),
    ('ulei-barba',      'Ulei barba',       20),
    ('balsam-barba',    'Balsam barba',     30),
    ('sampon-barba',    'Sampon barba',     40),
    ('ceara-mustata',   'Ceara mustata',    50),
    ('aparate-trimmer', 'Trimmere',         60)
) AS c(slug, title_ro, sort_order)
JOIN marketplace_categories p
    ON p.section = 'consumer' AND p.slug = 'barba-si-mustata' AND p.parent_id IS NULL
ON CONFLICT (section, slug) DO UPDATE
    SET title_ro   = EXCLUDED.title_ro,
        sort_order = EXCLUDED.sort_order,
        parent_id  = EXCLUDED.parent_id,
        is_active  = TRUE,
        updated_at = NOW();

-- ── 3. Brands lookup table ────────────────────────────────────
-- Brand-as-string already exists on marketplace_products.brand. We
-- add a lookup table so the app can render a "Branduri" row on the
-- shop homepage (logo + slug), matching barber-store.ro's brand
-- showcase. The text on products stays — this is purely additive.
CREATE TABLE IF NOT EXISTS marketplace_brands (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    logo_url    TEXT,
    /** Optional: featured brands appear on the marketplace home row. */
    is_featured BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE marketplace_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_brands_select ON marketplace_brands;
CREATE POLICY marketplace_brands_select ON marketplace_brands
    FOR SELECT TO authenticated USING (TRUE);

-- Seed brands matching the URLs/names on barber-store.ro. Logos to be
-- uploaded later (slug column matches the brand-page slug on the web
-- so logos can be migrated by name).
INSERT INTO marketplace_brands (slug, name, sort_order)
VALUES
    ('pop-barbers',                                        'POP BARBERS',           10),
    ('kiepe',                                              'KIEPE',                 20),
    ('gama-cel-mai-bun-brand-pentru-masini-de-tuns',       'GA.MA BARBER SERIES',   30),
    ('l3vel3',                                             'L3VEL3',                40),
    ('menoser',                                            'MENOSER',               50),
    ('rovra',                                              'ROVRA',                 60),
    ('tassel',                                             'TASSEL',                70),
    ('mirplay',                                            'MIRPLAY',               80),
    ('glemen',                                             'GLEMEN',                90),
    ('occ',                                                'OCC',                  100)
ON CONFLICT (slug) DO UPDATE
    SET name       = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        is_active  = TRUE,
        updated_at = NOW();

-- ── 4. 3-tier pricing on products (PRP + list + current) ──────
-- barber-store.ro displays three prices on each product card:
--   PRP   — manufacturer's recommended retail price (struck through)
--   list  — "old" price (struck through)
--   final — current price (bold, brand color)
-- Add both nullable columns; products without a PRP / compare-at
-- price simply render the current price alone.
ALTER TABLE marketplace_products
    ADD COLUMN IF NOT EXISTS prp_cents              INTEGER,
    ADD COLUMN IF NOT EXISTS compare_at_price_cents INTEGER;

ALTER TABLE marketplace_products
    DROP CONSTRAINT IF EXISTS marketplace_products_price_chain;

ALTER TABLE marketplace_products
    ADD CONSTRAINT marketplace_products_price_chain
    CHECK (
        (prp_cents              IS NULL OR prp_cents              >= price_cents)
    AND (compare_at_price_cents IS NULL OR compare_at_price_cents >= price_cents)
    AND (
            prp_cents IS NULL OR compare_at_price_cents IS NULL
            OR prp_cents >= compare_at_price_cents
        )
    );

-- "NOU" badge driver — already covered by `created_at`; the app uses
-- a 30-day window. No new column needed.

COMMIT;

-- After running this migration, verify with:
--   SELECT
--       p.title_ro AS parent,
--       c.title_ro AS child,
--       c.slug
--   FROM marketplace_categories c
--   LEFT JOIN marketplace_categories p ON p.id = c.parent_id
--   WHERE c.section = 'consumer'
--   ORDER BY COALESCE(p.sort_order, c.sort_order), c.sort_order;
