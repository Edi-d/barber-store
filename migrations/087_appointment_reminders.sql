-- ============================================================================
-- Migration 087 — Appointment Reminders (SMS + Email, 2h default before)
-- ============================================================================
-- Depends on:
--   - 004_appointments.sql      (appointments, barbers, barber_services)
--   - 010_unified_salon_system  (salons, salon_members, barbers.salon_id)
--   - 081/082 metered billing   (reserve_usage / confirm_usage / release_usage)
--
-- What this migration installs:
--   1. profiles.phone           (client contact for SMS — optional)
--   2. salon_reminder_preferences (per-salon toggles + hours_before)
--   3. appointment_reminders    (one row per (appointment, channel))
--   4. schedule_appointment_reminders(p_appointment_id uuid)
--   5. Triggers on appointments INSERT/UPDATE that drive the scheduler
--   6. RLS: salon members read their reminders; no direct write
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. profiles.phone (SMS contact, optional — skip SMS if NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

-- ---------------------------------------------------------------------------
-- 2. salon_reminder_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salon_reminder_preferences (
  salon_id      uuid PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
  sms_enabled   boolean     NOT NULL DEFAULT true,
  email_enabled boolean     NOT NULL DEFAULT true,
  hours_before  integer     NOT NULL DEFAULT 2
    CHECK (hours_before IN (1, 2, 3, 4, 6, 12, 24)),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS salon_reminder_preferences_set_updated_at
  ON public.salon_reminder_preferences;
CREATE TRIGGER salon_reminder_preferences_set_updated_at
  BEFORE UPDATE ON public.salon_reminder_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.salon_reminder_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salon_reminder_prefs_select_member"
  ON public.salon_reminder_preferences;
CREATE POLICY "salon_reminder_prefs_select_member"
  ON public.salon_reminder_preferences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.salons s
       WHERE s.id = salon_reminder_preferences.salon_id
         AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.salon_members sm
       WHERE sm.salon_id = salon_reminder_preferences.salon_id
         AND sm.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "salon_reminder_prefs_upsert_owner"
  ON public.salon_reminder_preferences;
CREATE POLICY "salon_reminder_prefs_upsert_owner"
  ON public.salon_reminder_preferences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.salons s
       WHERE s.id = salon_reminder_preferences.salon_id
         AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.salons s
       WHERE s.id = salon_reminder_preferences.salon_id
         AND s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. appointment_reminders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      uuid NOT NULL
    REFERENCES public.appointments(id) ON DELETE CASCADE,
  salon_id            uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  channel             text NOT NULL CHECK (channel IN ('sms', 'email')),
  scheduled_for       timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'cancelled')),
  sent_at             timestamptz,
  reservation_id      uuid,
  provider_message_id text,
  error               text,
  retry_count         integer     NOT NULL DEFAULT 0,
  max_retries         integer     NOT NULL DEFAULT 3,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_reminders_unique UNIQUE (appointment_id, channel)
);

