-- Migration 036: pg_cron story expiry cleanup
-- Hourly job that deletes expired stories and their storage files.

-- Enable pg_cron if not already (Supabase Pro has it available)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — story expiry cron not installed (requires Supabase Pro)';
END $$;

-- Cleanup function: deletes storage objects then story rows
CREATE OR REPLACE FUNCTION cleanup_expired_stories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired RECORD;
BEGIN
  FOR expired IN
    SELECT id, storage_path
    FROM stories
    WHERE expires_at <= NOW()
  LOOP
    -- Delete storage object if path is known
    IF expired.storage_path IS NOT NULL THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'stories'
        AND name = expired.storage_path;
    END IF;
  END LOOP;

  -- Delete expired story rows (CASCADE deletes story_views)
  DELETE FROM stories WHERE expires_at <= NOW();
END;
$$;

-- Schedule hourly at minute 0
DO $$
BEGIN
  PERFORM cron.schedule(
    'cleanup-expired-stories',
    '0 * * * *',
    'SELECT cleanup_expired_stories();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — skipping cron.schedule (requires Supabase Pro)';
END $$;
