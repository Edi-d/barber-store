-- ============================================
-- SEED DATA COMPLET - Barber Store
-- Generat din toate migratiile (001-012)
-- Ruleaza DUPA ce schema e creata
-- ============================================

-- ============================================
-- 1. CURSURI (4)
-- ============================================
INSERT INTO courses (id, title, description, cover_url, is_premium) VALUES
('a1111111-1111-1111-1111-111111111111', 'Fundamente Frizerie', 'Învață bazele frizuriei profesionale de la zero. Curs complet pentru începători.', 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800', FALSE),
('a2222222-2222-2222-2222-222222222222', 'Fade Masterclass', 'Stăpânește arta fade-ului perfect. De la low fade la skin fade, toate tehnicile.', 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', TRUE),
('a3333333-3333-3333-3333-333333333333', 'Beard Styling Pro', 'Transformă orice barbă într-o operă de artă. Conturare, styling și îngrijire.', 'https://images.unsplash.com/photo-1621607512214-68297480165e?w=800', TRUE),
('a4444444-4444-4444-4444-444444444444', 'Business pentru Barberi', 'Construiește-ți afacerea de succes în industria barber.', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. MODULE CURSURI (15)
-- ============================================
INSERT INTO course_modules (id, course_id, title, "order") VALUES
-- Fundamente Frizerie
('b1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Introducere', 1),
('b1111111-1111-1111-1111-111111111112', 'a1111111-1111-1111-1111-111111111111', 'Unelte și Echipamente', 2),
('b1111111-1111-1111-1111-111111111113', 'a1111111-1111-1111-1111-111111111111', 'Tehnici de Bază', 3),
('b1111111-1111-1111-1111-111111111114', 'a1111111-1111-1111-1111-111111111111', 'Finisaje', 4),
-- Fade Masterclass
('b2222222-2222-2222-2222-222222222221', 'a2222222-2222-2222-2222-222222222222', 'Teoria Fade-ului', 1),
('b2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'Low Fade', 2),
('b2222222-2222-2222-2222-222222222223', 'a2222222-2222-2222-2222-222222222222', 'Mid Fade', 3),
('b2222222-2222-2222-2222-222222222224', 'a2222222-2222-2222-2222-222222222222', 'High Fade', 4),
('b2222222-2222-2222-2222-222222222225', 'a2222222-2222-2222-2222-222222222222', 'Skin Fade', 5),
-- Beard Styling Pro
('b3333333-3333-3333-3333-333333333331', 'a3333333-3333-3333-3333-333333333333', 'Tipuri de Barbă', 1),
('b3333333-3333-3333-3333-333333333332', 'a3333333-3333-3333-3333-333333333333', 'Conturare', 2),
('b3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'Styling & Produse', 3),
-- Business pentru Barberi
('b4444444-4444-4444-4444-444444444441', 'a4444444-4444-4444-4444-444444444444', 'Mindset de Business', 1),
('b4444444-4444-4444-4444-444444444442', 'a4444444-4444-4444-4444-444444444444', 'Marketing Digital', 2),
('b4444444-4444-4444-4444-444444444443', 'a4444444-4444-4444-4444-444444444444', 'Pricing & Profitabilitate', 3)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. LECTII (13)
-- ============================================
INSERT INTO lessons (id, module_id, title, type, content_url, duration_sec, "order") VALUES
-- Modul: Introducere
('c1111111-1111-1111-1111-111111111101', 'b1111111-1111-1111-1111-111111111111', 'Bine ai venit!', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 180, 1),
('c1111111-1111-1111-1111-111111111102', 'b1111111-1111-1111-1111-111111111111', 'Ce vei învăța', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 300, 2),
('c1111111-1111-1111-1111-111111111103', 'b1111111-1111-1111-1111-111111111111', 'Istoria frizuriei', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 420, 3),
-- Modul: Unelte și Echipamente
('c1111111-1111-1111-1111-111111111201', 'b1111111-1111-1111-1111-111111111112', 'Mașini de tuns', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', 600, 1),
('c1111111-1111-1111-1111-111111111202', 'b1111111-1111-1111-1111-111111111112', 'Foarfece profesionale', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', 480, 2),
('c1111111-1111-1111-1111-111111111203', 'b1111111-1111-1111-1111-111111111112', 'Accesorii esențiale', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', 360, 3),
-- Modul: Tehnici de Bază
('c1111111-1111-1111-1111-111111111301', 'b1111111-1111-1111-1111-111111111113', 'Poziția corectă', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', 540, 1),
('c1111111-1111-1111-1111-111111111302', 'b1111111-1111-1111-1111-111111111113', 'Tehnica cu mașina', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', 720, 2),
('c1111111-1111-1111-1111-111111111303', 'b1111111-1111-1111-1111-111111111113', 'Tehnica cu foarfeca', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4', 780, 3),
-- Modul: Teoria Fade-ului
('c2222222-2222-2222-2222-222222222101', 'b2222222-2222-2222-2222-222222222221', 'Ce este fade-ul?', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', 360, 1),
('c2222222-2222-2222-2222-222222222102', 'b2222222-2222-2222-2222-222222222221', 'Tipuri de fade', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4', 480, 2),
-- Modul: Low Fade
('c2222222-2222-2222-2222-222222222201', 'b2222222-2222-2222-2222-222222222222', 'Low fade - Teorie', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', 420, 1),
('c2222222-2222-2222-2222-222222222202', 'b2222222-2222-2222-2222-222222222222', 'Low fade - Practică', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4', 900, 2)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 5. PRODUSE (8)
-- ============================================
INSERT INTO products (id, title, description, price_cents, currency, image_url, stock, active) VALUES
('d1111111-1111-1111-1111-111111111111', 'Wahl Legend Clipper', 'Mașina de tuns profesională Wahl Legend. Motor V9000, lame de precizie.', 89900, 'RON', 'https://images.unsplash.com/photo-1621607512214-68297480165e?w=800', 15, TRUE),
('d2222222-2222-2222-2222-222222222222', 'Andis Slimline Pro Li', 'Trimmer wireless profesional pentru contururi precise și detalii fine.', 64900, 'RON', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 20, TRUE),
('d3333333-3333-3333-3333-333333333333', 'Uppercut Deluxe Pomade', 'Pomadă cu fixare medie și luciu natural. Pe bază de apă.', 12900, 'RON', 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800', 50, TRUE),
('d4444444-4444-4444-4444-444444444444', 'Reuzel Beard Foam', 'Spumă pentru barbă cu ulei de argan și vitamina E.', 8900, 'RON', 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 35, TRUE),
('d5555555-5555-5555-5555-555555555555', 'Cape Profesional Neagră', 'Capă impermeabilă profesională cu închidere magnetică.', 14900, 'RON', 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 25, TRUE),
('d6666666-6666-6666-6666-666666666666', 'Set Foarfece Premium', 'Set de 2 foarfece profesionale: tuns + filat. Oțel japonez.', 199900, 'RON', 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=800', 10, TRUE),
('d7777777-7777-7777-7777-777777777777', 'Perie Neck Duster', 'Perie profesională pentru îndepărtarea părului de pe gât și față.', 4900, 'RON', 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=800', 40, TRUE),
('d8888888-8888-8888-8888-888888888888', 'After Shave Clubman', 'After shave clasic Pinaud Clubman. Aromă fresh, efect calmant.', 6900, 'RON', 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800', 30, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 6. FEED / CONTENT (6 postari)
-- ============================================
INSERT INTO content (id, author_id, type, caption, media_url, thumb_url, status) VALUES
('e1111111-1111-1111-1111-111111111111', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'video', 'Skin fade perfect în 15 minute! Tutorialul complet pe curs.', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400', 'published'),
('e2222222-2222-2222-2222-222222222222', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'video', 'Transformare completă! De la păr lung la textured crop cu mid fade.', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400', 'published'),
('e3333333-3333-3333-3333-333333333333', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'video', 'Beard trim & styling session. Produse folosite în descriere.', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400', 'published'),
('e4444444-4444-4444-4444-444444444444', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'image', 'Setup-ul meu de lucru. Curățenie și organizare = profesionalism.', 'https://images.unsplash.com/photo-1621607512214-68297480165e?w=800', 'https://images.unsplash.com/photo-1621607512214-68297480165e?w=400', 'published'),
('e5555555-5555-5555-5555-555555555555', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'video', 'Snippet din noul curs "Fade Masterclass"! Link în bio.', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400', 'published'),
('e6666666-6666-6666-6666-666666666666', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'video', 'Classic pompadour cu low fade! Cerut de voi, realizat cu drag.', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400', 'published')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 7. SERVICII FRIZERIE (7)
-- ============================================
INSERT INTO barber_services (id, name, description, duration_min, price_cents, category) VALUES
('f1111111-1111-1111-1111-111111111111', 'Tuns Clasic', 'Tuns clasic cu mașina și foarfeca, include spălat și styling.', 45, 8000, 'Tuns'),
('f2222222-2222-2222-2222-222222222222', 'Fade Premium', 'Skin fade sau low fade profesional cu tranziții impecabile.', 60, 12000, 'Tuns'),
('f3333333-3333-3333-3333-333333333333', 'Tuns + Barbă', 'Pachet complet: tuns cu fade + aranjat barbă.', 75, 15000, 'Pachete'),
('f4444444-4444-4444-4444-444444444444', 'Aranjat Barbă', 'Conturare și styling barbă cu produse premium.', 30, 5000, 'Barbă'),
('f5555555-5555-5555-5555-555555555555', 'Buzz Cut', 'Tuns scurt uniform cu mașina.', 20, 5000, 'Tuns'),
('f6666666-6666-6666-6666-666666666666', 'Kids Cut', 'Tuns pentru copii (sub 12 ani).', 30, 5000, 'Tuns'),
('f7777777-7777-7777-7777-777777777777', 'Royal Treatment', 'Experiența completă: tuns premium, barbă, prosop cald, masaj facial.', 90, 25000, 'Pachete')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 8. BARBERI / SALOANE (10 total)
-- ============================================
-- Primii 3 barberi (originali)
INSERT INTO barbers (id, name, avatar_url, bio, specialties, address, city, latitude, longitude, cover_url, phone, avg_price_cents, rating_avg, reviews_count, is_promoted, active) VALUES
('aa111111-1111-1111-1111-111111111111', 'Alex Popescu', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200', 'Specialist în fade-uri și tunsori moderne. 8 ani experiență.', ARRAY['fade', 'modern cuts', 'beard'], 'Str. Victoriei 45, Sector 1', 'București', 44.4530, 26.0861, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=600', '+40721111111', 8000, 4.8, 47, TRUE, TRUE),
('aa222222-2222-2222-2222-222222222222', 'Mihai Ionescu', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200', 'Expert în tunsori clasice și stiluri tradiționale.', ARRAY['classic cuts', 'pompadour', 'straight razor'], NULL, 'București', 44.4268, 26.1025, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600', '+40722222222', 12000, 4.5, 32, FALSE, TRUE),
('aa333333-3333-3333-3333-333333333333', 'Cristi Barber', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200', 'Fondator Barber Store. Pasionat de arta frizuriei.', ARRAY['all styles', 'beard sculpting', 'education'], NULL, 'București', 44.4323, 26.0989, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600', '+40723333333', 15000, 4.9, 85, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 7 barberi noi (din discover)
INSERT INTO barbers (id, name, avatar_url, bio, specialties, address, city, latitude, longitude, cover_url, phone, avg_price_cents, rating_avg, reviews_count, is_promoted, active) VALUES
('aa444444-4444-4444-4444-444444444444', 'Razor Studio', 'https://images.unsplash.com/photo-1560869713-7d0a29430803?w=200', 'Studio modern de frizerie cu echipamente de ultimă generație.', ARRAY['skin fade', 'beard design', 'hair tattoo'], 'Str. Floreasca 52, Sector 1', 'București', 44.4627, 26.0933, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600', '+40724444444', 10000, 4.7, 63, FALSE, TRUE),
('aa555555-5555-5555-5555-555555555555', 'The Gentleman''s Cut', 'https://images.unsplash.com/photo-1534297635766-99e9128e93b5?w=200', 'Barbershop premium cu atmosferă clasică. Whisky & grooming.', ARRAY['classic cuts', 'hot towel shave', 'gentleman style'], 'Bd. Aviatorilor 28, Sector 1', 'București', 44.4530, 26.0835, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600', '+40725555555', 18000, 4.6, 91, TRUE, TRUE),
('aa666666-6666-6666-6666-666666666666', 'BarberX Hub', 'https://images.unsplash.com/photo-1521490683712-35a1cb235d1c?w=200', 'Frizerie urbană pentru bărbatul modern. Walk-in friendly.', ARRAY['textured crop', 'buzz cut', 'line up'], 'Str. Cotroceni 15, Sector 6', 'București', 44.4340, 26.0700, 'https://images.unsplash.com/photo-1596362601603-1cf77acf3754?w=600', '+40726666666', 6500, 4.3, 28, FALSE, TRUE),
('aa777777-7777-7777-7777-777777777777', 'Crown Barbers', 'https://images.unsplash.com/photo-1493106819501-66d381c466f1?w=200', 'Experiențe premium de grooming. Rezervă-ți locul regal.', ARRAY['premium fade', 'beard grooming', 'scalp treatment'], 'Calea Dorobanți 65, Sector 1', 'București', 44.4560, 26.0890, 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=600', '+40727777777', 20000, 4.9, 124, TRUE, TRUE),
('aa888888-8888-8888-8888-888888888888', 'FreshCutz', 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?w=200', 'Stiluri fresh pentru tineret. Prețuri accesibile, calitate top.', ARRAY['fade', 'designs', 'color'], 'Str. Obor 34, Sector 2', 'București', 44.4480, 26.1260, 'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=600', '+40728888888', 5500, 4.4, 56, FALSE, TRUE),
('aa999999-9999-9999-9999-999999999999', 'Blade & Bone', 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=200', 'Barbershop artizanal. Fiecare tuns e o operă de artă.', ARRAY['artistic cuts', 'beard sculpting', 'traditional shave'], 'Bd. Tineretului 7, Sector 4', 'București', 44.4050, 26.1090, 'https://images.unsplash.com/photo-1596728325488-b772cf538e54?w=600', '+40729999999', 9000, 4.2, 19, FALSE, TRUE),
('aaa11111-1111-1111-1111-111111111111', 'Elite Grooming Lounge', 'https://images.unsplash.com/photo-1532710093739-9470acff878f?w=200', 'Salon exclusivist cu servicii de lux. Programare obligatorie.', ARRAY['luxury grooming', 'facial', 'VIP treatment'], 'Str. Pipera 112, Sector 2', 'București', 44.4780, 26.1150, 'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=600', '+40730111111', 25000, 4.8, 73, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 9. PROGRAMARI (4)
-- ============================================
INSERT INTO appointments (id, user_id, barber_id, service_id, scheduled_at, duration_min, status, total_cents, notes) VALUES
('bb111111-1111-1111-1111-111111111111', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'aa111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', NOW() - INTERVAL '7 days', 60, 'completed', 12000, 'Fade mediu, păstrat lungimea sus.'),
('bb222222-2222-2222-2222-222222222222', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'aa333333-3333-3333-3333-333333333333', 'f3333333-3333-3333-3333-333333333333', NOW() - INTERVAL '21 days', 75, 'completed', 15000, NULL),
('bb333333-3333-3333-3333-333333333333', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'aa222222-2222-2222-2222-222222222222', 'f7777777-7777-7777-7777-777777777777', NOW() + INTERVAL '3 days' + INTERVAL '14 hours', 90, 'confirmed', 25000, 'Royal Treatment - zi de răsfăț!'),
('bb444444-4444-4444-4444-444444444444', 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', 'aa111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111', NOW() + INTERVAL '10 days' + INTERVAL '10 hours', 45, 'pending', 8000, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 10. LIVE STREAMS — no seed data
-- ============================================
-- Lives are created on-demand by real users. No seed entries.

-- ============================================
-- 11. DISPONIBILITATE BARBERI
-- ============================================
-- Alex Popescu (Luni-Vineri 09-18, Sambata 10-15)
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa111111-1111-1111-1111-111111111111', 1, '09:00', '18:00'),
('aa111111-1111-1111-1111-111111111111', 2, '09:00', '18:00'),
('aa111111-1111-1111-1111-111111111111', 3, '09:00', '18:00'),
('aa111111-1111-1111-1111-111111111111', 4, '09:00', '18:00'),
('aa111111-1111-1111-1111-111111111111', 5, '09:00', '18:00'),
('aa111111-1111-1111-1111-111111111111', 6, '10:00', '15:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Mihai Ionescu (Luni-Vineri 10-19, Sambata 10-16)
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa222222-2222-2222-2222-222222222222', 1, '10:00', '19:00'),
('aa222222-2222-2222-2222-222222222222', 2, '10:00', '19:00'),
('aa222222-2222-2222-2222-222222222222', 3, '10:00', '19:00'),
('aa222222-2222-2222-2222-222222222222', 4, '10:00', '19:00'),
('aa222222-2222-2222-2222-222222222222', 5, '10:00', '19:00'),
('aa222222-2222-2222-2222-222222222222', 6, '10:00', '16:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Cristi Barber (Luni-Vineri 08-17, Sambata 09-14)
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa333333-3333-3333-3333-333333333333', 1, '08:00', '17:00'),
('aa333333-3333-3333-3333-333333333333', 2, '08:00', '17:00'),
('aa333333-3333-3333-3333-333333333333', 3, '08:00', '17:00'),
('aa333333-3333-3333-3333-333333333333', 4, '08:00', '17:00'),
('aa333333-3333-3333-3333-333333333333', 5, '08:00', '17:00'),
('aa333333-3333-3333-3333-333333333333', 6, '09:00', '14:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Razor Studio
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa444444-4444-4444-4444-444444444444', 1, '09:00', '20:00'),
('aa444444-4444-4444-4444-444444444444', 2, '09:00', '20:00'),
('aa444444-4444-4444-4444-444444444444', 3, '09:00', '20:00'),
('aa444444-4444-4444-4444-444444444444', 4, '09:00', '20:00'),
('aa444444-4444-4444-4444-444444444444', 5, '09:00', '20:00'),
('aa444444-4444-4444-4444-444444444444', 6, '10:00', '17:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- The Gentleman's Cut
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa555555-5555-5555-5555-555555555555', 1, '10:00', '20:00'),
('aa555555-5555-5555-5555-555555555555', 2, '10:00', '20:00'),
('aa555555-5555-5555-5555-555555555555', 3, '10:00', '20:00'),
('aa555555-5555-5555-5555-555555555555', 4, '10:00', '20:00'),
('aa555555-5555-5555-5555-555555555555', 5, '10:00', '20:00'),
('aa555555-5555-5555-5555-555555555555', 6, '10:00', '18:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- BarberX Hub
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa666666-6666-6666-6666-666666666666', 1, '08:00', '19:00'),
('aa666666-6666-6666-6666-666666666666', 2, '08:00', '19:00'),
('aa666666-6666-6666-6666-666666666666', 3, '08:00', '19:00'),
('aa666666-6666-6666-6666-666666666666', 4, '08:00', '19:00'),
('aa666666-6666-6666-6666-666666666666', 5, '08:00', '19:00'),
('aa666666-6666-6666-6666-666666666666', 6, '09:00', '15:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Crown Barbers
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa777777-7777-7777-7777-777777777777', 1, '09:00', '21:00'),
('aa777777-7777-7777-7777-777777777777', 2, '09:00', '21:00'),
('aa777777-7777-7777-7777-777777777777', 3, '09:00', '21:00'),
('aa777777-7777-7777-7777-777777777777', 4, '09:00', '21:00'),
('aa777777-7777-7777-7777-777777777777', 5, '09:00', '21:00'),
('aa777777-7777-7777-7777-777777777777', 6, '10:00', '18:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- FreshCutz
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa888888-8888-8888-8888-888888888888', 1, '10:00', '19:00'),
('aa888888-8888-8888-8888-888888888888', 2, '10:00', '19:00'),
('aa888888-8888-8888-8888-888888888888', 3, '10:00', '19:00'),
('aa888888-8888-8888-8888-888888888888', 4, '10:00', '19:00'),
('aa888888-8888-8888-8888-888888888888', 5, '10:00', '19:00'),
('aa888888-8888-8888-8888-888888888888', 6, '10:00', '16:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Blade & Bone (doar Luni-Vineri)
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa999999-9999-9999-9999-999999999999', 1, '09:00', '18:00'),
('aa999999-9999-9999-9999-999999999999', 2, '09:00', '18:00'),
('aa999999-9999-9999-9999-999999999999', 3, '09:00', '18:00'),
('aa999999-9999-9999-9999-999999999999', 4, '09:00', '18:00'),
('aa999999-9999-9999-9999-999999999999', 5, '09:00', '18:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Elite Grooming Lounge
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aaa11111-1111-1111-1111-111111111111', 1, '10:00', '21:00'),
('aaa11111-1111-1111-1111-111111111111', 2, '10:00', '21:00'),
('aaa11111-1111-1111-1111-111111111111', 3, '10:00', '21:00'),
('aaa11111-1111-1111-1111-111111111111', 4, '10:00', '21:00'),
('aaa11111-1111-1111-1111-111111111111', 5, '10:00', '21:00'),
('aaa11111-1111-1111-1111-111111111111', 6, '11:00', '19:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- ============================================
-- 12. CREARE SALOANE DIN BARBERI
-- (fiecare barber activ cu coordonate -> salon)
-- ============================================
DO $$
DECLARE
    v_barber RECORD;
    v_salon_id UUID;
BEGIN
    FOR v_barber IN
        SELECT * FROM barbers
        WHERE active = true AND latitude IS NOT NULL AND salon_id IS NULL
    LOOP
        INSERT INTO salons (
            owner_id, name, address, city, phone, avatar_url, cover_url,
            bio, specialties, latitude, longitude, rating_avg, reviews_count,
            avg_price_cents, is_promoted, amenities, active, created_at
        )
        VALUES (
            v_barber.profile_id, v_barber.name, v_barber.address, v_barber.city,
            v_barber.phone, v_barber.avatar_url, v_barber.cover_url, v_barber.bio,
            v_barber.specialties, v_barber.latitude, v_barber.longitude,
            v_barber.rating_avg, v_barber.reviews_count, v_barber.avg_price_cents,
            v_barber.is_promoted, v_barber.amenities, v_barber.active, v_barber.created_at
        )
        RETURNING id INTO v_salon_id;

        UPDATE barbers SET salon_id = v_salon_id, role = 'owner' WHERE id = v_barber.id;

        RAISE NOTICE 'Created salon % for barber % (%)', v_salon_id, v_barber.id, v_barber.name;
    END LOOP;
END $$;

-- ============================================
-- 13. RECENZII SALON (9)
-- ============================================
INSERT INTO salon_reviews (user_id, salon_id, rating, comment)
SELECT 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', b.salon_id, v.rating, v.comment
FROM barbers b
JOIN (VALUES
    ('aa111111-1111-1111-1111-111111111111'::UUID, 5, 'Cel mai bun fade din Bucuresti! Recomand cu incredere.'),
    ('aa333333-3333-3333-3333-333333333333'::UUID, 5, 'Cristi e un maestru. Atmosfera fantastica.'),
    ('aa777777-7777-7777-7777-777777777777'::UUID, 4, 'Serviciu premium, preturi pe masura. Merita experienta.'),
    ('aa444444-4444-4444-4444-444444444444'::UUID, 4, 'Foarte curat, echipamente noi. Recomand!'),
    ('aa555555-5555-5555-5555-555555555555'::UUID, 5, 'Atmosfera de gentleman. Whisky-ul e pe casa!'),
    ('aa666666-6666-6666-6666-666666666666'::UUID, 3, 'Decent, dar se poate mai bine la curatenie.'),
    ('aa888888-8888-8888-8888-888888888888'::UUID, 4, 'Preturi bune, rezultat foarte ok.'),
    ('aa999999-9999-9999-9999-999999999999'::UUID, 4, 'Atmosfera artizanala, frizerul e pasionat.'),
    ('aaa11111-1111-1111-1111-111111111111'::UUID, 5, 'Cel mai bun salon din Bucuresti. Merita fiecare leu.')
) AS v(barber_id, rating, comment) ON b.id = v.barber_id
WHERE b.salon_id IS NOT NULL
ON CONFLICT (user_id, salon_id) DO NOTHING;

-- ============================================
-- 14. FAVORITE SALON (4)
-- ============================================
INSERT INTO salon_favorites (user_id, salon_id)
SELECT 'ce0b48a1-2e88-4af9-9cf3-ca7dde8c34e2', b.salon_id
FROM barbers b
WHERE b.id IN (
    'aa111111-1111-1111-1111-111111111111',
    'aa333333-3333-3333-3333-333333333333',
    'aa777777-7777-7777-7777-777777777777',
    'aaa11111-1111-1111-1111-111111111111'
) AND b.salon_id IS NOT NULL
ON CONFLICT (user_id, salon_id) DO NOTHING;

-- ============================================
-- 15. HAPPY HOURS (3)
-- ============================================
INSERT INTO salon_happy_hours (salon_id, discount_percent, starts_at, ends_at)
SELECT b.salon_id, v.discount, NOW(), NOW() + v.duration
FROM barbers b
JOIN (VALUES
    ('aa111111-1111-1111-1111-111111111111'::UUID, 20, INTERVAL '2 hours'),
    ('aa666666-6666-6666-6666-666666666666'::UUID, 30, INTERVAL '3 hours'),
    ('aa888888-8888-8888-8888-888888888888'::UUID, 15, INTERVAL '1 hour 30 minutes')
) AS v(barber_id, discount, duration) ON b.id = v.barber_id
WHERE b.salon_id IS NOT NULL;

-- ============================================
-- 16. POZE SALOANE
-- ============================================
DO $$
DECLARE
    v_salon_id UUID;
BEGIN
    -- Alex Popescu / Barber Store
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Interior salon', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'Zona de lucru', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Detalii', 2);
    END IF;

    -- Mihai Ionescu
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa222222-2222-2222-2222-222222222222';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'Salon clasic', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Scaune vintage', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1596362601603-1cf77acf3754?w=800', 'Atmosfera', 2);
    END IF;

    -- Cristi Barber
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa333333-3333-3333-3333-333333333333';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Centru Vechi', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=800', 'Interior', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Produse premium', 2),
        (v_salon_id, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Detalii', 3);
    END IF;

    -- Razor Studio
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa444444-4444-4444-4444-444444444444';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Studio modern', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1596362601603-1cf77acf3754?w=800', 'Echipamente', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Zona de asteptare', 2);
    END IF;

    -- The Gentleman's Cut
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa555555-5555-5555-5555-555555555555';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800', 'Lounge', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=800', 'Bar', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Interior clasic', 2),
        (v_salon_id, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'Scaune', 3);
    END IF;

    -- BarberX Hub
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa666666-6666-6666-6666-666666666666';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1596362601603-1cf77acf3754?w=800', 'Urban vibe', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Interior', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Zona de lucru', 2);
    END IF;

    -- Crown Barbers
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa777777-7777-7777-7777-777777777777';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=800', 'Premium interior', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800', 'Detalii gold', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Lounge VIP', 2),
        (v_salon_id, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'Scaune premium', 3);
    END IF;

    -- FreshCutz
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa888888-8888-8888-8888-888888888888';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=800', 'Fresh vibes', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1596362601603-1cf77acf3754?w=800', 'Interior colorat', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Zona de lucru', 2);
    END IF;

    -- Blade & Bone
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa999999-9999-9999-9999-999999999999';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1596728325488-b772cf538e54?w=800', 'Artisan studio', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Unelte traditionale', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Interior', 2);
    END IF;

    -- Elite Grooming Lounge
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aaa11111-1111-1111-1111-111111111111';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=800', 'Lounge exclusivist', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=800', 'Zona VIP', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800', 'Bar & lounge', 2),
        (v_salon_id, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'Interior premium', 3);
    END IF;
END $$;

-- ============================================
-- 17. ECHIPA SALON (2 membri pentru primul salon)
-- ============================================
DO $$
DECLARE
    v_salon_id UUID;
    v_member1_id UUID;
    v_member2_id UUID;
BEGIN
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111';

    IF v_salon_id IS NULL THEN
        RAISE NOTICE 'First salon not found, skipping team seed';
        RETURN;
    END IF;

    -- Team member 1: Andrei Popescu (fade specialist)
    INSERT INTO barbers (name, avatar_url, bio, specialties, address, city, latitude, longitude, rating_avg, reviews_count, active, salon_id, role)
    VALUES (
        'Andrei Popescu', NULL,
        'Specialist in fade-uri si tuns clasic. 5 ani experienta.',
        ARRAY['Fade', 'Clasic'],
        (SELECT address FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111'),
        (SELECT city FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111'),
        (SELECT latitude FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111'),
        (SELECT longitude FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111'),
        4.8, 32, true, v_salon_id, 'barber'
    ) RETURNING id INTO v_member1_id;

    -- Team member 2: Mihai Ionescu (styling & beard)
    INSERT INTO barbers (name, avatar_url, bio, specialties, address, city, latitude, longitude, rating_avg, reviews_count, active, salon_id, role)
    VALUES (
        'Mihai Ionescu', NULL,
        'Pasionat de styling modern si barba. Certificat international.',
        ARRAY['Styling', 'Barba'],
        (SELECT address FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111'),
        (SELECT city FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111'),
        (SELECT latitude FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111'),
        (SELECT longitude FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111'),
        4.6, 18, true, v_salon_id, 'barber'
    ) RETURNING id INTO v_member2_id;

    -- Disponibilitate Andrei (Luni-Sambata 09-18)
    INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time, is_available)
    SELECT v_member1_id, d, '09:00', '18:00', d != 0
    FROM generate_series(0, 6) AS d;

    -- Disponibilitate Mihai (Luni-Sambata 10-19)
    INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time, is_available)
    SELECT v_member2_id, d, '10:00', '19:00', d != 0
    FROM generate_series(0, 6) AS d;

    RAISE NOTICE 'Added team members: Andrei (%) and Mihai (%) to salon %', v_member1_id, v_member2_id, v_salon_id;
END $$;

-- ============================================
-- DONE! Tot seed data-ul e inserat.
-- ============================================
