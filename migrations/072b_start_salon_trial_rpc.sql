-- ============================================
-- Tapzi Barber — start_salon_trial RPC
-- ============================================
-- Paste the whole file as ONE SQL editor request.
-- Rewritten to avoid `SELECT ... INTO` (triggers Supabase editor parse bugs
-- where plpgsql variables get treated as table names).
-- ============================================

DROP FUNCTION IF EXISTS public.start_salon_trial(TEXT, TEXT, INT);

CREATE FUNCTION public.start_salon_trial(
    p_plan_code TEXT,
    p_billing_interval TEXT DEFAULT 'month',
    p_quantity INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_salon_id UUID;
    v_plan_id UUID;
    v_trial_days INT;
    v_included_staff INT;
    v_trial_start TIMESTAMPTZ;
    v_trial_end TIMESTAMPTZ;
    v_subscription_id UUID;
    v_quantity INT;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    IF p_billing_interval NOT IN ('month', 'year') THEN
        RAISE EXCEPTION 'invalid_billing_interval';
    END IF;

    v_salon_id := (
        SELECT id FROM public.salons
        WHERE owner_id = v_user_id
        LIMIT 1
    );

    IF v_salon_id IS NULL THEN
        RAISE EXCEPTION 'salon_not_found';
    END IF;

    v_plan_id := (
        SELECT id FROM public.plans
        WHERE code = p_plan_code AND is_active
        LIMIT 1
    );

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'plan_not_found';
    END IF;

    v_trial_days := (SELECT trial_days FROM public.plans WHERE id = v_plan_id);
    v_included_staff := (SELECT included_staff FROM public.plans WHERE id = v_plan_id);

    IF EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE salon_id = v_salon_id
          AND status IN ('trialing', 'active', 'past_due', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'subscription_exists';
    END IF;

    v_quantity := GREATEST(COALESCE(p_quantity, 1), v_included_staff);
    v_trial_start := NOW();
    v_trial_end := v_trial_start + make_interval(days => v_trial_days);

    INSERT INTO public.subscriptions (
        salon_id, plan_id, status, quantity, billing_interval,
        trial_start, trial_end, current_period_start, current_period_end
    )
    VALUES (
        v_salon_id, v_plan_id, 'trialing', v_quantity, p_billing_interval,
        v_trial_start, v_trial_end, v_trial_start, v_trial_end
    )
    RETURNING id INTO v_subscription_id;

    UPDATE public.salons
    SET subscription_status = 'trialing',
        trial_ends_at = v_trial_end,
        activated_at = NOW()
    WHERE id = v_salon_id;

    UPDATE public.profiles
    SET onboarding_completed = TRUE
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'subscription_id', v_subscription_id,
        'salon_id', v_salon_id,
        'plan_code', p_plan_code,
        'quantity', v_quantity,
        'trial_start', v_trial_start,
        'trial_end', v_trial_end
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_salon_trial(TEXT, TEXT, INT) TO authenticated;
