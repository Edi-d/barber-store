-- Migration 126: Auto-link client-app bookings to salon_clients (CRM)
--
-- Background:
--   The customer-side app (Edi-d/barber-store) inserts appointments directly
--   with `user_id = auth.uid()` (the customer's profile) and never sets
--   `salon_client_id` — it doesn't even know `salon_clients` exists. As a
--   result, the barber-side `getAppointmentClientName()` falls back to
--   `profiles.display_name` for those rows, which often lands on an
--   auto-generated handle (e.g. "edi_a1b2") instead of a CRM-quality name.
--   It also leaves the salon's CRM blind to walk-up bookings made via the
--   customer app.
--
-- Fix:
--   AFTER INSERT trigger on appointments. When `salon_client_id IS NULL` AND
--   `user_id` is NOT the salon owner (i.e., a real customer booking), look
--   up the booker's profile, upsert a `salon_clients` row keyed on
--   `linked_profile_id` (so repeat bookings dedupe), and back-fill
--   `appointments.salon_client_id`.
--
--   Seed data and the owner-booked flow (RPC `create_appointment_with_client`,
--   migration 115) both set `salon_client_id` explicitly, so the trigger
--   no-ops on those paths.
--
-- Safety:
--   - Additive only: no column drops, no data deletes.
--   - SECURITY DEFINER so it runs with elevated privileges across RLS.
--   - Wrapped in a name-split helper that handles single-token display names.

BEGIN;

-- ===========================================================================
-- 1. UNIQUE constraint to dedupe by (salon_id, linked_profile_id).
--    Salon_clients already has `linked_profile_id` (mig 091, line 35) but no
--    uniqueness on it — so the upsert path needs this index. We use a partial
--    index because most CRM rows are walk-ins with NULL linked_profile_id.
-- ===========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_salon_clients_salon_profile
  ON public.salon_clients (salon_id, linked_profile_id)
  WHERE linked_profile_id IS NOT NULL;

-- ===========================================================================
-- 2. Helper: split a display_name into (first_name, last_name).
--    Single-token names land in first_name with NULL last_name.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.split_display_name(
  p_display_name text,
  OUT first_name text,
  OUT last_name  text
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text;
  v_parts text[];
BEGIN
  v_clean := btrim(COALESCE(p_display_name, ''));
  IF v_clean = '' THEN
    first_name := NULL;
    last_name  := NULL;
    RETURN;
  END IF;
  v_parts := regexp_split_to_array(v_clean, '\s+');
  first_name := v_parts[1];
  IF array_length(v_parts, 1) > 1 THEN
    last_name := array_to_string(v_parts[2:array_length(v_parts, 1)], ' ');
  ELSE
    last_name := NULL;
  END IF;
END;
$$;

-- ===========================================================================
-- 3. Trigger function: auto-link the booking to a salon_clients row.
--    Runs AFTER INSERT (after row + FK validation succeed) and AFTER the
--    existing `appointments_touch_salon_client` trigger from mig 115 — so a
--    later UPDATE of salon_client_id by THIS trigger fires that touch
--    trigger only if we explicitly route through it. We update counts
--    in-line to avoid double-counting via the existing AFTER trigger.
-- ===========================================================================
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

  -- Try to find an existing CRM row for this profile in this salon.
  SELECT id
    INTO v_existing_client
    FROM public.salon_clients
   WHERE salon_id = v_salon_id
     AND linked_profile_id = NEW.user_id
   LIMIT 1;

  IF v_existing_client IS NOT NULL THEN
    v_new_client_id := v_existing_client;
    -- Backfill any NULL name fields (a previous booking may have left them
    -- blank, or the customer just updated their profile).
    UPDATE public.salon_clients
       SET first_name = COALESCE(first_name, v_first),
           last_name  = COALESCE(last_name,  v_last),
           updated_at = now()
     WHERE id = v_existing_client;
  ELSE
    -- Create the CRM row. source='app_user' tags the origin so the salon
    -- owner can filter "clients who booked via the app". phone_e164 stays
    -- NULL because the customer-side `profiles` table has no phone column
    -- (verified — Edi-d/barber-store mig 001).
    INSERT INTO public.salon_clients (
      salon_id, phone_e164, first_name, last_name, source, linked_profile_id
    ) VALUES (
      v_salon_id, NULL, v_first, v_last, 'app_user', NEW.user_id
    )
    RETURNING id INTO v_new_client_id;
  END IF;

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

-- ===========================================================================
-- 4. Wire up the trigger. Use a distinct name from mig 115's touch trigger
--    so both can coexist.
-- ===========================================================================
DROP TRIGGER IF EXISTS appointments_autolink_salon_client ON public.appointments;
CREATE TRIGGER appointments_autolink_salon_client
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_appointments_autolink_salon_client();

-- ===========================================================================
-- 5. One-shot backfill for already-existing client-app bookings.
--    Walks every appointment with NULL salon_client_id whose user_id is
--    NOT the salon owner, and applies the same upsert logic. Safe to re-run.
-- ===========================================================================
DO $$
DECLARE
  v_appt           record;
  v_salon_id       uuid;
  v_owner_id       uuid;
  v_display_name   text;
  v_first          text;
  v_last           text;
  v_existing       uuid;
  v_new_client_id  uuid;
  v_count          int := 0;
BEGIN
  FOR v_appt IN
    SELECT a.id, a.user_id, a.barber_id, a.scheduled_at
      FROM public.appointments a
     WHERE a.salon_client_id IS NULL
  LOOP
    SELECT s.id, s.owner_id
      INTO v_salon_id, v_owner_id
      FROM public.barbers b
      JOIN public.salons  s ON s.id = b.salon_id
     WHERE b.id = v_appt.barber_id;

    CONTINUE WHEN v_salon_id IS NULL;
    CONTINUE WHEN v_appt.user_id = v_owner_id;

    SELECT p.display_name INTO v_display_name
      FROM public.profiles p WHERE p.id = v_appt.user_id;

    CONTINUE WHEN v_display_name IS NULL;

    SELECT s.first_name, s.last_name
      INTO v_first, v_last
      FROM public.split_display_name(v_display_name) s;

    SELECT id INTO v_existing
      FROM public.salon_clients
     WHERE salon_id = v_salon_id
       AND linked_profile_id = v_appt.user_id
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      v_new_client_id := v_existing;
    ELSE
      INSERT INTO public.salon_clients (
        salon_id, phone_e164, first_name, last_name, source, linked_profile_id
      ) VALUES (
        v_salon_id, NULL, v_first, v_last, 'app_user', v_appt.user_id
      )
      RETURNING id INTO v_new_client_id;
    END IF;

    UPDATE public.appointments
       SET salon_client_id = v_new_client_id
     WHERE id = v_appt.id;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfilled % existing client-app bookings.', v_count;
END $$;

COMMIT;
