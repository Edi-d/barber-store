-- Migration 124: Atomic appointment edit RPC
--
-- Companion to `create_appointment_with_client` (migration 115/117). Used
-- when the salon owner taps "Editează" on an existing appointment in
-- AppointmentDetailModal. Updates all editable fields in one round-trip:
--
--   - barber_id (move to a different barber)
--   - service_id + appointment_services junction (replace service set)
--   - scheduled_at + duration_min + total_cents (re-time)
--   - salon_client_id (reassign client; falls back to creating a fresh
--     salon_client when caller passes phone-based identity instead of an id)
--   - notes
--
-- Validates:
--   - caller is a salon member (RLS gate)
--   - target barber belongs to the salon
--   - new time doesn't overlap another non-cancelled appointment on the
--     target barber (excluding the appointment being edited)
--   - phone format if provided
--
-- Status flips back to 'confirmed' on edit (industry standard — you
-- re-confirmed a modification with the client).
--
-- Returns the updated appointment id on success; raises 23P01 on overlap,
-- 42501 on RLS, 22023 on invalid input.

BEGIN;

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

COMMIT;
