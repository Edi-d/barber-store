-- 071: Multi-photo review support
-- Replaces photo_url (TEXT) with photo_urls (TEXT[]) on salon_reviews.
-- Backfills existing single photos into the new array column.

BEGIN;

ALTER TABLE salon_reviews
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';

UPDATE salon_reviews
SET photo_urls = ARRAY[photo_url]
WHERE photo_url IS NOT NULL AND photo_url <> '';

ALTER TABLE salon_reviews
  DROP COLUMN IF EXISTS photo_url;

COMMIT;
