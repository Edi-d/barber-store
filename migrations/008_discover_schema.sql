-- ============================================
-- BarberApp - Discover / Salon Discovery Schema
-- ============================================
-- Extends barbers with geo-coordinates, ratings,
-- pricing. Adds reviews, favorites, happy hours.
-- ============================================

-- ============================================
-- EXTEND BARBERS TABLE
-- ============================================
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(2,1) DEFAULT 0;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS reviews_count INT DEFAULT 0;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS avg_price_cents INT DEFAULT 0;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN NOT NULL DEFAULT FALSE;

-- Geo index for location queries
CREATE INDEX IF NOT EXISTS idx_barbers_geo ON barbers(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_barbers_promoted ON barbers(is_promoted) WHERE is_promoted = TRUE;

-- ============================================
-- SALON REVIEWS
-- ============================================
CREATE TABLE IF NOT EXISTS salon_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, barber_id) -- one review per user per salon
);

CREATE INDEX IF NOT EXISTS idx_salon_reviews_barber ON salon_reviews(barber_id);
CREATE INDEX IF NOT EXISTS idx_salon_reviews_user ON salon_reviews(user_id);

-- ============================================
-- SALON FAVORITES
-- ============================================
CREATE TABLE IF NOT EXISTS salon_favorites (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, barber_id)
);

CREATE INDEX IF NOT EXISTS idx_salon_favorites_user ON salon_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_salon_favorites_barber ON salon_favorites(barber_id);

-- ============================================
-- SALON HAPPY HOURS
-- ============================================
CREATE TABLE IF NOT EXISTS salon_happy_hours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
    discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 5 AND 80),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_happy_hours_barber ON salon_happy_hours(barber_id);
CREATE INDEX IF NOT EXISTS idx_happy_hours_active ON salon_happy_hours(active, starts_at, ends_at);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE salon_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_happy_hours ENABLE ROW LEVEL SECURITY;

-- Reviews: everyone can read, auth users can create/update/delete their own
CREATE POLICY "Reviews are viewable by everyone" ON salon_reviews
    FOR SELECT USING (true);

CREATE POLICY "Users can create reviews" ON salon_reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews" ON salon_reviews
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reviews" ON salon_reviews
    FOR DELETE USING (auth.uid() = user_id);

-- Favorites: users can manage their own
CREATE POLICY "Users can view own favorites" ON salon_favorites
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add favorites" ON salon_favorites
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove favorites" ON salon_favorites
    FOR DELETE USING (auth.uid() = user_id);

-- Happy hours: everyone can read active ones
CREATE POLICY "Happy hours are viewable by everyone" ON salon_happy_hours
    FOR SELECT USING (active = true);

-- ============================================
-- SEED DATA - Update existing barbers with geo
-- ============================================

-- Alex Popescu - Piata Victoriei area
UPDATE barbers SET
    latitude = 44.4530,
    longitude = 26.0861,
    cover_url = 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=600',
    phone = '+40721111111',
    avg_price_cents = 8000,
    rating_avg = 4.8,
    reviews_count = 47,
    is_promoted = TRUE
WHERE id = 'aa111111-1111-1111-1111-111111111111';

-- Mihai Ionescu - Piata Unirii area
UPDATE barbers SET
    latitude = 44.4268,
    longitude = 26.1025,
    cover_url = 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600',
    phone = '+40722222222',
    avg_price_cents = 12000,
    rating_avg = 4.5,
    reviews_count = 32,
    is_promoted = FALSE
WHERE id = 'aa222222-2222-2222-2222-222222222222';

-- Cristi Barber - Centru Vechi / Lipscani
UPDATE barbers SET
    latitude = 44.4323,
    longitude = 26.0989,
    cover_url = 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600',
    phone = '+40723333333',
    avg_price_cents = 15000,
    rating_avg = 4.9,
    reviews_count = 85,
    is_promoted = TRUE
WHERE id = 'aa333333-3333-3333-3333-333333333333';

