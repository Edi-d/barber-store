-- Migration 102: Add sms_campaigns.queued_at (set when transitioning from draft to queued).
BEGIN;
ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS queued_at timestamptz;
COMMIT;
