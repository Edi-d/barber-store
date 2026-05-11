-- ============================================
-- Tapzi Barber — Service <-> Staff Assignments (new table)
-- ============================================
-- NOTE: An older table `barber_service_assignments` exists from migration
-- 011 (references the legacy `barbers` table). This migration introduces
-- a fresh table `service_staff_assignments` that maps services to
-- `salon_members` — which is what the app actually uses for staff/auth.
--
-- Semantics:
--   - NO rows for a service_id  => every salon member can perform it
--     (backward compatible default — existing services stay as-is).
--   - 1+ rows                   => only the listed members can perform it.
--
-- RLS: readable by any member of the salon, writable by the salon owner.
-- ============================================

CREATE TABLE IF NOT EXISTS public.service_staff_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES public.barber_services(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.salon_members(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(service_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_service_staff_assignments_service
    ON public.service_staff_assignments(service_id);
CREATE INDEX IF NOT EXISTS idx_service_staff_assignments_member
    ON public.service_staff_assignments(member_id);

ALTER TABLE public.service_staff_assignments ENABLE ROW LEVEL SECURITY;

-- Salon members can see assignments for their salon's services.
DROP POLICY IF EXISTS "Members can view service staff" ON public.service_staff_assignments;
CREATE POLICY "Members can view service staff"
    ON public.service_staff_assignments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.barber_services bs
            JOIN public.salon_members sm ON sm.salon_id = bs.salon_id
            WHERE bs.id = service_staff_assignments.service_id
              AND sm.profile_id = auth.uid()
        )
    );

-- Only salon owner can insert/update/delete.
DROP POLICY IF EXISTS "Owner can manage service staff" ON public.service_staff_assignments;
CREATE POLICY "Owner can manage service staff"
    ON public.service_staff_assignments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.barber_services bs
            JOIN public.salons s ON s.id = bs.salon_id
            WHERE bs.id = service_staff_assignments.service_id
              AND s.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.barber_services bs
            JOIN public.salons s ON s.id = bs.salon_id
            WHERE bs.id = service_staff_assignments.service_id
              AND s.owner_id = auth.uid()
        )
    );
