-- Migration 084 — Stripe usage reporting ledger + aggregation RPC + cron
-- Depends on migrations 081 (usage_events) and 082 (RPCs).

BEGIN;

CREATE TABLE IF NOT EXISTS public.usage_stripe_reports (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id                  uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  usage_date                date NOT NULL,
  sku                       text NOT NULL
    CHECK (sku IN ('sms_reminder','sms_marketing','email_reminder','email_marketing')),
  units                     integer NOT NULL CHECK (units >= 0),
  stripe_customer_id        text,
  stripe_subscription_id    text,
  stripe_event_name         text,
  stripe_identifier         text,
  stripe_meter_event_id     text,
  reported_to_stripe_at     timestamptz,
  error                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_stripe_reports_unique UNIQUE (salon_id, usage_date, sku)
);

CREATE INDEX IF NOT EXISTS idx_usage_stripe_reports_date
  ON public.usage_stripe_reports (usage_date);

CREATE INDEX IF NOT EXISTS idx_usage_stripe_reports_unreported
  ON public.usage_stripe_reports (usage_date, sku)
  WHERE reported_to_stripe_at IS NULL;

DROP TRIGGER IF EXISTS usage_stripe_reports_set_updated_at ON public.usage_stripe_reports;
CREATE TRIGGER usage_stripe_reports_set_updated_at
  BEFORE UPDATE ON public.usage_stripe_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.usage_stripe_reports ENABLE ROW LEVEL SECURITY;
-- No policies -> service role only.

-- Aggregation RPC used by stripe-report-usage edge function
CREATE OR REPLACE FUNCTION public.aggregate_confirmed_usage(p_date date)
RETURNS TABLE (salon_id uuid, sku text, units integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ue.salon_id,
         ue.sku::text,
         SUM(ue.units)::integer AS units
    FROM public.usage_events ue
   WHERE ue.status = 'confirmed'
     AND ue.confirmed_at AT TIME ZONE 'Europe/Bucharest' >= p_date::timestamp
     AND ue.confirmed_at AT TIME ZONE 'Europe/Bucharest' <  (p_date + INTERVAL '1 day')
   GROUP BY ue.salon_id, ue.sku
   HAVING SUM(ue.units) > 0;
$$;

REVOKE ALL ON FUNCTION public.aggregate_confirmed_usage(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggregate_confirmed_usage(date) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- pg_cron schedule (run separately after configuring Vault secrets)
-- ---------------------------------------------------------------------------
-- One-time Vault setup (run manually from SQL Editor):
--   SELECT vault.create_secret(
--     'https://<project-ref>.functions.supabase.co/stripe-report-usage',
--     'stripe_report_usage_url'
--   );
--   SELECT vault.create_secret('<random-32-byte-string>', 'cron_secret');
--
-- Then schedule the cron:
--   SELECT cron.schedule(
--     'stripe-report-usage-daily',
--     '30 23 * * *',
--     $cron$
--     SELECT net.http_post(
--       url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'stripe_report_usage_url'),
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
--       ),
--       body    := '{}'::jsonb,
--       timeout_milliseconds := 120000
--     );
--     $cron$
--   );
--
-- Also schedule the stale-reservation sweeper every 5 min:
--   SELECT cron.schedule('expire-stale-reservations', '*/5 * * * *',
--     $$SELECT public.expire_stale_reservations();$$);
