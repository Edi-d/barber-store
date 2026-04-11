-- ============================================
-- BarberApp - Onboarding, Salons & Invites
-- ============================================
-- Adds onboarding fields to profiles, creates
-- salons, salon_members, salon_invites tables.
-- ============================================

-- ============================================
-- 1. PROFILES — onboarding columns
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_role TEXT; -- 'salon_owner' | 'barber' | NULL

-- Update the handle_new_user() trigger to set onboarding_completed = false explicitly
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
    VALUES (
        NEW.id,
        _username,
        _display_name,
        'user',
        FALSE
    );

    RETURN NEW;
END;
$$;

-- ============================================
-- 2. SALONS
-- ============================================
CREATE TABLE IF NOT EXISTS salons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE salons ENABLE ROW LEVEL SECURITY;

-- Everyone can view salons
CREATE POLICY "Salons are viewable by everyone" ON salons
    FOR SELECT USING (true);

-- Owner can insert their own salon
CREATE POLICY "Owner can create salon" ON salons
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Owner can update their own salon
CREATE POLICY "Owner can update own salon" ON salons
    FOR UPDATE USING (auth.uid() = owner_id);

-- ============================================
-- 3. SALON MEMBERS
-- ============================================
CREATE TABLE IF NOT EXISTS salon_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'barber', -- 'owner' | 'barber'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(salon_id, profile_id)
);

ALTER TABLE salon_members ENABLE ROW LEVEL SECURITY;

-- Members of a salon can see other members
CREATE POLICY "Salon members are viewable by salon members" ON salon_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salon_members sm
            WHERE sm.salon_id = salon_members.salon_id
            AND sm.profile_id = auth.uid()
        )
    );

-- Salon owner can add members
CREATE POLICY "Salon owner can add members" ON salon_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = salon_id
            AND s.owner_id = auth.uid()
        )
        OR
        -- Allow barbers to add themselves via invite
        auth.uid() = profile_id
    );

-- ============================================
-- 4. SALON INVITES
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

-- Salon owner can view invites
CREATE POLICY "Owner can view salon invites" ON salon_invites
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = salon_id
            AND s.owner_id = auth.uid()
        )
    );

-- Salon owner can create invites
CREATE POLICY "Owner can create invites" ON salon_invites
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = salon_id
            AND s.owner_id = auth.uid()
        )
    );

-- Any authenticated user can use (update) an invite
CREATE POLICY "Authenticated users can use invites" ON salon_invites
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Anyone authenticated can select invites by code (to validate)
CREATE POLICY "Authenticated users can lookup invite by code" ON salon_invites
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================
-- Done! Onboarding & salon system ready.
-- ============================================