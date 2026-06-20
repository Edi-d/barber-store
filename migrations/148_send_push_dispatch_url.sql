-- 148_send_push_dispatch_url.sql
-- Point the push-dispatch trigger at the real send-push Edge Function URL.
--
-- Migration 105 created `trg_notify_push_on_insert()` with a PLACEHOLDER host
-- (`https://<your-project-ref>.supabase.co/functions/v1/send-push`). With that
-- placeholder in place, every dispatch silently fails (the trigger swallows the
-- net.http_post error) so no device ever receives a push. This migration
-- replaces the function body with the live project URL.
--
-- Project ref: iaqztbhkukgghomwnict  (from EXPO_PUBLIC_SUPABASE_URL)
--
-- Safe to run whether or not migration 105 was applied: it CREATE OR REPLACEs
-- the function and (re)asserts the AFTER INSERT trigger on notification_log.
--
-- ── STILL REQUIRED MANUALLY (one-time, on the hosted DB) ────────────────────
--   1. Deploy the function:   supabase functions deploy send-push
--   2. Enable the extension:   CREATE EXTENSION IF NOT EXISTS pg_net;  (done below)
--   3. Set the service-role key GUC so the trigger can authenticate:
--        ALTER DATABASE postgres
--          SET app.settings.service_role_key = '<SERVICE_ROLE_KEY>';
--      then reconnect (GUC is read per-session).
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trg_notify_push_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_url     TEXT := 'https://iaqztbhkukgghomwnict.supabase.co/functions/v1/send-push';
    v_key     TEXT;
    v_headers JSONB;
BEGIN
    -- Only dispatch push-channel rows. In-app/email rows are handled elsewhere.
    IF NEW.channel IS DISTINCT FROM 'push' THEN
        RETURN NEW;
    END IF;

    -- Service-role key from:
    --   ALTER DATABASE postgres SET app.settings.service_role_key = '...';
    v_key := current_setting('app.settings.service_role_key', true);

    v_headers := jsonb_build_object('Content-Type', 'application/json');
    IF v_key IS NOT NULL AND length(v_key) > 0 THEN
        v_headers := v_headers || jsonb_build_object(
            'Authorization', 'Bearer ' || v_key
        );
    END IF;

    -- Fire-and-forget. pg_net queues and executes asynchronously.
    PERFORM net.http_post(
        url     := v_url,
        body    := jsonb_build_object(
            'type',   'INSERT',
            'table',  'notification_log',
            'schema', 'public',
            'record', to_jsonb(NEW)
        ),
        headers := v_headers
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Never block the insert because dispatch failed.
    RAISE WARNING 'send-push dispatch failed for notification_log.id=%: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Re-assert the trigger binding (idempotent — covers the case where mig 105
-- was never applied on this DB).
DROP TRIGGER IF EXISTS notification_log_send_push ON public.notification_log;
CREATE TRIGGER notification_log_send_push
    AFTER INSERT ON public.notification_log
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_push_on_insert();

COMMIT;
