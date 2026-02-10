-- ============================================
-- BarberApp - Follow System
-- ============================================
-- Creates the follows table for social features.
-- ============================================

-- ============================================
-- FOLLOWS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS follows (
    follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

-- Prevent self-follows
ALTER TABLE follows ADD CONSTRAINT no_self_follow CHECK (follower_id != following_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Everyone can see follow relationships
CREATE POLICY "Follows are viewable by everyone" ON follows
    FOR SELECT USING (true);

-- Users can follow others
CREATE POLICY "Users can create follows" ON follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Users can unfollow
CREATE POLICY "Users can delete own follows" ON follows
    FOR DELETE USING (auth.uid() = follower_id);

-- ============================================
-- Done! Follow system ready.
-- ============================================
