-- 105_notifications_triggers.sql
-- Push dispatch trigger (pg_net) + bookings lifecycle notifications + reminder crons
-- Depends on: 060 (base tables: notification_log, push_tokens, appointments),
--             103 (user_notification_prefs push/email toggles),
--             104 (notification_log push fields: title_key, body_key, params,
--                  deep_link, priority, data, is_read, read_at)
--
-- IMPORTANT — manual setup required before this migration is fully functional:
--   1. Enable pg_net and pg_cron extensions on your Supabase project
--      (Dashboard → Database → Extensions).
--   2. Set the service-role key in a Postgres setting so the webhook can
--      authenticate against the Edge Function:
--          ALTER DATABASE postgres
--              SET app.settings.service_role_key = '<your-service-role-key>';
--      (Dashboard → Database → Settings → "Custom Postgres Config", or via
--      psql with the superuser role.)
--   3. Replace <your-project-ref> in `trg_notify_push_on_insert` below with
--      your actual Supabase project ref (looks like `abcdwxyz1234`, taken from
--      `SUPABASE_URL` = `https://<project-ref>.supabase.co`).
--   4. Deploy the `send-push` Edge Function (Agent 5's scope).
--
-- Note on preference gating:
--   The `send-push` Edge Function already gates on user_notification_prefs
--   (push_enabled + category-specific columns). DB triggers therefore do NOT
--   re-check prefs — they just insert into notification_log and let dispatch
--   handle it.
--
-- Note on existing migration 039:
--   039_notify_followers_on_live.sql writes to the legacy `notifications`
--   table with type='live', NOT into `notification_log` with type='live_starting'.
--   That means its live-stream notifications currently bypass the push dispatch
--   webhook added here. Re-wiring 039 to use notification_log is OUT OF SCOPE
--   for this migration (per the task brief); this is a documented mismatch.
-- ============================================================================

BEGIN;

-- ─── 1. EXTENSIONS ─────────────────────────────────────────────────────────
-- pg_net powers the async HTTP call from the trigger.
-- pg_cron powers the reminder schedules.

CREATE EXTENSION IF NOT EXISTS pg_net;
-- pg_cron may not be installable in every environment; we guard usage later.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available — reminder schedules will be skipped';
END $$;

-- ─── 2. create_notification() HELPER ───────────────────────────────────────
-- Thin insert helper used by triggers and by the reminder cron jobs. Service
-- role / SECURITY DEFINER bypasses RLS. Returns the new row id.

CREATE OR REPLACE FUNCTION public.create_notification(
    p_user_id   UUID,
    p_type      TEXT,
    p_title     TEXT     DEFAULT NULL,
    p_body      TEXT     DEFAULT NULL,
    p_params    JSONB    DEFAULT '{}'::jsonb,
    p_deep_link TEXT     DEFAULT NULL,
    p_priority  SMALLINT DEFAULT 0,
    p_data      JSONB    DEFAULT '{}'::jsonb,
    p_salon_id  UUID     DEFAULT NULL,
    p_channel   TEXT     DEFAULT 'push'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.notification_log (
        user_id, salon_id, type, channel,
        title, body, title_key, body_key,
        params, deep_link, priority, data
    ) VALUES (
        p_user_id, p_salon_id, p_type, p_channel,
        p_title, p_body,
        -- We use the type as the i18n key root so mobile clients can resolve
        -- `notifications.types.<type>.title/body`. The Edge Function falls
        -- back to title/body if i18n keys are not present.
        'notifications.types.' || p_type || '.title',
        'notifications.types.' || p_type || '.body',
        COALESCE(p_params, '{}'::jsonb),
        p_deep_link,
        COALESCE(p_priority, 0)::smallint,
        COALESCE(p_data, '{}'::jsonb)
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(
    UUID, TEXT, TEXT, TEXT, JSONB, TEXT, SMALLINT, JSONB, UUID, TEXT
) TO authenticated, service_role;

-- ─── 3. PUSH DISPATCH TRIGGER on notification_log ──────────────────────────
-- Fires async HTTP POST to the send-push Edge Function whenever a
-- notification_log row is inserted. Failures NEVER block the insert.

CREATE OR REPLACE FUNCTION public.trg_notify_push_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    -- !! REPLACE <your-project-ref> below with the actual Supabase project ref.
    -- Example: 'https://abcdwxyz1234.supabase.co/functions/v1/send-push'
    v_url     TEXT := 'https://iaqztbhkukgghomwnict.supabase.co/functions/v1/send-push';
    v_key     TEXT;
    v_headers JSONB;
BEGIN
    -- Pull the service-role key from Supabase Vault. Store it once with:
    --   select vault.create_secret('<service-role-key>', 'service_role_key');
    -- (Managed Supabase forbids `ALTER DATABASE ... SET`, so the old
    --  app.settings.* GUC approach can't be used here.) Wrapped so a missing
    --  secret or no read access degrades to "no auth header" rather than aborting.
    BEGIN
        SELECT decrypted_secret INTO v_key
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_key := NULL;
    END;

    v_headers := jsonb_build_object('Content-Type', 'application/json');
    IF v_key IS NOT NULL AND length(v_key) > 0 THEN
        v_headers := v_headers || jsonb_build_object(
            'Authorization', 'Bearer ' || v_key
        );
    END IF;

    -- Fire-and-forget. pg_net queues and executes asynchronously.
    PERFORM net.http_post(
        url     := v_url,
        body    := jsonb_build_object(
            'type',   'INSERT',
            'table',  'notification_log',
            'schema', 'public',
            'record', to_jsonb(NEW)
        ),
        headers := v_headers
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Never block the insert because dispatch failed.
    RAISE WARNING 'send-push dispatch failed for notification_log.id=%: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_log_send_push ON public.notification_log;
CREATE TRIGGER notification_log_send_push
    AFTER INSERT ON public.notification_log
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_push_on_insert();

-- ─── 4. APPOINTMENTS: dedup flags for reminders ────────────────────────────
-- Tapzi's bookings table is named `appointments` (migration 004). Columns of
-- interest: id, user_id (client), barber_id, service_id, scheduled_at,
-- duration_min, status ('pending'|'confirmed'|'completed'|'cancelled'|'no_show'),
-- total_cents, currency, notes, created_at, updated_at.
--
-- There is NO salon_id on appointments — salon is derivable via
--   appointments.barber_id → barbers.salon_id
-- which the triggers resolve when populating `salon_id` on notification_log.

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reminder_1h_sent  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_appointments_reminder_24h_due
    ON public.appointments (scheduled_at)
    WHERE reminder_24h_sent = FALSE;

CREATE INDEX IF NOT EXISTS idx_appointments_reminder_1h_due
    ON public.appointments (scheduled_at)
    WHERE reminder_1h_sent = FALSE;

-- ─── 5. APPOINTMENT LIFECYCLE TRIGGERS ─────────────────────────────────────
-- Guarded by information_schema lookups so the migration survives if the
-- schema diverges (column renames, etc.).

DO $$
DECLARE
    v_has_user_id     BOOLEAN;
    v_has_barber_id   BOOLEAN;
    v_has_service_id  BOOLEAN;
    v_has_scheduled   BOOLEAN;
    v_has_status      BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='appointments'
                     AND column_name='user_id')      INTO v_has_user_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='appointments'
                     AND column_name='barber_id')   INTO v_has_barber_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='appointments'
                     AND column_name='service_id')  INTO v_has_service_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='appointments'
                     AND column_name='scheduled_at') INTO v_has_scheduled;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='appointments'
                     AND column_name='status')      INTO v_has_status;

    IF NOT (v_has_user_id AND v_has_barber_id AND v_has_scheduled AND v_has_status) THEN
        RAISE NOTICE 'appointments schema is missing expected columns (user_id/barber_id/scheduled_at/status) — booking triggers will be skipped';
        RETURN;
    END IF;

    -- -- (noop — the actual trigger DDL is outside this DO block so it is
    --     visible for DROP/CREATE below; schema-drift reports only.)
