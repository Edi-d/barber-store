-- Migration 094: Remove STOP keyword enforcement from sms_campaigns.
-- Reason: opt-out handled via manual toggle in Clients UI instead of
-- SMS reply keyword (SMSAdvert standard plan has no inbound webhook).
-- Compliance: salon owner disables sms_marketing_consent per client on request.

BEGIN;

ALTER TABLE public.sms_campaigns
  DROP CONSTRAINT IF EXISTS sms_campaigns_message_body_check1;

-- Re-add only the length check (drop the regex check for 'stop').
ALTER TABLE public.sms_campaigns
  DROP CONSTRAINT IF EXISTS sms_campaigns_message_body_check;

ALTER TABLE public.sms_campaigns
  ADD CONSTRAINT sms_campaigns_message_body_length_check
    CHECK (char_length(message_body) BETWEEN 1 AND 459);

COMMIT;
