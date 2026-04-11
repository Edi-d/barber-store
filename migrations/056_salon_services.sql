-- ============================================
-- BarberApp - Link Services & Barbers to Salons
-- ============================================
-- Adds salon_id to barber_services and barbers,
-- creates barber_service_assignments and salon_hours.
-- ============================================

-- ============================================
-- 1. EXTEND barber_services WITH salon_id + category
-- ============================================
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS salon_id UUID REFERENCES salons(id) ON DELETE CASCADE;
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
-- categories: tuns | barba | colorare | tratament | pachet | general

CREATE INDEX IF NOT EXISTS idx_barber_services_salon ON barber_services(salon_id);

-- Allow salon owner to manage services
CREATE POLICY "Owner can insert services" ON barber_services
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid()
        )
    );

CREATE POLICY "Owner can update services" ON barber_services
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid()
        )
    );

CREATE POLICY "Owner can delete services" ON barber_services
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 2. EXTEND barbers WITH salon_id
-- ============================================
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS salon_id UUID REFERENCES salons(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_barbers_salon ON barbers(salon_id);

-- Allow salon owner to manage barbers
CREATE POLICY "Owner can insert barbers" ON barbers
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid()
        )
    );

CREATE POLICY "Owner can update barbers" ON barbers
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 3. BARBER ↔ SERVICE ASSIGNMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS barber_service_assignments (
    barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES barber_services(id) ON DELETE CASCADE,
    PRIMARY KEY (barber_id, service_id)
);

ALTER TABLE barber_service_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments viewable by everyone" ON barber_service_assignments
    FOR SELECT USING (true);

CREATE POLICY "Owner can manage assignments" ON barber_service_assignments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM barbers b
            JOIN salons s ON s.id = b.salon_id
            WHERE b.id = barber_id AND s.owner_id = auth.uid()
        )
    );

CREATE POLICY "Owner can delete assignments" ON barber_service_assignments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM barbers b
            JOIN salons s ON s.id = b.salon_id
            WHERE b.id = barber_id AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 4. SALON HOURS (operating schedule per day)
-- ============================================
CREATE TABLE IF NOT EXISTS salon_hours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    open_time TIME NOT NULL DEFAULT '09:00',
    close_time TIME NOT NULL DEFAULT '18:00',
    UNIQUE(salon_id, day_of_week)
);

ALTER TABLE salon_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salon hours viewable by everyone" ON salon_hours
    FOR SELECT USING (true);

CREATE POLICY "Owner can manage salon hours" ON salon_hours
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid()
        )
    );

CREATE POLICY "Owner can update salon hours" ON salon_hours
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid()
        )
    );

CREATE INDEX IF NOT EXISTS idx_salon_hours_salon ON salon_hours(salon_id, day_of_week);

-- ============================================
-- 5. EXTEND salons WITH description + cover_url
-- ============================================
ALTER TABLE salons ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- ============================================
-- Done! Salon services system ready.
-- ============================================
