-- ============================================
-- 038: Multi-Service Appointments
-- ============================================
-- Adds support for booking multiple services in a single appointment.
-- The existing `service_id` column remains as the primary/first service
-- for backward compatibility. The new `service_ids` array stores all
-- selected services.
--
-- Run this migration on all environments (dev, staging, prod).
-- Safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS patterns).
-- ============================================

-- 1. Add service_ids array column to appointments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'service_ids'
  ) THEN
    ALTER TABLE appointments ADD COLUMN service_ids UUID[] DEFAULT '{}';
  END IF;
END $$;

-- 2. Backfill existing appointments: copy service_id into service_ids array
UPDATE appointments
SET service_ids = ARRAY[service_id]
WHERE service_ids = '{}' OR service_ids IS NULL;

-- 3. Index for querying appointments by any service in the array
CREATE INDEX IF NOT EXISTS idx_appointments_service_ids
  ON appointments USING GIN (service_ids);

-- 4. Create a view that expands multi-service appointments for reporting
CREATE OR REPLACE VIEW appointment_services_expanded AS
SELECT
  a.id AS appointment_id,
  a.user_id,
  a.barber_id,
  a.scheduled_at,
  a.duration_min,
  a.status,
  a.total_cents,
  a.currency,
  a.created_at,
  unnest(a.service_ids) AS service_id
FROM appointments a;

-- ============================================
-- Done! Multi-service appointments ready.
-- ============================================
