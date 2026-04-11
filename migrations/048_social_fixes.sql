-- ============================================
-- Social fixes: add missing columns & buckets
-- ============================================

-- 1. Add updated_at to content (needed by edit-post)
ALTER TABLE content ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 2. Add missing social columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count INT NOT NULL DEFAULT 0;

-- 3. Ensure storage buckets exist (were commented out in 002)
INSERT INTO storage.buckets (id, name, public)
VALUES ('content', 'content', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
