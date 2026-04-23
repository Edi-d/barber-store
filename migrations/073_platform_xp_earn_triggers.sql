-- ============================================
-- Migration 073: Platform XP earn triggers
-- ============================================
-- The platform-level XP layer (tables platform_xp_transactions,
-- xp_level_thresholds, xp_voucher_tiers + RPC award_platform_xp) was
-- created directly in Supabase by the team, but no triggers wire
-- spend events to earning. This migration adds the two missing
-- triggers:
--   - appointments.status -> 'completed'  => award_platform_xp('appointment', ...)
--   - orders.status       -> 'paid'       => award_platform_xp('order', ...)
--
-- Idempotency: trigger uses a deterministic key 'appointment:<id>'
-- or 'order:<id>' so award_platform_xp can dedupe.
--
-- Failure mode: earn RPC errors are converted to WARNING so the
-- primary status UPDATE is never rolled back due to loyalty issues.
-- ============================================

BEGIN;

-- Resolve salon for an appointment: appointments.barber_id -> barbers.salon_id.
-- If barbers table uses a different column name or the app's salon concept
-- differs, adjust here. (If barber has no salon link, pass NULL.)
CREATE OR REPLACE FUNCTION handle_appointment_completion_platform_xp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_salon_id UUID;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    BEGIN
      SELECT salon_id INTO v_salon_id
        FROM barbers
        WHERE id = NEW.barber_id;

      PERFORM award_platform_xp(
        p_user_id          => NEW.user_id,
        p_ron_cents        => COALESCE(NEW.total_cents, 0),
        p_source           => 'appointment',
        p_source_id        => NEW.id,
        p_salon_id         => v_salon_id,
        p_idempotency_key  => 'appointment:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'platform xp earn failed for appointment % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION handle_order_paid_platform_xp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    BEGIN
      PERFORM award_platform_xp(
        p_user_id          => NEW.user_id,
        p_ron_cents        => COALESCE(NEW.total_cents, 0),
        p_source           => 'order',
        p_source_id        => NEW.id,
        p_salon_id         => NULL,
        p_idempotency_key  => 'order:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'platform xp earn failed for order % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_platform_xp_on_appointment_complete ON appointments;
CREATE TRIGGER trg_award_platform_xp_on_appointment_complete
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW EXECUTE FUNCTION handle_appointment_completion_platform_xp();

DROP TRIGGER IF EXISTS trg_award_platform_xp_on_order_paid ON orders;
CREATE TRIGGER trg_award_platform_xp_on_order_paid
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION handle_order_paid_platform_xp();

COMMIT;
