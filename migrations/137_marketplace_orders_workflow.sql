-- ============================================================
-- Migration 137: Marketplace orders workflow (state machine
-- + tracking + audit log)
-- ============================================================
-- Extends `marketplace_orders` (mig 109) with fulfillment
-- columns and an audit table that captures every status
-- transition.
--
-- Existing CHECK constraint on status (mig 109) already
-- includes the full state set:
--   placed, paid, preparing, shipped, delivered,
--   cancelled, returned, refunded
-- so no constraint changes are required here. We add:
--
--   - tracking_carrier / tracking_number / shipping_label_url
--   - per-status timestamps (preparing_at, shipped_at,
--     delivered_at, refunded_at) auto-stamped by the trigger
--   - refund_amount_cents (running refund total for partial
--     refunds; full refund equals total_cents)
--
-- The status-change trigger inserts a row into
-- `marketplace_order_status_history` whenever NEW.status differs
-- from OLD.status, and stamps the side-effect timestamps if
-- they were still NULL. We deliberately only stamp on the
-- first transition into a status so re-entry (e.g.
-- shipped -> delivered -> shipped) does not overwrite the
-- original timestamp.
--
-- Note: mig 109 already has `shipped_at` and `delivered_at`
-- on marketplace_orders. We keep those as the canonical
-- columns and add `preparing_at` / `refunded_at`.
-- ============================================================

ALTER TABLE marketplace_orders
    ADD COLUMN IF NOT EXISTS tracking_carrier TEXT,
    ADD COLUMN IF NOT EXISTS tracking_number TEXT,
    ADD COLUMN IF NOT EXISTS shipping_label_url TEXT,
    ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
    ALTER TABLE marketplace_orders
        ADD CONSTRAINT marketplace_orders_refund_amount_nonneg
        CHECK (refund_amount_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- marketplace_order_status_history — audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_history_order
    ON marketplace_order_status_history(order_id, created_at DESC);

ALTER TABLE marketplace_order_status_history ENABLE ROW LEVEL SECURITY;

-- Buyers (client or salon owner) can read history of their orders.
DROP POLICY IF EXISTS "Owner reads own order history" ON marketplace_order_status_history;
CREATE POLICY "Owner reads own order history"
    ON marketplace_order_status_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM marketplace_orders o
            WHERE o.id = marketplace_order_status_history.order_id
              AND (
                    o.buyer_user_id = auth.uid()
                 OR EXISTS (
                        SELECT 1 FROM salons s
                        WHERE s.id = o.buyer_salon_id
                          AND s.owner_id = auth.uid()
                    )
              )
        )
    );

-- Only service_role inserts (the trigger runs as the calling
-- user but the table is platform-managed for write).
DROP POLICY IF EXISTS "Admin writes order history" ON marketplace_order_status_history;
CREATE POLICY "Admin writes order history"
    ON marketplace_order_status_history FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- log_marketplace_order_status_change
-- ------------------------------------------------------------
-- BEFORE UPDATE on marketplace_orders. When `status` changes:
--   1. Append a row to marketplace_order_status_history.
--   2. Stamp the matching side-effect timestamp on first
--      entry into that status.
--
-- The function is SECURITY DEFINER so it can write to the
-- audit table even when the calling user has no INSERT
-- privilege (the policy above limits direct inserts to
-- service_role, but this trigger is platform-trusted).
-- ============================================================
CREATE OR REPLACE FUNCTION log_marketplace_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO marketplace_order_status_history (
            order_id, from_status, to_status, changed_by
        ) VALUES (
            NEW.id, OLD.status, NEW.status, auth.uid()
        );

        -- Side-effect timestamps (only on first entry).
        IF NEW.status = 'preparing' AND OLD.preparing_at IS NULL THEN
            NEW.preparing_at := NOW();
        END IF;
        IF NEW.status = 'shipped' AND OLD.shipped_at IS NULL THEN
            NEW.shipped_at := NOW();
        END IF;
        IF NEW.status = 'delivered' AND OLD.delivered_at IS NULL THEN
            NEW.delivered_at := NOW();
        END IF;
        IF NEW.status = 'refunded' AND OLD.refunded_at IS NULL THEN
            NEW.refunded_at := NOW();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_order_status_log ON marketplace_orders;
CREATE TRIGGER trg_marketplace_order_status_log
    BEFORE UPDATE ON marketplace_orders
    FOR EACH ROW EXECUTE FUNCTION log_marketplace_order_status_change();

-- ============================================================
-- Done — 137_marketplace_orders_workflow.sql
-- ============================================================
