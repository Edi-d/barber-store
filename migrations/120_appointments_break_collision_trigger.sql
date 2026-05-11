-- Migration 120: appointments BEFORE INSERT/UPDATE collision trigger
--
-- Purpose:
--   Reject any appointment whose [scheduled_at, scheduled_at + duration_min)
--   range overlaps a same-barber NON-recurring barber_break (recurrence_rule
--   = 'NONE') that is not a tombstone (is_exception_skip = false).
--
-- Trade-off (intentional):
--   Recurring barber_breaks are NOT checked here. Server-side expansion of
--   recurrence rules in a per-row trigger is too expensive — every appointment
--   write would have to expand every recurring series for the barber over the
--   full lookback/lookahead window, then test each occurrence for overlap.
--   Instead, recurrence collisions are enforced client-side (the calendar
--   expands occurrences when rendering and refuses to book over them).
--
--   This means a malicious or out-of-band INSERT could in theory bypass a
--   recurring break, but every real client path goes through the calendar UI
--   or the create_appointment_with_client RPC. The risk is acceptable.
--
-- Error code:
--   23P01 (exclusion_violation) — picked so callers can switch on SQLSTATE
--   to render a "barber is on break at this time" toast in Romanian.
--
-- Depends on:
--   - 004 (appointments)
--   - 118 (barber_breaks + GiST overlap index)

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_appointments_check_break_collision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_appt_range tstzrange;
  v_collision  uuid;
BEGIN
  -- Skip the check for cancelled/no_show appointments (their times don't
  -- block anything).
  IF NEW.status IN ('cancelled','no_show') THEN
    RETURN NEW;
  END IF;

  v_appt_range := tstzrange(
    NEW.scheduled_at,
    NEW.scheduled_at + (NEW.duration_min || ' minutes')::interval,
    '[)'
  );

  -- Only NON-recurring breaks are enforced here (see header comment).
  SELECT bb.id
    INTO v_collision
    FROM public.barber_breaks bb
   WHERE bb.barber_id        = NEW.barber_id
     AND bb.recurrence_rule  = 'NONE'
     AND bb.is_exception_skip = false
     AND tstzrange(bb.start_at, bb.end_at, '[)') && v_appt_range
   LIMIT 1;

  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION
      'appointment overlaps a barber break (break id %)', v_collision
      USING errcode = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_check_break_collision ON public.appointments;
CREATE TRIGGER appointments_check_break_collision
  BEFORE INSERT OR UPDATE OF scheduled_at, duration_min, barber_id, status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_appointments_check_break_collision();

COMMIT;
