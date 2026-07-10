-- ============================================================================
-- Migration 157: book_appointment — group booking (guests)
-- ============================================================================
--
-- Supersedes the RPC created by migration 156 (per-service extended price +
-- dependents). Adds a THIRD orthogonal feature on top of the same function:
--
--   "Book for a group": the caller books for themselves (or a dependent, as
--   introduced in 156) PLUS up to 5 additional guests (a friend, a second
--   child, ...), each guest with their OWN service selection. Guests are
--   scheduled BACK-TO-BACK with the same barber, immediately following the
--   main appointment in input order — guest 1 starts exactly where the main
--   appointment ends, guest 2 starts where guest 1 ends, and so on. The whole
--   chain is validated and booked as ONE all-or-nothing transaction: either
--   every person in the group gets a slot, or nothing is booked.
--
--   p_guests is NULL (default — fully backward compatible with every existing
--   4-arg/7-arg caller) or a JSON array of up to 5 objects:
--     { "name": "Ana", "dependent_client_id": null, "service_ids": [...] }
--   Exactly like the main booking's "book for a child" flow, a guest is
--   identified by an existing dependent (dependent_client_id, ownership
--   re-validated here) OR by a free-text name that becomes a new
--   salon_clients dependent row (source = 'client_dependent'). When both are
--   given, dependent_client_id wins.
--
--   All appointments created together (main + guests) share ONE
--   booking_group_id (a fresh gen_random_uuid(), NULL when there are no
--   guests) so the client/barber UI can visually group them. Pricing,
--   extended-hours eligibility and the fixed-surcharge-once rule are
--   evaluated PER PERSON based on THEIR OWN segment's start time — a guest
--   whose segment happens to land in the extended window is priced as an
--   extended booking even if the main appointment itself is not, and vice
--   versa.
--
-- Everything migration 156 already does for a single booker (extended
-- per-service pricing, "book for a dependent") is preserved byte-for-byte
-- when p_guests is NULL/empty — this is the critical backward-compat
-- surface, since every existing client only ever reads row [0] of the
-- result set. Guests are purely additive: extra rows appended after the
-- main appointment, in input order.
--
-- The signature grows by one optional param, so we DROP the 156 7-arg
-- function first, then CREATE the 8-arg one.
-- ============================================================================

BEGIN;

-- ─── 0. Schema: booking_group_id ────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_group_id uuid;

COMMENT ON COLUMN public.appointments.booking_group_id IS
  'Groups a main appointment with its back-to-back guest appointments created together via book_appointment''s p_guests. NULL when the appointment has no guests.';

