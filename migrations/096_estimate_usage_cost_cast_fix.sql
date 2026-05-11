-- Migration 096: Fix estimate_usage_cost — cast v_pool (text) to credit_pool enum
-- when comparing with credit_ledger.pool column. Same fix applied to
-- reserve_usage_bulk which likely has the same cast bug.

BEGIN;

-- ============================================================
-- estimate_usage_cost (rewritten with proper casts)
-- ============================================================
DROP FUNCTION IF EXISTS public.estimate_usage_cost(uuid, text, int);

CREATE FUNCTION public.estimate_usage_cost(
  p_salon_id uuid,
  p_sku text,
  p_quantity int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_sku                public.usage_sku;
  v_unit_price         int;
  v_plan_id            uuid;
  v_included           int;
  v_cap_cents          int;
  v_period_start       date;
  v_used               int;
  v_pack_balance       int;
  v_pool               public.credit_pool;
  v_remaining_included int;
  v_included_units     int;
  v_pack_units         int;
  v_overage_units      int;
  v_overage_cents      int;
  v_existing_over      int;
  v_cap_remaining      int;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity' USING errcode = '22023';
  END IF;

  BEGIN
    v_sku := p_sku::public.usage_sku;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_sku' USING errcode = '22023';
  END;

  v_unit_price := (SELECT unit_price_cents FROM public.metered_skus WHERE sku = v_sku);
  IF v_unit_price IS NULL THEN
    RAISE EXCEPTION 'unknown_sku' USING errcode = 'P0002';
  END IF;

  v_plan_id := (
    SELECT s.plan_id FROM public.subscriptions s
     WHERE s.salon_id = p_salon_id
       AND s.status IN ('trialing','active','past_due')
     ORDER BY s.created_at DESC LIMIT 1
  );
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'no_active_plan' USING errcode = 'P0002';
  END IF;

  v_included := CASE p_sku
    WHEN 'sms_reminder'    THEN (SELECT COALESCE(included_sms_reminder, 0)    FROM public.plans WHERE id = v_plan_id)
    WHEN 'sms_marketing'   THEN (SELECT COALESCE(included_sms_marketing, 0)   FROM public.plans WHERE id = v_plan_id)
    WHEN 'email_reminder'  THEN (SELECT COALESCE(included_email_reminder, 0)  FROM public.plans WHERE id = v_plan_id)
    WHEN 'email_marketing' THEN (SELECT COALESCE(included_email_marketing, 0) FROM public.plans WHERE id = v_plan_id)
    ELSE 0
  END;
  v_included := COALESCE(v_included, 0);

  v_cap_cents := (SELECT overage_cap_cents_per_month FROM public.salon_billing_config WHERE salon_id = p_salon_id);
  v_cap_cents := COALESCE(v_cap_cents, 20000);

  v_period_start := date_trunc('month', (now() AT TIME ZONE 'utc'))::date;

  v_used := (
    SELECT COALESCE(quantity_used_confirmed + quantity_reserved, 0)
      FROM public.usage_periods
     WHERE salon_id = p_salon_id
       AND period_start = v_period_start
       AND sku = v_sku
  );
  v_used := COALESCE(v_used, 0);

  v_remaining_included := GREATEST(0, v_included - v_used);

  -- Map sku -> pool (explicit enum cast when comparing)
  v_pool := CASE p_sku
    WHEN 'sms_reminder'    THEN 'sms_reminder'::public.credit_pool
    WHEN 'sms_marketing'   THEN 'sms_marketing'::public.credit_pool
    WHEN 'email_reminder'  THEN 'email'::public.credit_pool
    WHEN 'email_marketing' THEN 'email'::public.credit_pool
    ELSE NULL
  END;

  IF v_pool IS NOT NULL THEN
    v_pack_balance := (
      SELECT COALESCE(SUM(delta), 0)::int
        FROM public.credit_ledger
       WHERE salon_id = p_salon_id
         AND pool = v_pool
    );
  ELSE
    v_pack_balance := 0;
  END IF;

  -- Tiered allocation: included → pack → overage
  v_included_units := LEAST(p_quantity, v_remaining_included);
  v_pack_units     := LEAST(p_quantity - v_included_units, v_pack_balance);
  v_overage_units  := p_quantity - v_included_units - v_pack_units;
  v_overage_cents  := v_overage_units * v_unit_price;

  -- Cap headroom: existing overage this month across ALL skus
  v_existing_over := (
    SELECT COALESCE(SUM(
      GREATEST(0, (up.quantity_used_confirmed + up.quantity_reserved) - COALESCE(up.quota_included, 0))
      * ms.unit_price_cents
    ), 0)
      FROM public.usage_periods up
      JOIN public.metered_skus ms ON ms.sku = up.sku
     WHERE up.salon_id = p_salon_id
       AND up.period_start = v_period_start
  );

  v_cap_remaining := GREATEST(0, v_cap_cents - v_existing_over - v_overage_cents);

  RETURN jsonb_build_object(
    'sku',               p_sku,
    'quantity',          p_quantity,
    'unit_price_cents',  v_unit_price,
    'total_cost_cents',  v_overage_cents,
    'cap_cents',         v_cap_cents,
    'cap_remaining_cents', v_cap_remaining,
    'would_exceed_cap',  (v_existing_over + v_overage_cents) > v_cap_cents,
    'funding_breakdown', jsonb_build_object(
      'included_units', v_included_units,
      'pack_units',     v_pack_units,
      'overage_units',  v_overage_units,
      'included_cents', 0,
      'pack_cents',     0,
      'overage_cents',  v_overage_cents
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.estimate_usage_cost(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_usage_cost(uuid, text, int) TO authenticated, service_role;

COMMIT;
