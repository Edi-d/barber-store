-- ============================================================================
-- Migration 144: Booking Hardening
-- ============================================================================
--
-- Purpose:
--   Closes all known concurrency, RLS, and correctness gaps in the appointments
--   subsystem. Introduces:
--     1. get_barber_busy_intervals   — safe read-only slot availability RPC
--     2. book_appointment            — atomic consumer-booking entrypoint
--     3. appointments_check_overlap  — defense-in-depth trigger (all writers)
--     4. tg_appointments_autolink_salon_client  — race-safe rewrite (mig 126)
--     5. update_appointment_with_services       — guard vs cancelled edits
--     6. RLS hardening on appointments + appointment_services
--     7. v_barber_breaks_active security_invoker fix
--
-- Error-code contract:
--   errcode  | message (switch key)        | raised in
--   ---------+-----------------------------+----------------------------------
--   42501    | not_authenticated           | RPCs 1, 2
--   22023    | invalid_window              | RPC 1
--   22023    | invalid_barber              | RPC 2
--   22023    | invalid_services            | RPC 2
--   22023    | service_not_assigned        | RPC 2
--   22023    | past_slot                   | RPC 2
--   22023    | notes_too_long              | RPC 2
--   22023    | outside_working_hours       | RPC 2
--   22023    | cannot_edit_cancelled       | RPC 5 (update_appointment_with_services)
--   23P01    | slot_taken                  | RPC 2, trigger 3
--   23P01    | barber_break                | RPC 2
--   23P01    | appointment overlaps...     | trigger 3
--   42501    | clients may only cancel...  | trigger 6 (guard)
--   22023    | cannot_cancel_finished      | trigger 6 (guard)
--
-- Depends on:
--   - 004  (appointments, barbers, barber_services)
--   - 006  (barber_availability)
--   - 011  (salon_hours, barber_service_assignments, barbers.salon_id)
--   - 047  (appointment_services junction)
--   - 076  (barber_service_assignments — PK (barber_id, service_id), no active col)
--   - 081  (is_salon_member, tg_set_updated_at)
--   - 087  (appointment_reminders trigger — fires on status='confirmed')
--   - 115  (appointments.salon_client_id, create_appointment_with_client)
--   - 118  (barber_breaks + btree_gist already enabled)
--   - 119  (barber_breaks RPCs)
--   - 120  (break-collision trigger)
--   - 121  (barber_breaks view)
--   - 124  (update_appointment_with_services)
--   - 126  (tg_appointments_autolink_salon_client)
--
-- Salon app / web app MUST handle:
--   - 23P01 errcode 'slot_taken' on new INSERT (previously not returned by
--     create_appointment_with_client from mig 115, now enforced by trigger 3).
--   - 22023 errcode 'cannot_edit_cancelled' on update_appointment_with_services
--     (was a silent no-op / status resurrection before this migration).
--
-- NOTE (trigger 3): The overlap trigger validates NEW writes only. Any
--   pre-existing overlapping rows that existed before this migration are
--   tolerated and will not cause the trigger to fire retroactively.
--
-- NOTE (trigger functions + RLS): trigger functions run with the CALLER's
--   privileges unless SECURITY DEFINER. A customer's direct INSERT can only
--   see their own appointments under RLS, which would make an invoker overlap
--   check blind to other customers' rows. Both collision triggers (the new
--   overlap trigger and the mig-120 break trigger, re-created here) are
--   therefore SECURITY DEFINER.
--
-- Applied manually in Supabase SQL Editor (PG 15+).
-- ============================================================================

BEGIN;

