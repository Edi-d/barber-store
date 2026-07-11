-- ============================================================================
-- Migration 160: One summary push when a recurring package is cancelled
-- ============================================================================
-- Cancelling a "pachet recurent" cancels every future occurrence in one bulk
-- UPDATE (up to ~24 rows). The per-row BEFORE UPDATE trigger
-- (trg_appointment_notify_updated) fires a `booking_cancelled` push for EACH
-- cancelled row, so the buyer gets a burst of N identical "Programare anulată"
-- notifications. This migration collapses that into a single `package_cancelled`
-- summary push.
--
-- Mechanism: cancel_recurring_package sets a transaction-local flag
-- (`tapzi.bulk_cancel`) around its bulk UPDATE; the trigger skips its
-- per-occurrence `booking_cancelled` insert while that flag is on, then the RPC
-- emits ONE `package_cancelled` notification. The flag is is_local = true, so it
-- auto-resets at transaction end and NEVER affects an individual appointment
-- cancel (which still notifies normally).
--
-- IMPORTANT: this re-creates the trigger body from migration 127 (the live
-- version — NOT 105's) verbatim, adding only the flag guard on the cancelled
-- branch. The pending→confirmed and reschedule branches are unchanged.
--
-- Requires: send-push Edge Function must know the `package_cancelled` type
-- (added in the same code change) and be redeployed for the OS card to render.
--
-- SAFETY / SHARED PROJECT: additive + idempotent (CREATE OR REPLACE only). No
-- table or other object is altered.
-- ============================================================================

BEGIN;

-- ── 1. Booking UPDATE trigger — suppress per-occurrence cancel push in bulk ──
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

    -- ── pending → confirmed: client gets `booking_confirmed` push ──
    IF NEW.status = 'confirmed'
       AND COALESCE(OLD.status, '') = 'pending' THEN
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
    END IF;

    -- ── booking_cancelled ──
    -- Skipped while a bulk package cancel is in progress: cancel_recurring_package
    -- sets tapzi.bulk_cancel='on' and emits ONE package_cancelled summary instead
    -- of N per-occurrence pushes. An individual cancel never sets the flag, so it
    -- still notifies here as before.
    IF NEW.status = 'cancelled'
       AND COALESCE(OLD.status, '') IS DISTINCT FROM 'cancelled'
       AND COALESCE(current_setting('tapzi.bulk_cancel', true), '') <> 'on' THEN
        PERFORM public.create_notification(
            NEW.user_id,
            'booking_cancelled',
            NULL, NULL,
            jsonb_build_object(
                'salonName',    COALESCE(v_salon_name, ''),
                'serviceTitle', COALESCE(v_service_name, ''),
                'time',         v_time_txt
            ),
            '/bookings/' || NEW.id::text,
            1::smallint,
            jsonb_build_object('appointmentId', NEW.id),
            v_salon_id,
            'push'
        );
    END IF;

    -- ── booking_rescheduled ──
    IF NEW.status <> 'cancelled'
       AND OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
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
                'appointmentId',  NEW.id,
                'oldScheduledAt', OLD.scheduled_at,
                'newScheduledAt', NEW.scheduled_at
            ),
            v_salon_id,
            'push'
        );

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

-- ── 2. cancel_recurring_package — flag the bulk cancel + emit one summary ─────
CREATE OR REPLACE FUNCTION public.cancel_recurring_package(p_package_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         uuid;
  v_owner        uuid;
  v_salon        uuid;
  v_service_id   uuid;
  v_salon_name   text;
  v_service_name text;
  v_count        int;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '42501';
  END IF;

  SELECT ap.user_id, ap.salon_id, ap.service_id
    INTO v_owner, v_salon, v_service_id
    FROM public.appointment_packages ap
   WHERE ap.id = p_package_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'package_not_found' USING errcode = '22023';
  END IF;
  IF v_owner <> v_user THEN
    RAISE EXCEPTION 'not_package_owner' USING errcode = '42501';
  END IF;

  -- Suppress the trigger's per-occurrence booking_cancelled push for this
  -- transaction; the single package_cancelled summary below replaces them.
  PERFORM set_config('tapzi.bulk_cancel', 'on', true);

  UPDATE public.appointments a
     SET status = 'cancelled'
   WHERE a.package_id = p_package_id
     AND a.status IN ('pending', 'confirmed')
     AND a.scheduled_at >= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.appointment_packages ap
     SET status = 'cancelled'
   WHERE ap.id = p_package_id;

  -- Clear the flag before emitting so nothing downstream inherits it.
  PERFORM set_config('tapzi.bulk_cancel', 'off', true);

  -- One summary push (only if anything was actually cancelled).
  IF v_count > 0 THEN
    SELECT s.name INTO v_salon_name FROM public.salons s WHERE s.id = v_salon;
    SELECT bs.name INTO v_service_name
      FROM public.barber_services bs WHERE bs.id = v_service_id;

    PERFORM public.create_notification(
      v_owner,
      'package_cancelled',
      NULL, NULL,
      jsonb_build_object(
        'count',        v_count,
        'salonName',    COALESCE(v_salon_name, ''),
        'serviceTitle', COALESCE(v_service_name, '')
      ),
      '/appointments',
      1::smallint,
      jsonb_build_object('packageId', p_package_id, 'cancelledCount', v_count),
      v_salon,
      'push'
    );
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_recurring_package(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_recurring_package(uuid) TO authenticated;

COMMIT;
