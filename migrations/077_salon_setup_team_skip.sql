-- ============================================
-- Tapzi Barber — "Invite team later" skip flag
-- ============================================
-- Adds setup_team_skipped_at to salons, plus two RPCs that toggle the flag
-- (skip / unskip) and updates get_salon_setup_progress to respect it:
--   - steps.team.skipped = true when the column is non-null
--   - the team step counts as "done" for percent calculation so the user
--     can still reach 100% without onboarding staff
--   - the root payload includes team_skipped_at so the client can hide the
--     card or show a subtle "reactivate" affordance
-- ============================================

-- 1. Column
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS setup_team_skipped_at TIMESTAMPTZ;

-- 2. Skip RPC
DROP FUNCTION IF EXISTS public.skip_salon_setup_team();

CREATE FUNCTION public.skip_salon_setup_team()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_salon_id UUID;
    v_ts TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    v_salon_id := (
        SELECT id FROM public.salons
        WHERE owner_id = v_user_id
        LIMIT 1
    );
    IF v_salon_id IS NULL THEN
        RAISE EXCEPTION 'salon_not_found';
    END IF;

    v_ts := NOW();

    UPDATE public.salons
    SET setup_team_skipped_at = v_ts
    WHERE id = v_salon_id;

    RETURN jsonb_build_object(
        'salon_id', v_salon_id,
        'team_skipped_at', v_ts
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.skip_salon_setup_team() TO authenticated;

-- 3. Unskip RPC
DROP FUNCTION IF EXISTS public.unskip_salon_setup_team();

CREATE FUNCTION public.unskip_salon_setup_team()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_salon_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    v_salon_id := (
        SELECT id FROM public.salons
        WHERE owner_id = v_user_id
        LIMIT 1
    );
    IF v_salon_id IS NULL THEN
        RAISE EXCEPTION 'salon_not_found';
    END IF;

    UPDATE public.salons
    SET setup_team_skipped_at = NULL
    WHERE id = v_salon_id;

    RETURN jsonb_build_object(
        'salon_id', v_salon_id,
        'team_skipped_at', NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unskip_salon_setup_team() TO authenticated;

-- 4. Patched get_salon_setup_progress — replaces the version from migration 075.
DROP FUNCTION IF EXISTS public.get_salon_setup_progress();

CREATE FUNCTION public.get_salon_setup_progress()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_salon_id UUID;
    v_dismissed_at TIMESTAMPTZ;
    v_team_skipped_at TIMESTAMPTZ;

    v_profile_done BOOLEAN;
    v_services_done BOOLEAN;
    v_hours_done BOOLEAN;
    v_team_done BOOLEAN;
    v_team_done_effective BOOLEAN;

    v_services_count INT;
    v_hours_count INT;
    v_team_count INT;

    v_completed_count INT;
    v_total_count INT;
    v_percent INT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    -- Three scalar subqueries instead of `SELECT ... INTO var1, var2, var3`
    -- because Supabase SQL Editor's parser mis-reads the multi-target INTO
    -- syntax inside function bodies and raises "relation v_salon_id does not
    -- exist". Performance-equivalent (same row, same PK index lookup).
    v_salon_id := (
        SELECT id FROM public.salons
        WHERE owner_id = v_user_id
        LIMIT 1
    );
    v_dismissed_at := (
        SELECT setup_dismissed_at FROM public.salons
        WHERE owner_id = v_user_id
        LIMIT 1
    );
    v_team_skipped_at := (
        SELECT setup_team_skipped_at FROM public.salons
        WHERE owner_id = v_user_id
        LIMIT 1
    );

    IF v_salon_id IS NULL THEN
        RETURN jsonb_build_object(
            'salon_id', NULL,
            'steps', jsonb_build_object(),
            'completed_count', 0,
            'total_count', 4,
            'percent', 0,
            'dismissed_at', NULL,
            'team_skipped_at', NULL
        );
    END IF;

    -- profile: avatar_url + description + address
    v_profile_done := (
        SELECT (avatar_url IS NOT NULL)
           AND (description IS NOT NULL AND LENGTH(TRIM(description)) > 0)
           AND (address IS NOT NULL AND LENGTH(TRIM(address)) > 0)
        FROM public.salons WHERE id = v_salon_id
    );

    -- services: any active barber_services row for this salon
    BEGIN
        v_services_count := (
            SELECT COUNT(*)::INT
            FROM public.barber_services
            WHERE salon_id = v_salon_id
              AND COALESCE(active, TRUE) = TRUE
        );
    EXCEPTION WHEN undefined_table OR undefined_column THEN
        v_services_count := 0;
    END;

    v_services_done := v_services_count > 0;

    -- hours: at least one day marked is_open
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

    -- team: non-owner members
    v_team_count := (
        SELECT COUNT(*)::INT
        FROM public.salon_members
        WHERE salon_id = v_salon_id
          AND role <> 'owner'
    );
    v_team_done := v_team_count > 0;

    -- Effective team-done counts the skip flag so percent can reach 100.
    v_team_done_effective := v_team_done OR v_team_skipped_at IS NOT NULL;

    v_total_count := 4;
    v_completed_count :=
        (CASE WHEN v_profile_done THEN 1 ELSE 0 END)
      + (CASE WHEN v_services_done THEN 1 ELSE 0 END)
      + (CASE WHEN v_hours_done THEN 1 ELSE 0 END)
      + (CASE WHEN v_team_done_effective THEN 1 ELSE 0 END);

    v_percent := ((v_completed_count * 100) / v_total_count)::INT;

    RETURN jsonb_build_object(
        'salon_id', v_salon_id,
        'steps', jsonb_build_object(
            'profile', jsonb_build_object(
                'done', v_profile_done,
                'hint', 'Adauga poza si descriere'
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
                'count', v_team_count,
                'skipped', v_team_skipped_at IS NOT NULL
            )
        ),
        'completed_count', v_completed_count,
        'total_count', v_total_count,
        'percent', v_percent,
        'dismissed_at', v_dismissed_at,
        'team_skipped_at', v_team_skipped_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_salon_setup_progress() TO authenticated;
