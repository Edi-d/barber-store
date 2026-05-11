-- ============================================================================
-- DIAGNOSTIC: diag_salon_clients_count
-- ----------------------------------------------------------------------------
-- NOT A REGULAR MIGRATION. Leading underscore keeps this file at the top of
-- the migrations directory for visibility. Safe to run repeatedly.
--
-- Purpose: pinpoint exactly what's broken between the RLS chain and the
-- salon_clients count query. Compare what the caller can see through RLS vs.
-- what the raw data actually contains (via a SECURITY DEFINER sub-query).
--
-- Usage (see docs/diagnostic-run.md):
--   SELECT public.diag_salon_clients_count('<your-salon-uuid>');
-- ============================================================================

DROP FUNCTION IF EXISTS public.diag_salon_clients_count(uuid);

CREATE FUNCTION public.diag_salon_clients_count(p_salon_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER   -- IMPORTANT: runs as the caller. We want to see what RLS
                   -- actually allows for THIS user/role, not bypass it.
SET search_path = public
AS $$
DECLARE
  v_auth_uid                              uuid;
  v_salon_exists_visible                  boolean;
  v_salon_is_owner                        boolean;
  v_is_salon_member_returns               boolean;
  v_total_clients_via_select_with_rls     integer;
  v_consented_clients_via_select_with_rls integer;
  v_total_clients_via_security_definer    integer;
  v_consented_clients_via_security_definer integer;
BEGIN
  -- 1. Who is calling?
  v_auth_uid := auth.uid();

  -- 2. Can the caller SELECT the salon row? (tests RLS on salons)
  SELECT EXISTS (SELECT 1 FROM public.salons WHERE id = p_salon_id)
    INTO v_salon_exists_visible;

  -- 3. Is the caller the owner of this salon? (independent of RLS visibility)
  --    We read via a bypass query so we can answer even if RLS hides the row.
  SELECT EXISTS (
    SELECT 1
    FROM public.salons s
    WHERE s.id = p_salon_id
      AND s.owner_id = v_auth_uid
  )
    INTO v_salon_is_owner;

  -- 4. What does is_salon_member() (SECURITY DEFINER helper) return?
  BEGIN
    v_is_salon_member_returns := public.is_salon_member(p_salon_id);
  EXCEPTION WHEN OTHERS THEN
    v_is_salon_member_returns := NULL;
  END;

  -- 5. Counts via a regular SELECT — GOES THROUGH RLS as the caller's role.
  SELECT COUNT(*)::int
    INTO v_total_clients_via_select_with_rls
    FROM public.salon_clients
   WHERE salon_id = p_salon_id;

  SELECT COUNT(*)::int
    INTO v_consented_clients_via_select_with_rls
    FROM public.salon_clients
   WHERE salon_id = p_salon_id
     AND sms_marketing_consent = true;

  -- 6. Counts via an inline SECURITY DEFINER helper — BYPASSES RLS.
  --    This shows the ground-truth row count regardless of policy.
  SELECT total, consented
    INTO v_total_clients_via_security_definer,
         v_consented_clients_via_security_definer
    FROM public._diag_salon_clients_count_bypass(p_salon_id);

  RETURN jsonb_build_object(
    'authenticated_user_id',                   v_auth_uid,
    'salon_exists_visible',                    v_salon_exists_visible,
    'salon_is_owner',                          v_salon_is_owner,
    'is_salon_member_returns',                 v_is_salon_member_returns,
    'total_clients_via_select_with_rls',       v_total_clients_via_select_with_rls,
    'consented_clients_via_select_with_rls',   v_consented_clients_via_select_with_rls,
    'total_clients_via_security_definer',      v_total_clients_via_security_definer,
    'consented_clients_via_security_definer',  v_consented_clients_via_security_definer,
    'notes', jsonb_build_object(
      'auth_uid_is_null', (v_auth_uid IS NULL),
      'warning_if_null',
        'auth.uid() is NULL — you are running from an unauthenticated context '
        || '(e.g. SQL Editor as postgres/superuser). RLS-protected SELECTs will '
        || 'behave as anon. Call this RPC from the mobile app (or via PostgREST '
        || 'with a user JWT) for meaningful RLS results.'
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Internal SECURITY DEFINER helper that bypasses RLS so we can compare the
-- ground-truth counts against what the caller sees through RLS.
-- Not granted to anon — only callable from within diag_salon_clients_count.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._diag_salon_clients_count_bypass(uuid);

CREATE FUNCTION public._diag_salon_clients_count_bypass(p_salon_id uuid)
RETURNS TABLE (total int, consented int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::int FROM public.salon_clients
       WHERE salon_id = p_salon_id),
    (SELECT COUNT(*)::int FROM public.salon_clients
       WHERE salon_id = p_salon_id AND sms_marketing_consent = true);
$$;

REVOKE ALL ON FUNCTION public._diag_salon_clients_count_bypass(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public._diag_salon_clients_count_bypass(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.diag_salon_clients_count(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.diag_salon_clients_count(uuid) IS
  'Diagnostic RPC. Compares RLS-filtered counts against ground-truth counts '
  'to locate where the salon_clients count chain is breaking. See '
  'docs/diagnostic-run.md.';
