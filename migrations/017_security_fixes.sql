-- ============================================================================
-- Migration 017: Critical Security Fixes
-- ============================================================================
-- 1. Prevent role escalation on profiles
-- 2. Fix salon_invites UPDATE policy (was wide open)
-- 3. Fix salon_members INSERT policy (allowed self-joining any salon)
-- 4. Fix counter triggers with SECURITY DEFINER (bypass RLS)
-- 5. Fix handle_new_user() with ON CONFLICT handling
-- ============================================================================

-- ============================================================================
-- 1. PREVENT ROLE ESCALATION ON PROFILES
-- ============================================================================
-- Users can currently UPDATE their own role column to 'admin'.
-- This trigger resets role to its original value unless the caller is
-- the Supabase service_role (which runs outside RLS / as superuser).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- ============================================================================
-- 2. FIX salon_invites UPDATE POLICY
-- ============================================================================
-- Old policy allowed ANY authenticated user to UPDATE ANY field on ANY row.
-- New policy restricts to: setting used_by = self, only on unused & unexpired.
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can use invites" ON salon_invites;
CREATE POLICY "Authenticated users can use invites" ON salon_invites
  FOR UPDATE
  USING (
    used_by IS NULL
    AND expires_at > NOW()
  )
  WITH CHECK (
    used_by = auth.uid()
  );

-- ============================================================================
-- 3. FIX salon_members INSERT POLICY
-- ============================================================================
-- Old policy had `OR auth.uid() = profile_id` which let anyone join any salon
-- without an invite. New policy: owner can add anyone, OR self-add requires a
-- valid unused invite for that salon.
-- ============================================================================

DROP POLICY IF EXISTS "Salon owner can add members" ON salon_members;
CREATE POLICY "Salon owner can add members" ON salon_members
  FOR INSERT WITH CHECK (
    -- Salon owner can add anyone
    EXISTS (
      SELECT 1 FROM salons s
      WHERE s.id = salon_id
      AND s.owner_id = auth.uid()
    )
    OR (
      -- Self-adding requires: you are the profile AND a valid unused invite exists
      auth.uid() = profile_id
      AND EXISTS (
        SELECT 1 FROM salon_invites si
        WHERE si.salon_id = salon_members.salon_id
        AND si.used_by = auth.uid()
        AND si.used_at IS NOT NULL
        AND si.expires_at > NOW()
      )
    )
  );

-- ============================================================================
-- 4. FIX COUNTER TRIGGERS — add SECURITY DEFINER
-- ============================================================================
-- These trigger functions UPDATE the content table but run as the invoking
-- user, which may be blocked by RLS. SECURITY DEFINER + pinned search_path
-- lets them bypass RLS safely.
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_content_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE content
  SET likes_count = likes_count + 1
  WHERE id = NEW.content_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_content_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE content
  SET likes_count = GREATEST(likes_count - 1, 0)
  WHERE id = OLD.content_id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION increment_content_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE content
  SET comments_count = comments_count + 1
  WHERE id = NEW.content_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_content_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE content
  SET comments_count = GREATEST(comments_count - 1, 0)
  WHERE id = OLD.content_id;
  RETURN OLD;
END;
$$;

-- ============================================================================
-- 5. FIX handle_new_user() — ON CONFLICT for id AND username collisions
-- ============================================================================
-- If a profile with the same id already exists, do nothing (idempotent).
-- If the generated username collides, append random chars and retry.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _username TEXT;
  _display_name TEXT;
  _retries INT := 0;
BEGIN
  _username := COALESCE(
    NEW.raw_user_meta_data ->> 'username',
    SPLIT_PART(NEW.email, '@', 1) || '_' || SUBSTR(NEW.id::TEXT, 1, 4)
  );

  _display_name := COALESCE(
    NEW.raw_user_meta_data ->> 'display_name',
    _username
  );

  LOOP
    BEGIN
      INSERT INTO public.profiles (id, username, display_name, role, onboarding_completed)
      VALUES (NEW.id, _username, _display_name, 'user', FALSE)
      ON CONFLICT (id) DO NOTHING;

      -- If the row was inserted (or already existed for this id), we're done
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        -- Username collision — append random suffix and retry
        _retries := _retries + 1;
        IF _retries > 5 THEN
          RAISE EXCEPTION 'Could not generate unique username after 5 attempts for user %', NEW.id;
        END IF;
        _username := COALESCE(
          NEW.raw_user_meta_data ->> 'username',
          SPLIT_PART(NEW.email, '@', 1)
        ) || '_' || SUBSTR(md5(random()::TEXT), 1, 6);
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Re-create the trigger to ensure it's attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
