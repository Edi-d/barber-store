-- ============================================
-- Migration 010: Unified Salon System
-- ============================================
-- Merges onboarding, salons, salon_members,
-- salon_invites with existing discover/booking
-- system. Migrates salon-level data from
-- barbers to a proper salons table.
-- ============================================

-- ============================================
-- 1. PROFILES — onboarding columns
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_role TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    _username TEXT;
    _display_name TEXT;
BEGIN
    _username := COALESCE(
        NEW.raw_user_meta_data ->> 'username',
        SPLIT_PART(NEW.email, '@', 1) || '_' || SUBSTR(NEW.id::TEXT, 1, 4)
    );
    _display_name := COALESCE(
        NEW.raw_user_meta_data ->> 'display_name',
        _username
    );
    INSERT INTO public.profiles (id, username, display_name, role, onboarding_completed)
    VALUES (NEW.id, _username, _display_name, 'user', FALSE);
    RETURN NEW;
END;
$$;

-- ============================================
-- 2. SALONS TABLE (primary business entity)
-- ============================================
CREATE TABLE IF NOT EXISTS salons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    phone TEXT,
    avatar_url TEXT,
    cover_url TEXT,
    bio TEXT,
    specialties TEXT[],
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    rating_avg NUMERIC(2,1) DEFAULT 0,
    reviews_count INT DEFAULT 0,
    avg_price_cents INT DEFAULT 0,
    is_promoted BOOLEAN DEFAULT FALSE,
    amenities TEXT[] DEFAULT '{}',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE salons ENABLE ROW LEVEL SECURITY;

-- Make owner_id nullable (colleague's migration may have it NOT NULL, but seed barbers have no profile_id)
ALTER TABLE salons ALTER COLUMN owner_id DROP NOT NULL;

-- Add columns that may not exist from colleague's simpler migration
ALTER TABLE salons ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS specialties TEXT[];
ALTER TABLE salons ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(2,1) DEFAULT 0;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS reviews_count INT DEFAULT 0;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS avg_price_cents INT DEFAULT 0;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT FALSE;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS amenities TEXT[] DEFAULT '{}';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

DROP POLICY IF EXISTS "Salons are viewable by everyone" ON salons;
CREATE POLICY "Salons are viewable by everyone" ON salons
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owner can create salon" ON salons;
CREATE POLICY "Owner can create salon" ON salons
    FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owner can update own salon" ON salons;
CREATE POLICY "Owner can update own salon" ON salons
    FOR UPDATE USING (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_salons_geo ON salons(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_salons_promoted ON salons(is_promoted) WHERE is_promoted = TRUE;

-- ============================================
-- 3. SALON_MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS salon_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'barber',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(salon_id, profile_id)
);

ALTER TABLE salon_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Salon members viewable by salon members" ON salon_members;
CREATE POLICY "Salon members viewable by salon members" ON salon_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salon_members sm
            WHERE sm.salon_id = salon_members.salon_id
            AND sm.profile_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Salon owner can add members" ON salon_members;
CREATE POLICY "Salon owner can add members" ON salon_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid()
        )
        OR auth.uid() = profile_id
    );

-- ============================================
-- 4. SALON_INVITES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS salon_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES profiles(id),
    used_by UUID REFERENCES profiles(id),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE salon_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view salon invites" ON salon_invites;
CREATE POLICY "Owner can view salon invites" ON salon_invites
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid())
    );
DROP POLICY IF EXISTS "Owner can create invites" ON salon_invites;
CREATE POLICY "Owner can create invites" ON salon_invites
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid())
    );
DROP POLICY IF EXISTS "Authenticated users can use invites" ON salon_invites;
CREATE POLICY "Authenticated users can use invites" ON salon_invites
    FOR UPDATE USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can lookup invite by code" ON salon_invites;
CREATE POLICY "Authenticated users can lookup invite by code" ON salon_invites
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================
-- 5. BARBERS — add salon_id + role
-- ============================================
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS salon_id UUID REFERENCES salons(id);
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'owner';

-- ============================================
-- 5b. BARBER_SERVICES — add category
-- ============================================
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Tuns';

UPDATE barber_services SET category = 'Tuns' WHERE id IN (
    'f1111111-1111-1111-1111-111111111111',
    'f2222222-2222-2222-2222-222222222222',
    'f5555555-5555-5555-5555-555555555555',
    'f6666666-6666-6666-6666-666666666666'
);
UPDATE barber_services SET category = 'Barbă' WHERE id = 'f4444444-4444-4444-4444-444444444444';
UPDATE barber_services SET category = 'Pachete' WHERE id IN (
    'f3333333-3333-3333-3333-333333333333',
    'f7777777-7777-7777-7777-777777777777'
);

-- ============================================
-- 6. DROP old salon-level tables (seed data only, safe to recreate)
-- ============================================
DROP TABLE IF EXISTS salon_photos CASCADE;
DROP TABLE IF EXISTS salon_reviews CASCADE;
DROP TABLE IF EXISTS salon_favorites CASCADE;
DROP TABLE IF EXISTS salon_happy_hours CASCADE;

-- ============================================
-- 7. RECREATE salon-level tables with salon_id FK
-- ============================================