-- ============================================================================
-- INTERNAL HELPER: _barber_break_occurrences
-- Expands barber_breaks for a barber over a time window, returning
-- (busy_start, busy_end) pairs for every active occurrence.
-- SECURITY DEFINER — NOT granted to anon or authenticated (internal only).
-- ============================================================================
CREATE OR REPLACE FUNCTION public._barber_break_occurrences(
  p_barber_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
) RETURNS TABLE(busy_start timestamptz, busy_end timestamptz)
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
    SELECT bb.start_at, bb.end_at
      FROM public.barber_breaks bb
     WHERE bb.barber_id         = p_barber_id
       AND bb.recurrence_rule   = 'NONE'
       AND bb.is_exception_skip = false
       AND tstzrange(bb.start_at, bb.end_at, '[)') && tstzrange(p_from, p_to, '[)')
  LOOP
    busy_start := v_break.start_at;
    busy_end   := v_break.end_at;
    RETURN NEXT;
  END LOOP;

  -- ─── Recurring breaks: expand each master row over the window ──────────────
  FOR v_break IN
    SELECT bb.id,
           bb.start_at,
           bb.end_at,
           bb.recurrence_rule,
           bb.recurrence_until
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
-- 1. RPC: get_barber_busy_intervals
--    Returns the union of confirmed appointment slots + break occurrences for
--    a barber over a caller-supplied window.  Times only — no PII columns.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_barber_busy_intervals(
  p_barber_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
) RETURNS TABLE(busy_start timestamptz, busy_end timestamptz)
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

  -- ─── Appointment slots ─────────────────────────────────────────────────────
  RETURN QUERY
    SELECT a.scheduled_at                                               AS busy_start,
           a.scheduled_at + (a.duration_min || ' minutes')::interval   AS busy_end
      FROM public.appointments a
     WHERE a.barber_id = p_barber_id
       AND a.status NOT IN ('cancelled', 'no_show')
       AND tstzrange(
             a.scheduled_at,
             a.scheduled_at + (a.duration_min || ' minutes')::interval,
             '[)'
           ) && tstzrange(p_from, p_to, '[)');

  -- ─── Break occurrences (non-recurring + recurring expanded) ────────────────
  RETURN QUERY
    SELECT occ.busy_start, occ.busy_end
      FROM public._barber_break_occurrences(p_barber_id, p_from, p_to) occ;

END;
$$;

