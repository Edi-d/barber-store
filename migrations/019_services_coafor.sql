-- Migration 019: Extend services system for coafor (hair salon) support
-- Adds multi-salon-type services, variable pricing, dynamic categories
-- =====================================================================

-- =====================================================================
-- 1. Extend salon_type to support 4 types
-- =====================================================================

ALTER TABLE salons DROP CONSTRAINT IF EXISTS salons_salon_type_check;
ALTER TABLE salons ADD CONSTRAINT salons_salon_type_check
    CHECK (salon_type IN ('barbershop', 'coafor', 'mixt', 'beauty'));

-- =====================================================================
-- 2. Add new columns to barber_services
-- =====================================================================

ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'barbershop';
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS price_cents_min INT;
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS price_cents_max INT;
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS pricing_model TEXT DEFAULT 'fix';
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS duration_min_max INT;
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS is_trending BOOLEAN DEFAULT FALSE;
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS requires_consultation BOOLEAN DEFAULT FALSE;
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS variable_by_length BOOLEAN DEFAULT FALSE;
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'unisex';
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS icon_name TEXT;

-- Add check constraints (drop first to be idempotent)
ALTER TABLE barber_services DROP CONSTRAINT IF EXISTS barber_services_pricing_model_check;
ALTER TABLE barber_services ADD CONSTRAINT barber_services_pricing_model_check
    CHECK (pricing_model IN ('fix', 'de_la', 'la_consultatie'));

ALTER TABLE barber_services DROP CONSTRAINT IF EXISTS barber_services_gender_check;
ALTER TABLE barber_services ADD CONSTRAINT barber_services_gender_check
    CHECK (gender IN ('barbati', 'femei', 'unisex'));

-- =====================================================================
-- 3. Create service_categories table
-- =====================================================================

CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    icon_name TEXT,
    gender TEXT DEFAULT 'unisex' CHECK (gender IN ('barbati', 'femei', 'unisex')),
    salon_types TEXT[] NOT NULL DEFAULT '{barbershop}',
    sort_order INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 4. Seed categories (Romanian, exact order)
-- =====================================================================

INSERT INTO service_categories (slug, label, icon_name, gender, salon_types, sort_order)
VALUES
    ('tuns_barbati',       'Tuns Barbati',        'scissors',  'barbati', '{barbershop,mixt}',              1),
    ('barba',              'Barba',               'user',      'barbati', '{barbershop,mixt}',              2),
    ('tuns_femei',         'Tuns Femei',          'scissors',  'femei',   '{coafor,mixt,beauty}',           3),
    ('coafuri',            'Coafuri / Styling',   'wind',      'femei',   '{coafor,mixt,beauty}',           4),
    ('colorare',           'Colorare',            'droplet',   'femei',   '{coafor,mixt,beauty}',           5),
    ('tratamente_par',     'Tratamente Par',      'heart',     'unisex',  '{coafor,mixt,beauty}',           6),
    ('sprancene_gene',     'Sprancene & Gene',    'eye',       'femei',   '{coafor,beauty}',                7),
    ('manichiura',         'Manichiura',          'hand',      'femei',   '{beauty}',                       8),
    ('pedichiura',         'Pedichiura',          'star',      'femei',   '{beauty}',                       9),
    ('makeup',             'Makeup',              'edit-3',    'femei',   '{beauty}',                      10),
    ('epilare',            'Epilare',             'zap',       'femei',   '{beauty}',                      11),
    ('tratamente_faciale', 'Tratamente Faciale',  'sun',       'unisex',  '{beauty}',                      12),
    ('ingrijire_barbati',  'Ingrijire Barbati',   'user',      'barbati', '{barbershop,mixt}',             13),
    ('pachete',            'Pachete',             'gift',      'unisex',  '{barbershop,coafor,mixt,beauty}',14)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- 5. Migrate existing category values in barber_services
-- =====================================================================

-- tuns / Tuns → tuns_barbati
UPDATE barber_services
SET category = 'tuns_barbati', service_type = 'barbershop', gender = 'barbati'
WHERE category IN ('tuns', 'Tuns');

-- barba / Barbă → barba
UPDATE barber_services
SET category = 'barba', service_type = 'barbershop', gender = 'barbati'
WHERE category IN ('barba', 'Barbă', 'Barba');

-- pachete / Pachete → pachete
UPDATE barber_services
SET category = 'pachete', service_type = 'unisex', gender = 'unisex'
WHERE category IN ('pachete', 'Pachete');

-- colorare → colorare
UPDATE barber_services
SET category = 'colorare', service_type = 'coafor', gender = 'femei'
WHERE category = 'colorare';

-- tratament → tratamente_par
UPDATE barber_services
SET category = 'tratamente_par', service_type = 'unisex', gender = 'unisex'
WHERE category = 'tratament';

-- general → keep category, set type/gender
UPDATE barber_services
SET service_type = 'unisex', gender = 'unisex'
WHERE category = 'general';

-- =====================================================================
-- 6. Indexes
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_barber_services_category
    ON barber_services(category);

CREATE INDEX IF NOT EXISTS idx_barber_services_service_type
    ON barber_services(service_type);

CREATE INDEX IF NOT EXISTS idx_service_categories_salon_types
    ON service_categories USING gin(salon_types);

-- =====================================================================
-- 7. RLS for service_categories
-- =====================================================================

ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;

-- SELECT: everyone can view active categories
DROP POLICY IF EXISTS service_categories_select_policy ON service_categories;
CREATE POLICY service_categories_select_policy ON service_categories
    FOR SELECT
    USING (active = TRUE);

-- INSERT: admin / service role only
DROP POLICY IF EXISTS service_categories_insert_policy ON service_categories;
CREATE POLICY service_categories_insert_policy ON service_categories
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- UPDATE: admin / service role only
DROP POLICY IF EXISTS service_categories_update_policy ON service_categories;
CREATE POLICY service_categories_update_policy ON service_categories
    FOR UPDATE
    USING (auth.role() = 'service_role');

-- DELETE: admin / service role only
DROP POLICY IF EXISTS service_categories_delete_policy ON service_categories;
CREATE POLICY service_categories_delete_policy ON service_categories
    FOR DELETE
    USING (auth.role() = 'service_role');
