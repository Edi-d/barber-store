-- Migration 100: Add missing columns used by create-sms-campaign edge function.
-- Migration 091 had these under different names/missed them.

BEGIN;

-- recipient_filter (jsonb) — snapshot of recipient filter used (mode, days, client_ids)
ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS recipient_filter jsonb;

-- Copy from target_filter if that column exists (backfill).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'sms_campaigns'
       AND column_name  = 'target_filter'
  ) THEN
    EXECUTE 'UPDATE public.sms_campaigns SET recipient_filter = target_filter WHERE recipient_filter IS NULL AND target_filter IS NOT NULL';
  END IF;
END$$;

-- error column used by update when campaign fails
ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS error text;

COMMIT;
