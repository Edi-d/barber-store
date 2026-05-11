-- Migration 115: Link appointments to salon_clients (CRM identity fix)
--
-- Background:
--   Today appointments.user_id is set to auth.uid() (the salon owner) because
--   schema requires it NOT NULL FK to profiles AND the RLS check is
--   `auth.uid() = user_id`. Calendar query joins client:profiles!user_id,
--   so every owner-booked appointment displays the OWNER as the client.
--
--   migration 091 added a trigger `tg_appointments_upsert_salon_client` that
--   reads NEW.user_id's profile.phone and upserts a salon_client — that fires
--   even when user_id is the owner, polluting the CRM with the owner's row.
--
-- Fix:
--   1. Make salon_clients.phone_e164 NULL-able so walk-ins (no phone) can be
--      stored; preserve the format check when phone IS provided.
--   2. Add appointments.salon_client_id (nullable for backwards compat).
--   3. Replace the buggy AFTER-INSERT trigger with one that operates on
--      NEW.salon_client_id (set explicitly by the booking RPC).
--   4. Provide an atomic RPC `create_appointment_with_client` that:
--        a) ensures a salon_clients row exists for the given (salon, phone),
--           or creates a phone-less walk-in row when phone is omitted,
--        b) creates the appointment with salon_client_id pre-set,
--        c) is RLS-safe (salon-membership gated, runs as SECURITY DEFINER).

BEGIN;

-- ===========================================================================
-- 1. Relax salon_clients.phone_e164 to allow walk-ins without phone numbers
-- ===========================================================================
ALTER TABLE public.salon_clients
  ALTER COLUMN phone_e164 DROP NOT NULL;

-- Recreate the format check so it only validates non-NULL values.
ALTER TABLE public.salon_clients
  DROP CONSTRAINT IF EXISTS salon_clients_phone_e164_check;

ALTER TABLE public.salon_clients
  ADD CONSTRAINT salon_clients_phone_e164_check
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+40[0-9]{9}$');

-- Keep the full UNIQUE (salon_id, phone_e164) constraint. PostgreSQL's UNIQUE
-- treats NULLs as distinct (default NULLS DISTINCT semantics), so multiple
-- walk-in rows with NULL phones coexist within a salon. We need the FULL
-- constraint (not a partial index) so the RPC below can target it via
-- `ON CONFLICT (salon_id, phone_e164)` without repeating the predicate.

-- ===========================================================================
-- 2. Add appointments.salon_client_id (nullable, FK with ON DELETE SET NULL)
-- ===========================================================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS salon_client_id uuid
    REFERENCES public.salon_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_salon_client
  ON public.appointments (salon_client_id, scheduled_at DESC)
  WHERE salon_client_id IS NOT NULL;

-- ===========================================================================
-- 3. Drop the buggy auto-upsert trigger from migration 091
--    (it created salon_clients rows from the OWNER's profile data).
-- ===========================================================================
DROP TRIGGER IF EXISTS appointments_upsert_salon_client ON public.appointments;
DROP FUNCTION IF EXISTS public.tg_appointments_upsert_salon_client() CASCADE;

-- ===========================================================================
-- 4. New trigger: bump appointment_count + last_appointment_at on the linked
--    salon_client whenever an appointment with salon_client_id is inserted.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.tg_appointments_touch_salon_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.salon_client_id IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.salon_clients
     SET last_appointment_at = GREATEST(
           COALESCE(last_appointment_at, NEW.scheduled_at),
           NEW.scheduled_at
         ),
         appointment_count = appointment_count + 1,
         updated_at = now()
   WHERE id = NEW.salon_client_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_touch_salon_client ON public.appointments;
CREATE TRIGGER appointments_touch_salon_client
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_appointments_touch_salon_client();

-- ===========================================================================
-- 5. Atomic RPC: create_appointment_with_client
--    Resolves or creates the salon_client, then inserts the appointment.
--    Returns the new appointment id.
--
--    Logic:
--      - If p_existing_client_id is provided → use it directly.
--      - Else if p_client_phone is non-null → upsert by (salon_id, phone).
--      - Else → create a phone-less walk-in row (multiple allowed per salon).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.create_appointment_with_client(
  p_salon_id          uuid,
  p_barber_id         uuid,
  p_service_id        uuid,
  p_scheduled_at      timestamptz,
  p_duration_min      int,
  p_total_cents       int,
  p_currency          text,
  p_existing_client_id uuid,
  p_client_first      text,
  p_client_last       text,
  p_client_phone      text,
  p_notes             text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_appt_id   uuid;
BEGIN
  -- RLS gate: caller must be a member of the salon.
  IF NOT public.is_salon_member(p_salon_id) THEN
    RAISE EXCEPTION 'forbidden: not a salon member' USING errcode = '42501';
  END IF;

  -- Validate phone format if provided.
  IF p_client_phone IS NOT NULL AND p_client_phone !~ '^\+40[0-9]{9}$' THEN
    RAISE EXCEPTION 'invalid phone format (expected +40XXXXXXXXX)'
      USING errcode = '22023';
  END IF;

  -- 1. Resolve / create the salon_client.
  IF p_existing_client_id IS NOT NULL THEN
    -- Verify the client belongs to the same salon (avoid cross-salon leaks).
    SELECT id INTO v_client_id
      FROM public.salon_clients
     WHERE id = p_existing_client_id
       AND salon_id = p_salon_id;
    IF v_client_id IS NULL THEN
      RAISE EXCEPTION 'client not found in this salon' USING errcode = '23503';
    END IF;
  ELSIF p_client_phone IS NOT NULL THEN
    -- Upsert by (salon, phone). Fill missing names if existing row had NULLs.
    INSERT INTO public.salon_clients (
      salon_id, phone_e164, first_name, last_name, source
    ) VALUES (
      p_salon_id, p_client_phone, p_client_first, p_client_last, 'appointment'
    )
    ON CONFLICT (salon_id, phone_e164) DO UPDATE
      SET first_name = COALESCE(salon_clients.first_name, EXCLUDED.first_name),
          last_name  = COALESCE(salon_clients.last_name,  EXCLUDED.last_name),
          updated_at = now()
    RETURNING id INTO v_client_id;
  ELSE
    -- Phone-less walk-in. Create a fresh row each time (no UNIQUE collision
    -- because the partial index excludes NULL phone).
    INSERT INTO public.salon_clients (
      salon_id, phone_e164, first_name, last_name, source
    ) VALUES (
      p_salon_id, NULL, p_client_first, p_client_last, 'appointment'
    )
    RETURNING id INTO v_client_id;
  END IF;

  -- 2. Insert the appointment with salon_client_id set. user_id stays as the
  --    caller (auth.uid()) to satisfy the FK + RLS check on appointments.
  INSERT INTO public.appointments (
    user_id, barber_id, service_id, scheduled_at, duration_min,
    status, total_cents, currency, notes, salon_client_id
  ) VALUES (
    auth.uid(), p_barber_id, p_service_id, p_scheduled_at, p_duration_min,
    'confirmed', p_total_cents, COALESCE(p_currency, 'RON'), p_notes, v_client_id
  )
  RETURNING id INTO v_appt_id;

  RETURN v_appt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_appointment_with_client(
  uuid, uuid, uuid, timestamptz, int, int, text, uuid, text, text, text, text
) TO authenticated;

COMMIT;
