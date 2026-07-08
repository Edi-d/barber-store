-- ============================================================================
-- Migration 153: expose a `reason` on busy intervals
--
-- The consumer booking flow needs to tell WHY a day has no bookable slot so it
-- can show a specific message ("X este în concediu, următoarea zi disponibilă
-- este ..." vs "toate orele sunt ocupate"). Until now get_barber_busy_intervals
-- flattened appointments and breaks into anonymous (start, end) pairs, so the
-- client could not distinguish a vacation break from a fully-booked day.
--
-- This migration adds a nullable `reason text` column to both
-- _barber_break_occurrences and get_barber_busy_intervals:
--   • appointment slots  → reason = NULL
--   • break occurrences  → reason = barber_breaks.reason_type
--                          ('lunch','vacation','training','personal','other')
--
-- Adding a column changes each function's RETURNS TABLE signature, which
-- CREATE OR REPLACE cannot do — so both are DROP-ed first and recreated.
-- book_appointment references _barber_break_occurrences only via `SELECT 1`
-- (column-agnostic), so the extra column does not affect it.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_barber_busy_intervals(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public._barber_break_occurrences(uuid, timestamptz, timestamptz);

-- ============================================================================
-- INTERNAL HELPER: _barber_break_occurrences (now carries reason_type)
-- ============================================================================
CREATE FUNCTION public._barber_break_occurrences(
  p_barber_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
) RETURNS TABLE(busy_start timestamptz, busy_end timestamptz, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_break     RECORD;
  v_date      date;
  v_dow_local int;
  v_rule_dow  int;      -- weekday the rule targets (Postgres DOW: 0=Sun..6=Sat)
  v_occ_start timestamptz;
  v_occ_end   timestamptz;
  v_master_local_date date;
BEGIN

  -- ─── Non-recurring breaks (NONE, not tombstones) ───────────────────────────
  FOR v_break IN
    SELECT bb.start_at, bb.end_at, bb.reason_type
      FROM public.barber_breaks bb
     WHERE bb.barber_id         = p_barber_id
       AND bb.recurrence_rule   = 'NONE'
       AND bb.is_exception_skip = false
       AND tstzrange(bb.start_at, bb.end_at, '[)') && tstzrange(p_from, p_to, '[)')
  LOOP
    busy_start := v_break.start_at;
    busy_end   := v_break.end_at;
    reason     := v_break.reason_type;
    RETURN NEXT;
  END LOOP;

  -- ─── Recurring breaks: expand each master row over the window ──────────────
  FOR v_break IN
    SELECT bb.id,
           bb.start_at,
           bb.end_at,
           bb.recurrence_rule,
           bb.recurrence_until,
           bb.reason_type
      FROM public.barber_breaks bb
     WHERE bb.barber_id         = p_barber_id
       AND bb.recurrence_rule  <> 'NONE'
       AND bb.is_exception_skip = false
  LOOP

    -- Convert rule to a target Postgres DOW integer (0=Sun..6=Sat).
    -- WEEKLY_MO=1, WEEKLY_TU=2, WEEKLY_WE=3, WEEKLY_TH=4,
    -- WEEKLY_FR=5, WEEKLY_SA=6, WEEKLY_SU=0.
    v_rule_dow := CASE v_break.recurrence_rule
      WHEN 'WEEKLY_SU' THEN 0
      WHEN 'WEEKLY_MO' THEN 1
      WHEN 'WEEKLY_TU' THEN 2
      WHEN 'WEEKLY_WE' THEN 3
      WHEN 'WEEKLY_TH' THEN 4
      WHEN 'WEEKLY_FR' THEN 5
      WHEN 'WEEKLY_SA' THEN 6
      ELSE NULL  -- DAILY: no specific day filter
    END;

    -- Earliest possible occurrence date is the master's start_at local date.
    v_master_local_date := (v_break.start_at AT TIME ZONE 'Europe/Bucharest')::date;

    -- Generate candidate dates within the window.
    FOR v_date IN
      SELECT gs::date
        FROM generate_series(
               GREATEST(
                 v_master_local_date,
                 (p_from AT TIME ZONE 'Europe/Bucharest')::date
               ),
               LEAST(
                 COALESCE(
                   v_break.recurrence_until,
                   (p_to AT TIME ZONE 'Europe/Bucharest')::date
                 ),
                 (p_to AT TIME ZONE 'Europe/Bucharest')::date
               ),
               '1 day'::interval
             ) gs
    LOOP

      -- Check rule: DAILY passes all dates; WEEKLY_* requires matching DOW.
      v_dow_local := EXTRACT(DOW FROM v_date);
      IF v_break.recurrence_rule <> 'DAILY' AND v_dow_local <> v_rule_dow THEN
        CONTINUE;
      END IF;

      -- Compute occurrence start/end in Europe/Bucharest, convert to timestamptz.
      v_occ_start := (v_date + (v_break.start_at AT TIME ZONE 'Europe/Bucharest')::time)
                       AT TIME ZONE 'Europe/Bucharest';
      v_occ_end   := (v_date + (v_break.end_at   AT TIME ZONE 'Europe/Bucharest')::time)
                       AT TIME ZONE 'Europe/Bucharest';

      -- Skip occurrences tombstoned by a child exception-skip row.
      IF EXISTS (
        SELECT 1
          FROM public.barber_breaks child
         WHERE child.parent_break_id   = v_break.id
           AND child.is_exception_skip = true
           AND (child.start_at AT TIME ZONE 'Europe/Bucharest')::date = v_date
      ) THEN
        CONTINUE;
      END IF;

      -- Emit only occurrences that actually overlap the query window.
      IF tstzrange(v_occ_start, v_occ_end, '[)') && tstzrange(p_from, p_to, '[)') THEN
        busy_start := v_occ_start;
        busy_end   := v_occ_end;
        reason     := v_break.reason_type;
        RETURN NEXT;
      END IF;

    END LOOP;
  END LOOP;

END;
$$;

-- Not callable by end users; used internally by the two public RPCs only.
REVOKE ALL ON FUNCTION public._barber_break_occurrences(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- RPC: get_barber_busy_intervals (now returns reason)
--    Returns the union of confirmed appointment slots + break occurrences for
--    a barber over a caller-supplied window.  Times only — no PII columns.
--    reason: NULL for appointments, reason_type for breaks.
-- ============================================================================
CREATE FUNCTION public.get_barber_busy_intervals(
  p_barber_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
) RETURNS TABLE(busy_start timestamptz, busy_end timestamptz, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  -- Auth gate.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '42501';
  END IF;

  -- Window validation: must be forward-ordered and ≤ 60 days.
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_window' USING errcode = '22023';
  END IF;
  IF (p_to - p_from) > INTERVAL '60 days' THEN
    RAISE EXCEPTION 'invalid_window' USING errcode = '22023';
  END IF;

  -- ─── Appointment slots (reason = NULL) ─────────────────────────────────────
  RETURN QUERY
    SELECT a.scheduled_at                                               AS busy_start,
           a.scheduled_at + (a.duration_min || ' minutes')::interval   AS busy_end,
           NULL::text                                                   AS reason
      FROM public.appointments a
     WHERE a.barber_id = p_barber_id
       AND a.status NOT IN ('cancelled', 'no_show')
       AND tstzrange(
             a.scheduled_at,
             a.scheduled_at + (a.duration_min || ' minutes')::interval,
             '[)'
           ) && tstzrange(p_from, p_to, '[)');

  -- ─── Break occurrences (reason = reason_type) ──────────────────────────────
  RETURN QUERY
    SELECT occ.busy_start, occ.busy_end, occ.reason
      FROM public._barber_break_occurrences(p_barber_id, p_from, p_to) occ;

END;
$$;

REVOKE ALL ON FUNCTION public.get_barber_busy_intervals(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_barber_busy_intervals(uuid, timestamptz, timestamptz)
  TO authenticated;
