-- ============================================================================
-- Migration 062: Loyalty System — Seed Data (SALON PERSPECTIVE)
-- ============================================================================
-- Seed data from the SALON OWNER's perspective:
--   - The owner (Darius) does NOT have a loyalty profile — he runs the salon
--   - Seed users (11111111..88888888) are CLIENTS with loyalty profiles
--   - Rewards, challenges, events are created BY the salon FOR clients
--   - KPIs, analytics, churn risk are what the owner sees in admin dashboard
-- ============================================================================

-- Fixed UUIDs from 028_dive_software_salon_seed.sql:
--   Owner:    977ea6ba-065f-4e8c-ae1f-8f35fa1c690b  (Darius Dobrota) — NO loyalty profile
--   Salon:    bbb00000-d10e-0000-0000-000000000001
--   Barbers:  bbb00000-d10e-0001-0000-000000000001..004
--   Services: bbb00000-d10e-0002-0000-000000000001..010
--   Clients:  11111111..88888888-aaaa-bbbb-cccc-*

-- ============================================================================
-- 0. CLEANUP (reverse FK order)
-- ============================================================================
ALTER TABLE point_transactions DISABLE TRIGGER trg_point_transactions_immutable_delete;
ALTER TABLE point_transactions DISABLE TRIGGER trg_point_transactions_immutable_update;

DELETE FROM event_participations WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM loyalty_events WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM point_multipliers WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM streak_rewards WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM loyalty_streaks WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM referral_claims WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM referral_codes WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM user_challenges WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM challenges WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM loyalty_vouchers WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM rewards_catalog WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM user_achievements WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM achievements WHERE id::TEXT LIKE 'bbb00000-d10e-00d0%';
DELETE FROM user_personalization WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM point_transactions WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM loyalty_profiles WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM loyalty_tiers WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM loyalty_settings WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';

ALTER TABLE point_transactions ENABLE TRIGGER trg_point_transactions_immutable_delete;
ALTER TABLE point_transactions ENABLE TRIGGER trg_point_transactions_immutable_update;

-- ============================================================================
-- 1. LOYALTY SETTINGS (salon config — set by owner)
-- ============================================================================
INSERT INTO loyalty_settings (salon_id, points_per_ron, welcome_bonus, referral_bonus_referrer, referral_bonus_referee, points_expire_months, max_daily_earn, enabled)
VALUES ('bbb00000-d10e-0000-0000-000000000001', 10, 50, 500, 200, 12, 5000, TRUE);

-- ============================================================================
-- 2. LOYALTY TIERS (configured by salon)
-- ============================================================================
INSERT INTO loyalty_tiers (id, salon_id, name, slug, color, min_lifetime_points, multiplier, perks, sort_order, active) VALUES
('bbb00000-d10e-00a0-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001', 'Clipper', 'clipper', '#8E8E93', 0, 1.00,
  '[{"label": "Acumulezi puncte", "description": "Castigi puncte la fiecare vizita"}]'::JSONB, 0, TRUE),
('bbb00000-d10e-00a0-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001', 'Blade', 'blade', '#0A84FF', 5000, 1.20,
  '[{"label": "1.2x multiplicator", "description": "Castigi 20% mai multe puncte"}, {"label": "1 inghetare streak", "description": "O inghetare streak pe trimestru"}]'::JSONB, 1, TRUE),
('bbb00000-d10e-00a0-0000-000000000003', 'bbb00000-d10e-0000-0000-000000000001', 'Sharp', 'sharp', '#FFD60A', 15000, 1.50,
  '[{"label": "1.5x multiplicator", "description": "Castigi 50% mai multe puncte"}, {"label": "2 inghetari streak", "description": "Doua inghetari pe trimestru"}, {"label": "Recompense exclusive", "description": "Acces la premii speciale"}]'::JSONB, 2, TRUE),
('bbb00000-d10e-00a0-0000-000000000004', 'bbb00000-d10e-0000-0000-000000000001', 'Maestru', 'maestru', '#FFD700', 35000, 2.00,
  '[{"label": "2x multiplicator", "description": "Castigi dublu puncte"}, {"label": "Prioritate programare", "description": "Programare prioritara"}, {"label": "Recompense legendare", "description": "Acces la cele mai bune premii"}]'::JSONB, 3, TRUE);

