-- Migration 127: Fix lying booking notifications + add owner alert
--
-- Problems with mig 105:
--   1. INSERT trigger fires `booking_confirmed` to `NEW.user_id` regardless of
--      `NEW.status`. Client-app inserts come in with status='pending' — so the
--      customer immediately receives "Programare confirmata" even though the
--      barber hasn't acted yet. Lying UX, ungated.
--   2. The salon owner is never notified that a new booking arrived. The
--      whole AFTER INSERT path only pushes to the client. There is no
--      `booking_received` notification anywhere.
--   3. The pending → confirmed status transition is silent. No realtime, no
--      push — the customer learns about confirmation only via the (broken)
--      INSERT-time push or via 60s polling on the client app.
--
-- Fix:
--   - Replace `trg_appointment_notify_created`: gate `booking_confirmed` on
--     `NEW.status='confirmed'` AND emit `booking_received` to the salon owner
--     for EVERY new booking (so they always get a heads-up).
--   - Replace `trg_appointment_notify_updated`: add a branch that emits
--     `booking_confirmed` to the customer when status transitions
--     pending → confirmed.
--
-- The `booking_received` notification type is added to send-push edge
-- function's DEFAULT_COPY in a follow-up code change (not part of this
-- SQL migration, but required for the OS push card to render).

BEGIN;

-- ===========================================================================
-- 1. INSERT trigger — split: owner gets `booking_received` always, client gets
--    `booking_confirmed` only when status is already 'confirmed' on insert
--    (e.g., owner-side RPC `create_appointment_with_client` inserts with
--    status='confirmed' directly).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.trg_appointment_notify_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_salon_id     UUID;
    v_salon_name   TEXT;
    v_owner_id     UUID;
    v_service_name TEXT;
    v_client_name  TEXT;
    v_time_txt     TEXT;
BEGIN
    -- Resolve salon, owner, service.
    SELECT b.salon_id, s.name, s.owner_id
      INTO v_salon_id, v_salon_name, v_owner_id
      FROM public.barbers b
      LEFT JOIN public.salons s ON s.id = b.salon_id
     WHERE b.id = NEW.barber_id;

    SELECT name INTO v_service_name
      FROM public.barber_services
     WHERE id = NEW.service_id;

    -- Resolve a display name for the booker. Prefer salon_client (mig 126
    -- back-fills it for client-app bookings), then profiles.display_name.
    SELECT TRIM(BOTH FROM CONCAT_WS(' ', sc.first_name, sc.last_name))
      INTO v_client_name
      FROM public.salon_clients sc
     WHERE sc.id = NEW.salon_client_id;

    IF v_client_name IS NULL OR v_client_name = '' THEN
      SELECT p.display_name INTO v_client_name
        FROM public.profiles p
       WHERE p.id = NEW.user_id;
    END IF;

    v_time_txt := to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Bucharest',
                          'DD Mon YYYY HH24:MI');

    -- ── A. Owner-side `booking_received` push — always, for every insert ──
    --    Skip if the booker IS the owner (e.g., owner books for a walk-in
    --    via the dedicated RPC) — they don't need a push for their own click.
    IF v_owner_id IS NOT NULL AND v_owner_id <> NEW.user_id THEN
      PERFORM public.create_notification(
          v_owner_id,
          'booking_received',
          NULL, NULL,
          jsonb_build_object(
              'clientName',   COALESCE(v_client_name, ''),
              'serviceTitle', COALESCE(v_service_name, ''),
              'time',         v_time_txt,
              'status',       NEW.status
          ),
          '/(tabs)/calendar?id=' || NEW.id::text,
          1::smallint,
          jsonb_build_object(
              'appointmentId', NEW.id,
              'barberId',      NEW.barber_id,
              'serviceId',     NEW.service_id,
              'scheduledAt',   NEW.scheduled_at,
              'status',        NEW.status
          ),
          v_salon_id,
          'push'
      );
    END IF;

    -- ── B. Client-side `booking_confirmed` push — only if status is already
    --    'confirmed' on insert. Pending bookings get the confirmation push
    --    later, from the UPDATE trigger when the owner confirms.
    IF NEW.status = 'confirmed' THEN
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

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_appointment_notify_created failed for appointment %: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- (Trigger wiring is unchanged — we only swapped the function body.
--  Kept here as a no-op DROP/CREATE to be explicit about idempotency.)
DROP TRIGGER IF EXISTS appointments_notify_created ON public.appointments;
CREATE TRIGGER appointments_notify_created
    AFTER INSERT ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_appointment_notify_created();


-- ===========================================================================
-- 2. UPDATE trigger — add the missing pending → confirmed branch.
-- ===========================================================================
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

    -- booking_cancelled — unchanged from mig 105.
    IF NEW.status = 'cancelled'
       AND COALESCE(OLD.status, '') IS DISTINCT FROM 'cancelled' THEN
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

    -- booking_rescheduled — unchanged from mig 105.
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

COMMIT;
