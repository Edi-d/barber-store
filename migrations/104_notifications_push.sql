-- 104_notifications_push.sql
-- Extend notification_log for push delivery (i18n keys, params, deep links, read state)
-- Reference: tr-passport-medic migrations 00024

-- ============================================================================
-- Migration 104 — Push notification delivery scaffolding
-- ============================================================================
-- Extends the existing `notification_log` table (created in migration 060)
-- with the fields needed for:
--   * i18n delivery (title_key / body_key / params)
--   * deep-linking (deep_link, priority, arbitrary data payload)
--   * in-app inbox (is_read, read_at) plus plain title/body fallbacks
--
-- Also verifies `push_tokens` has the columns the mobile client writes
-- (user_id, token, platform, active, updated_at) and ensures the
-- (user_id, token) unique constraint is present for upsert onConflict.
--
-- Triggers and pg_cron jobs are intentionally NOT installed here — that is
-- Agent 6's scope (wave 2).
-- ============================================================================

BEGIN;

-- ─── 1. EXTEND notification_log ────────────────────────────────────────────

ALTER TABLE public.notification_log
    ADD COLUMN IF NOT EXISTS title_key  TEXT,
    ADD COLUMN IF NOT EXISTS body_key   TEXT,
    ADD COLUMN IF NOT EXISTS params     JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS deep_link  TEXT,
    ADD COLUMN IF NOT EXISTS priority   SMALLINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS data       JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS read_at    TIMESTAMPTZ;

-- `title` and `body` already exist (migration 060) as nullable TEXT — they
-- serve as fallbacks when no i18n key is provided. Make sure both columns
-- exist (no-op on fresh schemas, safe on older forks).
ALTER TABLE public.notification_log
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS body  TEXT;

-- ─── 2. VERIFY push_tokens SCHEMA ──────────────────────────────────────────
-- Migration 060 created push_tokens with (user_id, token, platform, active,
-- created_at, updated_at) plus UNIQUE(user_id, token). The client upserts
-- with onConflict 'user_id,token' so the unique constraint is required.
-- Also add device_id and app_version for multi-device telemetry (mirrors the
-- tr-passport-medic device_push_tokens schema).

ALTER TABLE public.push_tokens
    ADD COLUMN IF NOT EXISTS device_id    TEXT,
    ADD COLUMN IF NOT EXISTS app_version  TEXT,
    ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();

-- Ensure the UNIQUE(user_id, token) constraint exists. It was declared in
-- migration 060 as an inline UNIQUE, but re-assert defensively so that forks
-- or partial rollouts still satisfy the client's onConflict upsert.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'push_tokens'
          AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) ILIKE '%(user_id, token)%'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'push_tokens'
          AND indexname = 'push_tokens_user_id_token_key'
    ) THEN
        ALTER TABLE public.push_tokens
            ADD CONSTRAINT push_tokens_user_id_token_key UNIQUE (user_id, token);
    END IF;
END $$;

-- ─── 3. RLS POLICIES on notification_log ───────────────────────────────────
-- Migration 060 already enabled RLS and created SELECT + INSERT + UPDATE
-- policies. Here we replace them with a stricter set that also allows DELETE
-- by the owning user, and keeps UPDATE owner-scoped (for marking read).
-- The server (service_role) bypasses RLS for inserts/sends.

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification log" ON public.notification_log;
DROP POLICY IF EXISTS "notification_log_select_own"        ON public.notification_log;
CREATE POLICY "notification_log_select_own" ON public.notification_log
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "System can update notification log" ON public.notification_log;
DROP POLICY IF EXISTS "notification_log_update_own"        ON public.notification_log;
CREATE POLICY "notification_log_update_own" ON public.notification_log
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_log_delete_own" ON public.notification_log;
CREATE POLICY "notification_log_delete_own" ON public.notification_log
    FOR DELETE USING (user_id = auth.uid());

-- NOTE: The "System can insert notification log" policy from migration 060 is
-- intentionally kept (service_role / SECURITY DEFINER writers rely on it).
-- Clients never insert directly.

-- ─── 4. INDEXES ────────────────────────────────────────────────────────────
-- Existing indexes from migration 060 (kept intact):
--   idx_notification_log_user           ON (user_id, sent_at DESC)
--   idx_notification_log_effectiveness  ON (type, sent_at) WHERE opened_at IS NOT NULL
--
-- The inbox screen queries unread counts; add a partial index that uses
-- sent_at (the existing timestamp column in this schema — there is no
-- created_at on notification_log).

CREATE INDEX IF NOT EXISTS idx_notification_log_user_unread
    ON public.notification_log (user_id, sent_at DESC)
    WHERE is_read = FALSE;

-- ─── 5. REALTIME PUBLICATION ───────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notification_log'
    ) THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_log;
        EXCEPTION WHEN duplicate_object THEN
            -- already added by a concurrent migration; ignore
            NULL;
        END;
    END IF;
END $$;

COMMIT;
