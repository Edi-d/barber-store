-- ============================================
-- BarberApp - Storage Buckets
-- ============================================
-- Run this in Supabase SQL Editor after creating the buckets
-- Or create buckets manually in Supabase Dashboard > Storage

-- Note: Bucket creation is typically done via the Supabase Dashboard
-- or using the Supabase CLI. This file documents the bucket configuration.

-- ============================================
-- BUCKET: avatars
-- ============================================
-- Purpose: User profile avatars
-- Access: Public read, authenticated users can upload their own

-- Create bucket (run in Supabase Dashboard or CLI):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- ============================================
-- BUCKET: content
-- ============================================
-- Purpose: Feed content (videos, thumbnails)
-- Access: Public read, creators can upload

-- Create bucket:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('content', 'content', true);

-- ============================================
-- BUCKET: course_media
-- ============================================
-- Purpose: Course covers, lesson videos
-- Access: Public read, admins can upload

-- Create bucket:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('course_media', 'course_media', true);

-- ============================================
-- BUCKET: product_images
-- ============================================
-- Purpose: Product images for shop
-- Access: Public read, admins can upload

-- Create bucket:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('product_images', 'product_images', true);

-- ============================================
-- STORAGE POLICIES (Basic - without RLS)
-- ============================================
-- These are permissive policies for MVP
-- In production, add proper RLS policies

-- Avatars: Anyone can read, authenticated users can upload/update their own
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
);

-- Content: Public read, creators can upload
CREATE POLICY "Content is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'content');

CREATE POLICY "Authenticated users can upload content"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'content' 
  AND auth.role() = 'authenticated'
);

-- Course media: Public read
CREATE POLICY "Course media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'course_media');

-- Product images: Public read
CREATE POLICY "Product images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'product_images');
