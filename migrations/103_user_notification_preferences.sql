-- ============================================================================
-- Migration 103 — Add push/email toggles to user_notification_prefs
-- ============================================================================
-- The table `user_notification_prefs` already exists (migration 060, loyalty
-- notifications). We add two general-purpose toggles used by
-- Setari > Preferinte:
--
--   * push_enabled          — master switch for push delivery
--   * email_reports_enabled — weekly / periodic report emails
--
-- Senders (push/email) should check these before delivering.
-- RLS already present on the table ("Users can manage own prefs").
-- ============================================================================

BEGIN;

ALTER TABLE public.user_notification_prefs
  ADD COLUMN IF NOT EXISTS push_enabled          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_reports_enabled boolean NOT NULL DEFAULT false;

COMMIT;
