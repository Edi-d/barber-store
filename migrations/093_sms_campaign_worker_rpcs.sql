-- Migration 093: Helper RPCs for process-campaign-batches edge function.
-- These wrap multi-statement SQL into single round-trips from the worker.
--
-- Depends on 091 (sms_campaigns, sms_campaign_recipients).
--
-- NOTE: Uses scalar subquery assignments to avoid Supabase SQL Editor
-- parse bug on `SELECT ... INTO` inside plpgsql.

BEGIN;

-- ============================================================
-- 1. claim_campaign_batch
-- ============================================================
-- Atomically claims up to p_limit pending recipients for a campaign,
-- marks them as 'processing', increments attempt, sets locked_at.
-- Returns the claimed rows so the worker can iterate them.
DROP FUNCTION IF EXISTS public.claim_campaign_batch(uuid, int);

CREATE FUNCTION public.claim_campaign_batch(
  p_campaign_id uuid,
  p_limit int DEFAULT 20
) RETURNS TABLE (
  id                   uuid,
  salon_client_id      uuid,
  phone_e164           text,
  personalized_message text,
  reservation_id       uuid,
  attempt              int,
  max_attempts         int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    SELECT r.id
      FROM public.sms_campaign_recipients r
     WHERE r.campaign_id = p_campaign_id
       AND r.status = 'pending'
     ORDER BY r.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sms_campaign_recipients r
     SET status     = 'processing',
         attempt    = r.attempt + 1,
         locked_at  = now()
    FROM claimed
   WHERE r.id = claimed.id
  RETURNING r.id, r.salon_client_id, r.phone_e164, r.personalized_message,
            r.reservation_id, r.attempt, r.max_attempts;
$$;

-- ============================================================
-- 2. reclaim_stuck_recipients
-- ============================================================
-- Returns 'processing' rows back to 'pending' if their locked_at is older
-- than p_stuck_threshold (default 5 minutes). Idempotent.
DROP FUNCTION IF EXISTS public.reclaim_stuck_recipients(interval);

CREATE FUNCTION public.reclaim_stuck_recipients(
  p_stuck_threshold interval DEFAULT interval '5 minutes'
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.sms_campaign_recipients
     SET status    = 'pending',
         locked_at = NULL
   WHERE status    = 'processing'
     AND locked_at < now() - p_stuck_threshold;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 3. finalize_campaign_state
-- ============================================================
-- Recomputes sent_count / failed_count on a campaign, updates status
-- based on remaining pending/processing rows, sets started_at +
-- completed_at as appropriate.
DROP FUNCTION IF EXISTS public.finalize_campaign_state(uuid);

CREATE FUNCTION public.finalize_campaign_state(
  p_campaign_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent      int;
  v_failed    int;
  v_opted_out int;
  v_pending   int;
  v_processing int;
  v_new_status text;
  v_completed_at timestamptz;
BEGIN
  v_sent       := (SELECT COUNT(*)::int FROM public.sms_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'sent');
  v_failed     := (SELECT COUNT(*)::int FROM public.sms_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'failed');
  v_opted_out  := (SELECT COUNT(*)::int FROM public.sms_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'opted_out');
  v_pending    := (SELECT COUNT(*)::int FROM public.sms_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'pending');
  v_processing := (SELECT COUNT(*)::int FROM public.sms_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'processing');

  IF v_pending > 0 OR v_processing > 0 THEN
    v_new_status := 'sending';
    v_completed_at := NULL;
  ELSIF v_sent = 0 AND v_failed > 0 THEN
    v_new_status := 'failed';
    v_completed_at := now();
  ELSE
    v_new_status := 'sent';
    v_completed_at := now();
  END IF;

  UPDATE public.sms_campaigns
     SET sent_count   = v_sent,
         failed_count = v_failed,
         started_at   = COALESCE(started_at, now()),
         status       = v_new_status,
         completed_at = COALESCE(completed_at, v_completed_at)
   WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'campaign_id',  p_campaign_id,
    'status',       v_new_status,
    'sent',         v_sent,
    'failed',       v_failed,
    'opted_out',    v_opted_out,
    'pending',      v_pending,
    'processing',   v_processing
  );
END;
$$;

-- ============================================================
-- Permissions
-- ============================================================
REVOKE ALL ON FUNCTION public.claim_campaign_batch(uuid, int)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reclaim_stuck_recipients(interval)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_campaign_state(uuid)            FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_campaign_batch(uuid, int)       TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_stuck_recipients(interval)    TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_campaign_state(uuid)         TO service_role;

COMMIT;
