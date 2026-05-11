-- ============================================
-- Tapzi Barber — Stripe Integration (incremental)
-- ============================================
-- Builds on migration 071 (salons.stripe_customer_id,
-- subscriptions.stripe_subscription_id, plans.stripe_price_id_*,
-- webhook_events, payments.stripe_*, invoices.stripe_invoice_id).
-- This migration adds ONLY what's missing:
--   * subscriptions.stripe_price_id, stripe_latest_invoice_id
--   * monitoring index on webhook_events(received_at)
--   * explicit RLS policies for payments / invoices
--     (service_role full, salon owner read-only)
--   * get_salon_billing_summary() for web /billing + mobile settings
--   * set_stripe_customer_id() for Edge Function idempotent linking
-- ============================================

-- ============================================
-- 1. SUBSCRIPTIONS — add Stripe tracking columns
-- ============================================
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS stripe_latest_invoice_id TEXT;

CREATE INDEX IF NOT EXISTS idx_subs_stripe_price
    ON subscriptions(stripe_price_id)
    WHERE stripe_price_id IS NOT NULL;

-- ============================================
-- 2. WEBHOOK_EVENTS — monitoring index on received_at
-- ============================================
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
    ON webhook_events(received_at DESC);

-- ============================================
-- 3. PAYMENTS — RLS policies (service_role + owner read-only)
-- ============================================
DROP POLICY IF EXISTS "Salon owner can view payments" ON payments;
DROP POLICY IF EXISTS "Service role full access on payments" ON payments;
DROP POLICY IF EXISTS "Salon owner read own payments" ON payments;

-- service_role bypasses RLS by default, but declaring an explicit
-- ALL policy makes intent clear and protects against config drift.
CREATE POLICY "Service role full access on payments" ON payments
    FOR ALL
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Salon owner read own payments" ON payments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = payments.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 4. INVOICES — RLS policies (service_role + owner read-only)
-- ============================================
DROP POLICY IF EXISTS "Salon owner can view invoices" ON invoices;
DROP POLICY IF EXISTS "Service role full access on invoices" ON invoices;
DROP POLICY IF EXISTS "Salon owner read own invoices" ON invoices;

CREATE POLICY "Service role full access on invoices" ON invoices
    FOR ALL
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Salon owner read own invoices" ON invoices
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = invoices.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 5. RPC — get_salon_billing_summary()
-- ============================================
-- Returns a single JSONB blob used by:
--   * web /billing page
--   * mobile settings screen (management/settings.tsx)
-- Shape:
--   {
--     plan: { code, name, price_monthly, currency },
--     subscription: { status, current_period_end,
--                     cancel_at_period_end, trial_end },
--     stripe_customer_id: TEXT | NULL,
--     has_payment_method: BOOLEAN
--   }
-- ============================================
DROP FUNCTION IF EXISTS public.get_salon_billing_summary();

CREATE FUNCTION public.get_salon_billing_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_salon_id UUID;
    v_stripe_customer_id TEXT;
    v_plan JSONB;
    v_subscription JSONB;
    v_has_payment_method BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Resolve the owner's salon (one owner = one salon in B2B flow)
    v_salon_id := (
        SELECT s.id
        FROM salons s
        WHERE s.owner_id = v_uid
        ORDER BY s.created_at ASC
        LIMIT 1
    );

    IF v_salon_id IS NULL THEN
        RETURN jsonb_build_object(
            'plan', NULL,
            'subscription', NULL,
            'stripe_customer_id', NULL,
            'has_payment_method', FALSE
        );
    END IF;

    v_stripe_customer_id := (
        SELECT s.stripe_customer_id
        FROM salons s
        WHERE s.id = v_salon_id
        LIMIT 1
    );

    v_subscription := (
        SELECT jsonb_build_object(
            'status', sub.status,
            'current_period_end', sub.current_period_end,
            'cancel_at_period_end', sub.cancel_at_period_end,
            'trial_end', sub.trial_end
        )
        FROM subscriptions sub
        WHERE sub.salon_id = v_salon_id
          AND sub.status IN ('trialing','active','past_due','incomplete')
        ORDER BY sub.created_at DESC
        LIMIT 1
    );

    v_plan := (
        SELECT jsonb_build_object(
            'code', p.code,
            'name', p.name,
            'price_monthly', p.price_monthly,
            'currency', p.currency
        )
        FROM subscriptions sub
        JOIN plans p ON p.id = sub.plan_id
        WHERE sub.salon_id = v_salon_id
          AND sub.status IN ('trialing','active','past_due','incomplete')
        ORDER BY sub.created_at DESC
        LIMIT 1
    );

    -- Heuristic: a successful payment implies a usable payment method on file.
    v_has_payment_method := (
        SELECT EXISTS (
            SELECT 1 FROM payments pm
            WHERE pm.salon_id = v_salon_id
              AND pm.status = 'succeeded'
        )
    );

    RETURN jsonb_build_object(
        'plan', v_plan,
        'subscription', v_subscription,
        'stripe_customer_id', v_stripe_customer_id,
        'has_payment_method', v_has_payment_method
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_salon_billing_summary() TO authenticated;

-- ============================================
-- 6. RPC — set_stripe_customer_id(p_customer_id)
-- ============================================
-- Called by the Edge Function immediately after creating the
-- Stripe Customer. Idempotent: if salons.stripe_customer_id is
-- already populated, returns the existing value without modifying it.
-- ============================================
DROP FUNCTION IF EXISTS public.set_stripe_customer_id(TEXT);

CREATE FUNCTION public.set_stripe_customer_id(p_customer_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_salon_id UUID;
    v_existing TEXT;
    v_final TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF p_customer_id IS NULL OR LENGTH(TRIM(p_customer_id)) = 0 THEN
        RAISE EXCEPTION 'p_customer_id required' USING ERRCODE = '22023';
    END IF;

    v_salon_id := (
        SELECT s.id
        FROM salons s
        WHERE s.owner_id = v_uid
        ORDER BY s.created_at ASC
        LIMIT 1
    );

    IF v_salon_id IS NULL THEN
        RAISE EXCEPTION 'No salon found for user' USING ERRCODE = 'P0002';
    END IF;

    v_existing := (
        SELECT s.stripe_customer_id
        FROM salons s
        WHERE s.id = v_salon_id
        LIMIT 1
    );

    IF v_existing IS NOT NULL THEN
        -- Idempotent: already linked, do nothing.
        v_final := v_existing;
    ELSE
        UPDATE salons
        SET stripe_customer_id = p_customer_id
        WHERE id = v_salon_id
          AND stripe_customer_id IS NULL;

        v_final := p_customer_id;
    END IF;

    RETURN jsonb_build_object(
        'salon_id', v_salon_id,
        'stripe_customer_id', v_final
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_stripe_customer_id(TEXT) TO authenticated;

-- ============================================
-- Done!
-- ============================================
