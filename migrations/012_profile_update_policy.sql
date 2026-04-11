-- ============================================
-- Add UPDATE policy on profiles
-- Trigger auto-creates profile on signup,
-- onboarding updates it with chosen username
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can view profiles
CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

-- Trigger inserts via SECURITY DEFINER (bypasses RLS)
-- Keep INSERT policy as fallback
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profiles'
        AND policyname = 'Users can insert own profile'
    ) THEN
        CREATE POLICY "Users can insert own profile" ON profiles
            FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
END
$$;

-- Users can update their own profile (needed for onboarding)
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
