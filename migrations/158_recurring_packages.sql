-- ============================================================================
-- Migration 158: Pachete recurente — recurring appointment packages (client side)
-- ============================================================================
--
-- Ports the web app's (tazpi-website) "pachet recurent" feature to the mobile
-- client. An owner marks a service as offering one or more prepaid packages: the
-- same slot (weekday + time) repeated every N weeks/months for a fixed number of
-- occurrences, sold for one up-front price. A client who books that service can
-- pick a package; all its appointments are generated at booking time (bounded, so
-- no cron is needed) after validating each occurrence lands in the barber's free
-- working slot.
--
-- On the web the engine runs in a Node.js API route with a service-role client
-- that inserts into `appointments` directly. The mobile app has no such backend
-- and its triggers block direct inserts, so the engine is re-implemented here as
-- a SECURITY DEFINER RPC (book_recurring_package), modelled on the existing
-- book_appointment RPC (migrations 156/157) whose validation blocks it reuses.
--
-- SAFETY / SHARED PROJECT:
--   * Additive + idempotent. Every table/column uses IF NOT EXISTS and mirrors the
--     web migrations (20260710_recurring_packages.sql,
--     20260711_service_recurring_packages.sql) EXACTLY, so re-applying on a DB
--     where the web already created them is a no-op.
--   * Nothing existing is dropped or altered — book_appointment and every other
--     object is untouched. The DROP POLICY IF EXISTS ... CREATE POLICY pairs only
--     re-declare THIS feature's own policies to the same definition.
--   * The three new functions are net-new; nothing in the web app calls them.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Schema (idempotent mirror of the web's two migrations)
-- ───────────────────────────────────────────────────────────────────────────

-- 1a. One package definition = a (duration × cadence × discount) a service offers.
CREATE TABLE IF NOT EXISTS public.service_recurring_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.barber_services(id) ON DELETE CASCADE,
  duration_months INTEGER CHECK (duration_months > 0),
  cadence TEXT CHECK (cadence IN ('weekly', 'biweekly', 'monthly')),
  interval_unit TEXT NOT NULL CHECK (interval_unit IN ('week', 'month')),
  interval_count INTEGER NOT NULL CHECK (interval_count > 0),
  occurrences INTEGER NOT NULL CHECK (occurrences > 0),
  discount_type TEXT CHECK (discount_type IN ('amount', 'percent')),
  discount_value INTEGER CHECK (discount_value >= 0),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_recurring_packages_service
  ON public.service_recurring_packages(service_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_service_recurring_packages_salon
  ON public.service_recurring_packages(salon_id);

ALTER TABLE public.service_recurring_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salon owner manages recurring packages" ON public.service_recurring_packages;
CREATE POLICY "salon owner manages recurring packages" ON public.service_recurring_packages FOR ALL
  USING (salon_id IN (SELECT id FROM public.salons WHERE owner_id = auth.uid()))
  WITH CHECK (salon_id IN (SELECT id FROM public.salons WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "public reads active recurring packages" ON public.service_recurring_packages;
CREATE POLICY "public reads active recurring packages" ON public.service_recurring_packages FOR SELECT
  USING (active = true);

-- 1b. One purchased package = a bounded set of generated appointments.
CREATE TABLE IF NOT EXISTS public.appointment_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  barber_id UUID REFERENCES public.barbers(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.barber_services(id) ON DELETE SET NULL,
  user_id UUID,                       -- the buyer (booker)
  salon_client_id UUID REFERENCES public.salon_clients(id) ON DELETE SET NULL,
  anchor_start_at TIMESTAMPTZ NOT NULL,
  interval_unit TEXT NOT NULL CHECK (interval_unit IN ('week', 'month')),
  interval_count INTEGER NOT NULL CHECK (interval_count > 0),
  occurrences INTEGER NOT NULL CHECK (occurrences > 0),
  price_cents INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Trace a purchase back to the definition it was bought from (web 20260711).
  source_package_id UUID REFERENCES public.service_recurring_packages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_appointment_packages_salon
  ON public.appointment_packages(salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointment_packages_user
  ON public.appointment_packages(user_id);

ALTER TABLE public.appointment_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salon owner manages packages" ON public.appointment_packages;
CREATE POLICY "salon owner manages packages" ON public.appointment_packages FOR ALL
  USING (salon_id IN (SELECT id FROM public.salons WHERE owner_id = auth.uid()))
  WITH CHECK (salon_id IN (SELECT id FROM public.salons WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "buyer reads own packages" ON public.appointment_packages;
CREATE POLICY "buyer reads own packages" ON public.appointment_packages FOR SELECT
  USING (user_id = auth.uid());

-- 1c. Link generated appointments back to their package.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS package_id UUID
    REFERENCES public.appointment_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_package
  ON public.appointments(package_id) WHERE package_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Helper: is a (barber, start, duration) slot bookable?
-- ───────────────────────────────────────────────────────────────────────────
-- Read-only boolean version of book_appointment's working-hours + overlap +
-- break checks (no surcharge/pricing — the package price is authoritative). Used
-- by book_recurring_package to place the anchor and to shift each later
-- occurrence forward around closed days / taken slots. Because inserts happen
-- inside the same transaction as the placement loop, this naturally sees earlier
-- occurrences of the same series when checking overlap. Not granted to callers;
-- only invoked from the SECURITY DEFINER RPC below (runs as the function owner).
CREATE OR REPLACE FUNCTION public._recurring_slot_bookable(
  p_barber_id    uuid,
  p_salon_id     uuid,
  p_start        timestamptz,
  p_duration_min int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end       timestamptz;
  v_local     timestamp;
  v_dow       int;
  v_open_min  int;
  v_close_min int;
  v_start_min int;
  v_end_min   int;
  v_ext_close int;
BEGIN
  IF p_start <= now() THEN
    RETURN false;
  END IF;

  v_end   := p_start + (p_duration_min || ' minutes')::interval;
  v_local := p_start AT TIME ZONE 'Europe/Bucharest';
  v_dow   := EXTRACT(DOW FROM v_local)::int;
  v_start_min := EXTRACT(HOUR FROM v_local)::int * 60 + EXTRACT(MINUTE FROM v_local)::int;
  v_end_min   := v_start_min + p_duration_min;

  -- Working hours: barber schedule governs if any rows exist, else salon hours
  -- (widened by extended hours). Mirrors book_appointment section f.
  IF EXISTS (SELECT 1 FROM public.barber_availability ba WHERE ba.barber_id = p_barber_id) THEN
    SELECT (EXTRACT(HOUR FROM ba.start_time)::int * 60 + EXTRACT(MINUTE FROM ba.start_time)::int),
           (EXTRACT(HOUR FROM ba.end_time)::int   * 60 + EXTRACT(MINUTE FROM ba.end_time)::int)
      INTO v_open_min, v_close_min
      FROM public.barber_availability ba
     WHERE ba.barber_id = p_barber_id AND ba.day_of_week = v_dow AND ba.is_available = true;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
  ELSE
    SELECT (EXTRACT(HOUR FROM sh.open_time)::int  * 60 + EXTRACT(MINUTE FROM sh.open_time)::int),
           (EXTRACT(HOUR FROM sh.close_time)::int * 60 + EXTRACT(MINUTE FROM sh.close_time)::int)
      INTO v_open_min, v_close_min
      FROM public.salon_hours sh
     WHERE sh.salon_id = p_salon_id AND sh.day_of_week = v_dow AND sh.is_open = true;
    IF NOT FOUND THEN
      RETURN false;
    END IF;

    SELECT (EXTRACT(HOUR FROM eh.extended_close_time)::int * 60
              + EXTRACT(MINUTE FROM eh.extended_close_time)::int)
      INTO v_ext_close
      FROM public.salon_extended_hours eh
     WHERE eh.salon_id = p_salon_id AND eh.day_of_week = v_dow AND eh.enabled = true;
    IF FOUND AND v_ext_close > v_close_min THEN
      v_close_min := v_ext_close;
    END IF;
  END IF;

  IF v_start_min < v_open_min OR v_end_min > v_close_min THEN
    RETURN false;
  END IF;

  -- Overlap with another live appointment for this barber.
  IF EXISTS (
    SELECT 1 FROM public.appointments a
     WHERE a.barber_id = p_barber_id
       AND a.status NOT IN ('cancelled', 'no_show')
       AND tstzrange(a.scheduled_at,
                     a.scheduled_at + (a.duration_min || ' minutes')::interval, '[)')
           && tstzrange(p_start, v_end, '[)')
  ) THEN
    RETURN false;
  END IF;

  -- Barber break.
  IF EXISTS (
    SELECT 1 FROM public._barber_break_occurrences(p_barber_id, p_start, v_end) occ
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._recurring_slot_bookable(uuid, uuid, timestamptz, int)
  FROM PUBLIC, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. book_recurring_package — create the whole series atomically
-- ───────────────────────────────────────────────────────────────────────────
-- Reads the authoritative config from service_recurring_packages (never trusts
-- client-supplied engine params), validates the barber + service(s), computes
-- occurrence starts in Europe/Bucharest wall-clock, places each occurrence
-- (anchor fixed; later ones shift forward up to SHIFT_CAP_DAYS=14), and inserts
-- one appointment_packages row + N appointments (linked via package_id) in a
-- single transaction. Any RAISE rolls the whole series back — there is never a
-- partial series (matches the web's manual rollback). Optional add-on services
-- (p_extra_service_ids) ride ONLY on the first appointment.
DROP FUNCTION IF EXISTS public.book_recurring_package(uuid, uuid, timestamptz, uuid[], text);

CREATE OR REPLACE FUNCTION public.book_recurring_package(
  p_barber_id         uuid,
  p_source_package_id uuid,
  p_anchor_start_at   timestamptz,
  p_extra_service_ids uuid[] DEFAULT NULL,
  p_notes             text   DEFAULT NULL
) RETURNS TABLE(
  package_id     uuid,
  booking_id     uuid,
  occurrences    int,
  shifted_count  int,
  first_slot_iso timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user            uuid;
  v_salon_id        uuid;
  v_barber_salon    uuid;
  v_barber_active   boolean;
  v_service_id      uuid;
  v_interval_unit   text;
  v_interval_cnt    int;
  v_occurrences     int;
  v_price_cents     int;
  v_svc_duration    int;
  v_svc_currency    text;
  v_svc_active      boolean;
  v_svc_salon       uuid;
  v_extra_ids       uuid[];
  v_extras_dur      int := 0;
  v_extras_total    int := 0;
  v_anchor_dur      int;
  v_has_assignments boolean;
  v_notes_clean     text;
  v_local_anchor    timestamp;
  v_base_start      timestamptz;
  v_cand            timestamptz;
  v_ok              boolean;
  v_shifted         int := 0;
  v_pkg_id          uuid;
  v_appt_id         uuid;
  v_anchor_appt     uuid;
  v_per_occ         int;
  v_remainder       int;
  v_occ_total       int;
  i                 int;
  j                 int;
  v_d               int;
BEGIN
  -- a. Auth gate.
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '42501';
  END IF;

  -- b. Load barber.
  SELECT b.salon_id, b.active
    INTO v_barber_salon, v_barber_active
    FROM public.barbers b
   WHERE b.id = p_barber_id;
  IF v_barber_salon IS NULL OR NOT v_barber_active THEN
    RAISE EXCEPTION 'invalid_barber' USING errcode = '22023';
  END IF;

  -- c. Authoritative package config (active only).
  SELECT srp.salon_id, srp.service_id, srp.interval_unit, srp.interval_count,
         srp.occurrences, srp.price_cents
    INTO v_salon_id, v_service_id, v_interval_unit, v_interval_cnt,
         v_occurrences, v_price_cents
    FROM public.service_recurring_packages srp
   WHERE srp.id = p_source_package_id AND srp.active = true;
  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'invalid_package' USING errcode = '22023';
  END IF;

  IF v_barber_salon <> v_salon_id THEN
    RAISE EXCEPTION 'invalid_barber' USING errcode = '22023';
  END IF;

  -- d. Package service validity + duration/currency.
  SELECT bs.duration_min, bs.currency, bs.active, bs.salon_id
    INTO v_svc_duration, v_svc_currency, v_svc_active, v_svc_salon
    FROM public.barber_services bs
   WHERE bs.id = v_service_id;
  IF v_svc_duration IS NULL OR NOT v_svc_active OR v_svc_salon <> v_salon_id THEN
    RAISE EXCEPTION 'invalid_services' USING errcode = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.barber_service_assignments bsa WHERE bsa.barber_id = p_barber_id
  ) INTO v_has_assignments;

  IF v_has_assignments THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.barber_service_assignments bsa
       WHERE bsa.barber_id = p_barber_id AND bsa.service_id = v_service_id
    ) THEN
      RAISE EXCEPTION 'service_not_assigned' USING errcode = '22023';
    END IF;
  END IF;

  -- e. Extras (ride only on the anchor). Dedupe, drop the package service if
  --    included, validate active + in-salon + assigned; sum duration + price.
  IF p_extra_service_ids IS NOT NULL AND array_length(p_extra_service_ids, 1) > 0 THEN
    SELECT array_agg(sid ORDER BY pos)
      INTO v_extra_ids
      FROM (
        SELECT sid, min(pos) AS pos
          FROM unnest(p_extra_service_ids) WITH ORDINALITY AS t(sid, pos)
         WHERE sid <> v_service_id
         GROUP BY sid
      ) s;
  END IF;

  IF v_extra_ids IS NOT NULL AND array_length(v_extra_ids, 1) > 0 THEN
    IF (SELECT count(*) FROM public.barber_services bs
         WHERE bs.id = ANY(v_extra_ids) AND bs.active = true AND bs.salon_id = v_salon_id)
       <> array_length(v_extra_ids, 1) THEN
      RAISE EXCEPTION 'invalid_services' USING errcode = '22023';
    END IF;

    IF v_has_assignments THEN
      IF (SELECT count(*) FROM public.barber_service_assignments bsa
           WHERE bsa.barber_id = p_barber_id AND bsa.service_id = ANY(v_extra_ids))
         <> array_length(v_extra_ids, 1) THEN
        RAISE EXCEPTION 'service_not_assigned' USING errcode = '22023';
      END IF;
    END IF;

    SELECT COALESCE(sum(bs.duration_min), 0), COALESCE(sum(bs.price_cents), 0)
      INTO v_extras_dur, v_extras_total
      FROM public.barber_services bs
     WHERE bs.id = ANY(v_extra_ids);
  END IF;

  v_anchor_dur := v_svc_duration + v_extras_dur;

  -- f. Notes.
  v_notes_clean := btrim(COALESCE(p_notes, ''));
  IF char_length(v_notes_clean) > 500 THEN
    RAISE EXCEPTION 'notes_too_long' USING errcode = '22023';
  END IF;
  IF v_notes_clean = '' THEN
    v_notes_clean := NULL;
  END IF;

  -- g. Advisory lock — serialize this barber's bookings for the whole series.
  PERFORM pg_advisory_xact_lock(hashtextextended('booking:' || p_barber_id::text, 0));

  -- h. Anchor must be exactly bookable (never shifted). Includes extras duration.
  IF NOT public._recurring_slot_bookable(p_barber_id, v_salon_id, p_anchor_start_at, v_anchor_dur) THEN
    IF p_anchor_start_at <= now() THEN
      RAISE EXCEPTION 'past_slot' USING errcode = '22023';
    END IF;
    RAISE EXCEPTION 'slot_taken' USING errcode = '23P01';
  END IF;

  -- i. Parent package row.
  INSERT INTO public.appointment_packages (
    salon_id, barber_id, service_id, user_id, salon_client_id,
    anchor_start_at, interval_unit, interval_count, occurrences,
    price_cents, payment_method, payment_status, status, source_package_id
  ) VALUES (
    v_salon_id, p_barber_id, v_service_id, v_user, NULL,
    p_anchor_start_at, v_interval_unit, v_interval_cnt, v_occurrences,
    v_price_cents, 'cash', 'pending', 'active', p_source_package_id
  )
  RETURNING appointment_packages.id INTO v_pkg_id;

  -- Per-occurrence price split; the anchor absorbs the rounding remainder so the
  -- parts sum exactly to price_cents.
  v_per_occ   := v_price_cents / v_occurrences;
  v_remainder := v_price_cents - (v_per_occ * v_occurrences);

  -- j. Place + insert each occurrence. Anchor is i=0 (fixed); later occurrences
  --    are computed in Bucharest wall-clock and shifted forward up to 14 days.
  v_local_anchor := p_anchor_start_at AT TIME ZONE 'Europe/Bucharest';

  FOR i IN 0 .. (v_occurrences - 1) LOOP
    IF i = 0 THEN
      v_cand := p_anchor_start_at;
    ELSE
      IF v_interval_unit = 'week' THEN
        v_base_start := (v_local_anchor + ((i * v_interval_cnt) || ' weeks')::interval)
                          AT TIME ZONE 'Europe/Bucharest';
      ELSE
        v_base_start := (v_local_anchor + ((i * v_interval_cnt) || ' months')::interval)
                          AT TIME ZONE 'Europe/Bucharest';
      END IF;

      v_ok := false;
      FOR v_d IN 0 .. 14 LOOP
        IF v_d = 0 THEN
          v_cand := v_base_start;
        ELSE
          v_cand := ((v_base_start AT TIME ZONE 'Europe/Bucharest') + (v_d || ' days')::interval)
                      AT TIME ZONE 'Europe/Bucharest';
        END IF;
        -- Later occurrences never carry the extras, so only the package service
        -- duration must fit. Prior occurrences of THIS series are already
        -- inserted (same txn), so overlap is checked against them too.
        IF public._recurring_slot_bookable(p_barber_id, v_salon_id, v_cand, v_svc_duration) THEN
          v_ok := true;
        END IF;
        EXIT WHEN v_ok;
      END LOOP;

      IF NOT v_ok THEN
        RAISE EXCEPTION 'occurrence_unplaceable' USING errcode = '22023';
      END IF;
      IF v_cand <> v_base_start THEN
        v_shifted := v_shifted + 1;
      END IF;
    END IF;

    IF i = 0 THEN
      v_occ_total := (v_per_occ + v_remainder) + v_extras_total;
      INSERT INTO public.appointments (
        user_id, barber_id, service_id, scheduled_at, duration_min,
        status, notes, total_cents, currency, package_id
      ) VALUES (
        v_user, p_barber_id, v_service_id, v_cand, v_anchor_dur,
        'pending', v_notes_clean, v_occ_total, v_svc_currency, v_pkg_id
      )
      RETURNING appointments.id INTO v_appt_id;
      v_anchor_appt := v_appt_id;
    ELSE
      v_occ_total := v_per_occ;
      INSERT INTO public.appointments (
        user_id, barber_id, service_id, scheduled_at, duration_min,
        status, notes, total_cents, currency, package_id
      ) VALUES (
        v_user, p_barber_id, v_service_id, v_cand, v_svc_duration,
        'pending', NULL, v_occ_total, v_svc_currency, v_pkg_id
      )
      RETURNING appointments.id INTO v_appt_id;
    END IF;

    -- Junction: the package service's per-occurrence share (anchor gets the
    -- remainder), plus the extras only on the anchor.
    INSERT INTO public.appointment_services (
      appointment_id, service_id, duration_min, price_cents, sort_order
    )
    SELECT v_appt_id, v_service_id, v_svc_duration,
           CASE WHEN i = 0 THEN v_per_occ + v_remainder ELSE v_per_occ END, 0;

    IF i = 0 AND v_extra_ids IS NOT NULL AND array_length(v_extra_ids, 1) > 0 THEN
      FOR j IN 1 .. array_length(v_extra_ids, 1) LOOP
        INSERT INTO public.appointment_services (
          appointment_id, service_id, duration_min, price_cents, sort_order
        )
        SELECT v_appt_id, bs.id, bs.duration_min, bs.price_cents, j
          FROM public.barber_services bs
         WHERE bs.id = v_extra_ids[j];
      END LOOP;
    END IF;
  END LOOP;

  -- k. Associate the package with the salon_client the auto-link trigger set on
  --    the anchor appointment (best-effort; nullable).
  UPDATE public.appointment_packages ap
     SET salon_client_id = a.salon_client_id
    FROM public.appointments a
   WHERE ap.id = v_pkg_id
     AND a.id = v_anchor_appt
     AND a.salon_client_id IS NOT NULL;

  RETURN QUERY
    SELECT v_pkg_id, v_anchor_appt, v_occurrences::int, v_shifted::int, p_anchor_start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.book_recurring_package(uuid, uuid, timestamptz, uuid[], text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.book_recurring_package(uuid, uuid, timestamptz, uuid[], text)
  TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. cancel_recurring_package — cancel the whole series (future occurrences)
-- ───────────────────────────────────────────────────────────────────────────
-- The buyer has no UPDATE RLS on appointment_packages, so cancellation goes
-- through this SECURITY DEFINER RPC. Cancels the package + every still-upcoming
-- pending/confirmed occurrence; past sessions are untouched. Returns how many
-- appointments were cancelled.
DROP FUNCTION IF EXISTS public.cancel_recurring_package(uuid);

CREATE OR REPLACE FUNCTION public.cancel_recurring_package(p_package_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid;
  v_owner uuid;
  v_count int;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '42501';
  END IF;

  SELECT ap.user_id INTO v_owner
    FROM public.appointment_packages ap
   WHERE ap.id = p_package_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'package_not_found' USING errcode = '22023';
  END IF;
  IF v_owner <> v_user THEN
    RAISE EXCEPTION 'not_package_owner' USING errcode = '42501';
  END IF;

  UPDATE public.appointments a
     SET status = 'cancelled'
   WHERE a.package_id = p_package_id
     AND a.status IN ('pending', 'confirmed')
     AND a.scheduled_at >= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.appointment_packages ap
     SET status = 'cancelled'
   WHERE ap.id = p_package_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_recurring_package(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_recurring_package(uuid) TO authenticated;

COMMIT;
