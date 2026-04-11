-- ============================================
-- Migration 025: Fix appointment booking for salon owners
-- ============================================
-- Problems:
-- 1. Salon members may not have entries in `barbers` table
-- 2. RLS on appointments only allows user_id = auth.uid()
-- 3. Salon owners/members need to view all salon appointments
-- ============================================

-- ─── 1. Ensure all salon_members have a barbers record ───
DO $$
DECLARE
    v_member RECORD;
    v_barber_id UUID;
    v_profile RECORD;
BEGIN
    FOR v_member IN
        SELECT sm.*, s.name AS salon_name
        FROM salon_members sm
        JOIN salons s ON s.id = sm.salon_id
        WHERE NOT EXISTS (
            SELECT 1 FROM barbers b
            WHERE b.profile_id = sm.profile_id
            AND b.salon_id = sm.salon_id
        )
    LOOP
        -- Fetch profile info
        SELECT display_name, avatar_url, username
        INTO v_profile
        FROM profiles
        WHERE id = v_member.profile_id;

        INSERT INTO barbers (
            profile_id, salon_id, name, avatar_url, active, role
        ) VALUES (
            v_member.profile_id,
            v_member.salon_id,
            COALESCE(v_profile.display_name, v_profile.username, 'Barber'),
            v_profile.avatar_url,
            true,
            v_member.role
        )
        RETURNING id INTO v_barber_id;

        RAISE NOTICE 'Created barber % for member % in salon %',
            v_barber_id, v_member.profile_id, v_member.salon_name;
    END LOOP;
END $$;

-- ─── 2. RLS: Salon members can INSERT appointments ───
-- Allow salon owners and barbers to create appointments for their salon
DROP POLICY IF EXISTS "Salon members can create appointments" ON appointments;
CREATE POLICY "Salon members can create appointments" ON appointments
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM salon_members sm
            JOIN barbers b ON b.salon_id = sm.salon_id
            WHERE sm.profile_id = auth.uid()
            AND b.id = barber_id
        )
    );

-- ─── 3. RLS: Salon members can VIEW salon appointments ───
DROP POLICY IF EXISTS "Salon members can view salon appointments" ON appointments;
CREATE POLICY "Salon members can view salon appointments" ON appointments
    FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM salon_members sm
            JOIN barbers b ON b.salon_id = sm.salon_id
            WHERE sm.profile_id = auth.uid()
            AND b.id = barber_id
        )
    );

-- ─── 4. RLS: Salon members can UPDATE salon appointments ───
DROP POLICY IF EXISTS "Salon members can update salon appointments" ON appointments;
CREATE POLICY "Salon members can update salon appointments" ON appointments
    FOR UPDATE USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM salon_members sm
            JOIN barbers b ON b.salon_id = sm.salon_id
            WHERE sm.profile_id = auth.uid()
            AND b.id = barber_id
        )
    );

-- ─── 5. Ensure barbers RLS allows salon members to see their colleagues ───
DROP POLICY IF EXISTS "Salon members can view salon barbers" ON barbers;
CREATE POLICY "Salon members can view salon barbers" ON barbers
    FOR SELECT USING (
        active = true
        OR EXISTS (
            SELECT 1 FROM salon_members sm
            WHERE sm.salon_id = barbers.salon_id
            AND sm.profile_id = auth.uid()
        )
    );

-- ============================================
-- Done! Run this in Supabase SQL editor.
-- ============================================