END $$;

-- INSERT trigger — booking_confirmed
CREATE OR REPLACE FUNCTION public.trg_appointment_notify_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_salon_id     UUID;
    v_salon_name   TEXT;
    v_service_name TEXT;
    v_time_txt     TEXT;
BEGIN
    SELECT b.salon_id, s.name
      INTO v_salon_id, v_salon_name
      FROM public.barbers b
      LEFT JOIN public.salons s ON s.id = b.salon_id
     WHERE b.id = NEW.barber_id;

    SELECT name INTO v_service_name
      FROM public.barber_services
     WHERE id = NEW.service_id;

    v_time_txt := to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Bucharest',
                          'DD Mon YYYY HH24:MI');

    PERFORM public.create_notification(
        NEW.user_id,
        'booking_confirmed',
        NULL, NULL,
        jsonb_build_object(
            'salonName',    COALESCE(v_salon_name, ''),
            'serviceTitle', COALESCE(v_service_name, ''),
            'time',         v_time_txt
        ),
        '/bookings/' || NEW.id::text,
        1::smallint,
        jsonb_build_object(
            'appointmentId', NEW.id,
            'barberId',      NEW.barber_id,
            'serviceId',     NEW.service_id,
            'scheduledAt',   NEW.scheduled_at
        ),
        v_salon_id,
        'push'
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_appointment_notify_created failed for appointment %: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_notify_created ON public.appointments;
CREATE TRIGGER appointments_notify_created
    AFTER INSERT ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_appointment_notify_created();

-- UPDATE trigger — booking_cancelled + booking_rescheduled
CREATE OR REPLACE FUNCTION public.trg_appointment_notify_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_salon_id     UUID;
    v_salon_name   TEXT;
    v_service_name TEXT;
    v_time_txt     TEXT;
BEGIN
    -- Resolve salon + service up front (reused by both branches)
    SELECT b.salon_id, s.name
      INTO v_salon_id, v_salon_name
      FROM public.barbers b
      LEFT JOIN public.salons s ON s.id = b.salon_id
     WHERE b.id = NEW.barber_id;

    SELECT name INTO v_service_name
      FROM public.barber_services
     WHERE id = NEW.service_id;

    -- booking_cancelled: status transitioning TO 'cancelled'
    IF NEW.status = 'cancelled'
       AND COALESCE(OLD.status, '') IS DISTINCT FROM 'cancelled' THEN
        PERFORM public.create_notification(
            NEW.user_id,
            'booking_cancelled',
            NULL, NULL,
            jsonb_build_object(
                'salonName',    COALESCE(v_salon_name, ''),
                'serviceTitle', COALESCE(v_service_name, ''),
                'time',         to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Bucharest',
                                        'DD Mon YYYY HH24:MI')
            ),
            '/bookings/' || NEW.id::text,
            1::smallint,
            jsonb_build_object('appointmentId', NEW.id),
            v_salon_id,
            'push'
        );
    END IF;

    -- booking_rescheduled: scheduled_at changed (ignore if the row is now cancelled)
    IF NEW.status <> 'cancelled'
       AND OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
        v_time_txt := to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Bucharest',
                              'DD Mon YYYY HH24:MI');
        PERFORM public.create_notification(
            NEW.user_id,
            'booking_rescheduled',
            NULL, NULL,
            jsonb_build_object(
                'salonName',    COALESCE(v_salon_name, ''),
                'serviceTitle', COALESCE(v_service_name, ''),
                'newTime',      v_time_txt,
                'oldTime',      to_char(OLD.scheduled_at AT TIME ZONE 'Europe/Bucharest',
                                        'DD Mon YYYY HH24:MI')
            ),
            '/bookings/' || NEW.id::text,
            1::smallint,
            jsonb_build_object(
                'appointmentId', NEW.id,
                'oldScheduledAt', OLD.scheduled_at,
                'newScheduledAt', NEW.scheduled_at
            ),
            v_salon_id,
            'push'
        );

        -- A reschedule invalidates any previously-sent reminders.
        NEW.reminder_24h_sent := FALSE;
        NEW.reminder_1h_sent  := FALSE;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_appointment_notify_updated failed for appointment %: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_notify_updated ON public.appointments;
