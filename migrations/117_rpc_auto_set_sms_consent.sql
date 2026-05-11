-- Migration 117: Auto-set SMS marketing consent for new clients booked via RPC
--
-- When the salon owner books an appointment for a NEW client through the
-- in-app picker, the client implicitly agreed (verbally) to receive SMS
-- communications by giving their phone number for booking purposes. The
-- RPC now records that consent automatically with source='booking_form'.
--
-- Behavior matrix:
--   - p_existing_client_id given → no change (don't override the client's
--     existing consent state).
--   - p_client_phone provided + new client (INSERT path) → consent=true.
--   - p_client_phone provided + matched existing client (UPDATE path) → don't
--     override their existing consent; only fill missing names.
--   - p_client_phone NULL (walk-in, no contact) → consent=false (no phone
--     means no SMS to send to anyway).

BEGIN;

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
    -- Upsert by (salon, phone). On INSERT, mark SMS consent automatically
    -- (booking_form source). On UPDATE for an existing row, keep the
    -- caller's prior consent state — only fill missing names.
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

  ELSE
    -- Phone-less walk-in. No SMS consent (we have no number to message).
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