REVOKE ALL ON FUNCTION public.get_barber_busy_intervals(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_barber_busy_intervals(uuid, timestamptz, timestamptz)
  TO authenticated;


-- ============================================================================
-- 2. RPC: book_appointment
--    Single atomic consumer-booking entrypoint. Performs all validation,
--    working-hours checks, overlap checks, and advisory locking before writing.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_barber_id    uuid,
  p_service_ids  uuid[],
  p_scheduled_at timestamptz,
  p_notes        text DEFAULT NULL
) RETURNS TABLE(
  id           uuid,
  scheduled_at timestamptz,
  duration_min int,
  total_cents  int,
  currency     text,
  status       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user           uuid;
  v_salon_id       uuid;
  v_barber_active  boolean;
  v_service_ids    uuid[];       -- deduped
  v_svc            RECORD;
  v_duration       int  := 0;
  v_total          int  := 0;
  v_currency       text;
  v_new_end        timestamptz;
  -- Wall-clock local time: AT TIME ZONE on a timestamptz yields a plain
  -- timestamp; keeping it typed as such avoids a session-tz round-trip cast.
  v_local          timestamp;
  v_dow            int;
  v_open_min       int;
  v_close_min      int;
  v_start_min      int;
  v_end_min        int;
  v_appt_id        uuid;
  v_notes_clean    text;
  v_svc_count      int;
  v_has_assignments boolean;
  i                int;
BEGIN

  -- ─── a. Auth gate ──────────────────────────────────────────────────────────
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '42501';
  END IF;

  -- ─── b. Load barber ────────────────────────────────────────────────────────
  SELECT b.salon_id, b.active
    INTO v_salon_id, v_barber_active
    FROM public.barbers b
   WHERE b.id = p_barber_id;

  IF v_salon_id IS NULL OR NOT v_barber_active THEN
    RAISE EXCEPTION 'invalid_barber' USING errcode = '22023';
  END IF;

  -- ─── c. Dedupe service IDs (preserve first occurrence order) ───────────────
  SELECT array_agg(sid ORDER BY pos)
    INTO v_service_ids
    FROM (
      SELECT sid, min(pos) AS pos
        FROM unnest(p_service_ids) WITH ORDINALITY AS t(sid, pos)
       GROUP BY sid
    ) sub;

  IF v_service_ids IS NULL OR array_length(v_service_ids, 1) = 0 THEN
    RAISE EXCEPTION 'invalid_services' USING errcode = '22023';
  END IF;

  -- Validate all services: must exist, active, and belong to v_salon_id.
  SELECT count(*)
    INTO v_svc_count
    FROM public.barber_services bs
   WHERE bs.id = ANY(v_service_ids)
     AND bs.active = true
     AND bs.salon_id = v_salon_id;

  IF v_svc_count <> array_length(v_service_ids, 1) THEN
    RAISE EXCEPTION 'invalid_services' USING errcode = '22023';
  END IF;

  -- Check barber_service_assignments (mig 076/011).
  -- The table has PK (barber_id, service_id) and no active column.
  -- If ANY rows exist for this barber, every requested service must be assigned.
  SELECT EXISTS (
    SELECT 1
      FROM public.barber_service_assignments bsa
     WHERE bsa.barber_id = p_barber_id
  ) INTO v_has_assignments;

  IF v_has_assignments THEN
    SELECT count(*)
      INTO v_svc_count
      FROM public.barber_service_assignments bsa
     WHERE bsa.barber_id  = p_barber_id
       AND bsa.service_id = ANY(v_service_ids);

    IF v_svc_count <> array_length(v_service_ids, 1) THEN
      RAISE EXCEPTION 'service_not_assigned' USING errcode = '22023';
    END IF;
  END IF;

  -- ─── d. Aggregate duration, total, currency ────────────────────────────────
  FOR v_svc IN
    SELECT bs.id, bs.duration_min, bs.price_cents, bs.currency
      FROM public.barber_services bs
     WHERE bs.id = ANY(v_service_ids)
     ORDER BY array_position(v_service_ids, bs.id)
  LOOP
    v_duration := v_duration + v_svc.duration_min;
    v_total    := v_total    + v_svc.price_cents;
    IF v_currency IS NULL THEN
      v_currency := v_svc.currency;
    END IF;
  END LOOP;

  v_new_end := p_scheduled_at + (v_duration || ' minutes')::interval;

  -- ─── e. Basic slot validation ──────────────────────────────────────────────
  IF p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'past_slot' USING errcode = '22023';
  END IF;

  v_notes_clean := btrim(COALESCE(p_notes, ''));
  IF char_length(v_notes_clean) > 500 THEN
    RAISE EXCEPTION 'notes_too_long' USING errcode = '22023';
  END IF;
  IF v_notes_clean = '' THEN
    v_notes_clean := NULL;
  END IF;

  -- ─── f. Working-hours check (Europe/Bucharest) ─────────────────────────────
  v_local := p_scheduled_at AT TIME ZONE 'Europe/Bucharest';
  v_dow   := EXTRACT(DOW FROM v_local)::int;

  -- Start/end minutes-of-day for the new appointment.
  v_start_min := EXTRACT(HOUR FROM v_local)::int * 60
               + EXTRACT(MINUTE FROM v_local)::int;
  v_end_min   := v_start_min + v_duration;

  -- Prefer barber_availability when ANY row exists for this barber.
  IF EXISTS (
    SELECT 1
      FROM public.barber_availability ba
     WHERE ba.barber_id = p_barber_id
  ) THEN
    -- Barber schedule governs; missing or is_available=false = off.
    SELECT (EXTRACT(HOUR FROM ba.start_time)::int * 60 + EXTRACT(MINUTE FROM ba.start_time)::int),
           (EXTRACT(HOUR FROM ba.end_time)::int   * 60 + EXTRACT(MINUTE FROM ba.end_time)::int)
      INTO v_open_min, v_close_min
      FROM public.barber_availability ba
     WHERE ba.barber_id   = p_barber_id
       AND ba.day_of_week = v_dow
       AND ba.is_available = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'outside_working_hours' USING errcode = '22023';
    END IF;
  ELSE
    -- Fall back to salon_hours.
    SELECT (EXTRACT(HOUR FROM sh.open_time)::int  * 60 + EXTRACT(MINUTE FROM sh.open_time)::int),
           (EXTRACT(HOUR FROM sh.close_time)::int * 60 + EXTRACT(MINUTE FROM sh.close_time)::int)
      INTO v_open_min, v_close_min
      FROM public.salon_hours sh
     WHERE sh.salon_id   = v_salon_id
       AND sh.day_of_week = v_dow
       AND sh.is_open     = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'outside_working_hours' USING errcode = '22023';
    END IF;
  END IF;

  IF v_start_min < v_open_min OR v_end_min > v_close_min THEN
    RAISE EXCEPTION 'outside_working_hours' USING errcode = '22023';
  END IF;

  -- ─── g. Advisory lock — serializes concurrent bookings for this barber ─────
  PERFORM pg_advisory_xact_lock(
    hashtextextended('booking:' || p_barber_id::text, 0)
  );

  -- ─── h. Overlap check vs existing appointments ────────────────────────────
  IF EXISTS (
    SELECT 1
      FROM public.appointments a
     WHERE a.barber_id = p_barber_id
       AND a.status NOT IN ('cancelled', 'no_show')
       AND tstzrange(
             a.scheduled_at,
             a.scheduled_at + (a.duration_min || ' minutes')::interval,
             '[)'
           ) && tstzrange(p_scheduled_at, v_new_end, '[)')
  ) THEN
    RAISE EXCEPTION 'slot_taken' USING errcode = '23P01';
  END IF;

  -- Overlap check vs barber breaks (non-recurring + recurring expanded).
  IF EXISTS (
    SELECT 1
      FROM public._barber_break_occurrences(p_barber_id, p_scheduled_at, v_new_end) occ
  ) THEN
    RAISE EXCEPTION 'barber_break' USING errcode = '23P01';
  END IF;

  -- ─── i. Insert appointment + junction rows ─────────────────────────────────
  INSERT INTO public.appointments (
    user_id,
    barber_id,
    service_id,
    scheduled_at,
    duration_min,
    status,
    notes,
    total_cents,
    currency
  ) VALUES (
    v_user,
    p_barber_id,
    v_service_ids[1],
    p_scheduled_at,
    v_duration,
    'pending',
    v_notes_clean,
    v_total,
    v_currency
  )
  RETURNING appointments.id INTO v_appt_id;

  FOR i IN 1 .. array_length(v_service_ids, 1) LOOP
    INSERT INTO public.appointment_services (
      appointment_id,
      service_id,
      duration_min,
      price_cents,
      sort_order
    )
    SELECT
      v_appt_id,
      bs.id,
      bs.duration_min,
      bs.price_cents,
      i - 1
    FROM public.barber_services bs
    WHERE bs.id = v_service_ids[i];
  END LOOP;

  -- ─── j. Return new row ─────────────────────────────────────────────────────
  RETURN QUERY
    SELECT a.id, a.scheduled_at, a.duration_min, a.total_cents, a.currency, a.status
      FROM public.appointments a
     WHERE a.id = v_appt_id;

END;
$$;

REVOKE ALL ON FUNCTION public.book_appointment(uuid, uuid[], timestamptz, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.book_appointment(uuid, uuid[], timestamptz, text)
  TO authenticated;


-- ============================================================================
-- 3. Defense-in-depth overlap trigger on appointments
--    Fires BEFORE INSERT OR UPDATE on the appointments table for every writer
--    (including create_appointment_with_client from mig 115 and direct inserts).
--    Uses the same advisory-lock key as book_appointment (reentrant: within the
--    same transaction the lock is already held, so this is a no-op acquire).
-- ============================================================================

-- No expression index here: `scheduled_at + (duration_min||' minutes')::interval`
-- uses timestamptz + interval, which is only STABLE (not IMMUTABLE), so it is
-- not allowed in an index expression. The overlap check below filters by
-- barber_id first and is served by idx_appointments_barber (barber_id,
-- scheduled_at) from migration 004 — per-barber row counts keep this cheap.

-- SECURITY DEFINER is required: an invoker trigger inherits the caller's RLS,
-- and customers can only SELECT their own appointments — the check would be
-- blind to other customers' rows on legacy direct INSERTs.
CREATE OR REPLACE FUNCTION public.tg_appointments_check_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt_range tstzrange;
  v_conflict   uuid;
BEGIN
  -- Skip cancelled / no_show writes — they don't hold time slots.
  IF NEW.status IN ('cancelled', 'no_show') THEN
    RETURN NEW;
  END IF;

  -- Acquire the same advisory lock key used by book_appointment (2g).
  -- Within book_appointment's transaction this is a reentrant no-op.
  -- For external writers (mig 115 RPC, direct inserts) it serializes them.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('booking:' || NEW.barber_id::text, 0)
  );

  v_appt_range := tstzrange(
    NEW.scheduled_at,
    NEW.scheduled_at + (NEW.duration_min || ' minutes')::interval,
    '[)'
  );

  SELECT a.id
    INTO v_conflict
    FROM public.appointments a
   WHERE a.barber_id = NEW.barber_id
     AND a.id       <> NEW.id
     AND a.status NOT IN ('cancelled', 'no_show')
     AND tstzrange(
           a.scheduled_at,
           a.scheduled_at + (a.duration_min || ' minutes')::interval,
           '[)'
         ) && v_appt_range
   LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'appointment overlaps another appointment (id %)', v_conflict
      USING errcode = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_check_overlap ON public.appointments;
CREATE TRIGGER appointments_check_overlap
  BEFORE INSERT OR UPDATE OF scheduled_at, duration_min, barber_id, status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_appointments_check_overlap();


-- ============================================================================
-- 3b. Harden the mig-120 break-collision trigger function with SECURITY
--     DEFINER. The original ran as invoker: customers cannot SELECT
--     barber_breaks at all (RLS is salon-member-only), so the break check
--     silently passed for every consumer-app direct INSERT — the 23P01 it was
--     designed to raise never fired on that path. Body is otherwise identical
--     to migration 120.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_appointments_check_break_collision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Only NON-recurring breaks are enforced here (see migration 120 header for
  -- the trade-off; book_appointment additionally checks recurring breaks).
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


-- ============================================================================
-- 4. Fix the mig-126 autolink trigger race
--    Exact body copy of tg_appointments_autolink_salon_client, with the
--    select-then-insert wrapped in an upsert to eliminate the TOCTOU window.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_appointments_autolink_salon_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salon_id        uuid;
  v_owner_id        uuid;
  v_display_name    text;
  v_avatar_url      text;
  v_first           text;
  v_last            text;
  v_phone           text;
  v_existing_client uuid;
  v_new_client_id   uuid;
BEGIN
  -- Skip if already linked (seed, owner RPC, future explicit linkers).
  IF NEW.salon_client_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the salon via barber. If the chain is broken (orphan barber),
  -- bail silently — we don't want to block the insert.
  SELECT s.id, s.owner_id
    INTO v_salon_id, v_owner_id
    FROM public.barbers b
    JOIN public.salons  s ON s.id = b.salon_id
   WHERE b.id = NEW.barber_id;

  IF v_salon_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip owner-as-booker bookings — those are legacy "owner books for a
  -- walk-in client" rows that should set salon_client_id explicitly via the
  -- RPC. Auto-linking the owner to themselves would pollute the CRM.
  IF NEW.user_id = v_owner_id THEN
    RETURN NEW;
  END IF;

  -- Pull the booker's profile data. The customer app's `profiles` shape is
  -- (display_name, avatar_url, username, ...). We only consume display_name
  -- + avatar_url since those are the fields shared across both apps.
  SELECT p.display_name, p.avatar_url
    INTO v_display_name, v_avatar_url
    FROM public.profiles p
   WHERE p.id = NEW.user_id;

  -- Skip if no profile (defensive — FK guarantees existence, but RLS could
  -- mask the row in some setups).
  IF v_display_name IS NULL AND v_avatar_url IS NULL THEN
    RETURN NEW;
  END IF;

  -- Split the display name into first / last using the helper.
  SELECT s.first_name, s.last_name
    INTO v_first, v_last
    FROM public.split_display_name(v_display_name) s;

  -- Race-safe upsert: use the partial unique index
  -- uq_salon_clients_salon_profile (salon_id, linked_profile_id) WHERE
  -- linked_profile_id IS NOT NULL — created in mig 126.
  -- The ON CONFLICT clause mirrors the partial index predicate inline so
  -- Postgres can resolve the conflict target unambiguously.
  INSERT INTO public.salon_clients (
    salon_id, phone_e164, first_name, last_name, source, linked_profile_id
  ) VALUES (
    v_salon_id, NULL, v_first, v_last, 'app_user', NEW.user_id
  )
  ON CONFLICT (salon_id, linked_profile_id) WHERE linked_profile_id IS NOT NULL
  DO UPDATE
    SET first_name = COALESCE(salon_clients.first_name, EXCLUDED.first_name),
        last_name  = COALESCE(salon_clients.last_name,  EXCLUDED.last_name),
        updated_at = now()
  RETURNING id INTO v_new_client_id;

  -- Back-fill the appointment row. We use a direct UPDATE rather than
  -- mutating NEW because this is an AFTER trigger.
  UPDATE public.appointments
     SET salon_client_id = v_new_client_id
   WHERE id = NEW.id;

  -- Touch the CRM row's appointment counters (mirrors what the existing
  -- `appointments_touch_salon_client` trigger from mig 115 does, but for
  -- this row that bypassed it via NULL salon_client_id).
  UPDATE public.salon_clients
     SET last_appointment_at = GREATEST(
           COALESCE(last_appointment_at, NEW.scheduled_at),
           NEW.scheduled_at
         ),
         appointment_count = appointment_count + 1,
         updated_at = now()
   WHERE id = v_new_client_id;

  RETURN NEW;
