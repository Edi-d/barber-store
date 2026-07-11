-- ============================================================================
-- Migration 159: Push-token device exclusivity — stop cross-account leakage
-- ============================================================================
-- A push token identifies a physical DEVICE, but `push_tokens` is keyed
-- UNIQUE(user_id, token) and the mobile client only ever INSERTed rows, never
-- deactivated them (deactivatePushToken was dead code). So a device that logged
-- in as user A and later logged out (or switched to user B) left the row
-- (A, <device token>, active = true) behind — and send-push fans A's
-- notifications out to EVERY active token under A, hitting that device forever,
-- even while it's logged out. (See utils/push-notifications.ts + the send-push
-- Edge Function, which resolves recipients by user_id AND active = true.)
--
-- This migration adds the server-side half of the fix:
--   1. register_push_token() — SECURITY DEFINER RPC that atomically claims a
--      device token for the current user AND revokes it from every OTHER user,
--      so a device is active for at most one account at a time. RLS forbids a
--      client from touching another user's rows, which is why this must be a
--      SECURITY DEFINER function rather than a plain client upsert.
--   2. One-time backfill — collapse existing duplicates: when the same token is
--      active under multiple users, keep only the most-recently-updated row
--      active and deactivate the rest.
--
-- The client complement (call this RPC on login; deactivate on logout) ships in
-- utils/push-notifications.ts + stores/authStore.ts.
--
-- SAFETY / SHARED PROJECT: additive + idempotent. Nothing existing is dropped or
-- altered besides (re)creating this feature's own function. The backfill only
-- flips stale duplicate rows to active = false — it never deletes a row.
-- ============================================================================

BEGIN;

-- ── 1. register_push_token — claim a device token exclusively for the caller ──
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token    text,
  p_platform text DEFAULT 'expo'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '42501';
  END IF;
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RAISE EXCEPTION 'invalid_token' USING errcode = '22023';
  END IF;

  -- Revoke this device token from every OTHER account. This is the line that
  -- kills the leak: the previous owner of the device stops receiving pushes the
  -- moment a new account claims the same token.
  UPDATE public.push_tokens
     SET active = false, updated_at = now()
   WHERE token = p_token
     AND user_id <> v_user
     AND active = true;

  -- Claim it (active) for the caller.
  INSERT INTO public.push_tokens (user_id, token, platform, active, updated_at)
  VALUES (v_user, p_token,
          COALESCE(NULLIF(btrim(p_platform), ''), 'expo'), true, now())
  ON CONFLICT (user_id, token)
  DO UPDATE SET active     = true,
                platform   = EXCLUDED.platform,
                updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated;

-- ── 2. One-time backfill: dedupe tokens active under multiple users ───────────
-- Keyed on (user_id, token) rather than an id column so it holds regardless of
-- the table's PK shape. Keep the most-recently-updated active row per token.
WITH ranked AS (
  SELECT user_id, token,
         row_number() OVER (
           PARTITION BY token
           ORDER BY updated_at DESC NULLS LAST
         ) AS rn
    FROM public.push_tokens
   WHERE active = true
)
UPDATE public.push_tokens pt
   SET active = false, updated_at = now()
  FROM ranked r
 WHERE pt.user_id = r.user_id
   AND pt.token   = r.token
   AND r.rn > 1;

COMMIT;
