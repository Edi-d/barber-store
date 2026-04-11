-- ============================================
-- Migration 046: Consumables (Consumabile)
-- ============================================
-- Idempotent: safe to re-run multiple times
-- ============================================

-- ============================================
-- 1. salon_consumables — Products the salon uses
-- ============================================
CREATE TABLE IF NOT EXISTS salon_consumables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    product_sku TEXT,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT DEFAULT 'general',
    unit TEXT NOT NULL DEFAULT 'ml',
    unit_cost_cents INT,
    current_stock NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_stock_threshold NUMERIC(10,2) DEFAULT 0,
    usage_per_service NUMERIC(10,2),
    image_url TEXT,
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add unique constraint safely
DO $$ BEGIN
    ALTER TABLE salon_consumables ADD CONSTRAINT salon_consumables_salon_id_product_sku_key UNIQUE (salon_id, product_sku);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE salon_consumables ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_salon_consumables_salon ON salon_consumables(salon_id);
CREATE INDEX IF NOT EXISTS idx_salon_consumables_salon_category ON salon_consumables(salon_id, category);
CREATE INDEX IF NOT EXISTS idx_salon_consumables_salon_active ON salon_consumables(salon_id, active);
CREATE INDEX IF NOT EXISTS idx_salon_consumables_sku ON salon_consumables(salon_id, product_sku);

-- RLS (drop + recreate to be idempotent)
DROP POLICY IF EXISTS "Salon members can view consumables" ON salon_consumables;
CREATE POLICY "Salon members can view consumables" ON salon_consumables
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_members sm WHERE sm.salon_id = salon_consumables.salon_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salons s WHERE s.id = salon_consumables.salon_id AND s.owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Owner can insert consumables" ON salon_consumables;
CREATE POLICY "Owner can insert consumables" ON salon_consumables
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can update consumables" ON salon_consumables;
CREATE POLICY "Owner can update consumables" ON salon_consumables
    FOR UPDATE USING (EXISTS (SELECT 1 FROM salons s WHERE s.id = salon_consumables.salon_id AND s.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can delete consumables" ON salon_consumables;
CREATE POLICY "Owner can delete consumables" ON salon_consumables
    FOR DELETE USING (EXISTS (SELECT 1 FROM salons s WHERE s.id = salon_consumables.salon_id AND s.owner_id = auth.uid()));

-- ============================================
-- 2. consumable_service_usage
-- ============================================
CREATE TABLE IF NOT EXISTS consumable_service_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consumable_id UUID NOT NULL REFERENCES salon_consumables(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES barber_services(id) ON DELETE CASCADE,
    usage_amount NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(consumable_id, service_id)
);

ALTER TABLE consumable_service_usage ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_consumable_service_usage_consumable ON consumable_service_usage(consumable_id);
CREATE INDEX IF NOT EXISTS idx_consumable_service_usage_service ON consumable_service_usage(service_id);

DROP POLICY IF EXISTS "Salon members can view consumable service usage" ON consumable_service_usage;
CREATE POLICY "Salon members can view consumable service usage" ON consumable_service_usage
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_consumables sc JOIN salon_members sm ON sm.salon_id = sc.salon_id WHERE sc.id = consumable_service_usage.consumable_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_consumables sc JOIN salons s ON s.id = sc.salon_id WHERE sc.id = consumable_service_usage.consumable_id AND s.owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Owner can insert consumable service usage" ON consumable_service_usage;
CREATE POLICY "Owner can insert consumable service usage" ON consumable_service_usage
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM salon_consumables sc JOIN salons s ON s.id = sc.salon_id WHERE sc.id = consumable_id AND s.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can update consumable service usage" ON consumable_service_usage;
CREATE POLICY "Owner can update consumable service usage" ON consumable_service_usage
    FOR UPDATE USING (EXISTS (SELECT 1 FROM salon_consumables sc JOIN salons s ON s.id = sc.salon_id WHERE sc.id = consumable_service_usage.consumable_id AND s.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can delete consumable service usage" ON consumable_service_usage;
CREATE POLICY "Owner can delete consumable service usage" ON consumable_service_usage
    FOR DELETE USING (EXISTS (SELECT 1 FROM salon_consumables sc JOIN salons s ON s.id = sc.salon_id WHERE sc.id = consumable_service_usage.consumable_id AND s.owner_id = auth.uid()));

-- ============================================
-- 3. consumable_stock_logs
-- ============================================
CREATE TABLE IF NOT EXISTS consumable_stock_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consumable_id UUID NOT NULL REFERENCES salon_consumables(id) ON DELETE CASCADE,
    change_amount NUMERIC(10,2) NOT NULL,
    change_type TEXT NOT NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE consumable_stock_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_consumable_stock_logs_consumable_date ON consumable_stock_logs(consumable_id, created_at DESC);

DROP POLICY IF EXISTS "Salon members can view stock logs" ON consumable_stock_logs;
CREATE POLICY "Salon members can view stock logs" ON consumable_stock_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salon_consumables sc JOIN salon_members sm ON sm.salon_id = sc.salon_id WHERE sc.id = consumable_stock_logs.consumable_id AND sm.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_consumables sc JOIN salons s ON s.id = sc.salon_id WHERE sc.id = consumable_stock_logs.consumable_id AND s.owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Owner can insert stock logs" ON consumable_stock_logs;
CREATE POLICY "Owner can insert stock logs" ON consumable_stock_logs
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM salon_consumables sc JOIN salons s ON s.id = sc.salon_id WHERE sc.id = consumable_id AND s.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can update stock logs" ON consumable_stock_logs;
CREATE POLICY "Owner can update stock logs" ON consumable_stock_logs
    FOR UPDATE USING (EXISTS (SELECT 1 FROM salon_consumables sc JOIN salons s ON s.id = sc.salon_id WHERE sc.id = consumable_stock_logs.consumable_id AND s.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can delete stock logs" ON consumable_stock_logs;
CREATE POLICY "Owner can delete stock logs" ON consumable_stock_logs
    FOR DELETE USING (EXISTS (SELECT 1 FROM salon_consumables sc JOIN salons s ON s.id = sc.salon_id WHERE sc.id = consumable_stock_logs.consumable_id AND s.owner_id = auth.uid()));

-- ============================================
-- 4. Trigger: auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_salon_consumables_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_salon_consumables_updated_at ON salon_consumables;
CREATE TRIGGER trg_salon_consumables_updated_at
    BEFORE UPDATE ON salon_consumables
    FOR EACH ROW EXECUTE FUNCTION update_salon_consumables_updated_at();
