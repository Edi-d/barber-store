-- ============================================
-- BarberApp - Live Stream Seed Data
-- ============================================
-- Adds viewers_count column and seed live entries
-- with cover images for the feed LiveSection UI.
-- ============================================

-- Add viewers_count column to lives table
ALTER TABLE lives ADD COLUMN IF NOT EXISTS viewers_count INT NOT NULL DEFAULT 0;

-- ============================================
-- CLEANUP existing seed lives (allows re-running)
-- ============================================
DELETE FROM lives WHERE id IN (
    'cc111111-1111-1111-1111-111111111111',
    'cc222222-2222-2222-2222-222222222222',
    'cc333333-3333-3333-3333-333333333333',
    'cc444444-4444-4444-4444-444444444444',
    'cc555555-5555-5555-5555-555555555555',
    'cc666666-6666-6666-6666-666666666666'
);

-- ============================================
-- SEED DATA - Placeholder Lives
-- ============================================
-- Uses the demo user (Edi Barber - creator) as host
-- These show up in the feed LiveSection permanently

INSERT INTO lives (id, host_id, title, cover_url, is_public, status, viewers_count, started_at) VALUES
(
    'cc111111-1111-1111-1111-111111111111',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'Join me, paint the arts 🎨',
    'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600',
    TRUE,
    'live',
    41600,
    NOW() - INTERVAL '5 minutes'
),
(
    'cc222222-2222-2222-2222-222222222222',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'Live Session, Let''s learn together 🔥',
    'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=600',
    TRUE,
    'live',
    21200,
    NOW() - INTERVAL '6 minutes'
),
(
    'cc333333-3333-3333-3333-333333333333',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'Fade Masterclass - Live Demo ✂️',
    'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600',
    TRUE,
    'live',
    15800,
    NOW() - INTERVAL '12 minutes'
),
(
    'cc444444-4444-4444-4444-444444444444',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'Beard Styling Session 💈',
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600',
    TRUE,
    'live',
    8900,
    NOW() - INTERVAL '18 minutes'
),
(
    'cc555555-5555-5555-5555-555555555555',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'Q&A - Cum să-ți deschizi un salon 🏪',
    'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600',
    TRUE,
    'live',
    5400,
    NOW() - INTERVAL '25 minutes'
),
(
    'cc666666-6666-6666-6666-666666666666',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'Classic Cuts Workshop 🎓',
    'https://images.unsplash.com/photo-1621607512214-68297480165e?w=600',
    TRUE,
    'live',
    3200,
    NOW() - INTERVAL '32 minutes'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    cover_url = EXCLUDED.cover_url,
    status = EXCLUDED.status,
    viewers_count = EXCLUDED.viewers_count,
    started_at = EXCLUDED.started_at;

-- ============================================
-- Done! 6 placeholder lives with cover images.
-- ============================================
