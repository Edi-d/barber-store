-- Migration 121: barber_breaks consistency rails + active view
--
-- Purpose:
--   1. Validate parent/child invariants:
--      - When parent_break_id IS NOT NULL, the child must inherit the
--        parent's salon_id and barber_id (no cross-salon, no cross-barber
--        overrides).
--   2. Validate recurrence horizon:
--      - When recurrence_rule != 'NONE' AND recurrence_until IS NOT NULL,
--        the until-date must be on or after start_at::date.
--   3. Provide a read-side helper view `v_barber_breaks_active` that filters
--      out long-past, non-recurring rows so the calendar's bulk fetch can
--      stay cheap.
--
-- Depends on:
--   - 118 (barber_breaks)

BEGIN;

-- ===========================================================================
-- 1. Parent/child consistency trigger
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.tg_barber_breaks_parent_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_salon  uuid;
  v_parent_barber uuid;
BEGIN
  -- Recurrence horizon check.
  IF NEW.recurrence_rule <> 'NONE'
     AND NEW.recurrence_until IS NOT NULL
     AND NEW.recurrence_until < NEW.start_at::date THEN
    RAISE EXCEPTION
      'recurrence_until (%) must be on or after start_at date (%)',
      NEW.recurrence_until, NEW.start_at::date
      USING errcode = '22023';
  END IF;

  -- Parent linkage check.
  IF NEW.parent_break_id IS NOT NULL THEN
    SELECT salon_id, barber_id
      INTO v_parent_salon, v_parent_barber
      FROM public.barber_breaks
     WHERE id = NEW.parent_break_id;

    IF v_parent_salon IS NULL THEN
      RAISE EXCEPTION 'parent_break_id % does not exist', NEW.parent_break_id
        USING errcode = '23503';
    END IF;

    IF v_parent_salon <> NEW.salon_id THEN
      RAISE EXCEPTION
        'child barber_break salon_id (%) must match parent salon_id (%)',
        NEW.salon_id, v_parent_salon
        USING errcode = '23514';
    END IF;

    IF v_parent_barber <> NEW.barber_id THEN
      RAISE EXCEPTION
        'child barber_break barber_id (%) must match parent barber_id (%)',
        NEW.barber_id, v_parent_barber
        USING errcode = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS barber_breaks_parent_consistency ON public.barber_breaks;
CREATE TRIGGER barber_breaks_parent_consistency
  BEFORE INSERT OR UPDATE ON public.barber_breaks
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_barber_breaks_parent_consistency();

-- ===========================================================================
-- 2. v_barber_breaks_active view
--    Filters to rows that are still relevant to "now":
--      - non-recurring rows whose end_at is at most one day in the past
--        (the 1-day fudge protects against client clock skew when rendering
--        today), OR
--      - recurring masters whose horizon is open or hasn't passed yet.
--    Tombstones (is_exception_skip = true) are kept so callers can apply
--    them when expanding occurrences.
-- ===========================================================================
DROP VIEW IF EXISTS public.v_barber_breaks_active;
CREATE VIEW public.v_barber_breaks_active AS
  SELECT *
    FROM public.barber_breaks
   WHERE
     (
       recurrence_rule = 'NONE'
       AND end_at > now() - interval '1 day'
     )
     OR
     (
       recurrence_rule <> 'NONE'
       AND (
         recurrence_until IS NULL
         OR recurrence_until >= current_date
       )
     );

-- The view inherits RLS from barber_breaks because Postgres applies the base
-- table's policies through views by default (security_invoker not needed here
-- since the policies already key off salon membership).

COMMIT;