END;
$$;

-- Re-wire the trigger (DROP + CREATE to pick up the new function body).
DROP TRIGGER IF EXISTS appointments_autolink_salon_client ON public.appointments;
CREATE TRIGGER appointments_autolink_salon_client
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_appointments_autolink_salon_client();


-- ============================================================================
-- 5. Guard update_appointment_with_services against resurrecting cancelled rows
--    Exact signature + body from mig 124, with one guard added after step 2.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_appointment_with_services(
  p_appointment_id     uuid,
  p_salon_id           uuid,
  p_barber_id          uuid,
  p_service_ids        uuid[],
  p_service_durations  int[],
  p_service_prices     int[],
  p_scheduled_at       timestamptz,
  p_duration_min       int,
  p_total_cents        int,
  p_currency           text,
  p_existing_client_id uuid,
  p_client_first       text,
  p_client_last        text,
  p_client_phone       text,
  p_notes              text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt        public.appointments%ROWTYPE;
  v_client_id   uuid;
  v_overlap     boolean;
  v_new_end     timestamptz;
  i             int;
BEGIN
  -- 1. RLS gate
  IF NOT public.is_salon_member(p_salon_id) THEN
    RAISE EXCEPTION 'forbidden: not a salon member' USING errcode = '42501';
  END IF;

  -- 2. Locate appointment and verify it belongs to a barber of this salon.
  SELECT a.* INTO v_appt
    FROM public.appointments a
    JOIN public.barbers b ON b.id = a.barber_id
   WHERE a.id = p_appointment_id
     AND b.salon_id = p_salon_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment not found in this salon'
      USING errcode = '23503';
  END IF;

  -- 2b. Guard against resurrecting cancelled / no_show appointments.
  IF v_appt.status IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'cannot_edit_cancelled' USING errcode = '22023';
  END IF;

  -- 3. Validate the target barber exists in the same salon.
  IF NOT EXISTS (
    SELECT 1 FROM public.barbers
     WHERE id = p_barber_id AND salon_id = p_salon_id
  ) THEN
    RAISE EXCEPTION 'target barber does not belong to this salon'
      USING errcode = '23503';
  END IF;

  -- 4. Service arrays must match in length.
  IF array_length(p_service_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'at least one service is required'
      USING errcode = '22023';
  END IF;
  IF array_length(p_service_ids, 1) <> array_length(p_service_durations, 1)
     OR array_length(p_service_ids, 1) <> array_length(p_service_prices, 1) THEN
    RAISE EXCEPTION 'service arrays must have the same length'
      USING errcode = '22023';
  END IF;

  -- 5. Phone format if provided.
  IF p_client_phone IS NOT NULL AND p_client_phone !~ '^\+40[0-9]{9}$' THEN
    RAISE EXCEPTION 'invalid phone format (expected +40XXXXXXXXX)'
      USING errcode = '22023';
  END IF;

  -- 6. Collision check on the target barber for the new time window.
  --    Exclude the appointment being edited and cancelled/no_show rows.
  v_new_end := p_scheduled_at + (p_duration_min || ' minutes')::interval;
  SELECT EXISTS (
    SELECT 1
      FROM public.appointments a
     WHERE a.barber_id = p_barber_id
       AND a.id <> p_appointment_id
       AND a.status NOT IN ('cancelled', 'no_show')
       AND tstzrange(a.scheduled_at,
                     a.scheduled_at + (a.duration_min || ' minutes')::interval,
                     '[)')
           && tstzrange(p_scheduled_at, v_new_end, '[)')
  ) INTO v_overlap;
  IF v_overlap THEN
    RAISE EXCEPTION 'overlap with another appointment'
      USING errcode = '23P01';
  END IF;

  -- 7. Resolve / create the salon_client.
  IF p_existing_client_id IS NOT NULL THEN
    SELECT id INTO v_client_id
      FROM public.salon_clients
     WHERE id = p_existing_client_id
       AND salon_id = p_salon_id;
    IF v_client_id IS NULL THEN
      RAISE EXCEPTION 'client not found in this salon' USING errcode = '23503';
    END IF;
  ELSIF p_client_phone IS NOT NULL THEN
    INSERT INTO public.salon_clients (
      salon_id, phone_e164, first_name, last_name, source,
      sms_marketing_consent, sms_consent_source, sms_consent_at
    ) VALUES (
      p_salon_id, p_client_phone, p_client_first, p_client_last, 'appointment',
      true, 'booking_form', now()
    )
    ON CONFLICT (salon_id, phone_e164) DO UPDATE
      SET first_name = COALESCE(salon_clients.first_name, EXCLUDED.first_name),
          last_name  = COALESCE(salon_clients.last_name,  EXCLUDED.last_name),
          updated_at = now()
    RETURNING id INTO v_client_id;
  ELSIF p_client_first IS NOT NULL THEN
    -- Phone-less walk-in — fresh row.
    INSERT INTO public.salon_clients (
      salon_id, phone_e164, first_name, last_name, source
    ) VALUES (
      p_salon_id, NULL, p_client_first, p_client_last, 'appointment'
    )
    RETURNING id INTO v_client_id;
  ELSE
    -- Caller didn't change the client — keep existing link.
    v_client_id := v_appt.salon_client_id;
  END IF;

  -- 8. Update the appointments row. Status flips back to 'confirmed' so
  --    a previously-cancelled appointment doesn't resurrect with stale state
  --    — caller MUST not pass cancelled appointments to this RPC.
  UPDATE public.appointments
     SET barber_id        = p_barber_id,
         service_id       = p_service_ids[1],   -- primary service
         scheduled_at     = p_scheduled_at,
         duration_min     = p_duration_min,
         total_cents      = p_total_cents,
         currency         = COALESCE(p_currency, 'RON'),
         notes            = p_notes,
         salon_client_id  = v_client_id,
         status           = 'confirmed',
         updated_at       = now()
   WHERE id = p_appointment_id;

  -- 9. Replace the appointment_services junction rows.
  DELETE FROM public.appointment_services
   WHERE appointment_id = p_appointment_id;

  FOR i IN 1 .. array_length(p_service_ids, 1) LOOP
    INSERT INTO public.appointment_services (
      appointment_id, service_id, duration_min, price_cents, sort_order
    ) VALUES (
      p_appointment_id, p_service_ids[i], p_service_durations[i], p_service_prices[i], i - 1
    );
  END LOOP;

  RETURN p_appointment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_appointment_with_services(
  uuid, uuid, uuid, uuid[], int[], int[],
  timestamptz, int, int, text,
  uuid, text, text, text, text
) TO authenticated;


-- ============================================================================
-- 6. RLS hardening
-- ============================================================================

-- ─── 6a. appointments UPDATE policies: add WITH CHECK to prevent user_id
--         reassignment. Mirror USING expressions in WITH CHECK. ───────────────

DROP POLICY IF EXISTS "Users can update own appointments" ON public.appointments;
CREATE POLICY "Users can update own appointments"
  ON public.appointments
  FOR UPDATE
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Salon members can update salon appointments" ON public.appointments;
CREATE POLICY "Salon members can update salon appointments"
  ON public.appointments
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.salon_members sm
      JOIN public.barbers b ON b.salon_id = sm.salon_id
      WHERE sm.profile_id = auth.uid()
        AND b.id = barber_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.salon_members sm
      JOIN public.barbers b ON b.salon_id = sm.salon_id
      WHERE sm.profile_id = auth.uid()
        AND b.id = barber_id
    )
  );

