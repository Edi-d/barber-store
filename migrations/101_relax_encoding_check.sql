-- Migration 101: Relax encoding CHECK to accept lowercase short form (gsm7/ucs2)
-- which is what the edge function sends.

BEGIN;

ALTER TABLE public.sms_campaigns
  DROP CONSTRAINT IF EXISTS sms_campaigns_encoding_check;

ALTER TABLE public.sms_campaigns
  ADD CONSTRAINT sms_campaigns_encoding_check
    CHECK (encoding IS NULL OR encoding IN ('GSM-7', 'UCS-2', 'gsm7', 'ucs2'));

COMMIT;