CREATE TABLE salon_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, salon_id)
);
ALTER TABLE salon_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reviews viewable by everyone" ON salon_reviews;
CREATE POLICY "Reviews viewable by everyone" ON salon_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can create reviews" ON salon_reviews;
CREATE POLICY "Users can create reviews" ON salon_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own reviews" ON salon_reviews;
CREATE POLICY "Users can update own reviews" ON salon_reviews FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own reviews" ON salon_reviews;
CREATE POLICY "Users can delete own reviews" ON salon_reviews FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE salon_favorites (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, salon_id)
);
ALTER TABLE salon_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own favorites" ON salon_favorites;
CREATE POLICY "Users can view own favorites" ON salon_favorites FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can add favorites" ON salon_favorites;
CREATE POLICY "Users can add favorites" ON salon_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can remove favorites" ON salon_favorites;
CREATE POLICY "Users can remove favorites" ON salon_favorites FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE salon_happy_hours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 5 AND 80),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);
ALTER TABLE salon_happy_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Happy hours viewable by everyone" ON salon_happy_hours;
CREATE POLICY "Happy hours viewable by everyone" ON salon_happy_hours FOR SELECT USING (active = true);

CREATE TABLE salon_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    caption TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE salon_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Salon photos viewable by everyone" ON salon_photos;
CREATE POLICY "Salon photos viewable by everyone" ON salon_photos FOR SELECT USING (true);

-- ============================================
-- 8. DATA MIGRATION: barbers → salons
-- For each active barber with coordinates,
-- create a salon entry and link the barber.
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
-- 9. RE-SEED: Reviews (with salon_id)
-- ============================================
INSERT INTO salon_reviews (user_id, salon_id, rating, comment)
SELECT '73a42488-5437-486e-8ad6-3697301949ac', b.salon_id, v.rating, v.comment
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
-- 10. RE-SEED: Favorites (with salon_id)
-- ============================================
INSERT INTO salon_favorites (user_id, salon_id)
SELECT '73a42488-5437-486e-8ad6-3697301949ac', b.salon_id
FROM barbers b
WHERE b.id IN (
    'aa111111-1111-1111-1111-111111111111',
    'aa333333-3333-3333-3333-333333333333',
    'aa777777-7777-7777-7777-777777777777',
    'aaa11111-1111-1111-1111-111111111111'
) AND b.salon_id IS NOT NULL
ON CONFLICT (user_id, salon_id) DO NOTHING;

-- ============================================
-- 11. RE-SEED: Happy Hours (with salon_id)
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
-- 12. RE-SEED: Photos (with salon_id)
-- ============================================

-- Helper: insert photos for a salon (identified by original barber_id)
DO $$
DECLARE
    v_salon_id UUID;
BEGIN
    -- aa111111 (Alex Popescu / Barber Store)
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa111111-1111-1111-1111-111111111111';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Interior salon', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'Zona de lucru', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Detalii', 2);
    END IF;

    -- aa222222 (Mihai Ionescu)
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa222222-2222-2222-2222-222222222222';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'Salon clasic', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Scaune vintage', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1596362601603-1cf77acf3754?w=800', 'Atmosfera', 2);
    END IF;

    -- aa333333 (Cristi Barber)
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa333333-3333-3333-3333-333333333333';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Centru Vechi', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=800', 'Interior', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Produse premium', 2),
        (v_salon_id, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Detalii', 3);
    END IF;

    -- aa444444 (Razor Studio)
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa444444-4444-4444-4444-444444444444';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Studio modern', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1596362601603-1cf77acf3754?w=800', 'Echipamente', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Zona de asteptare', 2);
    END IF;

    -- aa555555 (The Gentleman's Cut)
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa555555-5555-5555-5555-555555555555';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800', 'Lounge', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=800', 'Bar', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Interior clasic', 2),
        (v_salon_id, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'Scaune', 3);
    END IF;

    -- aa666666 (BarberX Hub)
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa666666-6666-6666-6666-666666666666';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1596362601603-1cf77acf3754?w=800', 'Urban vibe', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Interior', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Zona de lucru', 2);
    END IF;

    -- aa777777 (Crown Barbers)
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa777777-7777-7777-7777-777777777777';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=800', 'Premium interior', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800', 'Detalii gold', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Lounge VIP', 2),
        (v_salon_id, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800', 'Scaune premium', 3);
    END IF;

    -- aa888888 (FreshCutz)
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa888888-8888-8888-8888-888888888888';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=800', 'Fresh vibes', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1596362601603-1cf77acf3754?w=800', 'Interior colorat', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800', 'Zona de lucru', 2);
    END IF;

    -- aa999999 (Blade & Bone)
    SELECT salon_id INTO v_salon_id FROM barbers WHERE id = 'aa999999-9999-9999-9999-999999999999';
    IF v_salon_id IS NOT NULL THEN
        INSERT INTO salon_photos (salon_id, photo_url, caption, sort_order) VALUES
        (v_salon_id, 'https://images.unsplash.com/photo-1596728325488-b772cf538e54?w=800', 'Artisan studio', 0),
        (v_salon_id, 'https://images.unsplash.com/photo-1585747860019-8ddddc27a82b?w=800', 'Unelte traditionale', 1),
        (v_salon_id, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800', 'Interior', 2);
    END IF;

    -- aaa11111 (Elite Grooming Lounge)
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
-- 13. SEED: Team members for first salon
-- ============================================
DO $$
DECLARE
    v_salon_id UUID;
    v_member1_id UUID;
    v_member2_id UUID;
BEGIN
    -- Get the salon for "Barber Store" / first barber
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

    -- Availability for Andrei (Mon-Sat 09:00-18:00)
    INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time, is_available)
    SELECT v_member1_id, d, '09:00', '18:00', d != 0
    FROM generate_series(0, 6) AS d;

    -- Availability for Mihai (Mon-Sat 10:00-19:00)
    INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time, is_available)
    SELECT v_member2_id, d, '10:00', '19:00', d != 0
    FROM generate_series(0, 6) AS d;

    RAISE NOTICE 'Added team members: Andrei (%) and Mihai (%) to salon %', v_member1_id, v_member2_id, v_salon_id;
END $$;

-- ============================================
-- Done! Unified salon system ready.
-- Run this INSTEAD of the old 010_salon_team.sql
-- ============================================
