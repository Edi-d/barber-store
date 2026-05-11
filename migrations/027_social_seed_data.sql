-- ============================================================================
-- Migration 027: Social Seed Data
-- ============================================================================
-- Seeds likes, comments (with threading), follows, bookmarks, stories,
-- and notifications for the 6 existing content posts.
-- ============================================================================

-- Demo user: ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2
-- Content:   e1111111..e6666666 (all by demo user)

-- ─── 1. HELPER: Create fake auth users + profiles for social interactions ──
-- profiles.id references auth.users(id), so we must create auth.users first.
-- These are seed-only accounts (no real password/email login).

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data)
VALUES
('11111111-aaaa-bbbb-cccc-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'andrei.vlad@seed.local', crypt('seed-password-123', gen_salt('bf')), NOW(), NOW(), NOW(), '', '{"provider":"email","providers":["email"]}', '{}'),
('22222222-aaaa-bbbb-cccc-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maria.popescu@seed.local', crypt('seed-password-123', gen_salt('bf')), NOW(), NOW(), NOW(), '', '{"provider":"email","providers":["email"]}', '{}'),
('33333333-aaaa-bbbb-cccc-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ion.dumitrescu@seed.local', crypt('seed-password-123', gen_salt('bf')), NOW(), NOW(), NOW(), '', '{"provider":"email","providers":["email"]}', '{}'),
('44444444-aaaa-bbbb-cccc-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'elena.marin@seed.local', crypt('seed-password-123', gen_salt('bf')), NOW(), NOW(), NOW(), '', '{"provider":"email","providers":["email"]}', '{}'),
('55555555-aaaa-bbbb-cccc-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'radu.stanescu@seed.local', crypt('seed-password-123', gen_salt('bf')), NOW(), NOW(), NOW(), '', '{"provider":"email","providers":["email"]}', '{}'),
('66666666-aaaa-bbbb-cccc-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana.constantinescu@seed.local', crypt('seed-password-123', gen_salt('bf')), NOW(), NOW(), NOW(), '', '{"provider":"email","providers":["email"]}', '{}'),
('77777777-aaaa-bbbb-cccc-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bogdan.popa@seed.local', crypt('seed-password-123', gen_salt('bf')), NOW(), NOW(), NOW(), '', '{"provider":"email","providers":["email"]}', '{}'),
('88888888-aaaa-bbbb-cccc-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cristina.lazar@seed.local', crypt('seed-password-123', gen_salt('bf')), NOW(), NOW(), NOW(), '', '{"provider":"email","providers":["email"]}', '{}')
ON CONFLICT (id) DO NOTHING;

-- Now create matching profiles (username is required, display_name is optional)
INSERT INTO profiles (id, username, display_name, avatar_url) VALUES
('11111111-aaaa-bbbb-cccc-111111111111', 'andrei.vlad', 'Andrei Vlad', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200'),
('22222222-aaaa-bbbb-cccc-222222222222', 'maria.popescu', 'Maria Popescu', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200'),
('33333333-aaaa-bbbb-cccc-333333333333', 'ion.dumitrescu', 'Ion Dumitrescu', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200'),
('44444444-aaaa-bbbb-cccc-444444444444', 'elena.marin', 'Elena Marin', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200'),
('55555555-aaaa-bbbb-cccc-555555555555', 'radu.stanescu', 'Radu Stanescu', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200'),
('66666666-aaaa-bbbb-cccc-666666666666', 'ana.constantinescu', 'Ana Constantinescu', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'),
('77777777-aaaa-bbbb-cccc-777777777777', 'bogdan.popa', 'Bogdan Popa', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200'),
('88888888-aaaa-bbbb-cccc-888888888888', 'cristina.lazar', 'Cristina Lazăr', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200')
ON CONFLICT (id) DO NOTHING;

-- ─── 2. LIKES (spread across all 6 posts) ───────────────────────────────────

-- Post 1: Skin fade tutorial — very popular (6 likes)
INSERT INTO likes (user_id, content_id) VALUES
('11111111-aaaa-bbbb-cccc-111111111111', 'e1111111-1111-1111-1111-111111111111'),
('22222222-aaaa-bbbb-cccc-222222222222', 'e1111111-1111-1111-1111-111111111111'),
('33333333-aaaa-bbbb-cccc-333333333333', 'e1111111-1111-1111-1111-111111111111'),
('44444444-aaaa-bbbb-cccc-444444444444', 'e1111111-1111-1111-1111-111111111111'),
('55555555-aaaa-bbbb-cccc-555555555555', 'e1111111-1111-1111-1111-111111111111'),
('66666666-aaaa-bbbb-cccc-666666666666', 'e1111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- Post 2: Textured crop — popular (5 likes)
INSERT INTO likes (user_id, content_id) VALUES
('11111111-aaaa-bbbb-cccc-111111111111', 'e2222222-2222-2222-2222-222222222222'),
('22222222-aaaa-bbbb-cccc-222222222222', 'e2222222-2222-2222-2222-222222222222'),
('33333333-aaaa-bbbb-cccc-333333333333', 'e2222222-2222-2222-2222-222222222222'),
('55555555-aaaa-bbbb-cccc-555555555555', 'e2222222-2222-2222-2222-222222222222'),
('77777777-aaaa-bbbb-cccc-777777777777', 'e2222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

-- Post 3: Beard trim (4 likes)
INSERT INTO likes (user_id, content_id) VALUES
('22222222-aaaa-bbbb-cccc-222222222222', 'e3333333-3333-3333-3333-333333333333'),
('44444444-aaaa-bbbb-cccc-444444444444', 'e3333333-3333-3333-3333-333333333333'),
('66666666-aaaa-bbbb-cccc-666666666666', 'e3333333-3333-3333-3333-333333333333'),
('88888888-aaaa-bbbb-cccc-888888888888', 'e3333333-3333-3333-3333-333333333333')
ON CONFLICT DO NOTHING;

-- Post 4: Setup image (5 likes)
INSERT INTO likes (user_id, content_id) VALUES
('11111111-aaaa-bbbb-cccc-111111111111', 'e4444444-4444-4444-4444-444444444444'),
('33333333-aaaa-bbbb-cccc-333333333333', 'e4444444-4444-4444-4444-444444444444'),
('55555555-aaaa-bbbb-cccc-555555555555', 'e4444444-4444-4444-4444-444444444444'),
('77777777-aaaa-bbbb-cccc-777777777777', 'e4444444-4444-4444-4444-444444444444'),
('88888888-aaaa-bbbb-cccc-888888888888', 'e4444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;

-- Post 5: Fade Masterclass snippet (3 likes)
INSERT INTO likes (user_id, content_id) VALUES
('22222222-aaaa-bbbb-cccc-222222222222', 'e5555555-5555-5555-5555-555555555555'),
('44444444-aaaa-bbbb-cccc-444444444444', 'e5555555-5555-5555-5555-555555555555'),
('66666666-aaaa-bbbb-cccc-666666666666', 'e5555555-5555-5555-5555-555555555555')
ON CONFLICT DO NOTHING;

-- Post 6: Pompadour (4 likes)
INSERT INTO likes (user_id, content_id) VALUES
('11111111-aaaa-bbbb-cccc-111111111111', 'e6666666-6666-6666-6666-666666666666'),
('33333333-aaaa-bbbb-cccc-333333333333', 'e6666666-6666-6666-6666-666666666666'),
('55555555-aaaa-bbbb-cccc-555555555555', 'e6666666-6666-6666-6666-666666666666'),
('88888888-aaaa-bbbb-cccc-888888888888', 'e6666666-6666-6666-6666-666666666666')
ON CONFLICT DO NOTHING;

-- ─── 3. COMMENTS (with threading) ──────────────────────────────────────────

-- Post 1: Skin fade tutorial — 4 comments (2 top-level + 2 replies)
INSERT INTO comments (id, content_id, user_id, text, created_at) VALUES
('c0000001-0001-0001-0001-000000000001', 'e1111111-1111-1111-1111-111111111111', '11111111-aaaa-bbbb-cccc-111111111111',
 'Fade-ul asta e impecabil! Ce mașină ai folosit?', NOW() - INTERVAL '2 hours'),
('c0000001-0001-0001-0001-000000000002', 'e1111111-1111-1111-1111-111111111111', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2',
 'Wahl Legend, cea mai bună pentru fade-uri. Mersi!', NOW() - INTERVAL '1 hour 50 minutes'),
('c0000001-0001-0001-0001-000000000003', 'e1111111-1111-1111-1111-111111111111', '33333333-aaaa-bbbb-cccc-333333333333',
 'Tutorial super bine explicat, bravo! 🔥', NOW() - INTERVAL '1 hour 30 minutes'),
('c0000001-0001-0001-0001-000000000004', 'e1111111-1111-1111-1111-111111111111', '22222222-aaaa-bbbb-cccc-222222222222',
 'Am încercat și eu, rezultatul e top!', NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- Thread reply: comment 2 replies to comment 1
UPDATE comments SET parent_id = 'c0000001-0001-0001-0001-000000000001'
WHERE id = 'c0000001-0001-0001-0001-000000000002';

-- Post 2: Textured crop — 3 comments
INSERT INTO comments (id, content_id, user_id, text, created_at) VALUES
('c0000002-0002-0002-0002-000000000001', 'e2222222-2222-2222-2222-222222222222', '55555555-aaaa-bbbb-cccc-555555555555',
 'Transformare incredibilă! Cât durează de obicei?', NOW() - INTERVAL '5 hours'),
('c0000002-0002-0002-0002-000000000002', 'e2222222-2222-2222-2222-222222222222', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2',
 'Cam 45-50 de minute cu tot cu spălat și styling.', NOW() - INTERVAL '4 hours 45 minutes'),
('c0000002-0002-0002-0002-000000000003', 'e2222222-2222-2222-2222-222222222222', '77777777-aaaa-bbbb-cccc-777777777777',
 'Vreau și eu textured crop la următoarea programare!', NOW() - INTERVAL '3 hours')
ON CONFLICT (id) DO NOTHING;

UPDATE comments SET parent_id = 'c0000002-0002-0002-0002-000000000001'
WHERE id = 'c0000002-0002-0002-0002-000000000002';

-- Post 3: Beard trim — 2 comments
INSERT INTO comments (id, content_id, user_id, text, created_at) VALUES
('c0000003-0003-0003-0003-000000000001', 'e3333333-3333-3333-3333-333333333333', '44444444-aaaa-bbbb-cccc-444444444444',
 'Ce produse ai folosit pentru styling-ul bărbii?', NOW() - INTERVAL '8 hours'),
('c0000003-0003-0003-0003-000000000002', 'e3333333-3333-3333-3333-333333333333', '66666666-aaaa-bbbb-cccc-666666666666',
 'Barba arată fenomenal, conturul e perfect!', NOW() - INTERVAL '7 hours')
ON CONFLICT (id) DO NOTHING;

-- Post 4: Setup image — 3 comments
INSERT INTO comments (id, content_id, user_id, text, created_at) VALUES
('c0000004-0004-0004-0004-000000000001', 'e4444444-4444-4444-4444-444444444444', '88888888-aaaa-bbbb-cccc-888888888888',
 'Ce curat și organizat! Foarte profesional.', NOW() - INTERVAL '12 hours'),
('c0000004-0004-0004-0004-000000000002', 'e4444444-4444-4444-4444-444444444444', '11111111-aaaa-bbbb-cccc-111111111111',
 'De unde ai luat suportul ăla pentru mașini? Arată super!', NOW() - INTERVAL '11 hours'),
('c0000004-0004-0004-0004-000000000003', 'e4444444-4444-4444-4444-444444444444', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2',
 'De pe Amazon, caut link-ul și revin!', NOW() - INTERVAL '10 hours 30 minutes')
ON CONFLICT (id) DO NOTHING;

UPDATE comments SET parent_id = 'c0000004-0004-0004-0004-000000000002'
WHERE id = 'c0000004-0004-0004-0004-000000000003';

-- Post 5: Fade Masterclass snippet — 2 comments
INSERT INTO comments (id, content_id, user_id, text, created_at) VALUES
('c0000005-0005-0005-0005-000000000001', 'e5555555-5555-5555-5555-555555555555', '22222222-aaaa-bbbb-cccc-222222222222',
 'Abia aștept cursul complet! Când apare?', NOW() - INTERVAL '1 day'),
('c0000005-0005-0005-0005-000000000002', 'e5555555-5555-5555-5555-555555555555', '44444444-aaaa-bbbb-cccc-444444444444',
 'Snippet-ul arată genial, cursul sigur va fi de top!', NOW() - INTERVAL '20 hours')
ON CONFLICT (id) DO NOTHING;

-- Post 6: Pompadour — 3 comments (1 top-level + 1 reply + 1 top-level)
INSERT INTO comments (id, content_id, user_id, text, created_at) VALUES
('c0000006-0006-0006-0006-000000000001', 'e6666666-6666-6666-6666-666666666666', '33333333-aaaa-bbbb-cccc-333333333333',
 'Classic pompadour! Ce fixativ recomanzi?', NOW() - INTERVAL '2 days'),
('c0000006-0006-0006-0006-000000000002', 'e6666666-6666-6666-6666-666666666666', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2',
 'Uppercut Deluxe Pomade — ține toată ziua!', NOW() - INTERVAL '1 day 23 hours'),
('c0000006-0006-0006-0006-000000000003', 'e6666666-6666-6666-6666-666666666666', '55555555-aaaa-bbbb-cccc-555555555555',
 'Low fade-ul e perfect combinat cu pompadour-ul. Clasă!', NOW() - INTERVAL '1 day 20 hours')
ON CONFLICT (id) DO NOTHING;

UPDATE comments SET parent_id = 'c0000006-0006-0006-0006-000000000001'
WHERE id = 'c0000006-0006-0006-0006-000000000002';

-- ─── 4. FOLLOWS (diverse follow relationships) ─────────────────────────────

INSERT INTO follows (follower_id, following_id) VALUES
-- Many people follow the demo user (content creator)
('11111111-aaaa-bbbb-cccc-111111111111', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2'),
('22222222-aaaa-bbbb-cccc-222222222222', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2'),
('33333333-aaaa-bbbb-cccc-333333333333', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2'),
('44444444-aaaa-bbbb-cccc-444444444444', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2'),
('55555555-aaaa-bbbb-cccc-555555555555', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2'),
('66666666-aaaa-bbbb-cccc-666666666666', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2'),
('77777777-aaaa-bbbb-cccc-777777777777', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2'),
('88888888-aaaa-bbbb-cccc-888888888888', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2'),
-- Demo user follows some people back
('ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', '11111111-aaaa-bbbb-cccc-111111111111'),
('ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', '33333333-aaaa-bbbb-cccc-333333333333'),
('ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', '55555555-aaaa-bbbb-cccc-555555555555'),
-- Cross-follows between users
('11111111-aaaa-bbbb-cccc-111111111111', '33333333-aaaa-bbbb-cccc-333333333333'),
('33333333-aaaa-bbbb-cccc-333333333333', '11111111-aaaa-bbbb-cccc-111111111111'),
('22222222-aaaa-bbbb-cccc-222222222222', '44444444-aaaa-bbbb-cccc-444444444444'),
('55555555-aaaa-bbbb-cccc-555555555555', '77777777-aaaa-bbbb-cccc-777777777777'),
('66666666-aaaa-bbbb-cccc-666666666666', '88888888-aaaa-bbbb-cccc-888888888888')
ON CONFLICT DO NOTHING;

-- ─── 5. BOOKMARKS (demo user bookmarks some posts) ─────────────────────────

INSERT INTO bookmarks (user_id, content_id) VALUES
('11111111-aaaa-bbbb-cccc-111111111111', 'e1111111-1111-1111-1111-111111111111'),
('11111111-aaaa-bbbb-cccc-111111111111', 'e4444444-4444-4444-4444-444444444444'),
('22222222-aaaa-bbbb-cccc-222222222222', 'e2222222-2222-2222-2222-222222222222'),
('33333333-aaaa-bbbb-cccc-333333333333', 'e1111111-1111-1111-1111-111111111111'),
('33333333-aaaa-bbbb-cccc-333333333333', 'e6666666-6666-6666-6666-666666666666'),
('44444444-aaaa-bbbb-cccc-444444444444', 'e3333333-3333-3333-3333-333333333333'),
('55555555-aaaa-bbbb-cccc-555555555555', 'e5555555-5555-5555-5555-555555555555'),
('ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'e1111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- ─── 6. STORIES (active stories for demo user) ─────────────────────────────

INSERT INTO stories (id, author_id, media_url, type, expires_at, created_at) VALUES
('fa111111-1111-1111-1111-111111111111', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2',
 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'image',
 NOW() + INTERVAL '20 hours', NOW() - INTERVAL '4 hours'),
('fa222222-2222-2222-2222-222222222222', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2',
 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800', 'image',
 NOW() + INTERVAL '18 hours', NOW() - INTERVAL '6 hours'),
('fa333333-3333-3333-3333-333333333333', '11111111-aaaa-bbbb-cccc-111111111111',
 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'image',
 NOW() + INTERVAL '22 hours', NOW() - INTERVAL '2 hours'),
('fa444444-4444-4444-4444-444444444444', '33333333-aaaa-bbbb-cccc-333333333333',
 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'image',
 NOW() + INTERVAL '16 hours', NOW() - INTERVAL '8 hours'),
('fa555555-5555-5555-5555-555555555555', '55555555-aaaa-bbbb-cccc-555555555555',
 'https://images.unsplash.com/photo-1621607512214-68297480165e?w=800', 'image',
 NOW() + INTERVAL '12 hours', NOW() - INTERVAL '12 hours')
ON CONFLICT (id) DO NOTHING;

-- Story views
INSERT INTO story_views (story_id, viewer_id, viewed_at) VALUES
('fa111111-1111-1111-1111-111111111111', '11111111-aaaa-bbbb-cccc-111111111111', NOW() - INTERVAL '3 hours'),
('fa111111-1111-1111-1111-111111111111', '22222222-aaaa-bbbb-cccc-222222222222', NOW() - INTERVAL '2 hours'),
('fa111111-1111-1111-1111-111111111111', '33333333-aaaa-bbbb-cccc-333333333333', NOW() - INTERVAL '1 hour'),
('fa222222-2222-2222-2222-222222222222', '44444444-aaaa-bbbb-cccc-444444444444', NOW() - INTERVAL '5 hours'),
('fa333333-3333-3333-3333-333333333333', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', NOW() - INTERVAL '1 hour'),
('fa444444-4444-4444-4444-444444444444', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', NOW() - INTERVAL '7 hours')
ON CONFLICT DO NOTHING;

-- ─── 7. UPDATE DENORMALIZED COUNTS ──────────────────────────────────────────
-- The triggers from migration 015 will fire on each INSERT above,
-- but let's ensure counts are correct with a final backfill.

UPDATE content SET
    likes_count = (SELECT COUNT(*) FROM likes WHERE likes.content_id = content.id),
    comments_count = (SELECT COUNT(*) FROM comments WHERE comments.content_id = content.id);

UPDATE profiles SET
    followers_count = (SELECT COUNT(*) FROM follows WHERE follows.following_id = profiles.id),
    following_count = (SELECT COUNT(*) FROM follows WHERE follows.follower_id = profiles.id);

-- ============================================================================
-- DONE! Social seed data inserted.
-- Summary:
--   8 social user profiles
--   27 likes across 6 posts
--   17 comments (with 4 threaded replies)
--   16 follow relationships (8 followers for demo user)
--   8 bookmarks
--   5 stories (with 6 views)
--   Notifications auto-generated by triggers
-- ============================================================================
