-- ============================================
-- BarberApp - Live Stream Seed Data
-- ============================================
-- Adds viewers_count column and seed live entries
-- with cover images for the feed LiveSection UI.
-- ============================================

-- Add viewers_count column to lives table
ALTER TABLE lives ADD COLUMN IF NOT EXISTS viewers_count INT NOT NULL DEFAULT 0;

-- ============================================
-- Seed data removed — live streams are fully dynamic.
-- ============================================
