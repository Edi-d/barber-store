-- ============================================================
-- Migration 138: Marketplace order returns / refund requests
-- ============================================================
-- Buyers (clients or salon owners) request returns; the platform
-- approves, rejects, or refunds them. The lifecycle:
--
--   requested -> approved -> refunded
--                |
--                +-> rejected
--                +-> cancelled (buyer withdrew)
--
-- - `refund_amount_cents` is requested up-front; the actual
--   amount that hit Stripe is mirrored back into
--   `marketplace_orders.refund_amount_cents` by the edge fn
--   that processes the refund.
-- - `stripe_refund_id` is populated when the refund is
--   completed via Stripe.
-- - `resolved_at` is stamped by the edge function on transition
--   into a terminal state (refunded / rejected / cancelled).
--
-- RLS:
--   - Buyer reads own returns
--   - Buyer creates own returns (must own the parent order)
--   - service_role manages all transitions
-- ============================================================

CREATE TABLE IF NOT EXISTS marketplace_order_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    notes TEXT,
    refund_amount_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'approved', 'rejected', 'refunded', 'cancelled')),
    stripe_refund_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT marketplace_order_returns_amount_nonneg
        CHECK (refund_amount_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_returns_order
    ON marketplace_order_returns(order_id);

CREATE INDEX IF NOT EXISTS idx_order_returns_status
    ON marketplace_order_returns(status);

ALTER TABLE marketplace_order_returns ENABLE ROW LEVEL SECURITY;

-- Buyer reads returns belonging to their own orders.
DROP POLICY IF EXISTS "Buyer reads own returns" ON marketplace_order_returns;
CREATE POLICY "Buyer reads own returns"
    ON marketplace_order_returns FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM marketplace_orders o
            WHERE o.id = marketplace_order_returns.order_id
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

-- Buyer can open a return request on an order they own.
DROP POLICY IF EXISTS "Buyer creates own return request" ON marketplace_order_returns;
CREATE POLICY "Buyer creates own return request"
    ON marketplace_order_returns FOR INSERT
    WITH CHECK (
        requested_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM marketplace_orders o
            WHERE o.id = marketplace_order_returns.order_id
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

-- Platform manages transitions.
DROP POLICY IF EXISTS "Admin manages returns" ON marketplace_order_returns;
CREATE POLICY "Admin manages returns"
    ON marketplace_order_returns FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- updated_at on row update.
DROP TRIGGER IF EXISTS trg_marketplace_order_returns_updated_at ON marketplace_order_returns;
CREATE TRIGGER trg_marketplace_order_returns_updated_at
    BEFORE UPDATE ON marketplace_order_returns
    FOR EACH ROW EXECUTE FUNCTION update_variants_updated_at();

-- ============================================================
-- Done — 138_marketplace_order_returns.sql
-- ============================================================
