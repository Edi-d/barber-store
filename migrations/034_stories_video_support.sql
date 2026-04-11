-- ============================================================================
-- Migration 033: Stories Video Support
-- ============================================================================
-- Ensures stories storage bucket exists and supports video uploads.
-- Also adds video-specific columns if missing.
-- ============================================================================

-- Create stories bucket if not exists (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'stories',
  'stories',
  true,
  52428800, -- 50MB limit for video
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];

-- Add duration column to stories (for video stories)
ALTER TABLE stories ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

-- Add thumbnail_url for video story thumbnails
ALTER TABLE stories ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
