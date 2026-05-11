-- ============================================
-- Migration 050: Consumable Data Integrity
-- ============================================
-- Adds CHECK constraints, deprecation comment,
-- audit trail protection, and performance index.
-- Idempotent: safe to re-run multiple times.
-- ============================================

-- ============================================
-- 1. CHECK: current_stock >= 0
-- ============================================
DO $$ BEGIN
    ALTER TABLE salon_consumables
        ADD CONSTRAINT chk_current_stock_non_negative CHECK (current_stock >= 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. CHECK: min_stock_threshold >= 0
-- ============================================
DO $$ BEGIN
    ALTER TABLE salon_consumables
        ADD CONSTRAINT chk_min_stock_threshold_non_negative CHECK (min_stock_threshold >= 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 3. CHECK: change_type allowed values
-- ============================================
DO $$ BEGIN
    ALTER TABLE consumable_stock_logs
        ADD CONSTRAINT chk_change_type_valid CHECK (
            change_type IN ('restock', 'usage', 'adjustment', 'correction', 'initial', 'reversal')
        );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 4. CHECK: usage_amount > 0
-- ============================================
DO $$ BEGIN
    ALTER TABLE consumable_service_usage
        ADD CONSTRAINT chk_usage_amount_positive CHECK (usage_amount > 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 5. DEPRECATE usage_per_service column
-- ============================================
COMMENT ON COLUMN salon_consumables.usage_per_service
    IS 'DEPRECATED – use the consumable_service_usage table instead for per-service usage amounts.';

-- ============================================
-- 6. Protect audit trail: change FK on
--    consumable_stock_logs.consumable_id
--    from ON DELETE CASCADE → ON DELETE RESTRICT
-- ============================================
DO $$ BEGIN
    -- Drop the existing CASCADE foreign key
    ALTER TABLE consumable_stock_logs
        DROP CONSTRAINT IF EXISTS consumable_stock_logs_consumable_id_fkey;

    -- Re-add with RESTRICT
    ALTER TABLE consumable_stock_logs
        ADD CONSTRAINT consumable_stock_logs_consumable_id_fkey
        FOREIGN KEY (consumable_id) REFERENCES salon_consumables(id)
        ON DELETE RESTRICT;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 7. Partial index for prediction queries on
--    completed appointments
-- ============================================
CREATE INDEX IF NOT EXISTS idx_appointments_completed_scheduled
    ON appointments(status, scheduled_at)
    WHERE status = 'completed';
