-- 081_metered_billing_core.sql
-- Metered billing core: usage ledger, rollups, SKU catalog, per-salon caps.
-- Conventions:
--   * All monetary values stored in integer cents (RON bani).
--   * All writes go through SECURITY DEFINER RPCs (migration 082).
--   * RLS: salon members can read their rows; no direct client writes.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend plans with included quotas (NULL = unlimited)
-- ---------------------------------------------------------------------------
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS included_sms_reminder    integer,
  ADD COLUMN IF NOT EXISTS included_sms_marketing   integer,
  ADD COLUMN IF NOT EXISTS included_email_reminder  integer,
  ADD COLUMN IF NOT EXISTS included_email_marketing integer;

COMMENT ON COLUMN public.plans.included_sms_reminder    IS 'Monthly included SMS reminders; NULL = unlimited.';
COMMENT ON COLUMN public.plans.included_sms_marketing   IS 'Monthly included SMS marketing; NULL = unlimited.';
COMMENT ON COLUMN public.plans.included_email_reminder  IS 'Monthly included email reminders; NULL = unlimited.';
COMMENT ON COLUMN public.plans.included_email_marketing IS 'Monthly included email marketing; NULL = unlimited.';

-- ---------------------------------------------------------------------------
-- 2. Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'usage_sku') THEN
    CREATE TYPE public.usage_sku AS ENUM (
      'sms_reminder',
      'sms_marketing',
      'email_reminder',
      'email_marketing'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'usage_event_status') THEN
    CREATE TYPE public.usage_event_status AS ENUM (
      'reserved',
      'confirmed',
      'failed',
      'released',
      'expired'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3. metered_skus — reference/catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metered_skus (
  sku                public.usage_sku PRIMARY KEY,
  display_name       text             NOT NULL,
  unit_price_cents   integer          NOT NULL CHECK (unit_price_cents >= 0),
  currency           char(3)          NOT NULL DEFAULT 'RON',
  stripe_meter_id    text,
  stripe_price_id    text,
  is_active          boolean          NOT NULL DEFAULT true,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now()
);

INSERT INTO public.metered_skus (sku, display_name, unit_price_cents, currency)
VALUES
  ('sms_reminder',     'SMS reminder programare',  35, 'RON'),
  ('sms_marketing',    'SMS marketing',            45, 'RON'),
  ('email_reminder',   'Email reminder programare',10, 'RON'),
  ('email_marketing',  'Email marketing',          10, 'RON')
ON CONFLICT (sku) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. usage_events — append-only ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_events (
  id                    uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id              uuid                       NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  sku                   public.usage_sku           NOT NULL,
  units                 integer                    NOT NULL CHECK (units > 0),
  unit_price_cents      integer                    NOT NULL CHECK (unit_price_cents >= 0),
  total_cents           integer                    NOT NULL CHECK (total_cents >= 0),
  idempotency_key       text,
  external_ref          text,
  status                public.usage_event_status  NOT NULL DEFAULT 'reserved',
  reason                text,
  related_entity_type   text,
  related_entity_id     uuid,
  period_id             uuid,
  billing_period_start  date                       NOT NULL,
  reserved_at           timestamptz                NOT NULL DEFAULT now(),
  confirmed_at          timestamptz,
  released_at           timestamptz,
  created_at            timestamptz                NOT NULL DEFAULT now(),
  CONSTRAINT usage_events_total_matches CHECK (total_cents = units * unit_price_cents),
  CONSTRAINT usage_events_idempotency_unique UNIQUE (salon_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS usage_events_salon_period_sku_status_idx
  ON public.usage_events (salon_id, billing_period_start, sku, status);

CREATE INDEX IF NOT EXISTS usage_events_confirmed_rollup_idx
  ON public.usage_events (salon_id, sku, billing_period_start)
  INCLUDE (units, total_cents)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS usage_events_open_reservations_idx
  ON public.usage_events (salon_id, reserved_at)
  WHERE status = 'reserved';

CREATE INDEX IF NOT EXISTS usage_events_external_ref_idx
  ON public.usage_events (external_ref)
  WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS usage_events_created_at_idx
  ON public.usage_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. usage_periods — monthly rollup per (salon, period, sku)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_periods (
  id                        uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id                  uuid              NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  period_start              date              NOT NULL,
  period_end                date              NOT NULL,
  sku                       public.usage_sku  NOT NULL,
  quota_included            integer,
  quantity_used_confirmed   integer           NOT NULL DEFAULT 0 CHECK (quantity_used_confirmed >= 0),
  quantity_reserved         integer           NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  overage_cents             integer           NOT NULL DEFAULT 0 CHECK (overage_cents >= 0),
  updated_at                timestamptz       NOT NULL DEFAULT now(),
  UNIQUE (salon_id, period_start, sku)
);

CREATE INDEX IF NOT EXISTS usage_periods_salon_period_idx
  ON public.usage_periods (salon_id, period_start);

-- ---------------------------------------------------------------------------
-- 6. salon_billing_config — per-salon caps and toggles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salon_billing_config (
  salon_id                     uuid         PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
  overage_cap_cents_per_month  integer      NOT NULL DEFAULT 20000 CHECK (overage_cap_cents_per_month >= 0),
  hard_cap                     boolean      NOT NULL DEFAULT true,
  auto_topup                   boolean      NOT NULL DEFAULT false,
  created_at                   timestamptz  NOT NULL DEFAULT now(),
  updated_at                   timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS metered_skus_set_updated_at ON public.metered_skus;
CREATE TRIGGER metered_skus_set_updated_at
  BEFORE UPDATE ON public.metered_skus
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS usage_periods_set_updated_at ON public.usage_periods;
CREATE TRIGGER usage_periods_set_updated_at
  BEFORE UPDATE ON public.usage_periods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS salon_billing_config_set_updated_at ON public.salon_billing_config;
CREATE TRIGGER salon_billing_config_set_updated_at
  BEFORE UPDATE ON public.salon_billing_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_salon_member(p_salon_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = p_salon_id AND s.owner_id = auth.uid()
  );
$$;

ALTER TABLE public.usage_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_periods        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_billing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metered_skus         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metered_skus_read ON public.metered_skus;
CREATE POLICY metered_skus_read ON public.metered_skus
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS usage_events_read ON public.usage_events;
CREATE POLICY usage_events_read ON public.usage_events
  FOR SELECT TO authenticated USING (public.is_salon_member(salon_id));

DROP POLICY IF EXISTS usage_periods_read ON public.usage_periods;
CREATE POLICY usage_periods_read ON public.usage_periods
  FOR SELECT TO authenticated USING (public.is_salon_member(salon_id));

DROP POLICY IF EXISTS salon_billing_config_read ON public.salon_billing_config;
CREATE POLICY salon_billing_config_read ON public.salon_billing_config
  FOR SELECT TO authenticated USING (public.is_salon_member(salon_id));

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.metered_skus         TO authenticated;
GRANT SELECT ON public.usage_events         TO authenticated;
GRANT SELECT ON public.usage_periods        TO authenticated;
GRANT SELECT ON public.salon_billing_config TO authenticated;

COMMIT;