CREATE TRIGGER appointments_notify_updated
    BEFORE UPDATE ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_appointment_notify_updated();

-- ─── 6. REMINDER CRON FUNCTIONS ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.emit_booking_reminders_24h()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INTEGER := 0;
    r RECORD;
    v_salon_id     UUID;
    v_salon_name   TEXT;
    v_service_name TEXT;
BEGIN
    FOR r IN
        SELECT a.id, a.user_id, a.barber_id, a.service_id, a.scheduled_at, a.status
          FROM public.appointments a
         WHERE a.reminder_24h_sent = FALSE
           AND a.status IN ('pending', 'confirmed')
           AND a.scheduled_at BETWEEN NOW() + INTERVAL '23 hours 55 minutes'
                                  AND NOW() + INTERVAL '24 hours 5 minutes'
    LOOP
        SELECT b.salon_id, s.name
          INTO v_salon_id, v_salon_name
          FROM public.barbers b
          LEFT JOIN public.salons s ON s.id = b.salon_id
         WHERE b.id = r.barber_id;

        SELECT name INTO v_service_name
          FROM public.barber_services WHERE id = r.service_id;

        PERFORM public.create_notification(
            r.user_id,
            'booking_reminder_24h',
            NULL, NULL,
            jsonb_build_object(
                'salonName',    COALESCE(v_salon_name, ''),
                'serviceTitle', COALESCE(v_service_name, ''),
                'time',         to_char(r.scheduled_at AT TIME ZONE 'Europe/Bucharest',
                                        'DD Mon HH24:MI')
            ),
            '/bookings/' || r.id::text,
            1::smallint,
            jsonb_build_object('appointmentId', r.id,
                               'scheduledAt', r.scheduled_at),
            v_salon_id,
            'push'
        );

        UPDATE public.appointments SET reminder_24h_sent = TRUE WHERE id = r.id;
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.emit_booking_reminders_1h()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INTEGER := 0;
    r RECORD;
    v_salon_id     UUID;
    v_salon_name   TEXT;
    v_service_name TEXT;