-- ============================================================================
-- 3. CLIENT LOYALTY PROFILES (salon's customers — NOT the owner)
-- ============================================================================
INSERT INTO loyalty_profiles (id, user_id, salon_id, current_points, lifetime_earned, lifetime_redeemed, tier, current_tier_id, tier_since, total_visits, last_visit_at, referral_code, streak_count, longest_streak) VALUES
-- Andrei Vlad — Sharp, power client, 24 visits
('bbb00000-d10e-00b0-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0000-0000-000000000001',
  4100, 18500, 3200, 'sharp', 'bbb00000-d10e-00a0-0000-000000000003', NOW() - INTERVAL '30 days', 24, NOW() - INTERVAL '5 days', 'TAPZI-ANDREI', 8, 12),
-- Maria Popescu — Clipper, new client, 3 visits
('bbb00000-d10e-00b0-0000-000000000002', '22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0000-0000-000000000001',
  350, 850, 0, 'clipper', 'bbb00000-d10e-00a0-0000-000000000001', NOW() - INTERVAL '20 days', 3, NOW() - INTERVAL '10 days', 'TAPZI-MARIA0', 2, 2),
-- Ion Dumitrescu — Blade, regular client, 9 visits
('bbb00000-d10e-00b0-0000-000000000003', '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0000-0000-000000000001',
  1200, 6100, 800, 'blade', 'bbb00000-d10e-00a0-0000-000000000002', NOW() - INTERVAL '60 days', 9, NOW() - INTERVAL '7 days', 'TAPZI-ION000', 3, 5),
-- Elena Marin — Clipper, 5 visits
('bbb00000-d10e-00b0-0000-000000000004', '44444444-aaaa-bbbb-cccc-444444444444', 'bbb00000-d10e-0000-0000-000000000001',
  600, 2100, 200, 'clipper', 'bbb00000-d10e-00a0-0000-000000000001', NOW() - INTERVAL '90 days', 5, NOW() - INTERVAL '14 days', 'TAPZI-ELENA0', 1, 3),
-- Radu Stanescu — Maestru, VIP client, 38 visits
('bbb00000-d10e-00b0-0000-000000000005', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-0000-0000-000000000001',
  8200, 42000, 5800, 'maestru', 'bbb00000-d10e-00a0-0000-000000000004', NOW() - INTERVAL '15 days', 38, NOW() - INTERVAL '2 days', 'TAPZI-RADU00', 12, 14),
-- Ana Constantinescu — Clipper, occasional
('bbb00000-d10e-00b0-0000-000000000006', '66666666-aaaa-bbbb-cccc-666666666666', 'bbb00000-d10e-0000-0000-000000000001',
  200, 700, 0, 'clipper', 'bbb00000-d10e-00a0-0000-000000000001', NOW() - INTERVAL '45 days', 2, NOW() - INTERVAL '30 days', 'TAPZI-ANA000', 0, 0),
-- Bogdan Popa — Blade, 7 visits
('bbb00000-d10e-00b0-0000-000000000007', '77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-0000-0000-000000000001',
  900, 5500, 600, 'blade', 'bbb00000-d10e-00a0-0000-000000000002', NOW() - INTERVAL '40 days', 7, NOW() - INTERVAL '8 days', 'TAPZI-BOGDAN', 2, 4),
-- Cristina Lazar — Clipper, DORMANT (at risk!)
('bbb00000-d10e-00b0-0000-000000000008', '88888888-aaaa-bbbb-cccc-888888888888', 'bbb00000-d10e-0000-0000-000000000001',
  150, 400, 0, 'clipper', 'bbb00000-d10e-00a0-0000-000000000001', NOW() - INTERVAL '120 days', 2, NOW() - INTERVAL '95 days', 'TAPZI-CRISTI', 0, 1);

-- ============================================================================
-- 4. CLIENT POINT TRANSACTIONS (visible in admin as activity)
-- ============================================================================
-- Andrei (Sharp) — recent activity the owner sees in dashboard
INSERT INTO point_transactions (id, loyalty_profile_id, user_id, salon_id, type, amount, balance_after, source, description, multiplier_applied, idempotency_key, created_at) VALUES
('bbb00000-d10e-00c0-0000-000000000001', 'bbb00000-d10e-00b0-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0000-0000-000000000001',
  'earn', 540, 4640, 'appointment', 'Tuns premium + barba', 1.50, 'apt-andrei-001', NOW() - INTERVAL '5 days'),
('bbb00000-d10e-00c0-0000-000000000002', 'bbb00000-d10e-00b0-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0000-0000-000000000001',
  'spend', -500, 4140, 'redemption', 'Recompensat: 10% Reducere', 1.00, 'redeem-andrei-001', NOW() - INTERVAL '4 days'),
('bbb00000-d10e-00c0-0000-000000000003', 'bbb00000-d10e-00b0-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0000-0000-000000000001',
  'bonus', 200, 4340, 'streak', 'Streak bonus: 8 luni', 1.00, 'streak-andrei-8mo', NOW() - INTERVAL '5 days'),
-- Radu (Maestru VIP) — recent
('bbb00000-d10e-00c0-0000-000000000010', 'bbb00000-d10e-00b0-0000-000000000005', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-0000-0000-000000000001',
  'earn', 900, 9100, 'appointment', 'Experienta VIP completa', 2.00, 'apt-radu-001', NOW() - INTERVAL '2 days'),
('bbb00000-d10e-00c0-0000-000000000011', 'bbb00000-d10e-00b0-0000-000000000005', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-0000-0000-000000000001',
  'referral', 500, 9600, 'referral', 'Referral: a invitat un prieten', 1.00, 'ref-radu-001', NOW() - INTERVAL '3 days'),
-- Ion (Blade) — recent
('bbb00000-d10e-00c0-0000-000000000020', 'bbb00000-d10e-00b0-0000-000000000003', '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0000-0000-000000000001',
  'earn', 420, 1620, 'appointment', 'Tuns + barba', 1.20, 'apt-ion-001', NOW() - INTERVAL '7 days'),
('bbb00000-d10e-00c0-0000-000000000021', 'bbb00000-d10e-00b0-0000-000000000003', '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0000-0000-000000000001',
  'spend', -300, 1320, 'redemption', 'Recompensat: Spalat Gratuit', 1.00, 'redeem-ion-001', NOW() - INTERVAL '6 days'),
-- Maria (new) — first visit bonus
('bbb00000-d10e-00c0-0000-000000000030', 'bbb00000-d10e-00b0-0000-000000000002', '22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0000-0000-000000000001',
  'bonus', 50, 50, 'manual', 'Bonus de bun-venit', 1.00, 'welcome-maria', NOW() - INTERVAL '20 days'),
('bbb00000-d10e-00c0-0000-000000000031', 'bbb00000-d10e-00b0-0000-000000000002', '22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0000-0000-000000000001',
  'earn', 300, 350, 'appointment', 'Tuns clasic', 1.00, 'apt-maria-001', NOW() - INTERVAL '10 days'),
-- Bogdan (Blade)
('bbb00000-d10e-00c0-0000-000000000040', 'bbb00000-d10e-00b0-0000-000000000007', '77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-0000-0000-000000000001',
  'earn', 480, 1380, 'appointment', 'Tuns + styling', 1.20, 'apt-bogdan-001', NOW() - INTERVAL '8 days');

-- ============================================================================
-- 5. ACHIEVEMENTS (configured by salon — global for all clients)
-- ============================================================================
INSERT INTO achievements (id, slug, name, description, category, rarity, icon_url, points_reward, condition_type, condition_value, is_secret, salon_id, active, sort_order) VALUES
('bbb00000-d10e-00d0-0000-000000000001', 'prima-tunsoare', 'Prima Tunsoare', 'Prima vizita la salon!', 'milestone', 'common', NULL, 100, 'visit_count', '{"count": 1}'::JSONB, FALSE, NULL, TRUE, 1),
('bbb00000-d10e-00d0-0000-000000000002', 'client-fidel', 'Client Fidel', '5 vizite acumulate', 'milestone', 'common', NULL, 250, 'visit_count', '{"count": 5}'::JSONB, FALSE, NULL, TRUE, 2),
('bbb00000-d10e-00d0-0000-000000000003', 'veteran', 'Veteran', '10 vizite', 'milestone', 'rare', NULL, 500, 'visit_count', '{"count": 10}'::JSONB, FALSE, NULL, TRUE, 3),
('bbb00000-d10e-00d0-0000-000000000004', 'legenda', 'Legenda', '25 de vizite', 'milestone', 'epic', NULL, 1500, 'visit_count', '{"count": 25}'::JSONB, FALSE, NULL, TRUE, 4),
('bbb00000-d10e-00d0-0000-000000000005', 'centenar', 'Centenar', '100 de vizite!', 'milestone', 'legendary', NULL, 5000, 'visit_count', '{"count": 100}'::JSONB, FALSE, NULL, TRUE, 5),
('bbb00000-d10e-00d0-0000-000000000006', 'explorer', 'Explorer', '3 servicii diferite incercate', 'exploration', 'common', NULL, 200, 'service_variety', '{"count": 3}'::JSONB, FALSE, NULL, TRUE, 10),
('bbb00000-d10e-00d0-0000-000000000007', 'completist', 'Completist', 'Toate serviciile incercate!', 'exploration', 'epic', NULL, 1000, 'service_variety', '{"count": 10}'::JSONB, FALSE, NULL, TRUE, 11),
('bbb00000-d10e-00d0-0000-000000000008', 'ambasador', 'Ambasador', '3 prieteni invitati', 'social', 'rare', NULL, 750, 'referral_count', '{"count": 3}'::JSONB, FALSE, NULL, TRUE, 30),
('bbb00000-d10e-00d0-0000-000000000009', 'loial', 'Loial', 'Streak de 3 luni consecutive', 'behavior', 'rare', NULL, 400, 'streak_length', '{"months": 3}'::JSONB, FALSE, NULL, TRUE, 40),
('bbb00000-d10e-00d0-0000-000000000010', 'de-neclintit', 'De Neclintit', 'Streak de 6 luni consecutive!', 'behavior', 'epic', NULL, 1000, 'streak_length', '{"months": 6}'::JSONB, FALSE, NULL, TRUE, 41);

-- ============================================================================
-- 6. CLIENT ACHIEVEMENTS EARNED (owner sees in admin analytics)
-- ============================================================================
INSERT INTO user_achievements (id, user_id, achievement_id, salon_id, earned_at, is_showcased, notified) VALUES
-- Andrei: Prima Tunsoare, Client Fidel, Veteran, Explorer, Loial, De Neclintit
('bbb00000-d10e-00e0-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-00d0-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '180 days', FALSE, TRUE),
('bbb00000-d10e-00e0-0000-000000000002', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-00d0-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '120 days', FALSE, TRUE),
('bbb00000-d10e-00e0-0000-000000000003', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-00d0-0000-000000000003', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '60 days', TRUE, TRUE),
('bbb00000-d10e-00e0-0000-000000000004', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-00d0-0000-000000000006', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '90 days', FALSE, TRUE),
('bbb00000-d10e-00e0-0000-000000000005', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-00d0-0000-000000000009', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '40 days', TRUE, TRUE),
('bbb00000-d10e-00e0-0000-000000000006', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-00d0-0000-000000000010', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '20 days', TRUE, TRUE),
-- Radu (Maestru): all milestone + social
('bbb00000-d10e-00e0-0000-000000000010', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-00d0-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '365 days', FALSE, TRUE),
('bbb00000-d10e-00e0-0000-000000000011', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-00d0-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '300 days', FALSE, TRUE),
('bbb00000-d10e-00e0-0000-000000000012', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-00d0-0000-000000000003', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '200 days', FALSE, TRUE),
('bbb00000-d10e-00e0-0000-000000000013', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-00d0-0000-000000000004', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '90 days', TRUE, TRUE),
('bbb00000-d10e-00e0-0000-000000000014', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-00d0-0000-000000000007', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '60 days', TRUE, TRUE),
('bbb00000-d10e-00e0-0000-000000000015', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-00d0-0000-000000000008', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '30 days', FALSE, TRUE),
-- Ion, Maria, Bogdan: Prima Tunsoare
('bbb00000-d10e-00e0-0000-000000000020', '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-00d0-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '150 days', FALSE, TRUE),
('bbb00000-d10e-00e0-0000-000000000021', '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-00d0-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '60 days', FALSE, TRUE),
('bbb00000-d10e-00e0-0000-000000000022', '22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-00d0-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '20 days', FALSE, TRUE),
('bbb00000-d10e-00e0-0000-000000000023', '77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-00d0-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '100 days', FALSE, TRUE),
('bbb00000-d10e-00e0-0000-000000000024', '77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-00d0-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001', NOW() - INTERVAL '30 days', FALSE, TRUE);

-- ============================================================================
-- 7. REWARDS CATALOG (created by owner for clients to redeem)
-- ============================================================================
INSERT INTO rewards_catalog (id, salon_id, name, description, category, reward_type, reward_value, points_cost, required_tier, stock, active, sort_order) VALUES
('bbb00000-d10e-00f0-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001',
  '10% Reducere', 'Reducere 10% la orice serviciu', 'discount', 'percentage_discount',
  '{"percent": 10}'::JSONB, 500, 'clipper', NULL, TRUE, 1),
('bbb00000-d10e-00f0-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001',
  '20% Reducere', 'Reducere 20% la orice serviciu', 'discount', 'percentage_discount',
  '{"percent": 20}'::JSONB, 1200, 'clipper', NULL, TRUE, 2),
('bbb00000-d10e-00f0-0000-000000000003', 'bbb00000-d10e-0000-0000-000000000001',
  'Spalat Gratuit', 'Un spalat pe cap gratuit la urmatoarea vizita', 'free_service', 'free_service',
  '{"service": "spalat"}'::JSONB, 300, 'clipper', 50, TRUE, 3),
('bbb00000-d10e-00f0-0000-000000000004', 'bbb00000-d10e-0000-0000-000000000001',
  'Barba Gratuita', 'Aranjat barba gratuit', 'free_service', 'free_service',
  '{"service": "barba"}'::JSONB, 800, 'blade', 30, TRUE, 4),
('bbb00000-d10e-00f0-0000-000000000005', 'bbb00000-d10e-0000-0000-000000000001',
  'Ceara de Par Premium', 'Produs de styling premium — cadou!', 'product', 'physical_item',
  '{"product": "ceara_premium"}'::JSONB, 1500, 'blade', 20, TRUE, 5),
('bbb00000-d10e-00f0-0000-000000000006', 'bbb00000-d10e-0000-0000-000000000001',
  'Tuns Complet Gratuit', 'Un tuns complet gratuit', 'free_service', 'free_service',
  '{"service": "tuns_complet"}'::JSONB, 2500, 'sharp', 10, TRUE, 6),
('bbb00000-d10e-00f0-0000-000000000007', 'bbb00000-d10e-0000-0000-000000000001',
  '50% Reducere Totala', 'Reducere 50% la tot cosul', 'discount', 'percentage_discount',
  '{"percent": 50}'::JSONB, 3000, 'sharp', NULL, TRUE, 7),
('bbb00000-d10e-00f0-0000-000000000008', 'bbb00000-d10e-0000-0000-000000000001',
  'Kit Grooming Complet', 'Set complet: ceara, ulei barba, sampon', 'product', 'physical_item',
  '{"products": ["ceara", "ulei_barba", "sampon"]}'::JSONB, 5000, 'maestru', 5, TRUE, 8),
('bbb00000-d10e-00f0-0000-000000000009', 'bbb00000-d10e-0000-0000-000000000001',
  'Experienta VIP', 'Sedinta completa VIP: tuns, barba, masaj facial, styling', 'experience', 'free_service',
  '{"services": ["tuns", "barba", "masaj", "styling"]}'::JSONB, 8000, 'maestru', 3, TRUE, 9);

-- ============================================================================
-- 8. CLIENT VOUCHERS (redeemed by clients — owner sees in management)
-- ============================================================================
INSERT INTO loyalty_vouchers (id, user_id, salon_id, reward_id, code, status, points_spent, expires_at, created_at) VALUES
('bbb00000-d10e-0100-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0000-0000-000000000001',
  'bbb00000-d10e-00f0-0000-000000000001', 'TAPZ8K2M', 'active', 500, NOW() + INTERVAL '25 days', NOW() - INTERVAL '4 days'),
('bbb00000-d10e-0100-0000-000000000002', '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0000-0000-000000000001',
  'bbb00000-d10e-00f0-0000-000000000003', 'TAPZW9R4', 'used', 300, NOW() + INTERVAL '10 days', NOW() - INTERVAL '6 days'),
('bbb00000-d10e-0100-0000-000000000003', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-0000-0000-000000000001',
  'bbb00000-d10e-00f0-0000-000000000006', 'TAPZP3N7', 'active', 2500, NOW() + INTERVAL '20 days', NOW() - INTERVAL '2 days');

-- ============================================================================
-- 9. CHALLENGES (created by salon for clients)
-- ============================================================================
INSERT INTO challenges (id, salon_id, name, description, icon_url, category, challenge_type, target_value, target_metadata, points_reward, starts_at, ends_at, active) VALUES
('bbb00000-d10e-0110-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001',
  'Maratonul Saptamanii', 'Viziteaza salonul de 2 ori saptamana asta', NULL,
  'weekly', 'visit_count', 2, '{"period": "week"}'::JSONB, 300,
  date_trunc('week', NOW()), date_trunc('week', NOW()) + INTERVAL '7 days', TRUE),
('bbb00000-d10e-0110-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001',
  'Colectionar de Servicii', 'Incearca 3 servicii diferite luna asta', NULL,
  'general', 'service_specific', 3, '{"period": "month"}'::JSONB, 750,
  date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month', TRUE),
('bbb00000-d10e-0110-0000-000000000003', 'bbb00000-d10e-0000-0000-000000000001',
  'Aduce un Prieten', 'Invita 2 prieteni prin referral', NULL,
  'special', 'referral', 2, '{}'::JSONB, 1500,
  NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days', TRUE),
('bbb00000-d10e-0110-0000-000000000004', 'bbb00000-d10e-0000-0000-000000000001',
  'Cheltuitor Regal', 'Cheltuieste 200 RON luna asta', NULL,
  'general', 'spend_amount', 20000, '{"period": "month"}'::JSONB, 500,
  date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month', TRUE);

-- ============================================================================
-- 10. CLIENT CHALLENGE PROGRESS
-- ============================================================================
INSERT INTO user_challenges (id, user_id, challenge_id, salon_id, current_progress, target_value, status, created_at) VALUES
-- Andrei: completed weekly, active monthly
('bbb00000-d10e-0120-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0110-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001',
  2, 2, 'completed', NOW() - INTERVAL '3 days'),
('bbb00000-d10e-0120-0000-000000000002', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0110-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001',
  2, 3, 'active', NOW() - INTERVAL '15 days'),
-- Radu: active referral challenge
('bbb00000-d10e-0120-0000-000000000003', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-0110-0000-000000000003', 'bbb00000-d10e-0000-0000-000000000001',
  1, 2, 'active', NOW() - INTERVAL '5 days'),
-- Ion: active spend challenge
('bbb00000-d10e-0120-0000-000000000004', '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0110-0000-000000000004', 'bbb00000-d10e-0000-0000-000000000001',
  12000, 20000, 'active', NOW() - INTERVAL '10 days');

-- ============================================================================
-- 11. CLIENT REFERRAL CODES
-- ============================================================================
INSERT INTO referral_codes (id, user_id, salon_id, code, max_uses, uses_count, active) VALUES
('bbb00000-d10e-0130-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0000-0000-000000000001', 'TAPZI-ANDREI', 50, 3, TRUE),
('bbb00000-d10e-0130-0000-000000000002', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-0000-0000-000000000001', 'TAPZI-RADU00', 50, 5, TRUE);

-- ============================================================================
-- 12. REFERRAL CLAIMS (clients inviting other clients)
-- ============================================================================
INSERT INTO referral_claims (id, referral_code_id, referrer_id, referee_id, salon_id, status, referrer_points_awarded, referee_points_awarded, rewarded_at, created_at) VALUES
-- Andrei invited Maria, Ion
('bbb00000-d10e-0140-0000-000000000001', 'bbb00000-d10e-0130-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', '22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0000-0000-000000000001',
  'rewarded', 500, 200, NOW() - INTERVAL '20 days', NOW() - INTERVAL '22 days'),
('bbb00000-d10e-0140-0000-000000000002', 'bbb00000-d10e-0130-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0000-0000-000000000001',
  'rewarded', 500, 200, NOW() - INTERVAL '150 days', NOW() - INTERVAL '155 days'),
-- Radu invited Bogdan, Elena, Ana
('bbb00000-d10e-0140-0000-000000000003', 'bbb00000-d10e-0130-0000-000000000002', '55555555-aaaa-bbbb-cccc-555555555555', '77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-0000-0000-000000000001',
  'rewarded', 500, 200, NOW() - INTERVAL '100 days', NOW() - INTERVAL '105 days'),
('bbb00000-d10e-0140-0000-000000000004', 'bbb00000-d10e-0130-0000-000000000002', '55555555-aaaa-bbbb-cccc-555555555555', '44444444-aaaa-bbbb-cccc-444444444444', 'bbb00000-d10e-0000-0000-000000000001',
  'rewarded', 500, 200, NOW() - INTERVAL '90 days', NOW() - INTERVAL '92 days'),
('bbb00000-d10e-0140-0000-000000000005', 'bbb00000-d10e-0130-0000-000000000002', '55555555-aaaa-bbbb-cccc-555555555555', '66666666-aaaa-bbbb-cccc-666666666666', 'bbb00000-d10e-0000-0000-000000000001',
  'qualified', 0, 0, NULL, NOW() - INTERVAL '10 days');

-- ============================================================================
-- 13. CLIENT STREAKS
-- ============================================================================
INSERT INTO loyalty_streaks (id, user_id, loyalty_profile_id, salon_id, streak_type, current_count, longest_count, last_activity_at, streak_started_at, grace_periods_remaining) VALUES
('bbb00000-d10e-0150-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-00b0-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001',
  'monthly_visit', 8, 12, NOW() - INTERVAL '5 days', NOW() - INTERVAL '250 days', 2),
('bbb00000-d10e-0150-0000-000000000002', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-00b0-0000-000000000005', 'bbb00000-d10e-0000-0000-000000000001',
  'monthly_visit', 12, 14, NOW() - INTERVAL '2 days', NOW() - INTERVAL '400 days', 2),
('bbb00000-d10e-0150-0000-000000000003', '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-00b0-0000-000000000003', 'bbb00000-d10e-0000-0000-000000000001',
  'monthly_visit', 3, 5, NOW() - INTERVAL '7 days', NOW() - INTERVAL '100 days', 1);

-- ============================================================================
-- 14. ACTIVE PROMOTIONS (configured by owner)
-- ============================================================================
INSERT INTO point_multipliers (id, salon_id, name, description, applies_to, multiplier, starts_at, ends_at, active) VALUES
('bbb00000-d10e-0160-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001',
  'Promotie Primavara', 'Puncte 1.5x pe toate serviciile!', 'all', 1.50,
  NOW() - INTERVAL '5 days', NOW() + INTERVAL '10 days', TRUE),
('bbb00000-d10e-0160-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001',
  'Bonus Referral', 'Puncte duble la fiecare referral', 'referral', 2.00,
  NOW() - INTERVAL '30 days', NOW() + INTERVAL '30 days', TRUE);

-- ============================================================================
-- 15. LOYALTY EVENTS (created by owner for campaigns)
-- ============================================================================
INSERT INTO loyalty_events (id, salon_id, slug, name, description, event_type, point_multiplier, bonus_points, starts_at, ends_at, active, notification_title, notification_body, participation_count) VALUES
('bbb00000-d10e-0170-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001',
  'primavara-2026', 'Festivalul Primaverii', 'Puncte bonus la fiecare vizita!',
  'seasonal', 1.5, 100, NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days', TRUE,
  'Festivalul Primaverii a inceput!', 'Vino la salon si castiga puncte bonus + 1.5x multiplicator!', 5),
('bbb00000-d10e-0170-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001',
  'paste-2026', 'Sarbatori Pascale', 'Bonus special de Paste',
  'holiday', 2.0, 200,
  '2026-04-10'::TIMESTAMPTZ, '2026-04-20'::TIMESTAMPTZ,
  TRUE, 'Paste Fericit!', 'Bonus dublu + 200 puncte cadou de Paste!', 0);

-- ============================================================================
-- 16. EVENT PARTICIPATIONS (clients who participated)
-- ============================================================================
INSERT INTO event_participations (id, event_id, user_id, salon_id, bonus_awarded, created_at) VALUES
('bbb00000-d10e-0180-0000-000000000001', 'bbb00000-d10e-0170-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0000-0000-000000000001', 100, NOW() - INTERVAL '4 days'),
('bbb00000-d10e-0180-0000-000000000002', 'bbb00000-d10e-0170-0000-000000000001', '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-0000-0000-000000000001', 100, NOW() - INTERVAL '2 days'),
('bbb00000-d10e-0180-0000-000000000003', 'bbb00000-d10e-0170-0000-000000000001', '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0000-0000-000000000001', 100, NOW() - INTERVAL '7 days'),
('bbb00000-d10e-0180-0000-000000000004', 'bbb00000-d10e-0170-0000-000000000001', '77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-0000-0000-000000000001', 100, NOW() - INTERVAL '8 days'),
('bbb00000-d10e-0180-0000-000000000005', 'bbb00000-d10e-0170-0000-000000000001', '22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0000-0000-000000000001', 100, NOW() - INTERVAL '10 days');

-- ============================================================================
-- 17. STREAK REWARDS (milestones configured by salon)
-- ============================================================================
INSERT INTO streak_rewards (id, salon_id, streak_type, milestone, bonus_points) VALUES
('bbb00000-d10e-0190-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001', 'monthly_visit', 2, 200),
('bbb00000-d10e-0190-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001', 'monthly_visit', 3, 400),
('bbb00000-d10e-0190-0000-000000000003', 'bbb00000-d10e-0000-0000-000000000001', 'monthly_visit', 4, 600),
('bbb00000-d10e-0190-0000-000000000004', 'bbb00000-d10e-0000-0000-000000000001', 'monthly_visit', 6, 1000),
('bbb00000-d10e-0190-0000-000000000005', 'bbb00000-d10e-0000-0000-000000000001', 'monthly_visit', 12, 3000);

-- ============================================================================
-- 18. CLIENT PERSONALIZATION (analytics for salon owner)
-- ============================================================================
INSERT INTO user_personalization (user_id, salon_id, segment, avg_days_between_visits, avg_spend_cents, preferred_barber_id, barber_loyalty_pct, preferred_day_of_week, preferred_hour, churn_risk_score, churn_risk_level, reward_preference, next_visit_predicted, services_tried, total_services_available, computed_at) VALUES
('11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0000-0000-000000000001',
  'vip', 6.0, 5200, 'bbb00000-d10e-0001-0000-000000000002', 0.85, 6, 11,
  0.05, 'low', 'experience', CURRENT_DATE + 1, 8, 10, NOW()),
('22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0000-0000-000000000001',
  'new', 7.0, 3500, 'bbb00000-d10e-0001-0000-000000000001', 0.67, 3, 16,
  0.30, 'medium', 'discount', CURRENT_DATE + 0, 2, 10, NOW()),
('33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0000-0000-000000000001',
  'regular', 10.0, 4200, 'bbb00000-d10e-0001-0000-000000000001', 0.78, 5, 14,
  0.15, 'low', 'discount', CURRENT_DATE + 3, 4, 10, NOW()),
('55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-0000-0000-000000000001',
  'vip', 5.0, 6800, 'bbb00000-d10e-0001-0000-000000000003', 0.90, 2, 10,
  0.02, 'low', 'experience', CURRENT_DATE + 3, 10, 10, NOW()),
('66666666-aaaa-bbbb-cccc-666666666666', 'bbb00000-d10e-0000-0000-000000000001',
  'at_risk', 30.0, 3000, 'bbb00000-d10e-0001-0000-000000000001', 0.50, 6, 15,
  0.65, 'high', 'discount', CURRENT_DATE - 15, 1, 10, NOW()),
('77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-0000-0000-000000000001',
  'loyal', 8.5, 4500, 'bbb00000-d10e-0001-0000-000000000002', 0.75, 4, 13,
  0.12, 'low', 'free_service', CURRENT_DATE + 1, 5, 10, NOW()),
('88888888-aaaa-bbbb-cccc-888888888888', 'bbb00000-d10e-0000-0000-000000000001',
  'dormant', 45.0, 3000, 'bbb00000-d10e-0001-0000-000000000001', 0.50, 6, 15,
  0.82, 'critical', 'discount', CURRENT_DATE - 50, 1, 10, NOW());
