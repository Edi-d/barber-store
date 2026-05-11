-- ============================================================
-- Migration 089: Credit Packs (prepaid SMS/email credits)
-- ============================================================
-- Depends on migration 081 (usage_events, usage_sku enum, salons,
-- tg_set_updated_at, is_salon_member).
--
-- NOTE: Rewritten to avoid `SELECT ... INTO` inside plpgsql
-- (triggers Supabase SQL Editor parse bugs where plpgsql variables
-- get treated as table names). All lookups use scalar subquery
-- assignments `v_X := (SELECT ... LIMIT 1);` per the pattern in
-- migration 072b and 082. Paste this whole file as ONE SQL editor
-- request.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Enum: credit_pool
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_pool') THEN
    CREATE TYPE public.credit_pool AS ENUM (
      'sms_reminder',
      'sms_marketing',
      'email'
    );
  END IF;
END $$;

-- ============================================================
-- 2. Table: credit_packs (catalog)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_packs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text UNIQUE NOT NULL,
  display_name      text NOT NULL,
  pool              public.credit_pool NOT NULL,
  units             integer NOT NULL CHECK (units > 0),
  price_cents       integer NOT NULL CHECK (price_cents > 0),
  currency          char(3) NOT NULL DEFAULT 'RON',
  stripe_product_id text,
  stripe_price_id   text,
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tg_credit_packs_set_updated_at ON public.credit_packs;
CREATE TRIGGER tg_credit_packs_set_updated_at
  BEFORE UPDATE ON public.credit_packs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 3. Seed catalog (6 packs)
-- ============================================================
INSERT INTO public.credit_packs (code, display_name, pool, units, price_cents, sort_order)
VALUES
  ('sms_reminder_100',  'SMS reminder 100',   'sms_reminder',    100,   3500,  10),
  ('sms_reminder_500',  'SMS reminder 500',   'sms_reminder',    500,  17500,  20),
  ('sms_marketing_100', 'SMS marketing 100',  'sms_marketing',   100,   4500,  30),
  ('sms_marketing_500', 'SMS marketing 500',  'sms_marketing',   500,  22500,  40),
  ('email_500',         'Email 500',          'email',           500,   5000,  50),
  ('email_2000',        'Email 2000',         'email',          2000,  20000,  60)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      pool         = EXCLUDED.pool,
      units        = EXCLUDED.units,
      price_cents  = EXCLUDED.price_cents,
      sort_order   = EXCLUDED.sort_order,
      is_active    = true;

