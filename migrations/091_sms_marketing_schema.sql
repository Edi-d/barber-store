-- Migration 091: SMS Marketing Schema
-- CRM + campaigns + recipients + opt-outs for per-salon SMS marketing.
-- Depends on migrations 001 (salons, profiles), 004 (appointments, barbers),
-- 081 (tg_set_updated_at, is_salon_member, usage_sku enum).
--
-- NOTE: File is pasted into Supabase SQL Editor. All plpgsql function bodies
-- use scalar subquery assignments `v_X := (SELECT ... LIMIT 1);` instead of
-- `SELECT ... INTO` to avoid editor parse bugs. Functions use
-- `DROP FUNCTION IF EXISTS ...; CREATE FUNCTION ...` per the 082 pattern.

BEGIN;

-- ===========================================================================
-- 1. Extend salons with alphanumeric sender metadata
-- ===========================================================================
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS sms_sender_id text
    CHECK (sms_sender_id IS NULL OR char_length(sms_sender_id) BETWEEN 3 AND 11);

ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS sms_sender_registered_at timestamptz;

-- ===========================================================================
-- 2. salon_clients — per-salon CRM
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.salon_clients (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id                  uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  phone_e164                text        NOT NULL CHECK (phone_e164 ~ '^\+40[0-9]{9}$'),
  email                     text        NULL,
  first_name                text        NULL,
  last_name                 text        NULL,
  source                    text        NOT NULL DEFAULT 'manual'
                                         CHECK (source IN ('appointment','manual','import','app_user')),
  linked_profile_id         uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_seen_at             timestamptz NOT NULL DEFAULT now(),
  last_appointment_at       timestamptz NULL,
  appointment_count         int         NOT NULL DEFAULT 0,
  -- consent block
  sms_marketing_consent     boolean     NOT NULL DEFAULT false,
  sms_consent_source        text        NULL
                                         CHECK (sms_consent_source IS NULL OR sms_consent_source IN (
                                           'booking_form','manual_entry','import_declared','app_signup','written'
                                         )),
  sms_consent_at            timestamptz NULL,
  sms_consent_ip            inet        NULL,
  sms_consent_text_version  text        NULL,
  -- metadata
  tags                      text[]      NOT NULL DEFAULT '{}',
  notes                     text        NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_salon_clients_salon_consent
  ON public.salon_clients (salon_id)
  WHERE sms_marketing_consent = true;

CREATE INDEX IF NOT EXISTS idx_salon_clients_salon_last_appt
  ON public.salon_clients (salon_id, last_appointment_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_salon_clients_phone
  ON public.salon_clients (salon_id, phone_e164);

-- ===========================================================================
-- 3. sms_campaigns
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.sms_campaigns (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id              uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  created_by            uuid        NULL REFERENCES auth.users(id),
  name                  text        NOT NULL,
  message_body          text        NOT NULL
                                     CHECK (char_length(message_body) BETWEEN 1 AND 459)
                                     CHECK (message_body ~* 'stop'),
  sender_id             text        NOT NULL
                                     CHECK (char_length(sender_id) BETWEEN 3 AND 11),
  status                text        NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft','queued','sending','sent','failed','cancelled')),
  recipient_count       int         NOT NULL DEFAULT 0,
  sent_count            int         NOT NULL DEFAULT 0,
  failed_count          int         NOT NULL DEFAULT 0,
  segments_per_msg      smallint    NOT NULL DEFAULT 1,
  estimated_cost_cents  int         NOT NULL DEFAULT 0,
  actual_cost_cents     int         NOT NULL DEFAULT 0,
  funding_breakdown     jsonb       NULL,
  target_filter         jsonb       NULL,
  scheduled_at          timestamptz NULL,
  started_at            timestamptz NULL,
  completed_at          timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_salon_created
  ON public.sms_campaigns (salon_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_queued
  ON public.sms_campaigns (status)
  WHERE status IN ('queued','sending');

-- ===========================================================================
-- 4. sms_campaign_recipients
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.sms_campaign_recipients (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           uuid        NOT NULL REFERENCES public.sms_campaigns(id) ON DELETE CASCADE,
  salon_client_id       uuid        NOT NULL REFERENCES public.salon_clients(id),
  salon_id              uuid        NOT NULL,
  phone_e164            text        NOT NULL,
  personalized_message  text        NOT NULL,
  status                text        NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending','processing','sent','delivered','failed','opted_out','cancelled')),
  reservation_id        uuid        NULL,
  provider_message_id   text        NULL,
  error_code            text        NULL,
  error_message         text        NULL,
  attempt               int         NOT NULL DEFAULT 0,
  max_attempts          int         NOT NULL DEFAULT 3,
  locked_at             timestamptz NULL,
  sent_at               timestamptz NULL,
  delivered_at          timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, salon_client_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_pending
  ON public.sms_campaign_recipients (status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_campaign
  ON public.sms_campaign_recipients (campaign_id, status);

-- ===========================================================================
-- 5. sms_opt_outs — immutable, append-only
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id            uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  phone_e164          text        NOT NULL CHECK (phone_e164 ~ '^\+40[0-9]{9}$'),
  method              text        NOT NULL CHECK (method IN ('sms_stop','ui_manual','support','import_blocklist')),
  inbound_message_id  text        NULL,
  notes               text        NULL,
  opted_out_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, phone_e164)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_opt_outs_lookup
  ON public.sms_opt_outs (salon_id, phone_e164);

-- ===========================================================================
-- 6. updated_at triggers (reuse public.tg_set_updated_at from 081)
-- ===========================================================================
DROP TRIGGER IF EXISTS salon_clients_set_updated_at ON public.salon_clients;
CREATE TRIGGER salon_clients_set_updated_at
  BEFORE UPDATE ON public.salon_clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS sms_campaigns_set_updated_at ON public.sms_campaigns;
CREATE TRIGGER sms_campaigns_set_updated_at
  BEFORE UPDATE ON public.sms_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ===========================================================================
-- 7. Auto-populate salon_clients from appointments
-- ===========================================================================
DROP FUNCTION IF EXISTS public.tg_appointments_upsert_salon_client() CASCADE;

CREATE FUNCTION public.tg_appointments_upsert_salon_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salon_id uuid;
  v_phone    text;
  v_first    text;
  v_last     text;
BEGIN
  v_salon_id := (SELECT b.salon_id FROM public.barbers b WHERE b.id = NEW.barber_id LIMIT 1);
  IF v_salon_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_phone := (SELECT p.phone FROM public.profiles p WHERE p.id = NEW.user_id LIMIT 1);
  IF v_phone IS NULL OR v_phone !~ '^\+40[0-9]{9}$' THEN
    RETURN NEW;
  END IF;

  v_first := (SELECT p.first_name FROM public.profiles p WHERE p.id = NEW.user_id LIMIT 1);
  v_last  := (SELECT p.last_name  FROM public.profiles p WHERE p.id = NEW.user_id LIMIT 1);

  INSERT INTO public.salon_clients (
    salon_id, phone_e164, first_name, last_name, source, linked_profile_id,
    first_seen_at, last_appointment_at, appointment_count
  )
  VALUES (
    v_salon_id, v_phone, v_first, v_last, 'appointment', NEW.user_id,
    now(), NEW.scheduled_at, 1
  )
  ON CONFLICT (salon_id, phone_e164) DO UPDATE SET
    last_appointment_at = GREATEST(
      public.salon_clients.last_appointment_at,
      NEW.scheduled_at
    ),
    appointment_count   = public.salon_clients.appointment_count + 1,
    first_name          = COALESCE(public.salon_clients.first_name, EXCLUDED.first_name),
    last_name           = COALESCE(public.salon_clients.last_name,  EXCLUDED.last_name),
    linked_profile_id   = COALESCE(public.salon_clients.linked_profile_id, NEW.user_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_upsert_salon_client ON public.appointments;
CREATE TRIGGER appointments_upsert_salon_client
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.tg_appointments_upsert_salon_client();

-- ===========================================================================
-- 8. Enforce opt-out at recipient insert
-- ===========================================================================
DROP FUNCTION IF EXISTS public.tg_sms_recipients_enforce_opt_out() CASCADE;

CREATE FUNCTION public.tg_sms_recipients_enforce_opt_out()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opted_out boolean;
BEGIN
  v_opted_out := EXISTS (
    SELECT 1
      FROM public.sms_opt_outs o
     WHERE o.salon_id  = NEW.salon_id
       AND o.phone_e164 = NEW.phone_e164
  );

  IF v_opted_out THEN
    NEW.status := 'opted_out';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_campaign_recipients_enforce_opt_out
  ON public.sms_campaign_recipients;
CREATE TRIGGER sms_campaign_recipients_enforce_opt_out
  BEFORE INSERT ON public.sms_campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.tg_sms_recipients_enforce_opt_out();

-- ===========================================================================
-- 9. Campaign stats sync on recipient status changes
-- ===========================================================================
DROP FUNCTION IF EXISTS public.tg_sms_recipients_sync_campaign_stats() CASCADE;

CREATE FUNCTION public.tg_sms_recipients_sync_campaign_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_success boolean;
  v_is_success  boolean;
  v_was_failure boolean;
  v_is_failure  boolean;
  v_sent_delta   int := 0;
  v_failed_delta int := 0;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  v_was_success := OLD.status IN ('sent','delivered');
  v_is_success  := NEW.status IN ('sent','delivered');
  v_was_failure := OLD.status IN ('failed');
  v_is_failure  := NEW.status IN ('failed');

  IF v_is_success AND NOT v_was_success THEN
    v_sent_delta := 1;
  ELSIF v_was_success AND NOT v_is_success THEN
    v_sent_delta := -1;
  END IF;

  IF v_is_failure AND NOT v_was_failure THEN
    v_failed_delta := 1;
  ELSIF v_was_failure AND NOT v_is_failure THEN
    v_failed_delta := -1;
  END IF;

  IF v_sent_delta <> 0 OR v_failed_delta <> 0 THEN
    UPDATE public.sms_campaigns
       SET sent_count   = GREATEST(0, sent_count   + v_sent_delta),
           failed_count = GREATEST(0, failed_count + v_failed_delta),
           updated_at   = now()
     WHERE id = NEW.campaign_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_campaign_recipients_sync_stats
  ON public.sms_campaign_recipients;
CREATE TRIGGER sms_campaign_recipients_sync_stats
  AFTER UPDATE OF status ON public.sms_campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.tg_sms_recipients_sync_campaign_stats();

-- ===========================================================================
-- 10. Row Level Security
-- ===========================================================================
ALTER TABLE public.salon_clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaign_recipients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_opt_outs             ENABLE ROW LEVEL SECURITY;

-- ---- salon_clients: full CRUD for salon members --------------------------
DROP POLICY IF EXISTS salon_clients_select ON public.salon_clients;
CREATE POLICY salon_clients_select ON public.salon_clients
  FOR SELECT TO authenticated
  USING (public.is_salon_member(salon_id));

DROP POLICY IF EXISTS salon_clients_insert ON public.salon_clients;
CREATE POLICY salon_clients_insert ON public.salon_clients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_salon_member(salon_id));

DROP POLICY IF EXISTS salon_clients_update ON public.salon_clients;
CREATE POLICY salon_clients_update ON public.salon_clients
  FOR UPDATE TO authenticated
  USING (public.is_salon_member(salon_id))
  WITH CHECK (public.is_salon_member(salon_id));

DROP POLICY IF EXISTS salon_clients_delete ON public.salon_clients;
CREATE POLICY salon_clients_delete ON public.salon_clients
  FOR DELETE TO authenticated
  USING (public.is_salon_member(salon_id));

-- ---- sms_campaigns: read + insert by members; updates only service_role --
DROP POLICY IF EXISTS sms_campaigns_select ON public.sms_campaigns;
CREATE POLICY sms_campaigns_select ON public.sms_campaigns
  FOR SELECT TO authenticated
  USING (public.is_salon_member(salon_id));

DROP POLICY IF EXISTS sms_campaigns_insert ON public.sms_campaigns;
CREATE POLICY sms_campaigns_insert ON public.sms_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.is_salon_member(salon_id));

-- (no UPDATE/DELETE policy for authenticated — service_role bypasses RLS)

-- ---- sms_campaign_recipients: read only for members ---------------------
DROP POLICY IF EXISTS sms_campaign_recipients_select ON public.sms_campaign_recipients;
CREATE POLICY sms_campaign_recipients_select ON public.sms_campaign_recipients
  FOR SELECT TO authenticated
  USING (public.is_salon_member(salon_id));

-- (INSERT/UPDATE/DELETE limited to service_role via RLS bypass)

-- ---- sms_opt_outs: read + insert by members; immutable thereafter -------
DROP POLICY IF EXISTS sms_opt_outs_select ON public.sms_opt_outs;
CREATE POLICY sms_opt_outs_select ON public.sms_opt_outs
  FOR SELECT TO authenticated
  USING (public.is_salon_member(salon_id));

DROP POLICY IF EXISTS sms_opt_outs_insert ON public.sms_opt_outs;
CREATE POLICY sms_opt_outs_insert ON public.sms_opt_outs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_salon_member(salon_id));

-- (no UPDATE/DELETE policies — append-only audit log)

-- ===========================================================================
-- 11. Grants
-- ===========================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_clients           TO authenticated;
GRANT SELECT, INSERT                 ON public.sms_campaigns           TO authenticated;
GRANT SELECT                         ON public.sms_campaign_recipients TO authenticated;
GRANT SELECT, INSERT                 ON public.sms_opt_outs            TO authenticated;

-- Service role covers worker writes to campaigns/recipients (bypasses RLS).
GRANT ALL ON public.salon_clients            TO service_role;
GRANT ALL ON public.sms_campaigns            TO service_role;
GRANT ALL ON public.sms_campaign_recipients  TO service_role;
GRANT ALL ON public.sms_opt_outs             TO service_role;

COMMIT;
