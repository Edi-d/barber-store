-- ============================================
-- BarberApp - Seed Data
-- ============================================

-- Your user ID
-- 73a42488-5437-486e-8ad6-3697301949ac

-- ============================================
-- CLEANUP EXISTING DATA (allows re-running)
-- ============================================
DELETE FROM content WHERE author_id = '73a42488-5437-486e-8ad6-3697301949ac';
DELETE FROM lessons WHERE module_id IN (SELECT id FROM course_modules WHERE course_id IN ('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'a3333333-3333-3333-3333-333333333333', 'a4444444-4444-4444-4444-444444444444'));
DELETE FROM course_modules WHERE course_id IN ('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'a3333333-3333-3333-3333-333333333333', 'a4444444-4444-4444-4444-444444444444');
DELETE FROM courses WHERE id IN ('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'a3333333-3333-3333-3333-333333333333', 'a4444444-4444-4444-4444-444444444444');
DELETE FROM products WHERE id IN ('d1111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222', 'd3333333-3333-3333-3333-333333333333', 'd4444444-4444-4444-4444-444444444444', 'd5555555-5555-5555-5555-555555555555', 'd6666666-6666-6666-6666-666666666666', 'd7777777-7777-7777-7777-777777777777', 'd8888888-8888-8888-8888-888888888888');

-- ============================================
-- UPDATE YOUR PROFILE
-- ============================================
UPDATE profiles SET
    display_name = 'Edi Barber',
    avatar_url = NULL,
    bio = 'Pasionat de arta frizuriei. Creator de conținut și instructor.',
    role = 'creator'
WHERE id = '73a42488-5437-486e-8ad6-3697301949ac';

-- ============================================
-- COURSES
-- ============================================
INSERT INTO courses (id, title, description, cover_url, is_premium) VALUES
(
    'a1111111-1111-1111-1111-111111111111',
    'Fundamente Frizerie',
    'Învață bazele frizuriei profesionale. De la tehnici de tuns la stilizare, acest curs acoperă tot ce trebuie să știi pentru a începe.',
    'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800',
    FALSE
),
(
    'a2222222-2222-2222-2222-222222222222',
    'Fade Masterclass',
    'Stăpânește arta fade-ului perfect. Tehnici avansate pentru low, mid și high fade cu tranziții impecabile.',
    'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800',
    TRUE
),
(
    'a3333333-3333-3333-3333-333333333333',
    'Beard Styling Pro',
    'Transformă orice barbă într-o operă de artă. Tehnici de conturare, trimming și styling pentru toate tipurile de barbă.',
    'https://images.unsplash.com/photo-1621607512214-68297480165e?w=800',
    TRUE
),
(
    'a4444444-4444-4444-4444-444444444444',
    'Business pentru Barberi',
    'Construiește-ți afacerea de succes. Marketing, pricing, retenție clienți și scalare.',
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800',
    TRUE
);

-- ============================================
-- COURSE MODULES
-- ============================================

-- Fundamente Frizerie - Modules
INSERT INTO course_modules (id, course_id, title, "order") VALUES
('b1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Introducere', 1),
('b1111111-1111-1111-1111-111111111112', 'a1111111-1111-1111-1111-111111111111', 'Unelte și Echipamente', 2),
('b1111111-1111-1111-1111-111111111113', 'a1111111-1111-1111-1111-111111111111', 'Tehnici de Bază', 3),
('b1111111-1111-1111-1111-111111111114', 'a1111111-1111-1111-1111-111111111111', 'Finisaje', 4);

-- Fade Masterclass - Modules
INSERT INTO course_modules (id, course_id, title, "order") VALUES
('b2222222-2222-2222-2222-222222222221', 'a2222222-2222-2222-2222-222222222222', 'Teoria Fade-ului', 1),
('b2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'Low Fade', 2),
('b2222222-2222-2222-2222-222222222223', 'a2222222-2222-2222-2222-222222222222', 'Mid Fade', 3),
('b2222222-2222-2222-2222-222222222224', 'a2222222-2222-2222-2222-222222222222', 'High Fade', 4),
('b2222222-2222-2222-2222-222222222225', 'a2222222-2222-2222-2222-222222222222', 'Skin Fade', 5);

-- Beard Styling - Modules
INSERT INTO course_modules (id, course_id, title, "order") VALUES
('b3333333-3333-3333-3333-333333333331', 'a3333333-3333-3333-3333-333333333333', 'Tipuri de Barbă', 1),
('b3333333-3333-3333-3333-333333333332', 'a3333333-3333-3333-3333-333333333333', 'Conturare', 2),
('b3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'Styling & Produse', 3);

-- Business - Modules
INSERT INTO course_modules (id, course_id, title, "order") VALUES
('b4444444-4444-4444-4444-444444444441', 'a4444444-4444-4444-4444-444444444444', 'Mindset de Business', 1),
('b4444444-4444-4444-4444-444444444442', 'a4444444-4444-4444-4444-444444444444', 'Marketing Digital', 2),
('b4444444-4444-4444-4444-444444444443', 'a4444444-4444-4444-4444-444444444444', 'Pricing & Profitabilitate', 3);

-- ============================================
-- LESSONS
-- ============================================

-- Fundamente - Introducere
INSERT INTO lessons (id, module_id, title, type, content_url, duration_sec, "order") VALUES
('c1111111-1111-1111-1111-111111111101', 'b1111111-1111-1111-1111-111111111111', 'Bine ai venit!', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 180, 1),
('c1111111-1111-1111-1111-111111111102', 'b1111111-1111-1111-1111-111111111111', 'Ce vei învăța', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 300, 2),
('c1111111-1111-1111-1111-111111111103', 'b1111111-1111-1111-1111-111111111111', 'Istoria frizuriei', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 420, 3);

-- Fundamente - Unelte
INSERT INTO lessons (id, module_id, title, type, content_url, duration_sec, "order") VALUES
('c1111111-1111-1111-1111-111111111201', 'b1111111-1111-1111-1111-111111111112', 'Mașini de tuns', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', 600, 1),
('c1111111-1111-1111-1111-111111111202', 'b1111111-1111-1111-1111-111111111112', 'Foarfece profesionale', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', 480, 2),
('c1111111-1111-1111-1111-111111111203', 'b1111111-1111-1111-1111-111111111112', 'Accesorii esențiale', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', 360, 3);

-- Fundamente - Tehnici de Bază
INSERT INTO lessons (id, module_id, title, type, content_url, duration_sec, "order") VALUES
('c1111111-1111-1111-1111-111111111301', 'b1111111-1111-1111-1111-111111111113', 'Poziția corectă', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', 540, 1),
('c1111111-1111-1111-1111-111111111302', 'b1111111-1111-1111-1111-111111111113', 'Tehnica cu mașina', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', 720, 2),
('c1111111-1111-1111-1111-111111111303', 'b1111111-1111-1111-1111-111111111113', 'Tehnica cu foarfeca', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4', 780, 3);

-- Fade Masterclass - Teoria
INSERT INTO lessons (id, module_id, title, type, content_url, duration_sec, "order") VALUES
('c2222222-2222-2222-2222-222222222101', 'b2222222-2222-2222-2222-222222222221', 'Ce este fade-ul?', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', 360, 1),
('c2222222-2222-2222-2222-222222222102', 'b2222222-2222-2222-2222-222222222221', 'Tipuri de fade', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4', 480, 2);

-- Fade Masterclass - Low Fade
INSERT INTO lessons (id, module_id, title, type, content_url, duration_sec, "order") VALUES
('c2222222-2222-2222-2222-222222222201', 'b2222222-2222-2222-2222-222222222222', 'Low fade - Teorie', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', 420, 1),
('c2222222-2222-2222-2222-222222222202', 'b2222222-2222-2222-2222-222222222222', 'Low fade - Practică', 'video', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4', 900, 2);

-- ============================================
-- PRODUCTS
-- ============================================
INSERT INTO products (id, title, description, price_cents, currency, image_url, stock, active) VALUES
(
    'd1111111-1111-1111-1111-111111111111',
    'Wahl Legend Clipper',
    'Mașina de tuns profesională Wahl Legend. Motor electromagnetic V9000, ideal pentru fade-uri și tunsori precise.',
    89900,
    'RON',
    'https://images.unsplash.com/photo-1621607512214-68297480165e?w=800',
    15,
    TRUE
),
(
    'd2222222-2222-2222-2222-222222222222',
    'Andis Slimline Pro Li',
    'Trimmer wireless profesional pentru contururi și detalii fine. Autonomie 2 ore.',
    64900,
    'RON',
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800',
    20,
    TRUE
),
(
    'd3333333-3333-3333-3333-333333333333',
    'Uppercut Deluxe Pomade',
    'Pomadă cu fixare medie și luciu natural. Ideală pentru stiluri clasice.',
    12900,
    'RON',
    'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800',
    50,
    TRUE
),
(
    'd4444444-4444-4444-4444-444444444444',
    'Reuzel Beard Foam',
    'Spumă pentru barbă cu ulei de argan. Hidratează și stilizează barba.',
    8900,
    'RON',
    'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800',
    35,
    TRUE
),
(
    'd5555555-5555-5555-5555-555555555555',
    'Cape Profesional Neagră',
    'Capă impermeabilă profesională. Material premium, închidere magnetică.',
    14900,
    'RON',
    'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800',
    25,
    TRUE
),
(
    'd6666666-6666-6666-6666-666666666666',
    'Set Foarfece Premium',
    'Set de 2 foarfece profesionale: tuns (6") și filare (6"). Oțel japonez.',
    199900,
    'RON',
    'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=800',
    10,
    TRUE
),
(
    'd7777777-7777-7777-7777-777777777777',
    'Perie Neck Duster',
    'Perie profesională pentru îndepărtarea părului. Mâner ergonomic din lemn.',
    4900,
    'RON',
    'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=800',
    40,
    TRUE
),
(
    'd8888888-8888-8888-8888-888888888888',
    'After Shave Clubman',
    'After shave clasic Pinaud Clubman. Parfum tradițional de barbershop.',
    6900,
    'RON',
    'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800',
    30,
    TRUE
);

-- ============================================
-- FEED CONTENT
-- ============================================
INSERT INTO content (id, author_id, type, caption, media_url, thumb_url, status) VALUES
(
    'e1111111-1111-1111-1111-111111111111',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'video',
    '🔥 Skin fade perfect în 15 minute! Urmărește tutorialul complet pentru tehnica mea signature. #fade #barber #tutorial',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400',
    'published'
),
(
    'e2222222-2222-2222-2222-222222222222',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'video',
    '✂️ Transformare completă! De la păr lung la buzz cut cu fade. Clientul a fost super mulțumit! 💈',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400',
    'published'
),
(
    'e3333333-3333-3333-3333-333333333333',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'video',
    '💈 Beard trim & styling session. Produsele folosite: Reuzel Beard Foam + Uppercut Pomade. Link în bio!',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400',
    'published'
),
(
    'e4444444-4444-4444-4444-444444444444',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'image',
    '📸 Setup-ul meu de lucru. Fiecare unealtă are locul ei! Organizarea e cheia eficienței. 🔧',
    'https://images.unsplash.com/photo-1621607512214-68297480165e?w=800',
    'https://images.unsplash.com/photo-1621607512214-68297480165e?w=400',
    'published'
),
(
    'e5555555-5555-5555-5555-555555555555',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'video',
    '🎓 Snippet din noul curs "Fade Masterclass"! Disponibil acum în Academy. Link în bio pentru acces! 📚',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400',
    'published'
),
(
    'e6666666-6666-6666-6666-666666666666',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'video',
    '🔥 Classic pompadour cu low fade! Stilul care nu moare niciodată. Ce părere aveți? 💬',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400',
    'published'
);

-- ============================================
-- Done! Your app should now have:
-- - Your complete profile (Edi Barber, creator role)
-- - 4 courses with modules and lessons
-- - 8 products in the shop
-- - 6 feed posts
-- ============================================