DROP FUNCTION IF EXISTS public.book_appointment(uuid, uuid[], timestamptz, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.book_appointment(
  p_barber_id           uuid,
  p_service_ids         uuid[],
  p_scheduled_at        timestamptz,
  p_notes               text DEFAULT NULL,
  p_booking_for         text DEFAULT 'self',
  p_dependent_client_id uuid DEFAULT NULL,
  p_child_name          text DEFAULT NULL,
  p_guests              jsonb DEFAULT NULL
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
  -- Guests ("group booking") state. p_guests is walked twice: once (d2) for
  -- structural validation + back-to-back scheduling, and once more (f3, i3)
  -- for extended-window eligibility and — after the lock — final pricing and
  -- the insert itself. Re-deriving service_ids from p_guests each pass is
  -- cheap (<=5 guests) and deterministic, so it stays in sync by construction
  -- rather than needing an array-of-arrays to carry state between passes.
  v_guest_count        int := 0;
  v_guest              RECORD;
  v_gi                 int;
  v_g_name             text;
  v_g_dep_id           uuid;
  v_g_service_ids      uuid[];
  v_g_svc_count        int;
  v_g_duration         int;
  v_g_total            int;
  v_g_charged          int[];
  v_g_fixed_applied    boolean;
  v_g_target_client_id uuid;
  v_guest_appt_id      uuid;
  -- Parallel arrays, index 1..v_guest_count (guest input order == ordinality).
  v_guest_start        timestamptz[];
  v_guest_end          timestamptz[];
  v_guest_start_min    int[];
  v_guest_duration     int[];
  v_guest_extended     boolean[];
  v_guest_dep_id       uuid[];
  v_guest_name         text[];
  v_guests_duration_sum int := 0;
  v_cursor             timestamptz;   -- running end-of-previous-person pointer
  v_group_end          timestamptz;   -- end of the whole chain (main + guests)
  v_booking_group_id   uuid;
  v_appt_ids           uuid[];        -- main first, then guests, input order
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

  -- ─── b3. Guests: top-level shape check ─────────────────────────────────────
  -- p_guests must be NULL or a JSON array of at most 5 objects. Checked before
  -- jsonb_array_elements/jsonb_array_length are ever called on it, since both
  -- raise an ugly raw error on a non-array (e.g. an object or scalar).
  IF p_guests IS NOT NULL THEN
    IF jsonb_typeof(p_guests) <> 'array' THEN
      RAISE EXCEPTION 'invalid_guests' USING errcode = '22023';
    END IF;
    v_guest_count := jsonb_array_length(p_guests);
    IF v_guest_count > 5 THEN
      RAISE EXCEPTION 'too_many_guests' USING errcode = '22023';
    END IF;
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

  -- ─── d2. Guests: validate + chain back-to-back scheduling ──────────────────
  -- Runs once v_new_end (end of the main appointment) is known, so guest 1 can
  -- start exactly where the main appointment ends and every subsequent guest
  -- starts where the previous one ends. All raises here happen before the
  -- advisory lock (section g) — same fail-fast philosophy as b2/c. Only
  -- structure/ownership/service validity + duration are resolved here; each
  -- guest's extended-window eligibility needs v_has_ext/v_normal_close, which
  -- aren't known until section f, so that part is deferred to f3.
  v_cursor := v_new_end;
  v_guests_duration_sum := 0;

  FOR v_guest IN
    SELECT * FROM jsonb_array_elements(p_guests) WITH ORDINALITY AS t(value, ord)
  LOOP
    v_gi := v_guest.ord::int;

    IF jsonb_typeof(v_guest.value) <> 'object' THEN
      RAISE EXCEPTION 'invalid_guests' USING errcode = '22023';
    END IF;

    BEGIN
      v_g_dep_id := NULLIF(v_guest.value->>'dependent_client_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid_guests' USING errcode = '22023';
    END;

    v_g_name := left(btrim(COALESCE(v_guest.value->>'name', '')), 80);

    IF v_g_dep_id IS NOT NULL THEN
      -- dependent_client_id wins when both name and dependent are given.
      IF NOT EXISTS (
        SELECT 1
          FROM public.salon_clients sc
         WHERE sc.id = v_g_dep_id
           AND sc.salon_id = v_salon_id
           AND sc.managed_by_profile_id = v_user
      ) THEN
        RAISE EXCEPTION 'dependent_not_owned' USING errcode = '42501';
      END IF;
      v_g_name := NULL;
    ELSE
      IF v_g_name = '' THEN
        RAISE EXCEPTION 'guest_name_required' USING errcode = '22023';
      END IF;
    END IF;

    BEGIN
      SELECT array_agg(x::uuid)
        INTO v_g_service_ids
        FROM jsonb_array_elements_text(v_guest.value->'service_ids') AS t(x);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid_guests' USING errcode = '22023';
    END;

    -- Dedupe (preserve first occurrence order) — same technique as section c.
    SELECT array_agg(sid ORDER BY pos)
      INTO v_g_service_ids
      FROM (
        SELECT sid, min(pos) AS pos
          FROM unnest(v_g_service_ids) WITH ORDINALITY AS t(sid, pos)
         GROUP BY sid
      ) sub;

    IF v_g_service_ids IS NULL OR array_length(v_g_service_ids, 1) = 0 THEN
      RAISE EXCEPTION 'invalid_services' USING errcode = '22023';
    END IF;

    SELECT count(*)
      INTO v_g_svc_count
      FROM public.barber_services bs
     WHERE bs.id = ANY(v_g_service_ids)
       AND bs.active = true
       AND bs.salon_id = v_salon_id;

    IF v_g_svc_count <> array_length(v_g_service_ids, 1) THEN
      RAISE EXCEPTION 'invalid_services' USING errcode = '22023';
    END IF;

    IF v_has_assignments THEN
      SELECT count(*)
        INTO v_g_svc_count
        FROM public.barber_service_assignments bsa
       WHERE bsa.barber_id  = p_barber_id
         AND bsa.service_id = ANY(v_g_service_ids);

      IF v_g_svc_count <> array_length(v_g_service_ids, 1) THEN
        RAISE EXCEPTION 'service_not_assigned' USING errcode = '22023';
      END IF;
    END IF;

    SELECT COALESCE(sum(bs.duration_min), 0)
      INTO v_g_duration
      FROM public.barber_services bs
     WHERE bs.id = ANY(v_g_service_ids);

    v_guest_dep_id[v_gi]   := v_g_dep_id;
    v_guest_name[v_gi]     := v_g_name;
    v_guest_duration[v_gi] := v_g_duration;
    v_guest_start[v_gi]    := v_cursor;
    v_guest_end[v_gi]      := v_cursor + (v_g_duration || ' minutes')::interval;

    -- Minute-of-day (Europe/Bucharest) for this guest's segment start, used by
    -- f3 to decide extended-window eligibility per person.
    v_guest_start_min[v_gi] :=
        EXTRACT(HOUR   FROM (v_guest_start[v_gi] AT TIME ZONE 'Europe/Bucharest'))::int * 60
      + EXTRACT(MINUTE FROM (v_guest_start[v_gi] AT TIME ZONE 'Europe/Bucharest'))::int;

    v_cursor := v_guest_end[v_gi];
    v_guests_duration_sum := v_guests_duration_sum + v_g_duration;
  END LOOP;

  v_group_end := v_cursor;   -- == v_new_end when there are no guests

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
  -- Combined duration of the WHOLE group (main + every guest), so the window
  -- check covers everyone, not just the main appointment.
  v_end_min   := v_start_min + v_duration + v_guests_duration_sum;

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

  -- ─── f2. Extended-window pricing + service subset (main appointment) ───────
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

  -- ─── f3. Guests: extended-window flag + service-subset validation ──────────
  -- Per person, not per booking: a guest is "extended" iff v_has_ext AND THEIR
  -- OWN segment start (v_guest_start_min[]) is at/after the normal close — the
  -- main appointment can be non-extended while a guest later in the chain is,
  -- and vice versa. Only the eligibility + subset check happens here (fail
  -- fast, pre-lock); the actual per-service charged prices are computed in i3
  -- because the fixed-surcharge-once rule must reset per person and there is
  -- nothing to gain by computing it twice before we even know the slot is free.
  FOR v_gi IN 1 .. v_guest_count LOOP
    v_guest_extended[v_gi] := v_has_ext AND v_guest_start_min[v_gi] >= v_normal_close;

    IF v_guest_extended[v_gi] THEN
      SELECT array_agg(sid ORDER BY pos)
        INTO v_g_service_ids
        FROM (
          SELECT sid, min(pos) AS pos
            FROM (
              SELECT x::uuid AS sid, ord AS pos
                FROM jsonb_array_elements_text(p_guests -> (v_gi - 1) -> 'service_ids')
                     WITH ORDINALITY AS t(x, ord)
            ) raw
           GROUP BY sid
        ) sub;

      IF EXISTS (
        SELECT 1 FROM public.salon_extended_services ses
         WHERE ses.salon_id = v_salon_id AND ses.day_of_week = v_dow
      ) THEN
        SELECT count(*)
          INTO v_g_svc_count
          FROM public.salon_extended_services ses
         WHERE ses.salon_id    = v_salon_id
           AND ses.day_of_week = v_dow
           AND ses.service_id  = ANY(v_g_service_ids);

        IF v_g_svc_count <> array_length(v_g_service_ids, 1) THEN
          RAISE EXCEPTION 'service_not_assigned' USING errcode = '22023';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- ─── g. Advisory lock ──────────────────────────────────────────────────────
  PERFORM pg_advisory_xact_lock(
    hashtextextended('booking:' || p_barber_id::text, 0)
  );

  -- ─── h. Overlap checks (whole group range) ──────────────────────────────────
  IF EXISTS (
    SELECT 1
      FROM public.appointments a
     WHERE a.barber_id = p_barber_id
       AND a.status NOT IN ('cancelled', 'no_show')
       AND tstzrange(
             a.scheduled_at,
             a.scheduled_at + (a.duration_min || ' minutes')::interval,
             '[)'
           ) && tstzrange(p_scheduled_at, v_group_end, '[)')
  ) THEN
    RAISE EXCEPTION 'slot_taken' USING errcode = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public._barber_break_occurrences(p_barber_id, p_scheduled_at, v_group_end) occ
  ) THEN
    RAISE EXCEPTION 'barber_break' USING errcode = '23P01';
  END IF;

  -- ─── i. Insert appointment + junction rows (main) ───────────────────────────
  IF v_guest_count > 0 THEN
    v_booking_group_id := gen_random_uuid();
  END IF;

  INSERT INTO public.appointments (
    user_id, barber_id, service_id, scheduled_at, duration_min,
    status, notes, total_cents, currency, booking_group_id
  ) VALUES (
    v_user, p_barber_id, v_service_ids[1], p_scheduled_at, v_duration,
    'pending', v_notes_clean, v_total, v_currency, v_booking_group_id
  )
  -- Table-qualify: a bare `id` is ambiguous with this function's RETURNS TABLE
  -- OUT column of the same name (42702).
  RETURNING appointments.id INTO v_appt_id;

  v_appt_ids := ARRAY[v_appt_id];

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

  -- ─── i2. Dependent re-point (main) ──────────────────────────────────────────
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
    RETURNING salon_clients.id INTO v_child_client_id;
  END IF;

  IF v_child_client_id IS NOT NULL THEN
    UPDATE public.appointments AS a
       SET salon_client_id = v_child_client_id
     WHERE a.id = v_appt_id;
  END IF;

  -- ─── i3. Guests: insert appointments, junction rows, CRM re-point ──────────
  -- Each guest's segment [v_guest_start[gi], v_guest_end[gi]) is already
  -- covered by the group-wide overlap/break checks in section h, so no further
  -- locking is needed. service_ids is re-derived from p_guests one more time
  -- (deterministic — already validated in d2/f3). Per-service extended pricing
  -- is computed fresh per guest, with the fixed-surcharge-once rule reset for
  -- EACH person (v_g_fixed_applied is guest-scoped, re-initialized every
  -- iteration). Every guest appointment is re-pointed onto its dependent/named
  -- client — unlike the main appointment there is no "self" case for a guest.
  FOR v_gi IN 1 .. v_guest_count LOOP
    SELECT array_agg(sid ORDER BY pos)
      INTO v_g_service_ids
      FROM (
        SELECT sid, min(pos) AS pos
          FROM (
            SELECT x::uuid AS sid, ord AS pos
              FROM jsonb_array_elements_text(p_guests -> (v_gi - 1) -> 'service_ids')
                   WITH ORDINALITY AS t(x, ord)
          ) raw
         GROUP BY sid
      ) sub;

    v_g_total         := 0;
    v_g_charged       := ARRAY[]::int[];
    v_g_fixed_applied := false;

    FOR v_svc IN
      SELECT bs.id, bs.price_cents, bs.price_cents_extended
        FROM public.barber_services bs
       WHERE bs.id = ANY(v_g_service_ids)
       ORDER BY array_position(v_g_service_ids, bs.id)
    LOOP
      IF v_guest_extended[v_gi] THEN
        IF v_svc.price_cents_extended IS NOT NULL AND v_svc.price_cents_extended > 0 THEN
          v_price := v_svc.price_cents_extended;
        ELSIF v_surcharge_type = 'fixed' THEN
          v_price := v_svc.price_cents
                   + (CASE WHEN v_g_fixed_applied THEN 0 ELSE COALESCE(v_surcharge_fixed, 0) END);
          v_g_fixed_applied := true;
        ELSE
          v_price := round(v_svc.price_cents * (1 + v_surcharge_pct / 100.0))::int;
        END IF;
      ELSE
        v_price := v_svc.price_cents;
      END IF;
      v_g_charged := array_append(v_g_charged, v_price);
      v_g_total   := v_g_total + v_price;
    END LOOP;

    INSERT INTO public.appointments (
      user_id, barber_id, service_id, scheduled_at, duration_min,
      status, notes, total_cents, currency, booking_group_id
    ) VALUES (
      v_user, p_barber_id, v_g_service_ids[1], v_guest_start[v_gi], v_guest_duration[v_gi],
      'pending', NULL, v_g_total, v_currency, v_booking_group_id
    )
    RETURNING appointments.id INTO v_guest_appt_id;

    v_appt_ids := array_append(v_appt_ids, v_guest_appt_id);

    FOR i IN 1 .. array_length(v_g_service_ids, 1) LOOP
      INSERT INTO public.appointment_services (
        appointment_id, service_id, duration_min, price_cents, sort_order
      )
      SELECT
        v_guest_appt_id,
        bs.id,
        bs.duration_min,
        v_g_charged[i],
        i - 1
      FROM public.barber_services bs
      WHERE bs.id = v_g_service_ids[i];
    END LOOP;

    IF v_guest_dep_id[v_gi] IS NOT NULL THEN
      v_g_target_client_id := v_guest_dep_id[v_gi];
    ELSE
      INSERT INTO public.salon_clients (
        salon_id, phone_e164, email, first_name, last_name,
        linked_profile_id, managed_by_profile_id, source
      ) VALUES (
        v_salon_id, NULL, NULL, v_guest_name[v_gi], NULL,
        NULL, v_user, 'client_dependent'
      )
      RETURNING salon_clients.id INTO v_g_target_client_id;
    END IF;

    UPDATE public.appointments AS a
       SET salon_client_id = v_g_target_client_id
     WHERE a.id = v_guest_appt_id;
  END LOOP;

  -- ─── j. Return new rows (main first, then guests, in input order) ─────────
  RETURN QUERY
    SELECT a.id, a.scheduled_at, a.duration_min, a.total_cents, a.currency, a.status
      FROM public.appointments a
     WHERE a.id = ANY(v_appt_ids)
     ORDER BY array_position(v_appt_ids, a.id);

END;
$$;

REVOKE ALL ON FUNCTION public.book_appointment(uuid, uuid[], timestamptz, text, text, uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.book_appointment(uuid, uuid[], timestamptz, text, text, uuid, text, jsonb)
  TO authenticated;

COMMIT;