-- ─── 6b. appointment_services SELECT: replace open USING (true) with ─────────
--         owner-or-salon-member check (matches INSERT policy from mig 047). ───

DROP POLICY IF EXISTS "Appointment services are viewable" ON public.appointment_services;
CREATE POLICY "Appointment services are viewable"
  ON public.appointment_services
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
       WHERE a.id = appointment_id
         AND (
           a.user_id = auth.uid()
           OR EXISTS (
             SELECT 1
               FROM public.barbers b
               JOIN public.salon_members sm ON sm.salon_id = b.salon_id
              WHERE b.id = a.barber_id
                AND sm.profile_id = auth.uid()
           )
         )
    )
  );

-- ─── 6c. Customer update-guard trigger ────────────────────────────────────────
--    Applies only when: a JWT is present AND the caller is the appointment
--    owner AND the caller is NOT a salon member for this barber's salon.
--    Allowed: status transition pending/confirmed → 'cancelled', notes change.
--    Everything else (barber, service, time, amounts) is blocked.
--    When auth.uid() IS NULL (service role / SECURITY DEFINER contexts without
--    a JWT), the trigger passes through untouched. ─────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_appointments_guard_client_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := auth.uid();

  -- Service-role / definer contexts carry no JWT — pass through.
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only constrain the owner when they are NOT a salon staff member.
  IF v_caller <> OLD.user_id THEN
    RETURN NEW;  -- Not the appointment owner; other RLS policies govern.
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.salon_members sm
      JOIN public.barbers b ON b.salon_id = sm.salon_id
     WHERE sm.profile_id = v_caller
       AND b.id = OLD.barber_id
  ) THEN
    RETURN NEW;  -- Caller is also a salon staff member — full access.
  END IF;

  -- The caller is a pure customer. Validate what they are allowed to change.

  -- Enforce column immutability (only status and notes may change).
  IF NEW.user_id       IS DISTINCT FROM OLD.user_id       OR
     NEW.barber_id     IS DISTINCT FROM OLD.barber_id     OR
     NEW.service_id    IS DISTINCT FROM OLD.service_id    OR
     NEW.scheduled_at  IS DISTINCT FROM OLD.scheduled_at  OR
     NEW.duration_min  IS DISTINCT FROM OLD.duration_min  OR
     NEW.total_cents   IS DISTINCT FROM OLD.total_cents   OR
     NEW.currency      IS DISTINCT FROM OLD.currency
  THEN
    RAISE EXCEPTION 'clients may only cancel or edit notes' USING errcode = '42501';
  END IF;

  -- If status is changing, it must be a cancellation from an active state.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'clients may only cancel or edit notes' USING errcode = '42501';
    END IF;
    -- Can only cancel from pending or confirmed.
    IF OLD.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'cannot_cancel_finished' USING errcode = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_guard_client_updates ON public.appointments;
CREATE TRIGGER appointments_guard_client_updates
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_appointments_guard_client_updates();


-- ============================================================================
-- 7. v_barber_breaks_active: enable security_invoker so the view evaluates
--    barber_breaks RLS under the caller's identity rather than the definer's.
--    Consumer app confirmed to have zero reads of this view (grep returned
--    no hits in app/, components/, hooks/, lib/, stores/, providers/).
--    The salon app reads it as authenticated salon members who pass RLS.
-- ============================================================================
ALTER VIEW public.v_barber_breaks_active SET (security_invoker = on);


COMMIT;
