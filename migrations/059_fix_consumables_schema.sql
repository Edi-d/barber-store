-- ============================================
-- Migration 046a: Fix salon_consumables schema
-- Adds missing columns if the table already exists
-- Run this BEFORE 046 if you get column errors
-- ============================================

-- Add missing columns (safe - IF NOT EXISTS)
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS product_sku TEXT;
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'ml';
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS unit_cost_cents INT;
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS current_stock NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS min_stock_threshold NUMERIC(10,2) DEFAULT 0;
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS usage_per_service NUMERIC(10,2);
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE salon_consumables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add unique constraint if missing (ignore error if exists)
DO $$
BEGIN
    ALTER TABLE salon_consumables ADD CONSTRAINT salon_consumables_salon_id_product_sku_key UNIQUE (salon_id, product_sku);
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;
