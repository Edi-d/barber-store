-- ============================================
-- Migration 042: Multi-Service Appointments
-- ============================================
-- Adds appointment_services junction table to support
-- booking multiple services in a single appointment.
-- The appointments.service_id remains as the primary
-- service for backward compatibility.
-- ============================================

-- Junction table: tracks all services in an appointment
CREATE TABLE IF NOT EXISTS appointment_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES barber_services(id) ON DELETE CASCADE,
    duration_min INT NOT NULL,
    price_cents INT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointment_services_appointment
    ON appointment_services(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_services_service
    ON appointment_services(service_id);

-- Unique constraint: same service can't be added twice to same appointment
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_services_unique
    ON appointment_services(appointment_id, service_id);

-- RLS
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;

-- Everyone can view appointment services (appointment-level RLS handles access)
CREATE POLICY "Appointment services are viewable" ON appointment_services
    FOR SELECT USING (true);

-- Authenticated users can manage their appointment services
CREATE POLICY "Users can insert appointment services" ON appointment_services
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.id = appointment_id
            AND (a.user_id = auth.uid() OR EXISTS (
                SELECT 1 FROM barbers b
                JOIN salon_members sm ON sm.salon_id = b.salon_id
                WHERE b.id = a.barber_id AND sm.profile_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can delete appointment services" ON appointment_services
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.id = appointment_id
            AND (a.user_id = auth.uid() OR EXISTS (
                SELECT 1 FROM barbers b
                JOIN salon_members sm ON sm.salon_id = b.salon_id
                WHERE b.id = a.barber_id AND sm.profile_id = auth.uid()
            ))
        )
    );

-- Backfill: create appointment_services rows for all existing appointments
-- This ensures existing single-service appointments also have junction table entries
INSERT INTO appointment_services (appointment_id, service_id, duration_min, price_cents, sort_order)
SELECT
    a.id,
    a.service_id,
    a.duration_min,
    a.total_cents,
    0
FROM appointments a
WHERE a.service_id IS NOT NULL
ON CONFLICT DO NOTHING;
