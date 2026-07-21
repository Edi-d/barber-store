-- ============================================================================
-- Migration 162: Academy free haircuts
-- ============================================================================
--
-- "Academy" trainee barbers are pooled across ALL salons (not just their own
-- salon's discovery surface) so clients can book a FREE haircut with a
-- barber-in-training. A trainee keeps their normal salon_id/barbers row —
-- `is_academy` is just a flag — so everything about how a barber is staffed,
-- assigned services, and scheduled (barber_availability / salon_hours /
-- barber_breaks) is reused unchanged.
--
-- Adds, purely additively:
--   1. barbers.is_academy, appointments.is_academy, profiles.academy_consent_*
--   2. public.academy_barbers      — read-only view: active trainee barbers
--      pooled across active salons, single source of truth for "who is an
--      academy barber".
--   3. public.book_academy_appointment(...) — a SEPARATE, isolated RPC (does
--      NOT touch book_appointment). Single service, single person, ALWAYS
--      total_cents = 0, NO extended-hours surcharge logic. Reuses the exact
--      same overlap/break conflict checks and advisory-lock pattern as
--      book_appointment (migration 157) — no new conflict mechanism invented.
--      Enforces one active/upcoming free booking per client at a time.
--   4. public.accept_academy_consent(p_version) — records the caller's
--      acceptance of the academy liability/consent copy on their own profile
--      row, without loosening profiles UPDATE RLS.
--
-- Guardrail: book_appointment itself is NOT modified by this migration.
-- ============================================================================

BEGIN;

-- ─── 0. Schema: additive columns ────────────────────────────────────────────
ALTER TABLE public.barbers
  ADD COLUMN IF NOT EXISTS is_academy boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.barbers.is_academy IS
  'True for a trainee barber offering free "Academy" haircuts. Pooled across all salons via public.academy_barbers. The barber keeps their normal salon_id.';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_academy boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.appointments.is_academy IS
  'True for a free appointment created via book_academy_appointment. total_cents is always 0 on these rows.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS academy_consent_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS academy_consent_version text;

COMMENT ON COLUMN public.profiles.academy_consent_accepted_at IS
  'When the user accepted the Academy free-haircut liability/consent copy (accept_academy_consent RPC). NULL = never accepted.';
COMMENT ON COLUMN public.profiles.academy_consent_version IS
  'Version tag of the consent copy the user accepted (e.g. "2026-07-v1"). NULL = never accepted.';

-- Hot-path indexes for the two new lookups this migration introduces.
CREATE INDEX IF NOT EXISTS idx_barbers_academy_active
  ON public.barbers (salon_id)
  WHERE is_academy = true AND active = true;

CREATE INDEX IF NOT EXISTS idx_appointments_academy_active
  ON public.appointments (user_id, scheduled_at)
  WHERE is_academy = true AND status NOT IN ('cancelled', 'no_show');

-- ─── 1. View: academy_barbers ───────────────────────────────────────────────
-- Single source of truth for "who is an academy barber". Pools active
-- trainee barbers across ALL active salons, joined with everything a barber
-- card needs to render (salon name/city, profile avatar fallback).
DROP VIEW IF EXISTS public.academy_barbers;
CREATE VIEW public.academy_barbers AS
  SELECT
    b.*,
    s.name       AS salon_name,
    s.city       AS salon_city,
    p.avatar_url AS profile_avatar_url
  FROM public.barbers b
  JOIN public.salons s ON s.id = b.salon_id
  LEFT JOIN public.profiles p ON p.id = b.profile_id
  WHERE b.is_academy = true
    AND b.active     = true
    AND s.active      = true;

COMMENT ON VIEW public.academy_barbers IS
  'Active Academy (trainee) barbers pooled across all active salons. Single source of truth for "who is an academy barber" — storage can change later without breaking callers. SECURITY INVOKER (default): relies on the underlying barbers/salons/profiles SELECT policies, all of which already permit unauthenticated + authenticated reads of active rows.';

-- barbers/salons SELECT policies both allow unauthenticated reads of active
-- rows ("Barbers are viewable by everyone" / "Salons are viewable by
-- everyone"), so this view is granted to the same roles as the base tables.
GRANT SELECT ON public.academy_barbers TO anon, authenticated;

-- ─── 2. RPC: book_academy_appointment ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.book_academy_appointment(
  p_barber_id    uuid,
  p_service_id   uuid,
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
  v_user              uuid;
  v_salon_id          uuid;
  v_barber_active     boolean;
  v_barber_is_academy boolean;
  v_svc               RECORD;
  v_duration          int;
  v_currency          text;
  v_new_end           timestamptz;
  v_has_assignments   boolean;
  v_svc_count         int;
  v_notes_clean       text;
  v_appt_id           uuid;
  v_local             timestamp;
  v_dow               int;
  v_open_min          int;
  v_close_min         int;
  v_start_min         int;
  v_end_min           int;
BEGIN

  -- ─── a. Auth gate ──────────────────────────────────────────────────────────
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '42501';
  END IF;

  -- ─── b. Load + validate the trainee barber ─────────────────────────────────
  -- Also requires the barber's salon to be active, keeping this RPC in sync
  -- with what public.academy_barbers actually surfaces to clients.
  SELECT b.salon_id, b.active, b.is_academy
    INTO v_salon_id, v_barber_active, v_barber_is_academy
    FROM public.barbers b
    JOIN public.salons s ON s.id = b.salon_id
   WHERE b.id = p_barber_id
     AND s.active = true;

  IF v_salon_id IS NULL OR NOT v_barber_active OR NOT v_barber_is_academy THEN
    RAISE EXCEPTION 'invalid_academy_barber' USING errcode = '22023';
  END IF;

  -- ─── c. Validate the single service (active, same salon) ───────────────────
  SELECT bs.id, bs.duration_min, bs.currency
    INTO v_svc
    FROM public.barber_services bs
   WHERE bs.id = p_service_id
     AND bs.active = true
     AND bs.salon_id = v_salon_id;

  IF v_svc.id IS NULL THEN
    RAISE EXCEPTION 'invalid_service' USING errcode = '22023';
  END IF;

  -- Eligibility: mirrors book_appointment's rule — no assignment rows for
  -- this barber == every active service of their salon is allowed; 1+ rows
  -- == only the assigned services are allowed.
  SELECT EXISTS (
    SELECT 1 FROM public.barber_service_assignments bsa
     WHERE bsa.barber_id = p_barber_id
  ) INTO v_has_assignments;

  IF v_has_assignments THEN
    SELECT count(*)
      INTO v_svc_count
      FROM public.barber_service_assignments bsa
     WHERE bsa.barber_id  = p_barber_id
       AND bsa.service_id = p_service_id;

    IF v_svc_count <> 1 THEN
      RAISE EXCEPTION 'service_not_assigned' USING errcode = '22023';
    END IF;
  END IF;

  v_duration := v_svc.duration_min;
  v_currency := v_svc.currency;
  v_new_end  := p_scheduled_at + (v_duration || ' minutes')::interval;

  -- ─── d. Basic slot validation ────────────────────────────────────────────
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

  -- ─── e. Working-hours check (Europe/Bucharest) — NO extended-hours widening
  -- or surcharge logic, unlike book_appointment. Same barber_availability ->
  -- salon_hours fallback precedence.
  v_local := p_scheduled_at AT TIME ZONE 'Europe/Bucharest';
  v_dow   := EXTRACT(DOW FROM v_local)::int;

  v_start_min := EXTRACT(HOUR FROM v_local)::int * 60
               + EXTRACT(MINUTE FROM v_local)::int;
  v_end_min   := v_start_min + v_duration;

  IF EXISTS (
    SELECT 1 FROM public.barber_availability ba
     WHERE ba.barber_id = p_barber_id
  ) THEN
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

  -- ─── f. One active free booking at a time (pre-check, fail fast) ──────────
  IF EXISTS (
    SELECT 1
      FROM public.appointments a
     WHERE a.user_id = v_user
       AND a.is_academy = true
       AND a.status NOT IN ('cancelled', 'no_show')
       AND a.scheduled_at >= now()
  ) THEN
    RAISE EXCEPTION 'academy_booking_exists' USING errcode = '23505';
  END IF;

  -- ─── g. Advisory locks ──────────────────────────────────────────────────────
  -- Same barber-scoped key book_appointment uses (so a regular and an academy
  -- booking for the same barber row can never race each other), PLUS a
  -- user-scoped key to close the race window on rule f above.
  PERFORM pg_advisory_xact_lock(hashtextextended('booking:' || p_barber_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('academy_booking:' || v_user::text, 0));

  IF EXISTS (
    SELECT 1
      FROM public.appointments a
     WHERE a.user_id = v_user
       AND a.is_academy = true
       AND a.status NOT IN ('cancelled', 'no_show')
       AND a.scheduled_at >= now()
  ) THEN
    RAISE EXCEPTION 'academy_booking_exists' USING errcode = '23505';
  END IF;

  -- ─── h. Overlap checks — same conflict mechanism as book_appointment ───────
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

  -- ─── i. Insert appointment + single junction row ───────────────────────────
  -- Money is always 0 — never trust a client-supplied price for an Academy
  -- booking. Single service, single person: no guests/dependents/packages,
  -- no booking_group_id.
  INSERT INTO public.appointments (
    user_id, barber_id, service_id, scheduled_at, duration_min,
    status, notes, total_cents, currency, is_academy
  ) VALUES (
    v_user, p_barber_id, p_service_id, p_scheduled_at, v_duration,
    'pending', v_notes_clean, 0, v_currency, true
  )
  -- Table-qualify: a bare `id` is ambiguous with this function's RETURNS TABLE
  -- OUT column of the same name (42702).
  RETURNING appointments.id INTO v_appt_id;

  INSERT INTO public.appointment_services (
    appointment_id, service_id, duration_min, price_cents, sort_order
  ) VALUES (
    v_appt_id, p_service_id, v_duration, 0, 0
  );

  -- ─── j. Return the new row (same shape as book_appointment) ────────────────
  RETURN QUERY
    SELECT a.id, a.scheduled_at, a.duration_min, a.total_cents, a.currency, a.status
      FROM public.appointments a
     WHERE a.id = v_appt_id;

END;
$$;

REVOKE ALL ON FUNCTION public.book_academy_appointment(uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.book_academy_appointment(uuid, uuid, timestamptz, text)
  TO authenticated;

COMMENT ON FUNCTION public.book_academy_appointment(uuid, uuid, timestamptz, text) IS
  'Books a single FREE (total_cents = 0) appointment with an Academy trainee barber for the caller. Isolated from book_appointment; enforces one active/upcoming academy booking per client.';

-- ─── 3. RPC: accept_academy_consent ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_academy_consent(
  p_version text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         uuid;
  v_version_clean text;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '42501';
  END IF;

  v_version_clean := btrim(COALESCE(p_version, ''));
  IF v_version_clean = '' THEN
    RAISE EXCEPTION 'version_required' USING errcode = '22023';
  END IF;
  IF char_length(v_version_clean) > 40 THEN
    RAISE EXCEPTION 'version_too_long' USING errcode = '22023';
  END IF;

  UPDATE public.profiles
     SET academy_consent_accepted_at = now(),
         academy_consent_version     = v_version_clean
   WHERE id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_academy_consent(text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_academy_consent(text)
  TO authenticated;

COMMENT ON FUNCTION public.accept_academy_consent(text) IS
  'Records the caller''s acceptance of the Academy free-haircut consent copy on their own profiles row. SECURITY DEFINER so profiles UPDATE RLS does not need to be loosened.';

COMMIT;
