-- Migration 036: Add storage_path column + pg_cron story expiry cleanup
-- Merged from original 036 (cron) and 037 (storage_path column).
-- Order matters: column must exist before the cleanup function references it.

-- ── Step 1: Add storage_path column ─────────────────────────────────────────
-- The storage_path stores the relative path within the 'stories' bucket
-- (e.g., '{user_id}/{timestamp}.jpg') so the cleanup function does not
-- need to parse the full public URL.

ALTER TABLE stories ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- ── Step 2: Backfill existing rows ───────────────────────────────────────────
-- Extract path from media_url.
-- Pattern: https://{project}.supabase.co/storage/v1/object/public/stories/{path}

UPDATE stories
SET storage_path = REGEXP_REPLACE(media_url, '^.*/storage/v1/object/public/stories/', '')
WHERE storage_path IS NULL AND media_url IS NOT NULL;

-- ── Step 3: Enable pg_cron ───────────────────────────────────────────────────
-- (Supabase Pro has it available; silently skips on free tier)

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — story expiry cron not installed (requires Supabase Pro)';
END $$;

-- ── Step 4: Cleanup function ─────────────────────────────────────────────────
-- Deletes storage objects then expired story rows.
-- storage_path column is guaranteed to exist at this point.

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

-- ── Step 5: Schedule hourly cron job ─────────────────────────────────────────

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