-- ============================================
-- SEED DATA - New barber salons in Bucharest
-- ============================================
INSERT INTO barbers (id, name, avatar_url, bio, specialties, address, city, latitude, longitude, cover_url, phone, avg_price_cents, rating_avg, reviews_count, is_promoted, active) VALUES
(
    'aa444444-4444-4444-4444-444444444444',
    'Razor Studio',
    'https://images.unsplash.com/photo-1560869713-7d0a29430803?w=200',
    'Studio modern de frizerie cu echipamente de ultimă generație.',
    ARRAY['skin fade', 'beard design', 'hair tattoo'],
    'Str. Floreasca 52, Sector 1',
    'București',
    44.4627, 26.0933,
    'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600',
    '+40724444444',
    10000,
    4.7,
    63,
    FALSE,
    TRUE
),
(
    'aa555555-5555-5555-5555-555555555555',
    'The Gentleman''s Cut',
    'https://images.unsplash.com/photo-1534297635766-99e9128e93b5?w=200',
    'Barbershop premium cu atmosferă clasică. Whisky & grooming.',
    ARRAY['classic cuts', 'hot towel shave', 'gentleman style'],
    'Bd. Aviatorilor 28, Sector 1',
    'București',
    44.4530, 26.0835,
    'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600',
    '+40725555555',
    18000,
    4.6,
    91,
    TRUE,
    TRUE
),
(
    'aa666666-6666-6666-6666-666666666666',
    'BarberX Hub',
    'https://images.unsplash.com/photo-1521490683712-35a1cb235d1c?w=200',
    'Frizerie urbană pentru bărbatul modern. Walk-in friendly.',
    ARRAY['textured crop', 'buzz cut', 'line up'],
    'Str. Cotroceni 15, Sector 6',
    'București',
    44.4340, 26.0700,
    'https://images.unsplash.com/photo-1596362601603-1cf77acf3754?w=600',
    '+40726666666',
    6500,
    4.3,
    28,
    FALSE,
    TRUE
),
(
    'aa777777-7777-7777-7777-777777777777',
    'Crown Barbers',
    'https://images.unsplash.com/photo-1493106819501-66d381c466f1?w=200',
    'Experiențe premium de grooming. Rezervă-ți locul regal.',
    ARRAY['premium fade', 'beard grooming', 'scalp treatment'],
    'Calea Dorobanți 65, Sector 1',
    'București',
    44.4560, 26.0890,
    'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=600',
    '+40727777777',
    20000,
    4.9,
    124,
    TRUE,
    TRUE
),
(
    'aa888888-8888-8888-8888-888888888888',
    'FreshCutz',
    'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?w=200',
    'Stiluri fresh pentru tineret. Prețuri accesibile, calitate top.',
    ARRAY['fade', 'designs', 'color'],
    'Str. Obor 34, Sector 2',
    'București',
    44.4480, 26.1260,
    'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=600',
    '+40728888888',
    5500,
    4.4,
    56,
    FALSE,
    TRUE
),
(
    'aa999999-9999-9999-9999-999999999999',
    'Blade & Bone',
    'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=200',
    'Barbershop artizanal. Fiecare tuns e o operă de artă.',
    ARRAY['artistic cuts', 'beard sculpting', 'traditional shave'],
    'Bd. Tineretului 7, Sector 4',
    'București',
    44.4050, 26.1090,
    'https://images.unsplash.com/photo-1596728325488-b772cf538e54?w=600',
    '+40729999999',
    9000,
    4.2,
    19,
    FALSE,
    TRUE
),
(
    'aaa11111-1111-1111-1111-111111111111',
    'Elite Grooming Lounge',
    'https://images.unsplash.com/photo-1532710093739-9470acff878f?w=200',
    'Salon exclusivist cu servicii de lux. Programare obligatorie.',
    ARRAY['luxury grooming', 'facial', 'VIP treatment'],
    'Str. Pipera 112, Sector 2',
    'București',
    44.4780, 26.1150,
    'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=600',
    '+40730111111',
    25000,
    4.8,
    73,
    TRUE,
    TRUE
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SEED DATA - Barber availability for new salons
-- ============================================
-- Razor Studio: Mon-Fri 09:00-20:00, Sat 10:00-17:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa444444-4444-4444-4444-444444444444', 1, '09:00', '20:00'),
('aa444444-4444-4444-4444-444444444444', 2, '09:00', '20:00'),
('aa444444-4444-4444-4444-444444444444', 3, '09:00', '20:00'),
('aa444444-4444-4444-4444-444444444444', 4, '09:00', '20:00'),
('aa444444-4444-4444-4444-444444444444', 5, '09:00', '20:00'),
('aa444444-4444-4444-4444-444444444444', 6, '10:00', '17:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- The Gentleman's Cut: Mon-Fri 10:00-20:00, Sat 10:00-18:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa555555-5555-5555-5555-555555555555', 1, '10:00', '20:00'),
('aa555555-5555-5555-5555-555555555555', 2, '10:00', '20:00'),
('aa555555-5555-5555-5555-555555555555', 3, '10:00', '20:00'),
('aa555555-5555-5555-5555-555555555555', 4, '10:00', '20:00'),
('aa555555-5555-5555-5555-555555555555', 5, '10:00', '20:00'),
('aa555555-5555-5555-5555-555555555555', 6, '10:00', '18:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- BarberX Hub: Mon-Sat 08:00-19:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa666666-6666-6666-6666-666666666666', 1, '08:00', '19:00'),
('aa666666-6666-6666-6666-666666666666', 2, '08:00', '19:00'),
('aa666666-6666-6666-6666-666666666666', 3, '08:00', '19:00'),
('aa666666-6666-6666-6666-666666666666', 4, '08:00', '19:00'),
('aa666666-6666-6666-6666-666666666666', 5, '08:00', '19:00'),
('aa666666-6666-6666-6666-666666666666', 6, '09:00', '15:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Crown Barbers: Mon-Fri 09:00-21:00, Sat 10:00-18:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa777777-7777-7777-7777-777777777777', 1, '09:00', '21:00'),
('aa777777-7777-7777-7777-777777777777', 2, '09:00', '21:00'),
('aa777777-7777-7777-7777-777777777777', 3, '09:00', '21:00'),
('aa777777-7777-7777-7777-777777777777', 4, '09:00', '21:00'),
('aa777777-7777-7777-7777-777777777777', 5, '09:00', '21:00'),
('aa777777-7777-7777-7777-777777777777', 6, '10:00', '18:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- FreshCutz: Mon-Fri 10:00-19:00, Sat 10:00-16:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa888888-8888-8888-8888-888888888888', 1, '10:00', '19:00'),
('aa888888-8888-8888-8888-888888888888', 2, '10:00', '19:00'),
('aa888888-8888-8888-8888-888888888888', 3, '10:00', '19:00'),
('aa888888-8888-8888-8888-888888888888', 4, '10:00', '19:00'),
('aa888888-8888-8888-8888-888888888888', 5, '10:00', '19:00'),
('aa888888-8888-8888-8888-888888888888', 6, '10:00', '16:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Blade & Bone: Mon-Fri 09:00-18:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa999999-9999-9999-9999-999999999999', 1, '09:00', '18:00'),
('aa999999-9999-9999-9999-999999999999', 2, '09:00', '18:00'),
('aa999999-9999-9999-9999-999999999999', 3, '09:00', '18:00'),
('aa999999-9999-9999-9999-999999999999', 4, '09:00', '18:00'),
('aa999999-9999-9999-9999-999999999999', 5, '09:00', '18:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Elite Grooming Lounge: Mon-Fri 10:00-21:00, Sat 11:00-19:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aaa11111-1111-1111-1111-111111111111', 1, '10:00', '21:00'),
('aaa11111-1111-1111-1111-111111111111', 2, '10:00', '21:00'),
('aaa11111-1111-1111-1111-111111111111', 3, '10:00', '21:00'),
('aaa11111-1111-1111-1111-111111111111', 4, '10:00', '21:00'),
('aaa11111-1111-1111-1111-111111111111', 5, '10:00', '21:00'),
('aaa11111-1111-1111-1111-111111111111', 6, '11:00', '19:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- ============================================
-- SEED DATA - Happy Hours (active right now)
-- ============================================
INSERT INTO salon_happy_hours (barber_id, discount_percent, starts_at, ends_at) VALUES
(
    'aa111111-1111-1111-1111-111111111111',
    20,
    NOW(),
    NOW() + INTERVAL '2 hours'
),
(
    'aa666666-6666-6666-6666-666666666666',
    30,
    NOW(),
    NOW() + INTERVAL '3 hours'
),
(
    'aa888888-8888-8888-8888-888888888888',
    15,
    NOW(),
    NOW() + INTERVAL '1 hour 30 minutes'
);

-- ============================================
-- SEED DATA - Reviews (from demo user)
-- ============================================
INSERT INTO salon_reviews (user_id, barber_id, rating, comment) VALUES
('73a42488-5437-486e-8ad6-3697301949ac', 'aa111111-1111-1111-1111-111111111111', 5, 'Cel mai bun fade din București! Recomand cu încredere.'),
('73a42488-5437-486e-8ad6-3697301949ac', 'aa333333-3333-3333-3333-333333333333', 5, 'Cristi e un maestru. Atmosferă fantastică.'),
('73a42488-5437-486e-8ad6-3697301949ac', 'aa777777-7777-7777-7777-777777777777', 4, 'Serviciu premium, prețuri pe măsură. Merită experiența.')
ON CONFLICT (user_id, barber_id) DO NOTHING;

-- ============================================
-- SEED DATA - Favorites (demo user)
-- ============================================
INSERT INTO salon_favorites (user_id, barber_id) VALUES
('73a42488-5437-486e-8ad6-3697301949ac', 'aa111111-1111-1111-1111-111111111111'),
('73a42488-5437-486e-8ad6-3697301949ac', 'aa333333-3333-3333-3333-333333333333'),
('73a42488-5437-486e-8ad6-3697301949ac', 'aa777777-7777-7777-7777-777777777777'),
('73a42488-5437-486e-8ad6-3697301949ac', 'aaa11111-1111-1111-1111-111111111111')
ON CONFLICT (user_id, barber_id) DO NOTHING;

-- ============================================
-- Done! Discover schema ready.
-- ============================================
