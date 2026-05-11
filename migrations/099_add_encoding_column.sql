-- Migration 099: Add sms_campaigns.encoding column (GSM-7 or UCS-2).
-- create-sms-campaign edge function writes this but migration 091 forgot it.

BEGIN;

ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS encoding text
    CHECK (encoding IS NULL OR encoding IN ('GSM-7', 'UCS-2'));

COMMIT;
