-- Migration 119: barber_breaks RPCs (create / update / delete)
--
-- Purpose:
--   Atomic, RLS-safe operations against barber_breaks. All RPCs:
--     - Run as SECURITY DEFINER with `search_path = public`.
--     - Gate access via public.is_salon_member(salon_id).
--     - Are GRANTed to `authenticated`.
--
-- Update / delete scopes:
--   'all'    => operate on the master row directly.
--   'future' => clamp the master `recurrence_until` to (occurrence_date - 1d)
--               and (for update) start a NEW master from p_start_at onward.
--   'one'    => create a child row with parent_break_id pointing at the
--               master. For update: child row is a real override. For
--               delete: child row is a tombstone (is_exception_skip = true).
--
-- Depends on:
--   - 081 (is_salon_member)
--   - 118 (barber_breaks)

BEGIN;

-- ===========================================================================
-- 1. create_barber_break
--    Creates ONE row per barber inside a single transaction. Returns the
--    array of new ids in the same order as p_barber_ids.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.create_barber_break(
  p_salon_id          uuid,
  p_barber_ids        uuid[],
  p_start_at          timestamptz,
  p_end_at            timestamptz,
  p_reason_type       text,
  p_title             text,
  p_recurrence_rule   text,
  p_recurrence_until  date,
  p_notes             text
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_barber_id uuid;
  v_new_id    uuid;
  v_ids       uuid[] := ARRAY[]::uuid[];
  v_count     int;
BEGIN
  -- RLS gate.
  IF NOT public.is_salon_member(p_salon_id) THEN
    RAISE EXCEPTION 'forbidden: not a salon member' USING errcode = '42501';
  END IF;

  IF p_barber_ids IS NULL OR array_length(p_barber_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_barber_ids must contain at least one barber'
      USING errcode = '22023';
  END IF;

  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'end_at must be after start_at' USING errcode = '22023';
  END IF;

  -- Verify all barbers belong to the salon (avoid cross-salon writes).
  SELECT count(*)
    INTO v_count
    FROM public.barbers b
   WHERE b.id = ANY(p_barber_ids)
     AND b.salon_id = p_salon_id;

  IF v_count <> array_length(p_barber_ids, 1) THEN
    RAISE EXCEPTION 'one or more barbers do not belong to this salon'
      USING errcode = '23503';
  END IF;

  -- Insert one row per barber, preserving order.
  FOREACH v_barber_id IN ARRAY p_barber_ids LOOP
    INSERT INTO public.barber_breaks (
      salon_id, barber_id, start_at, end_at,
      reason_type, title,
      recurrence_rule, recurrence_until,
      notes
    ) VALUES (
      p_salon_id, v_barber_id, p_start_at, p_end_at,
      COALESCE(p_reason_type, 'other'), p_title,
      COALESCE(p_recurrence_rule, 'NONE'), p_recurrence_until,
      p_notes
    )
    RETURNING id INTO v_new_id;

    v_ids := v_ids || v_new_id;
  END LOOP;

  RETURN v_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_barber_break(
  uuid, uuid[], timestamptz, timestamptz, text, text, text, date, text
) TO authenticated;

-- ===========================================================================
-- 2. update_barber_break
--    p_scope ∈ ('one','future','all')
--      - 'all'    : UPDATE master directly.
--      - 'future' : clamp master.recurrence_until to (p_occurrence_date - 1d),
--                   INSERT a NEW master from p_start_at onward with new
--                   fields. Returns the id of the new master row.
--      - 'one'    : INSERT a child row with parent_break_id = master, the
--                   override fields applied; is_exception_skip = false.
--                   Only valid when the master is recurring.
--
--    p_occurrence_date is required for 'one' and 'future'. For 'all' it is
--    ignored.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.update_barber_break(
  p_break_id          uuid,
  p_scope             text,
  p_occurrence_date   date,
  p_start_at          timestamptz,
  p_end_at            timestamptz,
  p_reason_type       text,
  p_title             text,
  p_recurrence_rule   text,
  p_recurrence_until  date,
  p_notes             text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master    public.barber_breaks%ROWTYPE;
  v_new_id    uuid;
BEGIN
  IF p_scope NOT IN ('one','future','all') THEN
    RAISE EXCEPTION 'p_scope must be one of (one, future, all)'
      USING errcode = '22023';
  END IF;

  -- Load master row.
  SELECT *
    INTO v_master
    FROM public.barber_breaks
   WHERE id = p_break_id;

  IF v_master.id IS NULL THEN
    RAISE EXCEPTION 'barber_break not found' USING errcode = '23503';
  END IF;

  -- RLS gate.
  IF NOT public.is_salon_member(v_master.salon_id) THEN
    RAISE EXCEPTION 'forbidden: not a salon member' USING errcode = '42501';
  END IF;

  IF p_end_at IS NOT NULL AND p_start_at IS NOT NULL AND p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'end_at must be after start_at' USING errcode = '22023';
  END IF;

  IF p_scope = 'all' THEN
    UPDATE public.barber_breaks
       SET start_at         = COALESCE(p_start_at,         start_at),
           end_at           = COALESCE(p_end_at,           end_at),
           reason_type      = COALESCE(p_reason_type,      reason_type),
           title            = p_title,
           recurrence_rule  = COALESCE(p_recurrence_rule,  recurrence_rule),
           recurrence_until = p_recurrence_until,
           notes            = p_notes
     WHERE id = p_break_id;

    RETURN p_break_id;

  ELSIF p_scope = 'future' THEN
    IF p_occurrence_date IS NULL THEN
      RAISE EXCEPTION 'p_occurrence_date is required for scope=future'
        USING errcode = '22023';
    END IF;
    IF v_master.recurrence_rule = 'NONE' THEN
      RAISE EXCEPTION 'scope=future invalid for non-recurring break'
        USING errcode = '22023';
    END IF;

    -- Clamp old master so it stops the day before the occurrence.
    UPDATE public.barber_breaks
       SET recurrence_until = (p_occurrence_date - INTERVAL '1 day')::date
     WHERE id = p_break_id;

    -- Start a new master series from p_start_at onward with the new fields.
    INSERT INTO public.barber_breaks (
      salon_id, barber_id, start_at, end_at,
      reason_type, title,
      recurrence_rule, recurrence_until,
      notes
    ) VALUES (
      v_master.salon_id, v_master.barber_id,
      COALESCE(p_start_at, v_master.start_at),
      COALESCE(p_end_at,   v_master.end_at),
      COALESCE(p_reason_type, v_master.reason_type),
      p_title,
      COALESCE(p_recurrence_rule, v_master.recurrence_rule),
      p_recurrence_until,
      p_notes
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;

  ELSE  -- p_scope = 'one'
    IF p_occurrence_date IS NULL THEN
      RAISE EXCEPTION 'p_occurrence_date is required for scope=one'
        USING errcode = '22023';
    END IF;
    IF v_master.recurrence_rule = 'NONE' THEN
      RAISE EXCEPTION 'scope=one only valid for recurring breaks'
        USING errcode = '22023';
    END IF;

    -- Insert a child override row. start_at/end_at are taken from caller; if
    -- they did not move the time, they should still anchor on the occurrence
    -- date (caller is responsible for combining occurrence_date with the
    -- desired wall-time on the override).
    INSERT INTO public.barber_breaks (
      salon_id, barber_id, start_at, end_at,
      reason_type, title,
      recurrence_rule, recurrence_until,
      parent_break_id, is_exception_skip,
      notes
    ) VALUES (
      v_master.salon_id, v_master.barber_id,
      COALESCE(p_start_at, v_master.start_at),
      COALESCE(p_end_at,   v_master.end_at),
      COALESCE(p_reason_type, v_master.reason_type),
      p_title,
      'NONE',         -- the child override is itself a single occurrence
      NULL,
      p_break_id, false,
      p_notes
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_barber_break(
  uuid, text, date, timestamptz, timestamptz, text, text, text, date, text
) TO authenticated;

-- ===========================================================================
-- 3. delete_barber_break
--    p_scope ∈ ('one','future','all')
--      - 'all'    : DELETE master (cascades children).
--      - 'future' : set master.recurrence_until = (p_occurrence_date - 1d).
--      - 'one'    : INSERT tombstone child row (is_exception_skip = true)
--                   anchored on p_occurrence_date.
--    Returns the id of the affected row (master or tombstone).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.delete_barber_break(
  p_break_id        uuid,
  p_scope           text,
  p_occurrence_date date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master   public.barber_breaks%ROWTYPE;
  v_new_id   uuid;
  v_dur      interval;
  v_tomb_start timestamptz;
  v_tomb_end   timestamptz;
BEGIN
  IF p_scope NOT IN ('one','future','all') THEN
    RAISE EXCEPTION 'p_scope must be one of (one, future, all)'
      USING errcode = '22023';
  END IF;

  SELECT *
    INTO v_master
    FROM public.barber_breaks
   WHERE id = p_break_id;

  IF v_master.id IS NULL THEN
    RAISE EXCEPTION 'barber_break not found' USING errcode = '23503';
  END IF;

  IF NOT public.is_salon_member(v_master.salon_id) THEN
    RAISE EXCEPTION 'forbidden: not a salon member' USING errcode = '42501';
  END IF;

  IF p_scope = 'all' THEN
    DELETE FROM public.barber_breaks WHERE id = p_break_id;
    RETURN p_break_id;

  ELSIF p_scope = 'future' THEN
    IF p_occurrence_date IS NULL THEN
      RAISE EXCEPTION 'p_occurrence_date is required for scope=future'
        USING errcode = '22023';
    END IF;
    IF v_master.recurrence_rule = 'NONE' THEN
      RAISE EXCEPTION 'scope=future invalid for non-recurring break'
        USING errcode = '22023';
    END IF;

    UPDATE public.barber_breaks
       SET recurrence_until = (p_occurrence_date - INTERVAL '1 day')::date
     WHERE id = p_break_id;

    RETURN p_break_id;

  ELSE  -- p_scope = 'one'
    IF p_occurrence_date IS NULL THEN
      RAISE EXCEPTION 'p_occurrence_date is required for scope=one'
        USING errcode = '22023';
    END IF;
    IF v_master.recurrence_rule = 'NONE' THEN
      RAISE EXCEPTION 'scope=one only valid for recurring breaks'
        USING errcode = '22023';
    END IF;

    -- Build a tombstone anchored on the requested occurrence_date but keeping
    -- the master's wall-time-of-day window (so triggers / consistency checks
    -- see a row with end_at > start_at and the right barber/salon).
    v_dur        := v_master.end_at - v_master.start_at;
    v_tomb_start := (p_occurrence_date::timestamp + (v_master.start_at::time))
                    AT TIME ZONE current_setting('TIMEZONE');
    v_tomb_end   := v_tomb_start + v_dur;

    INSERT INTO public.barber_breaks (
      salon_id, barber_id, start_at, end_at,
      reason_type, title,
      recurrence_rule, recurrence_until,
      parent_break_id, is_exception_skip,
      notes
    ) VALUES (
      v_master.salon_id, v_master.barber_id, v_tomb_start, v_tomb_end,
      v_master.reason_type, v_master.title,
      'NONE', NULL,
      p_break_id, true,
      v_master.notes
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_barber_break(uuid, text, date)
  TO authenticated;

COMMIT;
