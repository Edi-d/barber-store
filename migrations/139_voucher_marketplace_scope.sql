-- ============================================================
-- Migration 139: Loyalty voucher marketplace scope
-- ============================================================
-- Adds a `scope` column to `loyalty_vouchers` (mig 055) so the
-- redemption flow can restrict where a voucher is usable:
--
--   'all'         (default) — usable for both services and
--                              marketplace purchases
--   'services'    — only at the chair (existing behavior)
--   'marketplace' — only at marketplace checkout
--
-- The actual table name is `loyalty_vouchers` (confirmed in
-- migration 055). Default 'all' preserves the legacy behavior
-- for already-issued vouchers.
--
-- The partial index on `scope` is filtered to vouchers that
-- have not yet been used (status = 'active' implicitly: we use
-- the legacy `used_at IS NULL` predicate to keep this index
-- cheap and aligned with checkout-side lookups).
-- ============================================================

ALTER TABLE loyalty_vouchers
    ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'all';

DO $$ BEGIN
    ALTER TABLE loyalty_vouchers
        ADD CONSTRAINT loyalty_vouchers_scope_check
        CHECK (scope IN ('all', 'services', 'marketplace'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Marketplace checkout looks up active, unused vouchers; this
-- index lets that query stay narrow.
CREATE INDEX IF NOT EXISTS idx_loyalty_vouchers_scope
    ON loyalty_vouchers(scope)
    WHERE used_at IS NULL;

-- ============================================================
-- Done — 139_voucher_marketplace_scope.sql
-- ============================================================
