-- ============================================================
-- 130_category_images.sql
--
-- Adds an optional image URL to marketplace_categories so the home
-- screen can render the category tile with a real product photo
-- (matching barber-store.ro's circular thumbnail layout) instead of
-- a generic icon. NULL is fine — the app falls back to a Feather
-- icon + tinted circle when no image is set.
--
-- The image is intended to be a square (~256x256) curated product
-- shot, NOT a full-bleed banner. Kept as a plain TEXT URL so the
-- existing storage pipeline (Supabase Storage bucket or external
-- CDN) can populate it without schema changes.
-- ============================================================

BEGIN;

ALTER TABLE marketplace_categories
    ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Optional: populate the new column for the seven top-level
-- categories with placeholder URLs the team can replace later.
-- Use ON CONFLICT-style UPDATE only when image_url is currently
-- NULL so re-running this doesn't blow away later edits.
UPDATE marketplace_categories
   SET image_url = NULL
 WHERE image_url IS NULL
   AND parent_id IS NULL;

COMMIT;