-- Cron scan index — keeps "pending & due" lookup tiny.
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_pending_due
  ON public.appointment_reminders (status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_appointment
  ON public.appointment_reminders (appointment_id);

DROP TRIGGER IF EXISTS appointment_reminders_set_updated_at
  ON public.appointment_reminders;
CREATE TRIGGER appointment_reminders_set_updated_at
  BEFORE UPDATE ON public.appointment_reminders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

-- Salon members can READ their reminders; writes are service-role only
-- (performed via triggers + the cron edge function).
DROP POLICY IF EXISTS "appointment_reminders_select_member"
  ON public.appointment_reminders;
CREATE POLICY "appointment_reminders_select_member"
  ON public.appointment_reminders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.salons s
       WHERE s.id = appointment_reminders.salon_id
         AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.salon_members sm
       WHERE sm.salon_id = appointment_reminders.salon_id
         AND sm.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. schedule_appointment_reminders RPC
-- ---------------------------------------------------------------------------
-- NOTE: Rewritten to avoid `SELECT ... INTO` (Supabase SQL Editor parse bug).
DROP FUNCTION IF EXISTS public.schedule_appointment_reminders(uuid);

CREATE FUNCTION public.schedule_appointment_reminders(
  p_appointment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scheduled_at  timestamptz;
  v_status        text;
  v_salon_id      uuid;
  v_sms_enabled   boolean;
  v_email_enabled boolean;
  v_hours_before  integer;
  v_fire_at       timestamptz;
BEGIN
  v_scheduled_at := (SELECT a.scheduled_at FROM public.appointments a WHERE a.id = p_appointment_id);

  IF v_scheduled_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
  END IF;

  v_status := (SELECT a.status FROM public.appointments a WHERE a.id = p_appointment_id);

  v_salon_id := (
    SELECT b.salon_id
      FROM public.appointments a
      JOIN public.barbers b ON b.id = a.barber_id
     WHERE a.id = p_appointment_id
  );

  IF v_salon_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'salon_not_resolved');
  END IF;

  IF v_status <> 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'status_not_confirmed');
  END IF;

  INSERT INTO public.salon_reminder_preferences (salon_id)
       VALUES (v_salon_id)
  ON CONFLICT (salon_id) DO NOTHING;

  v_sms_enabled   := (SELECT sms_enabled   FROM public.salon_reminder_preferences WHERE salon_id = v_salon_id);
  v_email_enabled := (SELECT email_enabled FROM public.salon_reminder_preferences WHERE salon_id = v_salon_id);
  v_hours_before  := (SELECT hours_before  FROM public.salon_reminder_preferences WHERE salon_id = v_salon_id);

  v_fire_at := v_scheduled_at - make_interval(hours => v_hours_before);

  IF v_fire_at <= now() THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'reason',  'too_late',
      'fire_at', v_fire_at
    );
  END IF;

  IF v_sms_enabled THEN
    INSERT INTO public.appointment_reminders
      (appointment_id, salon_id, channel, scheduled_for)
    VALUES
      (p_appointment_id, v_salon_id, 'sms', v_fire_at)
    ON CONFLICT (appointment_id, channel) DO NOTHING;
  END IF;

  IF v_email_enabled THEN
    INSERT INTO public.appointment_reminders
      (appointment_id, salon_id, channel, scheduled_for)
    VALUES
      (p_appointment_id, v_salon_id, 'email', v_fire_at)
    ON CONFLICT (appointment_id, channel) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'salon_id',      v_salon_id,
    'fire_at',       v_fire_at,
    'sms_enabled',  v_sms_enabled,
    'email_enabled', v_email_enabled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_appointment_reminders(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_appointment_reminders(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Trigger: after INSERT on appointments (confirmed → schedule)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_appointments_schedule_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    PERFORM public.schedule_appointment_reminders(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_after_insert_schedule_reminders
  ON public.appointments;
CREATE TRIGGER appointments_after_insert_schedule_reminders
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_appointments_schedule_reminders();

-- ---------------------------------------------------------------------------
-- 6. Trigger: after UPDATE on appointments
--    - status → cancelled / no_show : cancel pending reminders
--    - status → confirmed (from another): schedule (idempotent)
--    - scheduled_at changes          : shift pending reminders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_appointments_update_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours_before integer;
  v_salon_id     uuid;
  v_delta        interval;
BEGIN
  -- Status transitions.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('cancelled', 'no_show') THEN
      UPDATE public.appointment_reminders
         SET status = 'cancelled'
       WHERE appointment_id = NEW.id
         AND status = 'pending';
    ELSIF NEW.status = 'confirmed' THEN
      -- Newly confirmed (e.g. pending → confirmed): schedule now.
      PERFORM public.schedule_appointment_reminders(NEW.id);
    END IF;
  END IF;

  -- scheduled_at shifted: move pending reminders with the same delta, and
  -- re-cancel rows whose new fire_at would be in the past.
  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     AND NEW.status NOT IN ('cancelled', 'no_show') THEN
    v_delta := NEW.scheduled_at - OLD.scheduled_at;

    UPDATE public.appointment_reminders
       SET scheduled_for = scheduled_for + v_delta
     WHERE appointment_id = NEW.id
       AND status = 'pending';

    UPDATE public.appointment_reminders
       SET status = 'cancelled',
           error  = 'rescheduled_into_past'
     WHERE appointment_id = NEW.id
       AND status = 'pending'
       AND scheduled_for <= now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_after_update_reminders
  ON public.appointments;
CREATE TRIGGER appointments_after_update_reminders
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
  )
  EXECUTE FUNCTION public.tg_appointments_update_reminders();

COMMIT;

-- ===========================================================================
-- pg_cron schedule (run separately after configuring Vault secrets)
-- ===========================================================================
-- One-time Vault setup (run manually from the SQL Editor):
--
--   SELECT vault.create_secret(
--     'https://<project-ref>.functions.supabase.co/process-reminders',
--     'process_reminders_url'
--   );
--   -- Reuse the same 'cron_secret' vault entry created in migration 084.
--   -- If missing:
--   -- SELECT vault.create_secret('<random-32-byte-string>', 'cron_secret');
--
-- Then schedule the cron every 5 minutes:
--
--   SELECT cron.schedule(
--     'process-appointment-reminders',
--     '*/5 * * * *',
--     $cron$
--     SELECT net.http_post(
--       url     := (SELECT decrypted_secret FROM vault.decrypted_secrets
--                    WHERE name = 'process_reminders_url'),
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
--                            WHERE name = 'cron_secret')
--       ),
--       body    := '{}'::jsonb,
--       timeout_milliseconds := 60000
--     );
--     $cron$
--   );
--
-- To inspect / unschedule:
--   SELECT * FROM cron.job WHERE jobname = 'process-appointment-reminders';
--   SELECT cron.unschedule('process-appointment-reminders');