BEGIN
    FOR r IN
        SELECT a.id, a.user_id, a.barber_id, a.service_id, a.scheduled_at, a.status
          FROM public.appointments a
         WHERE a.reminder_1h_sent = FALSE
           AND a.status IN ('pending', 'confirmed')
           AND a.scheduled_at BETWEEN NOW() + INTERVAL '55 minutes'
                                  AND NOW() + INTERVAL '65 minutes'
    LOOP
        SELECT b.salon_id, s.name
          INTO v_salon_id, v_salon_name
          FROM public.barbers b
          LEFT JOIN public.salons s ON s.id = b.salon_id
         WHERE b.id = r.barber_id;

        SELECT name INTO v_service_name
          FROM public.barber_services WHERE id = r.service_id;

        PERFORM public.create_notification(
            r.user_id,
            'booking_reminder_1h',
            NULL, NULL,
            jsonb_build_object(
                'salonName',    COALESCE(v_salon_name, ''),
                'serviceTitle', COALESCE(v_service_name, ''),
                'time',         to_char(r.scheduled_at AT TIME ZONE 'Europe/Bucharest',
                                        'HH24:MI')
            ),
            '/bookings/' || r.id::text,
            2::smallint,
            jsonb_build_object('appointmentId', r.id,
                               'scheduledAt', r.scheduled_at),
            v_salon_id,
            'push'
        );

        UPDATE public.appointments SET reminder_1h_sent = TRUE WHERE id = r.id;
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emit_booking_reminders_24h() TO service_role;
GRANT EXECUTE ON FUNCTION public.emit_booking_reminders_1h()  TO service_role;

-- ─── 7. pg_cron SCHEDULES ──────────────────────────────────────────────────
-- Every 5 minutes. Guarded against pg_cron not being installed.

DO $$
BEGIN
    -- Unschedule prior runs (idempotent)
    BEGIN
        PERFORM cron.unschedule('emit_booking_reminders_24h');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        PERFORM cron.unschedule('emit_booking_reminders_1h');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Re-schedule
    PERFORM cron.schedule(
        'emit_booking_reminders_24h',
        '*/5 * * * *',
        $SQL$ SELECT public.emit_booking_reminders_24h(); $SQL$
    );
    PERFORM cron.schedule(
        'emit_booking_reminders_1h',
        '*/5 * * * *',
        $SQL$ SELECT public.emit_booking_reminders_1h(); $SQL$
    );
EXCEPTION
    WHEN undefined_function OR undefined_table OR invalid_schema_name THEN
        RAISE NOTICE 'pg_cron not installed — reminder schedules skipped';
    WHEN OTHERS THEN
        RAISE NOTICE 'Failed to schedule reminder crons: %', SQLERRM;
END $$;

-- ─── 8. TODO — NOT-YET-IMPLEMENTED TRIGGERS ────────────────────────────────
-- The following notification types are intentionally deferred because their
-- source events / tables / state-machines are not confirmed in this codebase
-- with enough certainty to write a safe trigger. Track each with its own
-- follow-up migration:
--
--   loyalty_reward      — fire when a redeemable reward becomes available
--                         for a user (likely AFTER INSERT on reward_redemptions
--                         with status='available', OR when points cross a
--                         reward threshold in a loyalty RPC).
--
--   loyalty_tier_up     — fire when a user's loyalty tier column changes in
--                         whatever table stores per-user tier state (vtier
--                         dashboard, ref. migration 063).
--
--   new_follower        — AFTER INSERT on `follows` (fire to the followed user;
--                         respect promotional/social opt-ins).
--
--   review_received     — AFTER INSERT on `reviews` (migration 024) — fire to
--                         the salon owner or reviewed barber.
--
--   new_message         — AFTER INSERT on the DM / chat message table (schema
--                         not confirmed). Must dedupe rapid bursts per
--                         conversation.
--
--   payment_received    — likely tied to the Stripe webhook / delivery_webhooks
--                         pipeline (migration 083) rather than a local trigger.
--                         Preferably emitted from the webhook handler after
--                         successful charge capture.
--
-- Migration 039 (legacy live-start notifier) also needs to be migrated from
-- the `notifications` table to `notification_log` + type='live_starting' so
-- the push dispatch trigger here picks it up.

COMMIT;
