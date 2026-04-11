-- ============================================
-- Fix: Re-create trigger + add INSERT policy
-- ============================================
-- The handle_new_user() trigger may not be attached
-- to auth.users. This migration ensures it is.
-- Also adds an INSERT policy so the client can
-- create a profile as a fallback if the trigger fails.
-- ============================================

-- 1. Re-create the function (idempotent)
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
    )
    ON CONFLICT (id) DO NOTHING; -- safety: don't fail if profile already exists

    RETURN NEW;
END;
$$;

-- 2. Drop and re-create the trigger (ensures it's attached)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Add INSERT policy so client can create own profile as fallback
-- (if the trigger fails, signUp creates it from the client)
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
