-- Migration 035: Add storage_path column for reliable cleanup
-- The storage_path stores the relative path within the 'stories' bucket
-- (e.g., '{user_id}/{timestamp}.jpg') so the cleanup function does not
-- need to parse the full public URL.

ALTER TABLE stories ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Backfill existing rows: extract path from media_url
-- Pattern: https://{project}.supabase.co/storage/v1/object/public/stories/{path}
UPDATE stories
SET storage_path = REGEXP_REPLACE(media_url, '^.*/storage/v1/object/public/stories/', '')
WHERE storage_path IS NULL AND media_url IS NOT NULL;
