-- ============================================================================
-- Migration 156: book_appointment — per-service extended price + dependents
-- ============================================================================
--
-- Extends the consumer booking RPC (migration 149) with two features that the
-- web app (tazpi-website) already implements on its own booking path, so mobile
-- and web charge the same amount and support the same "book for a child" flow on
-- the shared Supabase project:
--
--   1. Per-service extended-hours price (barber_services.price_cents_extended,
--      migration 154). When a slot starts in the extended window AND a service
--      has a non-null price_cents_extended (> 0), that exact amount is what the
--      service costs: it REPLACES the base price AND the day-level surcharge for
--      that service. Services without one keep the base -> surcharge flow.
--      Mirrors lib/extended-hours.finalBookingTotalCents (per-service rounding).
--
--   2. "Book for a dependent" (salon_clients.managed_by_profile_id, migration
--      155). p_booking_for = 'self' (default) | 'dependent' | 'new_child'.
--        - dependent : book onto an existing dependent the caller manages
--                      (p_dependent_client_id); ownership validated here.
--        - new_child : create the child's salon_clients row and book onto it.
--      Either way the appointment is re-pointed onto the child AFTER the
--      auto-link trigger (migration 126) created/linked the PARENT's own CRM row
--      from their profile, so the parent's identity stays intact and only the
--      appointment moves onto the child. Contact stays the parent's.
--
-- The signature grows by three optional params, so we DROP the old 4-arg
-- function first, then CREATE the 7-arg one (existing 4-arg calls still resolve
-- via the defaults). This RPC stays the authoritative price + eligibility check;
-- the client preview is display-only. Everything else is unchanged from 149.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.book_appointment(uuid, uuid[], timestamptz, text);

CREATE OR REPLACE FUNCTION public.book_appointment(
  p_barber_id           uuid,
  p_service_ids         uuid[],
  p_scheduled_at        timestamptz,
  p_notes               text DEFAULT NULL,
  p_booking_for         text DEFAULT 'self',
  p_dependent_client_id uuid DEFAULT NULL,
  p_child_name          text DEFAULT NULL
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
  -- Extended per-service charged prices (aligned with v_service_ids order),
  -- reused for the appointment_services snapshot so total == sum(price_cents).
  v_charged        int[];
  v_price          int;
  v_fixed_applied  boolean := false;
  -- Dependent ("book for a child") state.
  v_child_client_id uuid := NULL;
  v_child_name      text;
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

  -- ─── b2. Dependent target (book "for a child") ─────────────────────────────
  -- Validate an existing dependent's ownership up-front (fail before we secure a
  -- slot). Ownership is enforced here: the row must belong to THIS salon and be
  -- managed by the caller. A new_child row is created after the appointment
  -- insert. p_booking_for defaults to 'self' → nothing to do.
  IF p_booking_for = 'dependent' THEN
    IF p_dependent_client_id IS NULL THEN
      RAISE EXCEPTION 'dependent_not_owned' USING errcode = '42501';
    END IF;
    SELECT sc.id
      INTO v_child_client_id
      FROM public.salon_clients sc
     WHERE sc.id = p_dependent_client_id
       AND sc.salon_id = v_salon_id
       AND sc.managed_by_profile_id = v_user;
    IF v_child_client_id IS NULL THEN
      RAISE EXCEPTION 'dependent_not_owned' USING errcode = '42501';
    END IF;
  ELSIF p_booking_for = 'new_child' THEN
    v_child_name := btrim(COALESCE(p_child_name, ''));
    IF v_child_name = '' THEN
      RAISE EXCEPTION 'child_name_required' USING errcode = '22023';
    END IF;
    v_child_name := left(v_child_name, 80);
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

  -- ─── f2. Extended-window pricing + service subset ──────────────────────────
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

    -- Recompute the total + per-service charged prices. A service with an
    -- explicit price_cents_extended (> 0) is charged that amount verbatim (it
    -- replaces base + surcharge); every other service is surcharged — percent
    -- rounded PER SERVICE, fixed added ONCE to the first surcharged service
    -- (dropped entirely if every service used an explicit extended price). The
    -- v_charged[] array is aligned with v_service_ids order and reused by the
    -- junction insert so total_cents == sum(appointment_services.price_cents).
    v_total := 0;
    v_charged := ARRAY[]::int[];
    v_fixed_applied := false;
    FOR v_svc IN
      SELECT bs.id, bs.price_cents, bs.price_cents_extended
        FROM public.barber_services bs
       WHERE bs.id = ANY(v_service_ids)
       ORDER BY array_position(v_service_ids, bs.id)
    LOOP
      IF v_svc.price_cents_extended IS NOT NULL AND v_svc.price_cents_extended > 0 THEN
        v_price := v_svc.price_cents_extended;
      ELSIF v_surcharge_type = 'fixed' THEN
        v_price := v_svc.price_cents
                 + (CASE WHEN v_fixed_applied THEN 0 ELSE COALESCE(v_surcharge_fixed, 0) END);
        v_fixed_applied := true;
      ELSE
        v_price := round(v_svc.price_cents * (1 + v_surcharge_pct / 100.0))::int;
      END IF;
      v_charged := array_append(v_charged, v_price);
      v_total   := v_total + v_price;
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
      -- Snapshot the extended-window charged price (base otherwise). v_charged
      -- is aligned with v_service_ids order, so v_charged[i] matches v_service_ids[i].
      CASE WHEN v_extended THEN v_charged[i] ELSE bs.price_cents END,
      i - 1
    FROM public.barber_services bs
    WHERE bs.id = v_service_ids[i];
  END LOOP;

  -- ─── i2. Dependent re-point ────────────────────────────────────────────────
  -- The auto-link AFTER INSERT trigger (migration 126) just created/linked the
  -- PARENT's own CRM row and set appointments.salon_client_id to it. For a "book
  -- for a child" booking, create the child row now (new_child) and move ONLY
  -- this appointment onto it, leaving the parent's CRM identity intact. Mirrors
  -- the web bookings route; SECURITY DEFINER, so these writes bypass RLS.
  IF p_booking_for = 'new_child' THEN
    INSERT INTO public.salon_clients (
      salon_id, phone_e164, email, first_name, last_name,
      linked_profile_id, managed_by_profile_id, source
    ) VALUES (
      v_salon_id, NULL, NULL, v_child_name, NULL,
      NULL, v_user, 'client_dependent'
    )
    -- Table-qualify: a bare `id` is ambiguous with this function's RETURNS TABLE
    -- OUT column of the same name (42702).
    RETURNING salon_clients.id INTO v_child_client_id;
  END IF;

  IF v_child_client_id IS NOT NULL THEN
    UPDATE public.appointments AS a
       SET salon_client_id = v_child_client_id
     WHERE a.id = v_appt_id;
  END IF;

  -- ─── j. Return new row ─────────────────────────────────────────────────────
  RETURN QUERY
    SELECT a.id, a.scheduled_at, a.duration_min, a.total_cents, a.currency, a.status
      FROM public.appointments a
     WHERE a.id = v_appt_id;

END;
$$;

REVOKE ALL ON FUNCTION public.book_appointment(uuid, uuid[], timestamptz, text, text, uuid, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.book_appointment(uuid, uuid[], timestamptz, text, text, uuid, text)
  TO authenticated;

COMMIT;
