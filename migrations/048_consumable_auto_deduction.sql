-- ============================================
-- Migration 048: Consumable Auto-Deduction
-- ============================================
-- Automatically deducts consumable stock when an appointment
-- transitions to 'completed'. Handles:
--   - Multi-service appointments (via appointment_services)
--   - Multiple consumables per service (via consumable_service_usage)
--   - Aggregation when multiple services use the same consumable
--   - Idempotency (won't double-deduct or double-reverse)
--   - Reversal on cancellation of a previously completed appointment
--   - Race condition safety (SELECT ... FOR UPDATE on stock rows)
--   - Stock floor at 0 (never goes negative)
-- ============================================

-- ============================================
-- 1. Core deduction function
-- ============================================
-- Resolves salon_id via appointments -> barbers (salon_id).
-- Joins appointment_services -> consumable_service_usage -> salon_consumables.
-- Aggregates total usage per consumable across all services.
-- Locks each consumable row before updating to prevent races.
-- IDEMPOTENT: checks if usage logs already exist for this appointment.
-- ============================================
CREATE OR REPLACE FUNCTION deduct_consumables_for_appointment(
    p_appointment_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_salon_id UUID;
    rec RECORD;
BEGIN
    -- Resolve the salon for this appointment
    SELECT b.salon_id INTO v_salon_id
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE a.id = p_appointment_id;

    IF v_salon_id IS NULL THEN
        RAISE NOTICE 'deduct_consumables: no salon found for appointment %', p_appointment_id;
        RETURN;
    END IF;

    -- Idempotency: if we already logged deductions for this appointment, skip
    IF EXISTS (
        SELECT 1 FROM consumable_stock_logs
        WHERE appointment_id = p_appointment_id
          AND change_type = 'usage'
    ) THEN
        RETURN;
    END IF;

    -- For each (consumable, total_usage) pair across all services in this appointment:
    --   1. Lock the consumable row
    --   2. Insert a stock log with negative change_amount
    --   3. Decrement current_stock (floor at 0)
    FOR rec IN
        SELECT
            csu.consumable_id,
            SUM(csu.usage_amount) AS total_usage
        FROM appointment_services aps
        JOIN consumable_service_usage csu ON csu.service_id = aps.service_id
        JOIN salon_consumables sc ON sc.id = csu.consumable_id
        WHERE aps.appointment_id = p_appointment_id
          AND sc.salon_id = v_salon_id
          AND sc.active = TRUE
        GROUP BY csu.consumable_id
    LOOP
        -- Lock the consumable row to prevent concurrent modifications
        PERFORM 1 FROM salon_consumables
        WHERE id = rec.consumable_id
        FOR UPDATE;

        -- Insert the stock log entry (negative change_amount = usage deduction)
        INSERT INTO consumable_stock_logs (
            consumable_id,
            change_amount,
            change_type,
            appointment_id,
            notes,
            created_by
        ) VALUES (
            rec.consumable_id,
            -rec.total_usage,
            'usage',
            p_appointment_id,
            'Auto-deducere la finalizarea programarii',
            NULL  -- system-initiated, no user
        );

        -- Decrement stock, floor at 0
        UPDATE salon_consumables
        SET current_stock = GREATEST(current_stock - rec.total_usage, 0)
        WHERE id = rec.consumable_id;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION deduct_consumables_for_appointment(UUID) IS
    'Deducts consumable stock when an appointment is completed. Idempotent — safe to call multiple times.';


-- ============================================
-- 2. Reversal function (for cancelled/no_show after completed)
-- ============================================
-- Finds all 'usage' logs for the appointment.
-- Creates 'reversal' entries with positive amounts.
-- Adds stock back to each consumable.
-- IDEMPOTENT: checks if reversal logs already exist.
-- ============================================
CREATE OR REPLACE FUNCTION reverse_consumable_deduction(
    p_appointment_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    rec RECORD;
BEGIN
    -- Only reverse if there are actual usage logs for this appointment
    IF NOT EXISTS (
        SELECT 1 FROM consumable_stock_logs
        WHERE appointment_id = p_appointment_id
          AND change_type = 'usage'
    ) THEN
        RETURN;
    END IF;

    -- Idempotency: don't reverse if already reversed
    IF EXISTS (
        SELECT 1 FROM consumable_stock_logs
        WHERE appointment_id = p_appointment_id
          AND change_type = 'reversal'
    ) THEN
        RETURN;
    END IF;

    -- For each consumable, aggregate usage logs and reverse them
    FOR rec IN
        SELECT consumable_id, SUM(change_amount) AS total_deducted
        FROM consumable_stock_logs
        WHERE appointment_id = p_appointment_id
          AND change_type = 'usage'
        GROUP BY consumable_id
    LOOP
        -- Lock the row
        PERFORM 1 FROM salon_consumables
        WHERE id = rec.consumable_id
        FOR UPDATE;

        -- Insert reversal log (positive amount, since total_deducted is negative)
        INSERT INTO consumable_stock_logs (
            consumable_id,
            change_amount,
            change_type,
            appointment_id,
            notes,
            created_by
        ) VALUES (
            rec.consumable_id,
            -rec.total_deducted,  -- negate the negative = positive
            'reversal',
            p_appointment_id,
            'Reversare automata - programare anulata dupa finalizare',
            NULL
        );

        -- Restore stock
        UPDATE salon_consumables
        SET current_stock = current_stock + (-rec.total_deducted)
        WHERE id = rec.consumable_id;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION reverse_consumable_deduction(UUID) IS
    'Reverses consumable stock deductions when a completed appointment is cancelled or marked no-show. Idempotent.';


-- ============================================
-- 3. Trigger function: deduction on completion
-- ============================================
CREATE OR REPLACE FUNCTION fn_appointment_consumable_deduction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    PERFORM deduct_consumables_for_appointment(NEW.id);
    RETURN NEW;
END;
$$;

-- ============================================
-- 4. Trigger function: reversal on cancellation
-- ============================================
CREATE OR REPLACE FUNCTION fn_appointment_consumable_reversal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    PERFORM reverse_consumable_deduction(NEW.id);
    RETURN NEW;
END;
$$;

-- ============================================
-- 5. Attach triggers to appointments table
-- ============================================

-- Deduction trigger: fires when status changes TO 'completed'
DROP TRIGGER IF EXISTS trg_appointment_consumable_deduction ON appointments;
CREATE TRIGGER trg_appointment_consumable_deduction
    AFTER UPDATE ON appointments
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
    EXECUTE FUNCTION fn_appointment_consumable_deduction();

COMMENT ON TRIGGER trg_appointment_consumable_deduction ON appointments IS
    'Auto-deducts consumable stock when appointment status changes to completed.';

-- Reversal trigger: fires when status changes FROM 'completed' TO 'cancelled' or 'no_show'
DROP TRIGGER IF EXISTS trg_appointment_consumable_reversal ON appointments;
CREATE TRIGGER trg_appointment_consumable_reversal
    AFTER UPDATE ON appointments
    FOR EACH ROW
    WHEN (NEW.status IN ('cancelled', 'no_show') AND OLD.status = 'completed')
    EXECUTE FUNCTION fn_appointment_consumable_reversal();

COMMENT ON TRIGGER trg_appointment_consumable_reversal ON appointments IS
    'Auto-reverses consumable deductions when a completed appointment is cancelled or marked no-show.';


-- ============================================
-- 6. Backfill RPC for existing completed appointments
-- ============================================
-- Processes all completed appointments for a salon that have
-- no existing usage logs. Useful after initial consumable setup
-- or when consumable_service_usage mappings are added retroactively.
-- ============================================
CREATE OR REPLACE FUNCTION backfill_consumable_deductions(
    p_salon_id UUID,
    p_since DATE DEFAULT '2020-01-01'
)
RETURNS TABLE (
    appointment_id UUID,
    status TEXT,
    deductions_created BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_appt RECORD;
    v_count BIGINT;
BEGIN
    FOR v_appt IN
        SELECT a.id, a.status AS appt_status
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at::DATE >= p_since
          -- Only appointments that have services with consumable mappings
          AND EXISTS (
              SELECT 1
              FROM appointment_services aps
              JOIN consumable_service_usage csu ON csu.service_id = aps.service_id
              WHERE aps.appointment_id = a.id
          )
          -- Skip already processed (idempotency inside function too, but skip for performance)
          AND NOT EXISTS (
              SELECT 1 FROM consumable_stock_logs csl
              WHERE csl.appointment_id = a.id
                AND csl.change_type = 'usage'
          )
        ORDER BY a.scheduled_at
    LOOP
        BEGIN
            PERFORM deduct_consumables_for_appointment(v_appt.id);

            SELECT COUNT(*) INTO v_count
            FROM consumable_stock_logs csl
            WHERE csl.appointment_id = v_appt.id
              AND csl.change_type = 'usage';

            appointment_id := v_appt.id;
            status := 'processed';
            deductions_created := v_count;
            RETURN NEXT;
        EXCEPTION WHEN OTHERS THEN
            appointment_id := v_appt.id;
            status := 'error: ' || SQLERRM;
            deductions_created := 0;
            RETURN NEXT;
        END;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION backfill_consumable_deductions(UUID, DATE) IS
    'Backfills consumable deductions for all completed appointments in a salon without existing usage logs. Returns processing status per appointment.';


-- ============================================
-- 7. Index for efficient idempotency checks
-- ============================================
-- Partial index on (appointment_id, change_type) for fast lookups
-- used by both deduction and reversal idempotency guards.
-- ============================================
CREATE INDEX IF NOT EXISTS idx_consumable_stock_logs_appointment_type
    ON consumable_stock_logs(appointment_id, change_type)
    WHERE appointment_id IS NOT NULL;

-- ============================================
-- Valid change_type values for consumable_stock_logs (TEXT column, no ALTER needed):
--   'restock'    — manual stock addition
--   'usage'      — auto-deducted on appointment completion
--   'reversal'   — auto-reversed on cancellation after completion
--   'adjustment' — manual correction
--   'correction' — manual correction (legacy)
-- ============================================
