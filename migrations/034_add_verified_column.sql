-- ============================================================================
-- Migration 034: Add Verified Column to Profiles
-- ============================================================================
-- Adds a `verified` boolean column to the profiles table.
-- This column is referenced by social feed queries (use-social-feed.ts)
-- to display verification badges on user profiles and posts.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
