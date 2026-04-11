-- ============================================================================
-- Migration 030: Fix infinite recursion in salon_members RLS
-- ============================================================================
-- Problem: The SELECT policy on salon_members queries salon_members itself,
-- causing infinite recursion when any query joins salon_members (e.g.,
-- appointments RLS checking salon membership).
--
-- Fix: Replace the self-referencing check with direct conditions:
--   1. User can see their own memberships (profile_id = auth.uid())
--   2. Salon owner can see all members (via salons.owner_id)
-- ============================================================================

-- Drop ALL existing SELECT policies on salon_members
DROP POLICY IF EXISTS "Salon members viewable by salon members" ON salon_members;
DROP POLICY IF EXISTS "Salon members are viewable by salon members" ON salon_members;

-- New non-recursive SELECT policy
CREATE POLICY "View salon members" ON salon_members
    FOR SELECT USING (
        -- User can see their own membership rows
        profile_id = auth.uid()
        OR
        -- Salon owner can see all members of their salon
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = salon_members.salon_id
            AND s.owner_id = auth.uid()
        )
    );
