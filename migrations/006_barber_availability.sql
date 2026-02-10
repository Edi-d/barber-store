-- ============================================
-- BarberApp - Barber Availability & Location
-- ============================================
-- Adds address/city to barbers and creates
-- the barber_availability table for scheduling.
-- ============================================

-- ============================================
-- ADD LOCATION FIELDS TO BARBERS
-- ============================================
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'București';

-- Update existing barbers with addresses
UPDATE barbers SET address = 'Str. Victoriei 45, Sector 1', city = 'București'
WHERE id = 'aa111111-1111-1111-1111-111111111111';

UPDATE barbers SET address = 'Bd. Unirii 12, Sector 3', city = 'București'
WHERE id = 'aa222222-2222-2222-2222-222222222222';

UPDATE barbers SET address = 'Str. Lipscani 78, Sector 3', city = 'București'
WHERE id = 'aa333333-3333-3333-3333-333333333333';

-- ============================================
-- BARBER AVAILABILITY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS barber_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(barber_id, day_of_week)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_barber_availability_barber ON barber_availability(barber_id, day_of_week);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE barber_availability ENABLE ROW LEVEL SECURITY;

-- Everyone can view availability
CREATE POLICY "Availability is viewable by everyone" ON barber_availability
    FOR SELECT USING (true);

-- ============================================
-- SEED DATA - Working Hours
-- ============================================
-- Alex Popescu: Mon-Fri 09:00-18:00, Sat 10:00-15:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa111111-1111-1111-1111-111111111111', 1, '09:00', '18:00'),
('aa111111-1111-1111-1111-111111111111', 2, '09:00', '18:00'),
('aa111111-1111-1111-1111-111111111111', 3, '09:00', '18:00'),
('aa111111-1111-1111-1111-111111111111', 4, '09:00', '18:00'),
('aa111111-1111-1111-1111-111111111111', 5, '09:00', '18:00'),
('aa111111-1111-1111-1111-111111111111', 6, '10:00', '15:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Mihai Ionescu: Mon-Fri 10:00-19:00, Sat 10:00-16:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa222222-2222-2222-2222-222222222222', 1, '10:00', '19:00'),
('aa222222-2222-2222-2222-222222222222', 2, '10:00', '19:00'),
('aa222222-2222-2222-2222-222222222222', 3, '10:00', '19:00'),
('aa222222-2222-2222-2222-222222222222', 4, '10:00', '19:00'),
('aa222222-2222-2222-2222-222222222222', 5, '10:00', '19:00'),
('aa222222-2222-2222-2222-222222222222', 6, '10:00', '16:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Cristi Barber: Mon-Sat 08:00-17:00
INSERT INTO barber_availability (barber_id, day_of_week, start_time, end_time) VALUES
('aa333333-3333-3333-3333-333333333333', 1, '08:00', '17:00'),
('aa333333-3333-3333-3333-333333333333', 2, '08:00', '17:00'),
('aa333333-3333-3333-3333-333333333333', 3, '08:00', '17:00'),
('aa333333-3333-3333-3333-333333333333', 4, '08:00', '17:00'),
('aa333333-3333-3333-3333-333333333333', 5, '08:00', '17:00'),
('aa333333-3333-3333-3333-333333333333', 6, '09:00', '14:00')
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- Note: Sunday (day_of_week = 0) is not seeded = closed for all barbers

-- ============================================
-- Done! Barber availability system ready.
-- ============================================
