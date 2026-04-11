-- ============================================
-- Migration 018: Employee Analytics Support
-- ============================================
-- Adds RLS policies and a helper function so salon
-- owners/members can view appointment metrics for
-- their salon's barbers.
-- ============================================

-- ============================================
-- 1. RLS: Let salon members view their salon's appointments
-- ============================================
CREATE POLICY "Salon members can view salon appointments" ON appointments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM barbers b
            JOIN salon_members sm ON sm.salon_id = b.salon_id
            WHERE b.id = appointments.barber_id
            AND sm.profile_id = auth.uid()
        )
    );

-- ============================================
-- 2. RLS: Let salon owner update appointment status
--    (mark completed, no_show, etc.)
-- ============================================
CREATE POLICY "Salon owner can update salon appointments" ON appointments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM barbers b
            JOIN salons s ON s.id = b.salon_id
            WHERE b.id = appointments.barber_id
            AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 3. Function: Get per-barber metrics for a salon
-- ============================================
CREATE OR REPLACE FUNCTION get_salon_barber_metrics(p_salon_id UUID, p_days INT DEFAULT 30)
RETURNS TABLE (
    barber_id UUID,
    barber_name TEXT,
    barber_avatar_url TEXT,
    barber_profile_id UUID,
    total_appointments BIGINT,
    completed_appointments BIGINT,
    cancelled_appointments BIGINT,
    no_show_appointments BIGINT,
    pending_appointments BIGINT,
    revenue_cents BIGINT,
    avg_rating NUMERIC,
    completion_rate NUMERIC,
    no_show_rate NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        b.id AS barber_id,
        b.name AS barber_name,
        b.avatar_url AS barber_avatar_url,
        b.profile_id AS barber_profile_id,
        COUNT(a.id) AS total_appointments,
        COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed_appointments,
        COUNT(a.id) FILTER (WHERE a.status = 'cancelled') AS cancelled_appointments,
        COUNT(a.id) FILTER (WHERE a.status = 'no_show') AS no_show_appointments,
        COUNT(a.id) FILTER (WHERE a.status IN ('pending', 'confirmed')) AS pending_appointments,
        COALESCE(SUM(a.total_cents) FILTER (WHERE a.status = 'completed'), 0) AS revenue_cents,
        ROUND(AVG(a.total_cents) FILTER (WHERE a.status = 'completed') / 100.0, 2) AS avg_rating,
        CASE
            WHEN COUNT(a.id) FILTER (WHERE a.status IN ('completed', 'no_show')) > 0
            THEN ROUND(
                COUNT(a.id) FILTER (WHERE a.status = 'completed')::NUMERIC /
                COUNT(a.id) FILTER (WHERE a.status IN ('completed', 'no_show'))::NUMERIC * 100, 1
            )
            ELSE 0
        END AS completion_rate,
        CASE
            WHEN COUNT(a.id) FILTER (WHERE a.status IN ('completed', 'no_show')) > 0
            THEN ROUND(
                COUNT(a.id) FILTER (WHERE a.status = 'no_show')::NUMERIC /
                COUNT(a.id) FILTER (WHERE a.status IN ('completed', 'no_show'))::NUMERIC * 100, 1
            )
            ELSE 0
        END AS no_show_rate
    FROM barbers b
    LEFT JOIN appointments a
        ON a.barber_id = b.id
        AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    WHERE b.salon_id = p_salon_id
      AND b.active = true
    GROUP BY b.id, b.name, b.avatar_url, b.profile_id
    ORDER BY revenue_cents DESC;
$$;

-- ============================================
-- 4. Index: Speed up salon-level appointment queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_appointments_barber_status
    ON appointments(barber_id, status, scheduled_at DESC);

-- ============================================
-- Done! Employee analytics support ready.
-- Run: psql -f migrations/018_employee_analytics.sql
-- ============================================
