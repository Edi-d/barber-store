-- ============================================================================
-- Migration 028: Dive Software Salon — Seed Data
-- ============================================================================
-- Salonul "Dive Software" cu barberi, servicii, program, programari,
-- recenzii, poze, si happy hours.
-- ============================================================================

-- Demo user (owner):  977ea6ba-065f-4e8c-ae1f-8f35fa1c690b
-- Seed users from 027: 11111111..88888888-aaaa-bbbb-cccc-*

-- ─── UUID-uri fixe ───────────────────────────────────────────────────────────
-- Salon:     bbb00000-d10e-0000-0000-000000000001
-- Barberi:   bbb00000-d10e-0001-0000-000000000001 .. 004
-- Servicii:  bbb00000-d10e-0002-0000-000000000001 .. 010

-- ============================================================================
-- 0a. CREATE SEED USERS (if not already created by migration 027)
-- ============================================================================
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

INSERT INTO profiles (id, username, display_name, avatar_url) VALUES
('11111111-aaaa-bbbb-cccc-111111111111', 'andrei.vlad', 'Andrei Vlad', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200'),
('22222222-aaaa-bbbb-cccc-222222222222', 'maria.popescu', 'Maria Popescu', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200'),
('33333333-aaaa-bbbb-cccc-333333333333', 'ion.dumitrescu', 'Ion Dumitrescu', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200'),
('44444444-aaaa-bbbb-cccc-444444444444', 'elena.marin', 'Elena Marin', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200'),
('55555555-aaaa-bbbb-cccc-555555555555', 'radu.stanescu', 'Radu Stanescu', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200'),
('66666666-aaaa-bbbb-cccc-666666666666', 'ana.constantinescu', 'Ana Constantinescu', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'),
('77777777-aaaa-bbbb-cccc-777777777777', 'bogdan.popa', 'Bogdan Popa', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200'),
('88888888-aaaa-bbbb-cccc-888888888888', 'cristina.lazar', 'Cristina Lazăr', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200')
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

-- ============================================================================
-- 0a2. SET OWNER PROFILE AS SALON_OWNER (required for salon-provider)
-- ============================================================================
UPDATE profiles
SET onboarding_role = 'salon_owner',
    onboarding_completed = TRUE
WHERE id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b';

-- ============================================================================
-- 0b. CLEANUP — remove OTHER salons owned by this user (so .single() works)
-- ============================================================================
DELETE FROM appointments WHERE barber_id IN (
    SELECT id FROM barbers WHERE salon_id IN (
        SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
        AND id != 'bbb00000-d10e-0000-0000-000000000001'
    )
);
DELETE FROM appointments WHERE service_id IN (
    SELECT id FROM barber_services WHERE salon_id IN (
        SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
        AND id != 'bbb00000-d10e-0000-0000-000000000001'
    )
);
DELETE FROM barber_service_assignments WHERE barber_id IN (
    SELECT id FROM barbers WHERE salon_id IN (
        SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
        AND id != 'bbb00000-d10e-0000-0000-000000000001'
    )
);
DELETE FROM barber_availability WHERE barber_id IN (
    SELECT id FROM barbers WHERE salon_id IN (
        SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
        AND id != 'bbb00000-d10e-0000-0000-000000000001'
    )
);
DELETE FROM barbers WHERE salon_id IN (
    SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
    AND id != 'bbb00000-d10e-0000-0000-000000000001'
);
DELETE FROM barber_services WHERE salon_id IN (
    SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
    AND id != 'bbb00000-d10e-0000-0000-000000000001'
);
DELETE FROM salon_hours WHERE salon_id IN (
    SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
    AND id != 'bbb00000-d10e-0000-0000-000000000001'
);
DELETE FROM salon_reviews WHERE salon_id IN (
    SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
    AND id != 'bbb00000-d10e-0000-0000-000000000001'
);
DELETE FROM salon_photos WHERE salon_id IN (
    SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
    AND id != 'bbb00000-d10e-0000-0000-000000000001'
);
DELETE FROM salon_happy_hours WHERE salon_id IN (
    SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
    AND id != 'bbb00000-d10e-0000-0000-000000000001'
);
DELETE FROM salon_favorites WHERE salon_id IN (
    SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
    AND id != 'bbb00000-d10e-0000-0000-000000000001'
);
DELETE FROM salon_members WHERE salon_id IN (
    SELECT id FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
    AND id != 'bbb00000-d10e-0000-0000-000000000001'
);
DELETE FROM salons WHERE owner_id = '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b'
    AND id != 'bbb00000-d10e-0000-0000-000000000001';

-- ============================================================================
-- 0c. CLEANUP — Dive Software itself (safe re-run)
-- ============================================================================
DELETE FROM appointments WHERE barber_id IN (
    'bbb00000-d10e-0001-0000-000000000001',
    'bbb00000-d10e-0001-0000-000000000002',
    'bbb00000-d10e-0001-0000-000000000003',
    'bbb00000-d10e-0001-0000-000000000004'
);
DELETE FROM barber_service_assignments WHERE barber_id IN (
    'bbb00000-d10e-0001-0000-000000000001',
    'bbb00000-d10e-0001-0000-000000000002',
    'bbb00000-d10e-0001-0000-000000000003',
    'bbb00000-d10e-0001-0000-000000000004'
);
DELETE FROM barber_availability WHERE barber_id IN (
    'bbb00000-d10e-0001-0000-000000000001',
    'bbb00000-d10e-0001-0000-000000000002',
    'bbb00000-d10e-0001-0000-000000000003',
    'bbb00000-d10e-0001-0000-000000000004'
);
DELETE FROM barbers WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM barber_services WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM salon_hours WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM salon_reviews WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM salon_photos WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM salon_happy_hours WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM salon_favorites WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM salon_members WHERE salon_id = 'bbb00000-d10e-0000-0000-000000000001';
DELETE FROM salons WHERE id = 'bbb00000-d10e-0000-0000-000000000001';

-- ============================================================================
-- 1. SALON — Dive Software
-- ============================================================================
INSERT INTO salons (
    id, owner_id, name, address, city, phone, avatar_url, cover_url,
    bio, description, specialties, latitude, longitude,
    rating_avg, reviews_count, avg_price_cents, is_promoted,
    amenities, active
) VALUES (
    'bbb00000-d10e-0000-0000-000000000001',
    '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b',
    'Dive Software Barbershop',
    'Str. Victoriei 42, Sector 1',
    'București',
    '+40 721 123 456',
    'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=400',
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200',
    'Barbershop premium in inima Bucurestiului. Experienta de top, atmosfera relaxata.',
    'La Dive Software Barbershop credem ca fiecare vizita trebuie sa fie o experienta. Echipa noastra de barberi profesionisti combina tehnici clasice cu trenduri moderne pentru a-ti oferi cel mai bun look. Relaxeaza-te cu o cafea sau un whisky in timp ce noi ne ocupam de restul.',
    ARRAY['fade', 'beard', 'classic cuts', 'hair coloring', 'hot towel shave'],
    44.4396,
    26.0963,
    4.8,
    0,
    7500,
    TRUE,
    ARRAY['WiFi', 'Cafea', 'Whisky', 'Parcare', 'Aer conditionat', 'Muzica'],
    TRUE
);

-- ============================================================================
-- 2. SALON HOURS (Luni-Vineri 09-20, Sambata 10-18, Duminica inchis)
-- ============================================================================
INSERT INTO salon_hours (salon_id, day_of_week, is_open, open_time, close_time) VALUES
('bbb00000-d10e-0000-0000-000000000001', 0, FALSE, '09:00', '18:00'),  -- Duminica - inchis
('bbb00000-d10e-0000-0000-000000000001', 1, TRUE,  '09:00', '20:00'),  -- Luni
('bbb00000-d10e-0000-0000-000000000001', 2, TRUE,  '09:00', '20:00'),  -- Marti
('bbb00000-d10e-0000-0000-000000000001', 3, TRUE,  '09:00', '20:00'),  -- Miercuri
('bbb00000-d10e-0000-0000-000000000001', 4, TRUE,  '09:00', '20:00'),  -- Joi
('bbb00000-d10e-0000-0000-000000000001', 5, TRUE,  '09:00', '20:00'),  -- Vineri
('bbb00000-d10e-0000-0000-000000000001', 6, TRUE,  '10:00', '18:00')   -- Sambata
ON CONFLICT (salon_id, day_of_week) DO NOTHING;

-- ============================================================================
-- 3. BARBERI (4 barberi)
-- ============================================================================
INSERT INTO barbers (id, profile_id, salon_id, name, avatar_url, bio, specialties, address, city, latitude, longitude, rating_avg, reviews_count, active, role) VALUES
(
    'bbb00000-d10e-0001-0000-000000000001',
    '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b',
    'bbb00000-d10e-0000-0000-000000000001',
    'Edi Barber',
    NULL,
    'Fondatorul salonului. 10+ ani experienta in fade-uri si tunsori clasice.',
    ARRAY['fade', 'classic cuts', 'beard sculpting'],
    'Str. Victoriei 42, Sector 1', 'București',
    44.4396, 26.0963,
    4.9, 12,
    TRUE, 'owner'
),
(
    'bbb00000-d10e-0001-0000-000000000002',
    '11111111-aaaa-bbbb-cccc-111111111111',
    'bbb00000-d10e-0000-0000-000000000001',
    'Andrei Vlad',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
    'Specialist in fade-uri si tunsori moderne. Pasionat de detalii.',
    ARRAY['skin fade', 'textured crop', 'line up'],
    'Str. Victoriei 42, Sector 1', 'București',
    44.4396, 26.0963,
    4.7, 8,
    TRUE, 'barber'
),
(
    'bbb00000-d10e-0001-0000-000000000003',
    '33333333-aaaa-bbbb-cccc-333333333333',
    'bbb00000-d10e-0000-0000-000000000001',
    'Ion Dumitrescu',
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200',
    'Maestru in barba si tunsori clasice. Tehnici traditionale cu o nota moderna.',
    ARRAY['beard trim', 'hot towel shave', 'pompadour', 'classic cuts'],
    'Str. Victoriei 42, Sector 1', 'București',
    44.4396, 26.0963,
    4.8, 10,
    TRUE, 'barber'
),
(
    'bbb00000-d10e-0001-0000-000000000004',
    '55555555-aaaa-bbbb-cccc-555555555555',
    'bbb00000-d10e-0000-0000-000000000001',
    'Radu Stanescu',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
    'Colorist si stilist. Specializat in transformari complete si look-uri creative.',
    ARRAY['hair coloring', 'highlights', 'creative cuts', 'styling'],
    'Str. Victoriei 42, Sector 1', 'București',
    44.4396, 26.0963,
    4.6, 6,
    TRUE, 'barber'
);

-- ============================================================================
-- 4. SALON MEMBERS
-- ============================================================================
INSERT INTO salon_members (salon_id, profile_id, role) VALUES
('bbb00000-d10e-0000-0000-000000000001', '977ea6ba-065f-4e8c-ae1f-8f35fa1c690b', 'owner'),
('bbb00000-d10e-0000-0000-000000000001', '11111111-aaaa-bbbb-cccc-111111111111', 'barber'),
('bbb00000-d10e-0000-0000-000000000001', '33333333-aaaa-bbbb-cccc-333333333333', 'barber'),
('bbb00000-d10e-0000-0000-000000000001', '55555555-aaaa-bbbb-cccc-555555555555', 'barber')
ON CONFLICT (salon_id, profile_id) DO NOTHING;

-- ============================================================================
-- 5. SERVICII (10 servicii)
-- ============================================================================
INSERT INTO barber_services (id, salon_id, name, description, duration_min, price_cents, currency, category, active) VALUES
-- Tunsori
('bbb00000-d10e-0002-0000-000000000001', 'bbb00000-d10e-0000-0000-000000000001',
 'Tuns clasic', 'Tuns cu foarfeca si masina, spalat si styling inclus.', 45, 7000, 'RON', 'tuns', TRUE),
('bbb00000-d10e-0002-0000-000000000002', 'bbb00000-d10e-0000-0000-000000000001',
 'Skin Fade', 'Fade de la zero cu tranzitie perfecta. Include linia si styling.', 50, 8500, 'RON', 'tuns', TRUE),
('bbb00000-d10e-0002-0000-000000000003', 'bbb00000-d10e-0000-0000-000000000001',
 'Buzz Cut', 'Tuns scurt uniform cu masina. Simplu si curat.', 20, 4000, 'RON', 'tuns', TRUE),
('bbb00000-d10e-0002-0000-000000000004', 'bbb00000-d10e-0000-0000-000000000001',
 'Tuns copii (sub 12 ani)', 'Tuns pentru copii intr-o atmosfera prietenoasa.', 30, 5000, 'RON', 'tuns', TRUE),

-- Barba
('bbb00000-d10e-0002-0000-000000000005', 'bbb00000-d10e-0000-0000-000000000001',
 'Aranjat barba', 'Conturare, trimming si styling cu ulei de barba.', 25, 4500, 'RON', 'barba', TRUE),
('bbb00000-d10e-0002-0000-000000000006', 'bbb00000-d10e-0000-0000-000000000001',
 'Ras cu prosop cald', 'Ras traditional cu brici, prosop cald si aftershave premium.', 35, 6000, 'RON', 'barba', TRUE),

-- Colorare
('bbb00000-d10e-0002-0000-000000000007', 'bbb00000-d10e-0000-0000-000000000001',
 'Vopsit par', 'Colorare completa cu vopsea profesionala. Consultatie inclusa.', 90, 15000, 'RON', 'colorare', TRUE),
('bbb00000-d10e-0002-0000-000000000008', 'bbb00000-d10e-0000-0000-000000000001',
 'Suvite / Highlights', 'Suvite partiale sau totale pentru un look modern.', 75, 12000, 'RON', 'colorare', TRUE),

-- Tratament
('bbb00000-d10e-0002-0000-000000000009', 'bbb00000-d10e-0000-0000-000000000001',
 'Tratament scalp', 'Masaj si tratament pentru scalp sanatos. Relaxare garantata.', 30, 5500, 'RON', 'tratament', TRUE),

-- Pachete
('bbb00000-d10e-0002-0000-000000000010', 'bbb00000-d10e-0000-0000-000000000001',
 'Pachet complet (Tuns + Barba)', 'Tuns clasic sau fade + aranjat barba. Cel mai popular pachet.', 60, 10000, 'RON', 'pachet', TRUE);

-- ============================================================================
-- 6. BARBER ↔ SERVICE ASSIGNMENTS
-- ============================================================================
-- Edi (owner): tuns clasic, skin fade, buzz cut, tuns copii, barba, pachet complet
INSERT INTO barber_service_assignments (barber_id, service_id) VALUES
('bbb00000-d10e-0001-0000-000000000001', 'bbb00000-d10e-0002-0000-000000000001'),
('bbb00000-d10e-0001-0000-000000000001', 'bbb00000-d10e-0002-0000-000000000002'),
('bbb00000-d10e-0001-0000-000000000001', 'bbb00000-d10e-0002-0000-000000000003'),
('bbb00000-d10e-0001-0000-000000000001', 'bbb00000-d10e-0002-0000-000000000004'),
('bbb00000-d10e-0001-0000-000000000001', 'bbb00000-d10e-0002-0000-000000000005'),
('bbb00000-d10e-0001-0000-000000000001', 'bbb00000-d10e-0002-0000-000000000010');

-- Andrei: skin fade, tuns clasic, buzz cut, barba
INSERT INTO barber_service_assignments (barber_id, service_id) VALUES
('bbb00000-d10e-0001-0000-000000000002', 'bbb00000-d10e-0002-0000-000000000001'),
('bbb00000-d10e-0001-0000-000000000002', 'bbb00000-d10e-0002-0000-000000000002'),
('bbb00000-d10e-0001-0000-000000000002', 'bbb00000-d10e-0002-0000-000000000003'),
('bbb00000-d10e-0001-0000-000000000002', 'bbb00000-d10e-0002-0000-000000000005'),
('bbb00000-d10e-0001-0000-000000000002', 'bbb00000-d10e-0002-0000-000000000010');

-- Ion: tuns clasic, barba, ras cu prosop cald, pachet complet, tuns copii
INSERT INTO barber_service_assignments (barber_id, service_id) VALUES
('bbb00000-d10e-0001-0000-000000000003', 'bbb00000-d10e-0002-0000-000000000001'),
('bbb00000-d10e-0001-0000-000000000003', 'bbb00000-d10e-0002-0000-000000000004'),
('bbb00000-d10e-0001-0000-000000000003', 'bbb00000-d10e-0002-0000-000000000005'),
('bbb00000-d10e-0001-0000-000000000003', 'bbb00000-d10e-0002-0000-000000000006'),
('bbb00000-d10e-0001-0000-000000000003', 'bbb00000-d10e-0002-0000-000000000010');

-- Radu: tuns clasic, skin fade, vopsit, suvite, tratament scalp
INSERT INTO barber_service_assignments (barber_id, service_id) VALUES
('bbb00000-d10e-0001-0000-000000000004', 'bbb00000-d10e-0002-0000-000000000001'),
('bbb00000-d10e-0001-0000-000000000004', 'bbb00000-d10e-0002-0000-000000000002'),
('bbb00000-d10e-0001-0000-000000000004', 'bbb00000-d10e-0002-0000-000000000007'),
('bbb00000-d10e-0001-0000-000000000004', 'bbb00000-d10e-0002-0000-000000000008'),
('bbb00000-d10e-0001-0000-000000000004', 'bbb00000-d10e-0002-0000-000000000009');

-- ============================================================================
-- 7. BARBER AVAILABILITY (program lucru individual)
-- ============================================================================
-- Edi: Luni-Vineri 09:00-18:00 (owner, pleaca mai devreme)
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time, is_available) VALUES
('bbb00000-d10e-0001-0000-000000000001', 0, '09:00', '18:00', FALSE),  -- Duminica
('bbb00000-d10e-0001-0000-000000000001', 1, '09:00', '18:00', TRUE),
('bbb00000-d10e-0001-0000-000000000001', 2, '09:00', '18:00', TRUE),
('bbb00000-d10e-0001-0000-000000000001', 3, '09:00', '18:00', TRUE),
('bbb00000-d10e-0001-0000-000000000001', 4, '09:00', '18:00', TRUE),
('bbb00000-d10e-0001-0000-000000000001', 5, '09:00', '18:00', TRUE),
('bbb00000-d10e-0001-0000-000000000001', 6, '10:00', '16:00', TRUE)   -- Sambata scurt
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Andrei: Luni-Vineri 10:00-20:00, Sambata 10:00-18:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time, is_available) VALUES
('bbb00000-d10e-0001-0000-000000000002', 0, '10:00', '18:00', FALSE),
('bbb00000-d10e-0001-0000-000000000002', 1, '10:00', '20:00', TRUE),
('bbb00000-d10e-0001-0000-000000000002', 2, '10:00', '20:00', TRUE),
('bbb00000-d10e-0001-0000-000000000002', 3, '10:00', '20:00', TRUE),
('bbb00000-d10e-0001-0000-000000000002', 4, '10:00', '20:00', TRUE),
('bbb00000-d10e-0001-0000-000000000002', 5, '10:00', '20:00', TRUE),
('bbb00000-d10e-0001-0000-000000000002', 6, '10:00', '18:00', TRUE)
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Ion: Luni-Vineri 09:00-19:00, Sambata liber
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time, is_available) VALUES
('bbb00000-d10e-0001-0000-000000000003', 0, '09:00', '18:00', FALSE),
('bbb00000-d10e-0001-0000-000000000003', 1, '09:00', '19:00', TRUE),
('bbb00000-d10e-0001-0000-000000000003', 2, '09:00', '19:00', TRUE),
('bbb00000-d10e-0001-0000-000000000003', 3, '09:00', '19:00', TRUE),
('bbb00000-d10e-0001-0000-000000000003', 4, '09:00', '19:00', TRUE),
('bbb00000-d10e-0001-0000-000000000003', 5, '09:00', '19:00', TRUE),
('bbb00000-d10e-0001-0000-000000000003', 6, '09:00', '18:00', FALSE)
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Radu: Marti-Sambata 11:00-20:00 (Luni liber)
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time, is_available) VALUES
('bbb00000-d10e-0001-0000-000000000004', 0, '11:00', '20:00', FALSE),
('bbb00000-d10e-0001-0000-000000000004', 1, '11:00', '20:00', FALSE),   -- Luni liber
('bbb00000-d10e-0001-0000-000000000004', 2, '11:00', '20:00', TRUE),
('bbb00000-d10e-0001-0000-000000000004', 3, '11:00', '20:00', TRUE),
('bbb00000-d10e-0001-0000-000000000004', 4, '11:00', '20:00', TRUE),
('bbb00000-d10e-0001-0000-000000000004', 5, '11:00', '20:00', TRUE),
('bbb00000-d10e-0001-0000-000000000004', 6, '10:00', '18:00', TRUE)
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- ============================================================================
-- 8. PROGRAMARI (20 programari — mix de statusuri si date)
-- ============================================================================

-- Programari trecute (completed) — ultima saptamana
INSERT INTO appointments (id, user_id, barber_id, service_id, scheduled_at, duration_min, status, total_cents, currency, notes) VALUES
-- Clienti diversi la Edi
('bbb00000-d10e-0003-0001-000000000001',
 '22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0001-0000-000000000001',
 'bbb00000-d10e-0002-0000-000000000002',
 NOW() - INTERVAL '6 days' + TIME '10:00', 50, 'completed', 8500, 'RON',
 'Skin fade clasic, nr 0 pe lateral'),

('bbb00000-d10e-0003-0001-000000000002',
 '44444444-aaaa-bbbb-cccc-444444444444', 'bbb00000-d10e-0001-0000-000000000001',
 'bbb00000-d10e-0002-0000-000000000010',
 NOW() - INTERVAL '5 days' + TIME '14:00', 60, 'completed', 10000, 'RON',
 'Pachet complet, barba conturata'),

('bbb00000-d10e-0003-0001-000000000003',
 '66666666-aaaa-bbbb-cccc-666666666666', 'bbb00000-d10e-0001-0000-000000000001',
 'bbb00000-d10e-0002-0000-000000000001',
 NOW() - INTERVAL '4 days' + TIME '11:00', 45, 'completed', 7000, 'RON', NULL),

-- Clienti la Andrei
('bbb00000-d10e-0003-0001-000000000004',
 '77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-0001-0000-000000000002',
 'bbb00000-d10e-0002-0000-000000000002',
 NOW() - INTERVAL '6 days' + TIME '12:00', 50, 'completed', 8500, 'RON',
 'Mid fade cu textured crop'),

('bbb00000-d10e-0003-0001-000000000005',
 '88888888-aaaa-bbbb-cccc-888888888888', 'bbb00000-d10e-0001-0000-000000000002',
 'bbb00000-d10e-0002-0000-000000000003',
 NOW() - INTERVAL '5 days' + TIME '15:00', 20, 'completed', 4000, 'RON', NULL),

('bbb00000-d10e-0003-0001-000000000006',
 '22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0001-0000-000000000002',
 'bbb00000-d10e-0002-0000-000000000010',
 NOW() - INTERVAL '3 days' + TIME '16:00', 60, 'completed', 10000, 'RON',
 'Pachet complet cu skin fade'),

-- Clienti la Ion
('bbb00000-d10e-0003-0001-000000000007',
 '44444444-aaaa-bbbb-cccc-444444444444', 'bbb00000-d10e-0001-0000-000000000003',
 'bbb00000-d10e-0002-0000-000000000006',
 NOW() - INTERVAL '6 days' + TIME '09:30', 35, 'completed', 6000, 'RON',
 'Ras traditional cu brici, prosop cald'),

('bbb00000-d10e-0003-0001-000000000008',
 '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0001-0000-000000000003',
 'bbb00000-d10e-0002-0000-000000000001',
 NOW() - INTERVAL '4 days' + TIME '13:00', 45, 'completed', 7000, 'RON', NULL),

('bbb00000-d10e-0003-0001-000000000009',
 '66666666-aaaa-bbbb-cccc-666666666666', 'bbb00000-d10e-0001-0000-000000000003',
 'bbb00000-d10e-0002-0000-000000000005',
 NOW() - INTERVAL '2 days' + TIME '10:00', 25, 'completed', 4500, 'RON',
 'Doar conturare barba'),

-- Clienti la Radu
('bbb00000-d10e-0003-0001-000000000010',
 '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0001-0000-000000000004',
 'bbb00000-d10e-0002-0000-000000000007',
 NOW() - INTERVAL '5 days' + TIME '12:00', 90, 'completed', 15000, 'RON',
 'Vopsit blond cenusiu'),

('bbb00000-d10e-0003-0001-000000000011',
 '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-0001-0000-000000000004',
 'bbb00000-d10e-0002-0000-000000000008',
 NOW() - INTERVAL '3 days' + TIME '14:00', 75, 'completed', 12000, 'RON',
 'Suvite subtiri, efect natural'),

-- Programare anulata
('bbb00000-d10e-0003-0001-000000000012',
 '88888888-aaaa-bbbb-cccc-888888888888', 'bbb00000-d10e-0001-0000-000000000001',
 'bbb00000-d10e-0002-0000-000000000001',
 NOW() - INTERVAL '2 days' + TIME '16:00', 45, 'cancelled', 7000, 'RON',
 'Client a anulat - motiv personal'),

-- No-show
('bbb00000-d10e-0003-0001-000000000013',
 '77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-0001-0000-000000000003',
 'bbb00000-d10e-0002-0000-000000000010',
 NOW() - INTERVAL '1 day' + TIME '11:00', 60, 'no_show', 10000, 'RON', NULL),

-- Programari AZI (confirmed)
('bbb00000-d10e-0003-0001-000000000014',
 '22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0001-0000-000000000001',
 'bbb00000-d10e-0002-0000-000000000002',
 CURRENT_DATE + TIME '10:00', 50, 'confirmed', 8500, 'RON',
 'Skin fade cu linie'),

('bbb00000-d10e-0003-0001-000000000015',
 '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0001-0000-000000000002',
 'bbb00000-d10e-0002-0000-000000000001',
 CURRENT_DATE + TIME '11:00', 45, 'confirmed', 7000, 'RON', NULL),

('bbb00000-d10e-0003-0001-000000000016',
 '44444444-aaaa-bbbb-cccc-444444444444', 'bbb00000-d10e-0001-0000-000000000003',
 'bbb00000-d10e-0002-0000-000000000006',
 CURRENT_DATE + TIME '14:00', 35, 'confirmed', 6000, 'RON',
 'Ras cu prosop cald'),

('bbb00000-d10e-0003-0001-000000000017',
 '66666666-aaaa-bbbb-cccc-666666666666', 'bbb00000-d10e-0001-0000-000000000004',
 'bbb00000-d10e-0002-0000-000000000009',
 CURRENT_DATE + TIME '15:00', 30, 'confirmed', 5500, 'RON',
 'Tratament anti-matreata'),

-- Programari VIITOARE (pending + confirmed)
('bbb00000-d10e-0003-0001-000000000018',
 '11111111-aaaa-bbbb-cccc-111111111111', 'bbb00000-d10e-0001-0000-000000000001',
 'bbb00000-d10e-0002-0000-000000000010',
 CURRENT_DATE + INTERVAL '2 days' + TIME '10:00', 60, 'pending', 10000, 'RON',
 'Pachet complet, vreau ceva nou'),

('bbb00000-d10e-0003-0001-000000000019',
 '55555555-aaaa-bbbb-cccc-555555555555', 'bbb00000-d10e-0001-0000-000000000004',
 'bbb00000-d10e-0002-0000-000000000007',
 CURRENT_DATE + INTERVAL '3 days' + TIME '12:00', 90, 'confirmed', 15000, 'RON',
 'Vopsit par - negru intens'),

('bbb00000-d10e-0003-0001-000000000020',
 '88888888-aaaa-bbbb-cccc-888888888888', 'bbb00000-d10e-0001-0000-000000000002',
 'bbb00000-d10e-0002-0000-000000000002',
 CURRENT_DATE + INTERVAL '4 days' + TIME '14:00', 50, 'pending', 8500, 'RON',
 'Skin fade, prima data la Andrei')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 9. RECENZII SALON (6 recenzii)
-- ============================================================================
INSERT INTO salon_reviews (id, user_id, salon_id, rating, comment, created_at) VALUES
('bbb00000-d10e-0004-0000-000000000001',
 '22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0000-0000-000000000001',
 5, 'Cel mai bun salon din Bucuresti! Edi este un maestru, atmosfera e top si cafeaua e pe casa. Revin mereu!',
 NOW() - INTERVAL '20 days'),

('bbb00000-d10e-0004-0000-000000000002',
 '44444444-aaaa-bbbb-cccc-444444444444', 'bbb00000-d10e-0000-0000-000000000001',
 5, 'Am venit pentru ras cu prosop cald la Ion. Experienta premium, ma simt ca un domn. Recomand cu caldura!',
 NOW() - INTERVAL '15 days'),

('bbb00000-d10e-0004-0000-000000000003',
 '66666666-aaaa-bbbb-cccc-666666666666', 'bbb00000-d10e-0000-0000-000000000001',
 4, 'Serviciu foarte bun, preturi corecte. Singura sugestie: mai multe locuri de parcare.',
 NOW() - INTERVAL '12 days'),

('bbb00000-d10e-0004-0000-000000000004',
 '77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-0000-0000-000000000001',
 5, 'Andrei mi-a facut cel mai bun fade din viata mea. Tranzitia e impecabila. 10/10!',
 NOW() - INTERVAL '8 days'),

('bbb00000-d10e-0004-0000-000000000005',
 '33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0000-0000-000000000001',
 5, 'Radu e un artist! Mi-a facut suvitele exact cum mi le doream. Atmosfera relaxata, muzica buna.',
 NOW() - INTERVAL '5 days'),

('bbb00000-d10e-0004-0000-000000000006',
 '88888888-aaaa-bbbb-cccc-888888888888', 'bbb00000-d10e-0000-0000-000000000001',
 4, 'Salon modern si curat. Echipa profesionista. Usor de gasit. Revenim!',
 NOW() - INTERVAL '2 days')
ON CONFLICT (user_id, salon_id) DO NOTHING;

-- Owner replies on some reviews
UPDATE salon_reviews SET
    owner_reply = 'Multumim frumos, Maria! Ne bucuram ca te simti ca acasa la noi. Te asteptam oricand!',
    owner_reply_at = created_at + INTERVAL '3 hours'
WHERE id = 'bbb00000-d10e-0004-0000-000000000001';

UPDATE salon_reviews SET
    owner_reply = 'Multumim pentru feedback, Ana! Lucram la solutia de parcare. Ne vedem curand!',
    owner_reply_at = created_at + INTERVAL '5 hours'
WHERE id = 'bbb00000-d10e-0004-0000-000000000003';

-- ============================================================================
-- 10. POZE SALON (6 poze)
-- ============================================================================
INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
('bbb00000-d10e-0000-0000-000000000001', 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Interior — zona de asteptare', 0),
('bbb00000-d10e-0000-0000-000000000001', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'Scaunele de lucru', 1),
('bbb00000-d10e-0000-0000-000000000001', 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Detalii si unelte', 2),
('bbb00000-d10e-0000-0000-000000000001', 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Skin fade in progres', 3),
('bbb00000-d10e-0000-0000-000000000001', 'https://images.unsplash.com/photo-1621607512214-68297480165e?w=800', 'Beard styling', 4),
('bbb00000-d10e-0000-0000-000000000001', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800', 'Atmosfera de seara', 5);

-- ============================================================================
-- 11. HAPPY HOURS (2 active)
-- ============================================================================
INSERT INTO salon_happy_hours (salon_id, discount_percent, starts_at, ends_at, active) VALUES
-- 20% reducere la tunsori Luni-Miercuri 09-12
('bbb00000-d10e-0000-0000-000000000001', 20, NOW(), NOW() + INTERVAL '7 days', TRUE),
-- 15% reducere la pachete in weekend
('bbb00000-d10e-0000-0000-000000000001', 15, NOW(), NOW() + INTERVAL '5 days', TRUE);

-- ============================================================================
-- 12. FAVORITE (useri care au salvat salonul)
-- ============================================================================
INSERT INTO salon_favorites (user_id, salon_id) VALUES
('22222222-aaaa-bbbb-cccc-222222222222', 'bbb00000-d10e-0000-0000-000000000001'),
('44444444-aaaa-bbbb-cccc-444444444444', 'bbb00000-d10e-0000-0000-000000000001'),
('77777777-aaaa-bbbb-cccc-777777777777', 'bbb00000-d10e-0000-0000-000000000001'),
('33333333-aaaa-bbbb-cccc-333333333333', 'bbb00000-d10e-0000-0000-000000000001')
ON CONFLICT (user_id, salon_id) DO NOTHING;

-- ============================================================================
-- 13. UPDATE DENORMALIZED COUNTS
-- ============================================================================
UPDATE salons SET
    rating_avg = (SELECT COALESCE(AVG(rating), 0) FROM salon_reviews WHERE salon_reviews.salon_id = salons.id),
    reviews_count = (SELECT COUNT(*) FROM salon_reviews WHERE salon_reviews.salon_id = salons.id),
    avg_price_cents = (SELECT COALESCE(AVG(price_cents), 0) FROM barber_services WHERE barber_services.salon_id = salons.id AND active = TRUE)
WHERE id = 'bbb00000-d10e-0000-0000-000000000001';

-- ============================================================================
-- DONE! Dive Software Barbershop seeded.
-- Summary:
--   1 salon: Dive Software Barbershop (Str. Victoriei 42, București)
--   4 barberi: Edi (owner), Andrei, Ion, Radu
--   10 servicii: 4 tunsori, 2 barba, 2 colorare, 1 tratament, 1 pachet
--   22 service assignments
--   28 availability slots (program individual pe barber)
--   7 salon hours (program salon)
--   20 programari (11 completed, 1 cancelled, 1 no_show, 4 confirmed azi, 3 viitoare)
--   6 recenzii (cu 2 raspunsuri owner)
--   6 poze salon
--   2 happy hours active
--   4 favorite
-- ============================================================================
