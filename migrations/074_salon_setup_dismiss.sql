-- Migration 074: Salon setup checklist dismiss
-- Allows owners to dismiss the salon setup checklist manually.
-- Idempotent: can be run multiple times without error.

-- =====================================================================
-- 1. Add setup_dismissed_at column on public.salons
-- =====================================================================
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS setup_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.salons.setup_dismissed_at IS
  'Timestamp when salon owner manually dismissed the setup checklist. NULL = checklist still visible.';

-- =====================================================================
-- 2. RPC dismiss_salon_setup()
-- =====================================================================
DROP FUNCTION IF EXISTS public.dismiss_salon_setup();

CREATE OR REPLACE FUNCTION public.dismiss_salon_setup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_salon_id UUID;
  v_dismissed_at TIMESTAMPTZ;
BEGIN
  -- Resolve current user
  v_user_id := (SELECT auth.uid());

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

  IF v_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_not_found';
  END IF;

  -- Mark dismissed now
  UPDATE public.salons
  SET setup_dismissed_at = NOW()
  WHERE id = v_salon_id;

  v_dismissed_at := (
    SELECT setup_dismissed_at
    FROM public.salons
    WHERE id = v_salon_id
    LIMIT 1
  );

  RETURN jsonb_build_object(
    'dismissed_at', v_dismissed_at,
    'salon_id', v_salon_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_salon_setup() TO authenticated;

COMMENT ON FUNCTION public.dismiss_salon_setup() IS
  'Marks the current owner''s salon setup checklist as dismissed. Returns { dismissed_at, salon_id }.';

-- =====================================================================
-- 3. RPC restore_salon_setup()
-- =====================================================================
DROP FUNCTION IF EXISTS public.restore_salon_setup();

CREATE OR REPLACE FUNCTION public.restore_salon_setup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_salon_id UUID;
BEGIN
  -- Resolve current user
  v_user_id := (SELECT auth.uid());

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

  IF v_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_not_found';
  END IF;

  -- Clear dismissed flag
  UPDATE public.salons
  SET setup_dismissed_at = NULL
  WHERE id = v_salon_id;

  RETURN jsonb_build_object(
    'dismissed_at', NULL,
    'salon_id', v_salon_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_salon_setup() TO authenticated;

COMMENT ON FUNCTION public.restore_salon_setup() IS
  'Restores the current owner''s salon setup checklist (sets setup_dismissed_at = NULL). Returns { dismissed_at, salon_id }.';
