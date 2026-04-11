-- ============================================
-- Migration 022: Salon Media Storage & RLS
-- ============================================
-- Creates the salon-media storage bucket and
-- adds proper RLS policies for salon_photos
-- table and storage objects.
-- ============================================

-- ============================================
-- 1. CREATE salon-media STORAGE BUCKET
-- ============================================
-- Purpose: Salon gallery images (photos, cover images)
-- Access: Public read, salon owners can upload/delete

INSERT INTO storage.buckets (id, name, public)
VALUES ('salon-media', 'salon-media', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. STORAGE POLICIES for salon-media bucket
-- ============================================

-- Anyone can view salon media (public read for display)
DROP POLICY IF EXISTS "Salon media is publicly accessible" ON storage.objects;
CREATE POLICY "Salon media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'salon-media');

-- Salon owners can upload to their salon's folder
-- Path convention: salons/{salon_id}/filename
DROP POLICY IF EXISTS "Salon owners can upload media" ON storage.objects;
CREATE POLICY "Salon owners can upload media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'salon-media'
    AND auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM salons s
        WHERE s.owner_id = auth.uid()
        AND (storage.foldername(name))[1] = 'salons'
        AND (storage.foldername(name))[2] = s.id::TEXT
    )
);

-- Salon owners can update their salon's files
DROP POLICY IF EXISTS "Salon owners can update media" ON storage.objects;
CREATE POLICY "Salon owners can update media"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'salon-media'
    AND auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM salons s
        WHERE s.owner_id = auth.uid()
        AND (storage.foldername(name))[1] = 'salons'
        AND (storage.foldername(name))[2] = s.id::TEXT
    )
);

-- Salon owners can delete their salon's files
DROP POLICY IF EXISTS "Salon owners can delete media" ON storage.objects;
CREATE POLICY "Salon owners can delete media"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'salon-media'
    AND auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM salons s
        WHERE s.owner_id = auth.uid()
        AND (storage.foldername(name))[1] = 'salons'
        AND (storage.foldername(name))[2] = s.id::TEXT
    )
);

-- ============================================
-- 3. RLS POLICIES for salon_photos table
-- ============================================
-- RLS is already enabled from migration 010.
-- SELECT policy already exists; add INSERT,
-- UPDATE, and DELETE for salon owners.

-- SELECT: everyone can view (already exists from 010, re-create for safety)
DROP POLICY IF EXISTS "Salon photos viewable by everyone" ON salon_photos;
CREATE POLICY "Salon photos viewable by everyone"
ON salon_photos FOR SELECT
USING (true);

-- INSERT: salon owner only
DROP POLICY IF EXISTS "Salon owner can add photos" ON salon_photos;
CREATE POLICY "Salon owner can add photos"
ON salon_photos FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM salons s
        WHERE s.id = salon_id
        AND s.owner_id = auth.uid()
    )
);

-- UPDATE: salon owner only
DROP POLICY IF EXISTS "Salon owner can update photos" ON salon_photos;
CREATE POLICY "Salon owner can update photos"
ON salon_photos FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM salons s
        WHERE s.id = salon_id
        AND s.owner_id = auth.uid()
    )
);

-- DELETE: salon owner only
DROP POLICY IF EXISTS "Salon owner can delete photos" ON salon_photos;
CREATE POLICY "Salon owner can delete photos"
ON salon_photos FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM salons s
        WHERE s.id = salon_id
        AND s.owner_id = auth.uid()
    )
);

-- ============================================
-- 4. ENSURE created_at COLUMN on salon_photos
-- ============================================
-- Column exists from migration 010, but ensure
-- it is present if table was created differently.

ALTER TABLE salon_photos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- Done! Salon media storage and RLS ready.
-- ============================================