-- ============================================================
-- 4. Table: credit_ledger (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id           uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  pool               public.credit_pool NOT NULL,
  delta              integer NOT NULL,
  reason             text NOT NULL CHECK (reason IN ('purchase', 'consumption', 'refund', 'adjustment', 'expiry')),
  pack_id            uuid REFERENCES public.credit_packs(id),
  stripe_session_id  text,
  stripe_charge_id   text,
  usage_event_id     uuid REFERENCES public.usage_events(id) ON DELETE SET NULL,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_stripe_session_uidx
  ON public.credit_ledger (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_ledger_salon_pool_created_idx
  ON public.credit_ledger (salon_id, pool, created_at);

CREATE INDEX IF NOT EXISTS credit_ledger_usage_event_idx
  ON public.credit_ledger (usage_event_id)
  WHERE usage_event_id IS NOT NULL;

-- ============================================================
-- 5. Extend usage_events with funding_source (used by 090)
-- ============================================================
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS funding_source text
    CHECK (funding_source IN ('included', 'pack', 'overage'));

-- ============================================================
-- 6. RPC: get_credit_balance(p_salon_id uuid, p_pool text) -> int
-- ============================================================
DROP FUNCTION IF EXISTS public.get_credit_balance(uuid, text);

CREATE FUNCTION public.get_credit_balance(
  p_salon_id uuid,
  p_pool     text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_pool    public.credit_pool;
  v_balance integer;
BEGIN
  BEGIN
    v_pool := p_pool::public.credit_pool;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_pool' USING errcode = '22023';
  END;

  v_balance := (
    SELECT COALESCE(SUM(delta), 0)::integer
      FROM public.credit_ledger
     WHERE salon_id = p_salon_id
       AND pool     = v_pool
  );

  RETURN COALESCE(v_balance, 0);
END;
$$;

-- ============================================================
-- 7. RPC: record_credit_purchase
-- ============================================================
DROP FUNCTION IF EXISTS public.record_credit_purchase(uuid, text, text, text);

CREATE FUNCTION public.record_credit_purchase(
  p_salon_id           uuid,
  p_pack_code          text,
  p_stripe_session_id  text,
  p_stripe_charge_id   text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id       uuid;
  v_existing_delta    integer;
  v_existing_pool     public.credit_pool;
  v_pack_id           uuid;
  v_pool              public.credit_pool;
  v_units             integer;
  v_price_cents       integer;
  v_ledger_id         uuid;
  v_balance           integer;
BEGIN
  IF p_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_required' USING errcode = '22023';
  END IF;
  IF p_pack_code IS NULL THEN
    RAISE EXCEPTION 'pack_code_required' USING errcode = '22023';
  END IF;
  IF p_stripe_session_id IS NULL THEN
    RAISE EXCEPTION 'stripe_session_required' USING errcode = '22023';
  END IF;

  -- Idempotent: if this stripe_session_id was already recorded, return duplicate
  v_existing_id := (
    SELECT id FROM public.credit_ledger
     WHERE stripe_session_id = p_stripe_session_id
     LIMIT 1
  );

  IF v_existing_id IS NOT NULL THEN
    v_existing_delta := (SELECT delta FROM public.credit_ledger WHERE id = v_existing_id);
    v_existing_pool  := (SELECT pool  FROM public.credit_ledger WHERE id = v_existing_id);

    v_balance := (
      SELECT COALESCE(SUM(delta), 0)::integer
        FROM public.credit_ledger
       WHERE salon_id = p_salon_id
         AND pool     = v_existing_pool
    );

    RETURN jsonb_build_object(
      'status',     'duplicate',
      'ledger_id',  v_existing_id,
      'pool',       v_existing_pool::text,
      'units',      v_existing_delta,
      'balance',    COALESCE(v_balance, 0)
    );
  END IF;

  -- Look up pack
  v_pack_id := (
    SELECT id FROM public.credit_packs
     WHERE code = p_pack_code
       AND is_active
     LIMIT 1
  );

  IF v_pack_id IS NULL THEN
    RAISE EXCEPTION 'pack_not_found' USING errcode = 'P0002';
  END IF;

  v_pool        := (SELECT pool        FROM public.credit_packs WHERE id = v_pack_id);
  v_units       := (SELECT units       FROM public.credit_packs WHERE id = v_pack_id);
  v_price_cents := (SELECT price_cents FROM public.credit_packs WHERE id = v_pack_id);

  INSERT INTO public.credit_ledger (
    salon_id, pool, delta, reason, pack_id,
    stripe_session_id, stripe_charge_id, notes
  )
  VALUES (
    p_salon_id, v_pool, v_units, 'purchase', v_pack_id,
    p_stripe_session_id, p_stripe_charge_id,
    'pack=' || p_pack_code || ' price_cents=' || v_price_cents::text
  )
  RETURNING id INTO v_ledger_id;

  v_balance := (
    SELECT COALESCE(SUM(delta), 0)::integer
      FROM public.credit_ledger
     WHERE salon_id = p_salon_id
       AND pool     = v_pool
  );

  RETURN jsonb_build_object(
    'status',     'recorded',
    'ledger_id',  v_ledger_id,
    'pool',       v_pool::text,
    'units',      v_units,
    'balance',    COALESCE(v_balance, 0)
  );
END;
$$;

-- ============================================================
-- 8. RPC: get_all_credit_balances(p_salon_id uuid) -> jsonb
-- ============================================================
DROP FUNCTION IF EXISTS public.get_all_credit_balances(uuid);

CREATE FUNCTION public.get_all_credit_balances(
  p_salon_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_sms_reminder  integer;
  v_sms_marketing integer;
  v_email         integer;
BEGIN
  v_sms_reminder := (
    SELECT COALESCE(SUM(delta), 0)::integer
      FROM public.credit_ledger
     WHERE salon_id = p_salon_id
       AND pool     = 'sms_reminder'::public.credit_pool
  );

  v_sms_marketing := (
    SELECT COALESCE(SUM(delta), 0)::integer
      FROM public.credit_ledger
     WHERE salon_id = p_salon_id
       AND pool     = 'sms_marketing'::public.credit_pool
  );

  v_email := (
    SELECT COALESCE(SUM(delta), 0)::integer
      FROM public.credit_ledger
     WHERE salon_id = p_salon_id
       AND pool     = 'email'::public.credit_pool
  );

  RETURN jsonb_build_object(
    'sms_reminder',  COALESCE(v_sms_reminder, 0),
    'sms_marketing', COALESCE(v_sms_marketing, 0),
    'email',         COALESCE(v_email, 0)
  );
END;
$$;

-- ============================================================
-- 9. Row Level Security
-- ============================================================
ALTER TABLE public.credit_packs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

-- credit_packs: public catalog for authenticated users
DROP POLICY IF EXISTS credit_packs_select ON public.credit_packs;
CREATE POLICY credit_packs_select ON public.credit_packs
  FOR SELECT TO authenticated USING (true);

-- credit_ledger: salon members can read their own salon's ledger
DROP POLICY IF EXISTS credit_ledger_select ON public.credit_ledger;
CREATE POLICY credit_ledger_select ON public.credit_ledger
  FOR SELECT TO authenticated USING (public.is_salon_member(salon_id));

-- No INSERT/UPDATE/DELETE policies; all writes go through
-- SECURITY DEFINER RPCs (record_credit_purchase, plus 090+).

-- ============================================================
-- 10. Grants
-- ============================================================
REVOKE ALL ON FUNCTION public.get_credit_balance(uuid, text)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_all_credit_balances(uuid)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_credit_purchase(uuid, text, text, text)    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_credit_balance(uuid, text)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_all_credit_balances(uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_credit_purchase(uuid, text, text, text) TO service_role;

COMMIT;
