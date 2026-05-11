-- ============================================
-- Tapzi Barber — SMS / Email delivery webhooks
-- ============================================
-- Adds delivery-state columns to `usage_events` (so we can distinguish
-- "we sent it to the provider" from "the provider actually handed it off
-- to the carrier/mailbox") and creates a raw `delivery_events_log` table
-- to persist every inbound webhook payload for debugging + forensics.
--
-- Handled providers:
--   - 'smsadvert'  → SMS delivery receipts (sms-delivery-webhook)
--   - 'brevo'      → Email delivery / bounce events (email-delivery-webhook)
--
-- Design notes
--   * `usage_events.external_ref` already stores the provider message-id
--     (set by `confirm_usage` from send-email / send-sms). We look rows
--     up by (external_ref, sku-prefix).
--   * We keep a full raw payload in `delivery_events_log` so we can
--     replay or audit later — the ledger columns are a materialized
--     summary, not the source of truth.
--   * The log table is append-only; RLS denies all client access
--     (service-role only, matching the edge-function pattern).
-- ============================================

-- ---------------------------------------------------------------
-- 1. Ledger columns on usage_events
-- ---------------------------------------------------------------
ALTER TABLE public.usage_events
    ADD COLUMN IF NOT EXISTS delivered_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failed_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failure_reason   TEXT,
    ADD COLUMN IF NOT EXISTS delivery_status  TEXT
        CHECK (delivery_status IN (
            'pending', 'delivered', 'failed', 'expired',
            'bounced', 'soft_bounced', 'complained', 'unsubscribed'
        ));

-- Fast lookup by provider message id (already the natural key for
-- inbound webhooks). Partial index keeps it small — only rows that
-- actually have an external_ref (confirmed sends) qualify.
CREATE INDEX IF NOT EXISTS idx_usage_events_external_ref
    ON public.usage_events (external_ref)
    WHERE external_ref IS NOT NULL;

COMMENT ON COLUMN public.usage_events.delivered_at IS
    'Set when the provider confirms delivery (SMSAdvert DLR = delivered, Brevo event = delivered).';
COMMENT ON COLUMN public.usage_events.failed_at IS
    'Set when the provider reports permanent failure (hard bounce, rejected, expired).';
COMMENT ON COLUMN public.usage_events.failure_reason IS
    'Provider-supplied reason code / message, truncated to ~500 chars.';
COMMENT ON COLUMN public.usage_events.delivery_status IS
    'Latest terminal delivery state from the provider DLR pipeline.';

-- ---------------------------------------------------------------
-- 2. Raw event log
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_events_log (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        TEXT         NOT NULL
        CHECK (provider IN ('smsadvert', 'brevo')),
    channel         TEXT         NOT NULL
        CHECK (channel IN ('sms', 'email')),
    event_type      TEXT         NOT NULL,   -- 'delivered' | 'failed' | 'bounced' | raw provider event name
    external_ref    TEXT,                    -- provider message-id (matches usage_events.external_ref)
    recipient       TEXT,                    -- phone or email (for debugging; never exposed to client)
    usage_event_id  UUID         REFERENCES public.usage_events(id) ON DELETE SET NULL,
    payload         JSONB        NOT NULL,   -- full raw body from provider
    error           TEXT,                    -- any handler-side error (if processing threw)
    processed_at    TIMESTAMPTZ,             -- set when handler finished (NULL if still in flight)
    received_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_log_provider_received_at
    ON public.delivery_events_log (provider, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_events_log_external_ref
    ON public.delivery_events_log (external_ref)
    WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_events_log_usage_event
    ON public.delivery_events_log (usage_event_id)
    WHERE usage_event_id IS NOT NULL;

-- Backwards-compatible alias requested by spec.
-- Keeps the old name `sms_delivery_log` pointing at the unified table so
-- existing docs / scripts don't break.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'sms_delivery_log'
    ) THEN
        EXECUTE $v$
            CREATE VIEW public.sms_delivery_log AS
              SELECT *
              FROM public.delivery_events_log
              WHERE channel = 'sms'
        $v$;
    END IF;
END $$;

-- ---------------------------------------------------------------
-- 3. RLS — service-role only
-- ---------------------------------------------------------------
ALTER TABLE public.delivery_events_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_events_log_deny_all ON public.delivery_events_log;
CREATE POLICY delivery_events_log_deny_all
    ON public.delivery_events_log
    FOR ALL
    USING (FALSE)
    WITH CHECK (FALSE);

COMMENT ON TABLE public.delivery_events_log IS
    'Raw DLR / webhook events from SMSAdvert + Brevo. Service-role only.';
