-- Migration 075: Salon setup progress RPC
-- Returns a structured JSONB with the current owner's salon setup progress,
-- broken down into steps (profile, services, hours, team) so the UI can render
-- a checklist with completed/total counts and a percent.
-- Idempotent: safe to run multiple times.

-- =====================================================================
-- RPC get_salon_setup_progress()
-- =====================================================================
DROP FUNCTION IF EXISTS public.get_salon_setup_progress();

CREATE OR REPLACE FUNCTION public.get_salon_setup_progress()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_salon_id UUID;
  v_avatar_url TEXT;
  v_description TEXT;
  v_bio TEXT;
  v_address TEXT;
  v_dismissed_at TIMESTAMPTZ;
  v_profile_done BOOLEAN;
  v_services_count INT;
  v_hours_count INT;
  v_team_count INT;
  v_services_done BOOLEAN;
  v_hours_done BOOLEAN;
  v_team_done BOOLEAN;
  v_completed_count INT;
  v_total_count INT;
  v_percent INT;
BEGIN
  -- Auth guard
  v_user_id := (SELECT auth.uid());
s
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Find salon owned by current user
  v_salon_id := (
    SELECT id
    FROM public.salons
    WHERE owner_id = v_user_id
    LIMIT 1
  );

  -- No salon yet: return minimal payload (not an error)
  IF v_salon_id IS NULL THEN
    RETURN jsonb_build_object('salon_id', NULL);
  END IF;

  -- Load salon profile fields
  v_avatar_url := (SELECT avatar_url FROM public.salons WHERE id = v_salon_id);
  v_description := (SELECT description FROM public.salons WHERE id = v_salon_id);
  v_bio := (SELECT bio FROM public.salons WHERE id = v_salon_id);
  v_address := (SELECT address FROM public.salons WHERE id = v_salon_id);
  v_dismissed_at := (SELECT setup_dismissed_at FROM public.salons WHERE id = v_salon_id);

  -- profile done: avatar + (description OR bio) + address all present
  v_profile_done := (
    v_avatar_url IS NOT NULL
    AND (v_description IS NOT NULL OR v_bio IS NOT NULL)
    AND v_address IS NOT NULL
  );

  -- services: stored in barber_services scoped by salon_id
  BEGIN
    v_services_count := (
      SELECT COUNT(*)::INT
      FROM public.barber_services
      WHERE salon_id = v_salon_id
    );
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_services_count := 0;
  END;

  v_services_done := v_services_count > 0;

  -- hours: salon_hours with is_open = TRUE
  BEGIN
    v_hours_count := (
      SELECT COUNT(*)::INT
      FROM public.salon_hours
      WHERE salon_id = v_salon_id
        AND is_open = TRUE
    );
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_hours_count := 0;
  END;

  v_hours_done := v_hours_count > 0;

  -- team: salon_members with role <> 'owner'
  v_team_count := (
    SELECT COUNT(*)::INT
    FROM public.salon_members
    WHERE salon_id = v_salon_id
      AND role <> 'owner'
  );

  v_team_done := v_team_count > 0;

  -- Totals
  v_total_count := 4;
  v_completed_count :=
    (CASE WHEN v_profile_done THEN 1 ELSE 0 END)
    + (CASE WHEN v_services_done THEN 1 ELSE 0 END)
    + (CASE WHEN v_hours_done THEN 1 ELSE 0 END)
    + (CASE WHEN v_team_done THEN 1 ELSE 0 END);

  v_percent := ((v_completed_count * 100) / v_total_count)::INT;

  RETURN jsonb_build_object(
    'salon_id', v_salon_id,
    'steps', jsonb_build_object(
      'profile', jsonb_build_object(
        'done', v_profile_done,
        'hint', 'Adaugati poza si descriere'
      ),
      'services', jsonb_build_object(
        'done', v_services_done,
        'count', v_services_count
      ),
      'hours', jsonb_build_object(
        'done', v_hours_done,
        'count', v_hours_count
      ),
      'team', jsonb_build_object(
        'done', v_team_done,
        'count', v_team_count
      )
    ),
    'completed_count', v_completed_count,
    'total_count', v_total_count,
    'percent', v_percent,
    'dismissed_at', v_dismissed_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_salon_setup_progress() TO authenticated;

COMMENT ON FUNCTION public.get_salon_setup_progress() IS
  'Returns the current owner''s salon setup progress as JSONB with per-step done flags, counts, completed_count/total_count/percent, and dismissed_at. Returns { salon_id: null } if the user has no salon.';
