-- ============================================
-- BarberApp - Appointments System
-- ============================================

-- ============================================
-- BARBER SERVICES
-- ============================================
CREATE TABLE IF NOT EXISTS barber_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    duration_min INT NOT NULL DEFAULT 30,
    price_cents INT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RON',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- BARBERS (staff members)
-- ============================================
CREATE TABLE IF NOT EXISTS barbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    specialties TEXT[],
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- APPOINTMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE RESTRICT,
    service_id UUID NOT NULL REFERENCES barber_services(id) ON DELETE RESTRICT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_min INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | completed | cancelled | no_show
    notes TEXT,
    total_cents INT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RON',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_barber ON appointments(barber_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_barber_services_active ON barber_services(active);
CREATE INDEX IF NOT EXISTS idx_barbers_active ON barbers(active);

-- ============================================
-- SEED DATA - Services
-- ============================================
INSERT INTO barber_services (id, name, description, duration_min, price_cents) VALUES
(
    'f1111111-1111-1111-1111-111111111111',
    'Tuns Clasic',
    'Tuns clasic cu mașina și foarfeca, include spălat și styling.',
    45,
    8000
),
(
    'f2222222-2222-2222-2222-222222222222',
    'Fade Premium',
    'Skin fade sau low fade profesional cu tranziții impecabile.',
    60,
    12000
),
(
    'f3333333-3333-3333-3333-333333333333',
    'Tuns + Barbă',
    'Pachet complet: tuns cu fade + aranjat barbă.',
    75,
    15000
),
(
    'f4444444-4444-4444-4444-444444444444',
    'Aranjat Barbă',
    'Conturare și styling barbă cu produse premium.',
    30,
    5000
),
(
    'f5555555-5555-5555-5555-555555555555',
    'Buzz Cut',
    'Tuns scurt uniform cu mașina.',
    20,
    5000
),
(
    'f6666666-6666-6666-6666-666666666666',
    'Kids Cut',
    'Tuns pentru copii (sub 12 ani).',
    30,
    5000
),
(
    'f7777777-7777-7777-7777-777777777777',
    'Royal Treatment',
    'Experiența completă: tuns premium, barbă, prosop cald, masaj facial.',
    90,
    25000
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SEED DATA - Barbers
-- ============================================
INSERT INTO barbers (id, name, avatar_url, bio, specialties) VALUES
(
    'aa111111-1111-1111-1111-111111111111',
    'Alex Popescu',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
    'Specialist în fade-uri și tunsori moderne. 8 ani experiență.',
    ARRAY['fade', 'modern cuts', 'beard']
),
(
    'aa222222-2222-2222-2222-222222222222',
    'Mihai Ionescu',
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200',
    'Expert în tunsori clasice și stiluri tradiționale.',
    ARRAY['classic cuts', 'pompadour', 'straight razor']
),
(
    'aa333333-3333-3333-3333-333333333333',
    'Cristi Barber',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
    'Fondator Barber Store. Pasionat de arta frizuriei.',
    ARRAY['all styles', 'beard sculpting', 'education']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SEED DATA - Sample Appointments for demo user
-- ============================================
-- Note: These use the demo user ID from 003_seed_data.sql
-- Adjust if your user ID is different

-- Past appointment (completed)
INSERT INTO appointments (id, user_id, barber_id, service_id, scheduled_at, duration_min, status, total_cents, notes) VALUES
(
    'bb111111-1111-1111-1111-111111111111',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'aa111111-1111-1111-1111-111111111111',
    'f2222222-2222-2222-2222-222222222222',
    NOW() - INTERVAL '7 days',
    60,
    'completed',
    12000,
    'Fade mediu, păstrat lungimea sus.'
),
-- Past appointment (completed)
(
    'bb222222-2222-2222-2222-222222222222',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'aa333333-3333-3333-3333-333333333333',
    'f3333333-3333-3333-3333-333333333333',
    NOW() - INTERVAL '21 days',
    75,
    'completed',
    15000,
    NULL
),
-- Upcoming appointment (confirmed)
(
    'bb333333-3333-3333-3333-333333333333',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'aa222222-2222-2222-2222-222222222222',
    'f7777777-7777-7777-7777-777777777777',
    NOW() + INTERVAL '3 days' + INTERVAL '14 hours',
    90,
    'confirmed',
    25000,
    'Royal Treatment - zi de răsfăț!'
),
-- Future appointment (pending)
(
    'bb444444-4444-4444-4444-444444444444',
    '73a42488-5437-486e-8ad6-3697301949ac',
    'aa111111-1111-1111-1111-111111111111',
    'f1111111-1111-1111-1111-111111111111',
    NOW() + INTERVAL '10 days' + INTERVAL '10 hours',
    45,
    'pending',
    8000,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE barber_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Everyone can view services and barbers
CREATE POLICY "Services are viewable by everyone" ON barber_services
    FOR SELECT USING (active = true);

CREATE POLICY "Barbers are viewable by everyone" ON barbers
    FOR SELECT USING (active = true);

-- Users can view their own appointments
CREATE POLICY "Users can view own appointments" ON appointments
    FOR SELECT USING (auth.uid() = user_id);

-- Users can create appointments
CREATE POLICY "Users can create appointments" ON appointments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own appointments (cancel)
CREATE POLICY "Users can update own appointments" ON appointments
    FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- Done! Appointments system ready.
-- ============================================
