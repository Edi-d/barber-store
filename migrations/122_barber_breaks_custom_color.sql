-- Migration 122: Custom color override for barber_breaks
--
-- Problem: today the visual color of a break is dictated by reason_type
-- (vacation = green, lunch = amber, etc.). Salon owners asked to be able
-- to override this per-break to match their internal coding (e.g. red for
-- "wedding day off", blue for "supplier visit", etc.).
--
-- Solution:
--   1. Add `color text NULL` to barber_breaks. NULL means "use the
--      reason_type default" (current behavior, preserved for all existing
--      rows). When set, the value is a hex like '#E53935' that the UI
--      renders in place of the reason-type color.
--   2. Light format CHECK so we don't allow arbitrary garbage strings.
--   3. Extend the create/update RPCs with a `p_color text` parameter,
--      forwarded into the column. Both RPCs default to NULL when the
--      caller omits the argument (Supabase positional-call friendly).

BEGIN;

-- ===========================================================================
-- 1. Schema — add the column with a soft format check
-- ===========================================================================
ALTER TABLE public.barber_breaks
  ADD COLUMN IF NOT EXISTS color text NULL;

ALTER TABLE public.barber_breaks
  DROP CONSTRAINT IF EXISTS barber_breaks_color_format_check;

ALTER TABLE public.barber_breaks
  ADD CONSTRAINT barber_breaks_color_format_check
    CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

-- ===========================================================================
-- 2. RPC: create_barber_break — extend with p_color
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
  p_notes             text,
  p_color             text DEFAULT NULL
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_barber_id uuid;
  v_new_ids   uuid[] := ARRAY[]::uuid[];
  v_new_id    uuid;
BEGIN
  IF NOT public.is_salon_member(p_salon_id) THEN
    RAISE EXCEPTION 'forbidden: not a salon member' USING errcode = '42501';
  END IF;

  IF array_length(p_barber_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_barber_ids must contain at least one barber'
      USING errcode = '22023';
  END IF;

  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'end_at must be after start_at' USING errcode = '22023';
  END IF;

  -- Validate every barber belongs to the salon — single query, no n+1.
  IF EXISTS (
    SELECT 1
      FROM unnest(p_barber_ids) AS bid
     WHERE NOT EXISTS (
       SELECT 1 FROM public.barbers b
        WHERE b.id = bid AND b.salon_id = p_salon_id
     )
  ) THEN
    RAISE EXCEPTION 'one or more barbers do not belong to this salon'
      USING errcode = '23503';
  END IF;

  -- Insert one row per barber.
  FOREACH v_barber_id IN ARRAY p_barber_ids LOOP
    INSERT INTO public.barber_breaks (
      salon_id, barber_id, start_at, end_at,
      reason_type, title, recurrence_rule, recurrence_until,
      notes, color
    )
    VALUES (
      p_salon_id, v_barber_id, p_start_at, p_end_at,
      p_reason_type, p_title, p_recurrence_rule, p_recurrence_until,
      p_notes, p_color
    )
    RETURNING id INTO v_new_id;

    v_new_ids := array_append(v_new_ids, v_new_id);
  END LOOP;

  RETURN v_new_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_barber_break(
  uuid, uuid[], timestamptz, timestamptz, text, text, text, date, text, text
) TO authenticated;

-- ===========================================================================
-- 3. RPC: update_barber_break — extend with p_color
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
  p_notes             text,
  p_color             text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master       public.barber_breaks%ROWTYPE;
  v_new_id       uuid;
  v_occ_start    timestamptz;
  v_occ_end      timestamptz;
BEGIN
  IF p_scope NOT IN ('one', 'future', 'all') THEN
    RAISE EXCEPTION 'p_scope must be one of (one, future, all)' USING errcode = '22023';
  END IF;

  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'end_at must be after start_at' USING errcode = '22023';
  END IF;

  -- Locate the master row + RLS gate.
  SELECT * INTO v_master FROM public.barber_breaks WHERE id = p_break_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'break not found' USING errcode = '23503';
  END IF;

  IF NOT public.is_salon_member(v_master.salon_id) THEN
    RAISE EXCEPTION 'forbidden: not a salon member' USING errcode = '42501';
  END IF;

  IF p_scope = 'all' THEN
    UPDATE public.barber_breaks
       SET start_at         = p_start_at,
           end_at           = p_end_at,
           reason_type      = p_reason_type,
           title            = p_title,
           recurrence_rule  = p_recurrence_rule,
           recurrence_until = p_recurrence_until,
           notes            = p_notes,
           color            = p_color,
           updated_at       = now()
     WHERE id = p_break_id;
    RETURN p_break_id;

  ELSIF p_scope = 'future' THEN
    -- Trim master series and start a new one from p_start_at onward.
    IF p_occurrence_date IS NULL THEN
      RAISE EXCEPTION 'p_occurrence_date is required for scope=future' USING errcode = '22023';
    END IF;
    UPDATE public.barber_breaks
       SET recurrence_until = p_occurrence_date - 1,
           updated_at       = now()
     WHERE id = p_break_id;

    INSERT INTO public.barber_breaks (
      salon_id, barber_id, start_at, end_at,
      reason_type, title, recurrence_rule, recurrence_until,
      notes, color
    )
    VALUES (
      v_master.salon_id, v_master.barber_id, p_start_at, p_end_at,
      p_reason_type, p_title, p_recurrence_rule, p_recurrence_until,
      p_notes, p_color
    )
    RETURNING id INTO v_new_id;
    RETURN v_new_id;

  ELSE
    -- scope = 'one' — child override of a single occurrence.
    IF p_occurrence_date IS NULL THEN
      RAISE EXCEPTION 'p_occurrence_date is required for scope=one' USING errcode = '22023';
    END IF;

    -- Anchor the occurrence on its date, preserving the master's wall-time.
    v_occ_start := (p_occurrence_date::text || ' ' ||
                    to_char(p_start_at, 'HH24:MI:SS'))::timestamptz
                    AT TIME ZONE current_setting('TIMEZONE');
    v_occ_end   := (p_occurrence_date::text || ' ' ||
                    to_char(p_end_at,   'HH24:MI:SS'))::timestamptz
                    AT TIME ZONE current_setting('TIMEZONE');

    INSERT INTO public.barber_breaks (
      salon_id, barber_id, start_at, end_at,
      reason_type, title, recurrence_rule, recurrence_until,
      parent_break_id, is_exception_skip,
      notes, color
    )
    VALUES (
      v_master.salon_id, v_master.barber_id, v_occ_start, v_occ_end,
      p_reason_type, p_title, 'NONE', NULL,
      p_break_id, false,
      p_notes, p_color
    )
    RETURNING id INTO v_new_id;
    RETURN v_new_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_barber_break(
  uuid, text, date, timestamptz, timestamptz, text, text, text, date, text, text
) TO authenticated;

COMMIT;
