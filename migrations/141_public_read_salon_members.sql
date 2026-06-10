-- ============================================================================
-- Migration 141: Allow public read of salon team roster
-- ============================================================================
-- The public salon page (app/salon/[id].tsx) shows each team member's role.
-- The authoritative role lives in salon_members.role, but the only SELECT
-- policy (migration 030 "View salon members") restricts reads to the member
-- themselves or the salon owner — so a customer viewing the page gets zero
-- rows and no role data.
--
-- A salon's team roster (who works there + their role) is public information,
-- already implied by the public-readable `barbers` table. Add a permissive
-- SELECT policy so anyone can read it. RLS policies are OR'd together, so this
-- composes with the existing owner/self policy without weakening writes
-- (INSERT/UPDATE/DELETE policies are unchanged).
-- ============================================================================

DROP POLICY IF EXISTS "Salon team roster is public" ON salon_members;
CREATE POLICY "Salon team roster is public" ON salon_members
    FOR SELECT USING (true);
