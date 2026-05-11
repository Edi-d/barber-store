-- ============================================
-- Tapzi Barber — Fix get_salon_billing_summary heuristic
-- ============================================
-- Previous version set has_payment_method=true only when a SUCCESSFUL
-- Stripe payment existed. That's wrong for trialing users who added a
-- card via Checkout but haven't been charged yet.
--
-- New semantics: has_payment_method = TRUE iff the salon has an active
-- Stripe-linked subscription (stripe_subscription_id IS NOT NULL and
-- status in {trialing, active, past_due}). This is the correct proxy for
-- "can this salon self-serve billing (switch plans / cancel / etc)".
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

    -- Fixed heuristic: any Stripe-linked non-canceled subscription means
    -- the customer has completed Checkout and has a card on file (Stripe
    -- requires a payment method to create a subscription).
    v_has_payment_method := (
        SELECT EXISTS (
            SELECT 1 FROM subscriptions sub
            WHERE sub.salon_id = v_salon_id
              AND sub.stripe_subscription_id IS NOT NULL
              AND sub.status IN ('trialing', 'active', 'past_due')
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
