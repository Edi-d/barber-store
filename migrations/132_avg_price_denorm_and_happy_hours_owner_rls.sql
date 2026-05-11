-- Migration 132: avg_price denormalization + happy hours owner RLS + gallery cap
-- ─────────────────────────────────────────────────────────────────────────
-- 1) recompute_salon_avg_price(p_salon UUID)
--    AVGs barber_services per salon. pricing_model='de_la' uses
--    price_cents_min; 'la_consultatie' is excluded (NULL); else price_cents.
--    Filters by active=TRUE.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recompute_salon_avg_price(p_salon UUID)
RETURNS VOID AS $$
DECLARE
  v_avg INTEGER;
BEGIN
  -- ROUND() before ::INTEGER cast: prevents banker's-rounding surprises and
  -- truncation. AVG([599, 600]) -> 599.5 should display as 600 RON, not 599.
  SELECT COALESCE(
    ROUND(
      AVG(
        CASE
          WHEN pricing_model = 'la_consultatie' THEN NULL
          WHEN pricing_model = 'de_la' THEN price_cents_min
          ELSE price_cents
        END
      )
    )::INTEGER,
    0
  )
  INTO v_avg
  FROM barber_services
  WHERE salon_id = p_salon
    AND active = TRUE
    AND (
      pricing_model <> 'la_consultatie'
      OR pricing_model IS NULL
    );

  UPDATE salons SET avg_price_cents = v_avg WHERE id = p_salon;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) trigger function on barber_services that recomputes salon avg_price
--    Handles INSERT, UPDATE (incl salon_id changes), DELETE.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_recompute_salon_avg_price()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.salon_id IS NOT NULL THEN
      PERFORM recompute_salon_avg_price(NEW.salon_id);
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.salon_id IS NOT NULL THEN
      PERFORM recompute_salon_avg_price(NEW.salon_id);
    END IF;
    -- if salon_id changed, also recompute the OLD salon
    IF OLD.salon_id IS NOT NULL AND OLD.salon_id IS DISTINCT FROM NEW.salon_id THEN
      PERFORM recompute_salon_avg_price(OLD.salon_id);
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.salon_id IS NOT NULL THEN
      PERFORM recompute_salon_avg_price(OLD.salon_id);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_barber_services_avg_price ON barber_services;
CREATE TRIGGER trg_barber_services_avg_price
  AFTER INSERT OR UPDATE OR DELETE ON barber_services
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_salon_avg_price();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Backfill: recompute avg_price for every salon that has services
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT salon_id FROM barber_services WHERE salon_id IS NOT NULL LOOP
    PERFORM recompute_salon_avg_price(r.salon_id);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Happy hours owner RLS — drop & recreate INSERT/UPDATE/DELETE +
--    add owner-can-see-all SELECT policy (the public one filters active=true)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner can insert happy hours" ON salon_happy_hours;
CREATE POLICY "Owner can insert happy hours"
  ON salon_happy_hours
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM salons s
      WHERE s.id = salon_id AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner can update happy hours" ON salon_happy_hours;
CREATE POLICY "Owner can update happy hours"
  ON salon_happy_hours
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM salons s
      WHERE s.id = salon_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM salons s
      WHERE s.id = salon_id AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner can delete happy hours" ON salon_happy_hours;
CREATE POLICY "Owner can delete happy hours"
  ON salon_happy_hours
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM salons s
      WHERE s.id = salon_id AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner can see all own happy hours" ON salon_happy_hours;
CREATE POLICY "Owner can see all own happy hours"
  ON salon_happy_hours
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM salons s
      WHERE s.id = salon_id AND s.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Index for active happy-hour window lookups
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_salon_happy_hours_active_window
  ON salon_happy_hours(salon_id, starts_at, ends_at)
  WHERE active = TRUE;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) BONUS: enforce 12-photo cap on salon_photos via BEFORE INSERT trigger
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_salon_photos_cap()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Per-salon advisory lock prevents two concurrent INSERTs from each
  -- seeing count<12 and both succeeding (which would let a salon end up
  -- with 13+ photos). The lock is released at transaction end.
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(NEW.salon_id::text), 1, 16))::bit(64)::bigint
  );
  SELECT COUNT(*) INTO v_count FROM salon_photos WHERE salon_id = NEW.salon_id;
  IF v_count >= 12 THEN
    RAISE EXCEPTION 'Salon gallery is limited to 12 photos (salon_id=%).', NEW.salon_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_salon_photos_cap ON salon_photos;
CREATE TRIGGER trg_salon_photos_cap
  BEFORE INSERT ON salon_photos
  FOR EACH ROW EXECUTE FUNCTION enforce_salon_photos_cap();
