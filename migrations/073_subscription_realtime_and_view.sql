-- Migration 073: Enable realtime on subscriptions + create active subscription view + helper RPC
-- Idempotent: safe to run multiple times.

-- =========================================================================
-- 1. Enable Supabase Realtime for public.subscriptions
--    Guard: check pg_publication_tables first to avoid "already member" error
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'subscriptions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions';
  END IF;
END
$$;

-- =========================================================================
-- 2. View: v_active_subscription
--    Combines subscription + plan + salon for single-query fetch.
--    Only surfaces statuses considered "active" from product POV.
-- =========================================================================
CREATE OR REPLACE VIEW public.v_active_subscription AS
SELECT
  s.id              AS subscription_id,
  s.salon_id,
  s.status,
  s.quantity,
  s.billing_interval,
  s.trial_start,
  s.trial_end,
  s.current_period_end,
  s.cancel_at_period_end,
  p.id              AS plan_id,
  p.code            AS plan_code,
  p.name            AS plan_name,
  p.price_monthly,
  p.currency,
  p.included_staff,
  p.extra_staff_price,
  p.features,
  sa.owner_id       AS owner_id,
  sa.trial_ends_at  AS salon_trial_ends_at
FROM public.subscriptions s
JOIN public.plans p   ON p.id  = s.plan_id
JOIN public.salons sa ON sa.id = s.salon_id
WHERE s.status IN ('trialing','active','past_due','incomplete');

-- =========================================================================
-- 3. RLS note: view is SECURITY INVOKER (default) so it inherits RLS
--    from public.subscriptions. Only salon owners can see their rows.
-- =========================================================================
COMMENT ON VIEW public.v_active_subscription IS
  'Active subscription joined with plan + salon. Access controlled by RLS on public.subscriptions (SECURITY INVOKER view).';

-- =========================================================================
-- 4. Grant SELECT to authenticated role (RLS still applies)
-- =========================================================================
GRANT SELECT ON public.v_active_subscription TO authenticated;

-- =========================================================================
-- 5. Helper RPC: get_my_active_subscription()
--    Returns the caller's active subscription row (via owner_id = auth.uid()).
--    No SECURITY DEFINER — RLS on subscriptions applies naturally.
--    Uses RETURN QUERY (not SELECT INTO) to avoid Supabase SQL editor bug.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_active_subscription()
RETURNS SETOF public.v_active_subscription
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.v_active_subscription
  WHERE owner_id = auth.uid()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_active_subscription() TO authenticated;

COMMENT ON FUNCTION public.get_my_active_subscription() IS
  'Returns the calling user''s active subscription (if any). Relies on RLS via v_active_subscription.';
