-- ============================================================
-- Diagnostic: plan quotas for salon 0bb12ec3-86d7-459d-999b-6a60ccbd941b
-- (user darius55dobrota@gmail.com)
-- Paste this whole file into Supabase SQL Editor. No writes.
-- ============================================================

-- Handy salon constant
WITH s AS (SELECT '0bb12ec3-86d7-459d-999b-6a60ccbd941b'::uuid AS salon_id)

-- ------------------------------------------------------------
-- 1. Current subscription (plan_id, status, plan code)
-- ------------------------------------------------------------
SELECT
  'subscription'                AS section,
  sub.id                        AS subscription_id,
  sub.salon_id,
  sub.plan_id,
  sub.status,
  sub.quantity,
  sub.billing_interval,
  sub.trial_ends_at,
  sub.current_period_start,
  sub.current_period_end,
  sub.created_at,
  p.code                        AS plan_code,
  p.name                        AS plan_name
FROM public.subscriptions sub
LEFT JOIN public.plans p ON p.id = sub.plan_id
WHERE sub.salon_id = (SELECT salon_id FROM s)
ORDER BY sub.created_at DESC;

-- ------------------------------------------------------------
-- 2. Plan quotas for every plan (so we can see all 3)
-- ------------------------------------------------------------
SELECT
  'plans'                       AS section,
  code,
  name,
  included_sms_reminder,
  included_sms_marketing,
  included_email_reminder,
  included_email_marketing,
  included_sms                  AS legacy_included_sms,
  is_active,
  sort_order
FROM public.plans
ORDER BY sort_order;

-- ------------------------------------------------------------
-- 3. Plan quotas specifically for this salon's active plan
-- ------------------------------------------------------------
SELECT
  'salon_plan'                  AS section,
  p.code,
  p.name,
  p.included_sms_reminder,
  p.included_sms_marketing,
  p.included_email_reminder,
  p.included_email_marketing
FROM public.subscriptions sub
JOIN public.plans p ON p.id = sub.plan_id
WHERE sub.salon_id = '0bb12ec3-86d7-459d-999b-6a60ccbd941b'::uuid
  AND sub.status IN ('trialing','active','past_due')
ORDER BY sub.created_at DESC
LIMIT 1;

-- ------------------------------------------------------------
-- 4. Current month usage_periods rows for this salon
-- ------------------------------------------------------------
SELECT
  'usage_periods'               AS section,
  up.period_start,
  up.period_end,
  up.sku,
  up.quota_included,
  up.quantity_used_confirmed,
  up.quantity_reserved,
  up.overage_cents
FROM public.usage_periods up
WHERE up.salon_id = '0bb12ec3-86d7-459d-999b-6a60ccbd941b'::uuid
  AND up.period_start = date_trunc('month', now() AT TIME ZONE 'utc')::date
ORDER BY up.sku;

-- ------------------------------------------------------------
-- 5. Simulated allocation for sms_marketing quantity=1
--    Mirrors the tier decision in migration 090 reserve_usage.
-- ------------------------------------------------------------
WITH
  sub AS (
    SELECT plan_id
    FROM public.subscriptions
    WHERE salon_id = '0bb12ec3-86d7-459d-999b-6a60ccbd941b'::uuid
      AND status IN ('trialing','active','past_due')
    ORDER BY created_at DESC
    LIMIT 1
  ),
  plan AS (
    SELECT
      COALESCE((SELECT included_sms_marketing FROM public.plans WHERE id = (SELECT plan_id FROM sub)), 0) AS included
  ),
  period AS (
    SELECT
      COALESCE(quantity_used_confirmed, 0) AS used,
      COALESCE(quantity_reserved, 0)        AS reserved
    FROM public.usage_periods
    WHERE salon_id = '0bb12ec3-86d7-459d-999b-6a60ccbd941b'::uuid
      AND sku = 'sms_marketing'
      AND period_start = date_trunc('month', now() AT TIME ZONE 'utc')::date
  ),
  pack AS (
    SELECT COALESCE(SUM(delta), 0)::int AS pack_balance
    FROM public.credit_ledger
    WHERE salon_id = '0bb12ec3-86d7-459d-999b-6a60ccbd941b'::uuid
      AND pool = 'sms_marketing'
  ),
  price AS (
    SELECT unit_price_cents FROM public.metered_skus WHERE sku = 'sms_marketing'
  )
SELECT
  'simulation_sms_marketing_q1'                                              AS section,
  (SELECT included FROM plan)                                                AS plan_included,
  COALESCE((SELECT used FROM period), 0)                                     AS used,
  COALESCE((SELECT reserved FROM period), 0)                                 AS reserved,
  (SELECT pack_balance FROM pack)                                            AS pack_balance,
  (SELECT unit_price_cents FROM price)                                       AS unit_price_cents,
  CASE
    WHEN (COALESCE((SELECT used FROM period),0) + COALESCE((SELECT reserved FROM period),0))
         < (SELECT included FROM plan)
      THEN 'included'
    WHEN (SELECT pack_balance FROM pack) >= 1
      THEN 'pack'
    ELSE 'overage'
  END                                                                        AS predicted_funding_source,
  CASE
    WHEN (COALESCE((SELECT used FROM period),0) + COALESCE((SELECT reserved FROM period),0))
         < (SELECT included FROM plan)
      THEN 0
    WHEN (SELECT pack_balance FROM pack) >= 1
      THEN 0
    ELSE 1
  END                                                                        AS overage_units,
  CASE
    WHEN (COALESCE((SELECT used FROM period),0) + COALESCE((SELECT reserved FROM period),0))
         < (SELECT included FROM plan)
      THEN 0
    WHEN (SELECT pack_balance FROM pack) >= 1
      THEN 0
    ELSE (SELECT unit_price_cents FROM price)
  END                                                                        AS overage_cents;

-- ------------------------------------------------------------
-- 6. Did migration 085 run? Look at the features jsonb — if it still says
--    "50 SMS gateway" the UPDATE from 085 never executed.
-- ------------------------------------------------------------
SELECT
  'features_marker'             AS section,
  code,
  features
FROM public.plans
ORDER BY sort_order;
