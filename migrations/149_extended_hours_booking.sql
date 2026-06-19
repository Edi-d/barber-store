-- ============================================================================
-- Migration 149: Extended hours in book_appointment
-- ============================================================================
--
-- Teaches the consumer booking RPC about the salon "extended hours" feature
-- (tables salon_extended_hours + salon_extended_services, created by the salon
-- business app). On a weekday with an enabled extension whose extended_close_time
-- is later than salon_hours.close_time:
--
--   * the bookable window is widened to extended_close_time, so after-close
--     slots can be booked;
--   * a booking whose START is at/after the NORMAL close_time is "extended" and
--     carries a surcharge — percent (scales each service price) or fixed (a flat
--     amount added once). The per-service snapshot stays consistent with
--     total_cents (total == sum of appointment_services.price_cents);
--   * only services listed in salon_extended_services for that weekday are
--     bookable in the extended window (no rows for the day == all services).
--
-- Scope: extension applies ONLY on the salon_hours fallback path. A barber with
-- explicit barber_availability rows owns their own schedule (mirrors
-- lib/booking.ts resolveSchedule), so the surcharge boundary on the client and
-- in this RPC stay in lockstep.
--
-- This is the authoritative price + eligibility check — the client preview in
-- lib/extended-hours.ts is display-only. Everything else about book_appointment
-- is unchanged from migration 144.
-- ============================================================================

BEGIN;

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
  -- Extended-hours state.
  v_normal_close   int;          -- pre-extension close (surcharge boundary)
  v_has_ext        boolean := false;
  v_extended       boolean := false;
  v_surcharge_type text;
  v_surcharge_pct  int;
  v_surcharge_fixed int;
  v_ext            RECORD;
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

  SELECT count(*)
    INTO v_svc_count
    FROM public.barber_services bs
   WHERE bs.id = ANY(v_service_ids)
     AND bs.active = true
     AND bs.salon_id = v_salon_id;

  IF v_svc_count <> array_length(v_service_ids, 1) THEN
    RAISE EXCEPTION 'invalid_services' USING errcode = '22023';
  END IF;

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

  v_start_min := EXTRACT(HOUR FROM v_local)::int * 60
               + EXTRACT(MINUTE FROM v_local)::int;
  v_end_min   := v_start_min + v_duration;

  IF EXISTS (
    SELECT 1
      FROM public.barber_availability ba
     WHERE ba.barber_id = p_barber_id
  ) THEN
    -- Barber schedule governs; no extension on this path.
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

    -- Extended hours: widen the allowed window when this weekday is extended.
    v_normal_close := v_close_min;
    SELECT eh.enabled,
           (EXTRACT(HOUR FROM eh.extended_close_time)::int * 60
              + EXTRACT(MINUTE FROM eh.extended_close_time)::int) AS ext_close_min,
           eh.surcharge_type, eh.surcharge_percent, eh.surcharge_value_cents
      INTO v_ext
      FROM public.salon_extended_hours eh
     WHERE eh.salon_id    = v_salon_id
       AND eh.day_of_week = v_dow
       AND eh.enabled     = true;

    IF FOUND AND v_ext.ext_close_min > v_close_min THEN
      v_close_min       := v_ext.ext_close_min;   -- widen the bookable window
      v_has_ext         := true;
      v_surcharge_type  := v_ext.surcharge_type;
      v_surcharge_pct   := v_ext.surcharge_percent;
      v_surcharge_fixed := v_ext.surcharge_value_cents;
    END IF;
  END IF;

  IF v_start_min < v_open_min OR v_end_min > v_close_min THEN
    RAISE EXCEPTION 'outside_working_hours' USING errcode = '22023';
  END IF;

  -- ─── f2. Extended-window surcharge + service subset ────────────────────────
  -- A booking is "extended" when its start is at/after the normal close.
  v_extended := v_has_ext AND v_start_min >= v_normal_close;

  IF v_extended THEN
    -- Service subset: if ANY links exist for this weekday, every requested
    -- service must be among them. No links == all services allowed.
    IF EXISTS (
      SELECT 1 FROM public.salon_extended_services ses
       WHERE ses.salon_id = v_salon_id AND ses.day_of_week = v_dow
    ) THEN
      SELECT count(*)
        INTO v_svc_count
        FROM public.salon_extended_services ses
       WHERE ses.salon_id   = v_salon_id
         AND ses.day_of_week = v_dow
         AND ses.service_id = ANY(v_service_ids);

      IF v_svc_count <> array_length(v_service_ids, 1) THEN
        -- Reuse the existing client-handled code/message.
        RAISE EXCEPTION 'service_not_assigned' USING errcode = '22023';
      END IF;
    END IF;

    -- Recompute the total with the surcharge, using the SAME per-service formula
    -- as the junction insert below so total_cents == sum(price_cents).
    v_total := 0;
    i := 0;
    FOR v_svc IN
      SELECT bs.id, bs.price_cents
        FROM public.barber_services bs
       WHERE bs.id = ANY(v_service_ids)
       ORDER BY array_position(v_service_ids, bs.id)
    LOOP
      i := i + 1;
      IF v_surcharge_type = 'fixed' THEN
        v_total := v_total + v_svc.price_cents
                 + (CASE WHEN i = 1 THEN v_surcharge_fixed ELSE 0 END);
      ELSE
        v_total := v_total + round(v_svc.price_cents * (1 + v_surcharge_pct / 100.0))::int;
      END IF;
    END LOOP;
  END IF;

  -- ─── g. Advisory lock ──────────────────────────────────────────────────────
  PERFORM pg_advisory_xact_lock(
    hashtextextended('booking:' || p_barber_id::text, 0)
  );

  -- ─── h. Overlap checks ─────────────────────────────────────────────────────
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

  IF EXISTS (
    SELECT 1
      FROM public._barber_break_occurrences(p_barber_id, p_scheduled_at, v_new_end) occ
  ) THEN
    RAISE EXCEPTION 'barber_break' USING errcode = '23P01';
  END IF;

  -- ─── i. Insert appointment + junction rows ─────────────────────────────────
  INSERT INTO public.appointments (
    user_id, barber_id, service_id, scheduled_at, duration_min,
    status, notes, total_cents, currency
  ) VALUES (
    v_user, p_barber_id, v_service_ids[1], p_scheduled_at, v_duration,
    'pending', v_notes_clean, v_total, v_currency
  )
  RETURNING appointments.id INTO v_appt_id;

  FOR i IN 1 .. array_length(v_service_ids, 1) LOOP
    INSERT INTO public.appointment_services (
      appointment_id, service_id, duration_min, price_cents, sort_order
    )
    SELECT
      v_appt_id,
      bs.id,
      bs.duration_min,
      -- Snapshot the surcharged price in the extended window (same formula as
      -- the total recompute above). Base price otherwise.
      CASE
        WHEN v_extended AND v_surcharge_type = 'fixed'
          THEN bs.price_cents + (CASE WHEN i = 1 THEN v_surcharge_fixed ELSE 0 END)
        WHEN v_extended AND v_surcharge_type = 'percent'
          THEN round(bs.price_cents * (1 + v_surcharge_pct / 100.0))::int
        ELSE bs.price_cents
      END,
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

COMMIT;
