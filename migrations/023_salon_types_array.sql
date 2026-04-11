-- ============================================
-- Migration 023: salon_type → salon_types (array)
-- ============================================
-- Allows salons to have multiple types
-- e.g. both 'barbershop' and 'beauty'
-- ============================================

-- 1. Add new array column
ALTER TABLE salons ADD COLUMN IF NOT EXISTS salon_types TEXT[] DEFAULT '{barbershop}';

-- 2. Migrate existing data from salon_type → salon_types
UPDATE salons SET salon_types = ARRAY[salon_type] WHERE salon_type IS NOT NULL;

-- 3. Drop old constraint and column
ALTER TABLE salons DROP CONSTRAINT IF EXISTS salons_salon_type_check;
ALTER TABLE salons DROP COLUMN IF EXISTS salon_type;

-- 4. Create GIN index for array containment queries
CREATE INDEX IF NOT EXISTS idx_salons_types ON salons USING gin(salon_types);
