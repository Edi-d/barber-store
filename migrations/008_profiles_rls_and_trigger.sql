-- ============================================
-- BarberApp - Profiles RLS & Auto-Create Trigger
-- ============================================
-- Adds RLS policies to profiles and a trigger
-- to auto-create a profile when a user signs up.
-- ============================================

-- ============================================
-- ENABLE RLS ON PROFILES
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Everyone can view profiles (public data)
CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Only the trigger (via service_role) can insert profiles
-- No INSERT policy needed — the trigger runs as SECURITY DEFINER

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

-- Function that creates a profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    _username TEXT;
    _display_name TEXT;
BEGIN
    -- Get username from metadata, or generate from email
    _username := COALESCE(
        NEW.raw_user_meta_data ->> 'username',
        SPLIT_PART(NEW.email, '@', 1) || '_' || SUBSTR(NEW.id::TEXT, 1, 4)
    );

    -- Get display_name from metadata
    _display_name := COALESCE(
        NEW.raw_user_meta_data ->> 'display_name',
        _username
    );

    INSERT INTO public.profiles (id, username, display_name, role)
    VALUES (
        NEW.id,
        _username,
        _display_name,
        'user'
    );

    RETURN NEW;
END;
$$;

-- Trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Done! Profiles RLS and auto-creation ready.
-- ============================================
