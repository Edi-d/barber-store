-- ============================================================================
-- Migration 161: Fix push dispatch auth — read the bearer from Vault, not a GUC
-- ============================================================================
-- The push-dispatch trigger `trg_notify_push_on_insert()` POSTs every
-- notification_log INSERT to the send-push Edge Function with an
-- `Authorization: Bearer <secret>` header. send-push authenticates that bearer
-- against SEND_PUSH_SECRET.
--
-- Migration 148 rewrote the trigger to read the secret from the Postgres GUC
-- `app.settings.service_role_key`. On MANAGED Supabase that GUC can't be set
-- (`ALTER DATABASE ... SET` is forbidden), so `current_setting(...)` returns
-- NULL, the trigger sends NO Authorization header, and send-push 401s every
-- dispatch. Confirmed live on 2026-07-11: GUC = NULL, dispatch calls 401.
--
-- This restores migration 105's approach: read the secret from Supabase Vault
-- (`vault.decrypted_secrets`, name = 'service_role_key' — which holds the
-- SEND_PUSH_SECRET value) and send it as the bearer. The secret value never
-- appears in this migration. The Vault lookup is wrapped so a missing secret /
-- no read access degrades to "no auth header" instead of aborting the insert.
--
-- URL is unchanged from 148 (the live send-push endpoint). Trigger binding is
-- re-asserted idempotently.
--
-- SAFETY / SHARED PROJECT: additive + idempotent (CREATE OR REPLACE only).
-- ============================================================================

BEGIN;

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

    -- Bearer secret from Vault (holds the SEND_PUSH_SECRET value the Edge
    -- Function checks). Wrapped so a missing secret degrades to "no auth header"
    -- rather than aborting the notification_log insert.
    BEGIN
        SELECT decrypted_secret INTO v_key
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_key := NULL;
    END;

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

-- Re-assert the trigger binding (idempotent).
DROP TRIGGER IF EXISTS notification_log_send_push ON public.notification_log;
CREATE TRIGGER notification_log_send_push
    AFTER INSERT ON public.notification_log
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_push_on_insert();

COMMIT;
