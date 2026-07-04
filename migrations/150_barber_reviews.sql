-- ============================================
-- Migration 150: Per-Barber Reviews
-- ============================================
-- Allows a client to leave a review for a specific barber
-- (in addition to the existing salon-level review). Barber
-- reviews still carry salon_id, so they continue to appear
-- in the salon's review feed (fetchSalonReviews filters only
-- by salon_id) and roll into the salon's rating aggregate via
-- the existing trigger. Adds a matching trigger to keep
-- barbers.rating_avg / barbers.reviews_count in sync too.
-- ============================================

-- ============================================
-- 1. ADD barber_id (nullable — NULL means a salon-level review)
-- ============================================

ALTER TABLE salon_reviews ADD COLUMN IF NOT EXISTS barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_salon_reviews_barber ON salon_reviews(barber_id) WHERE barber_id IS NOT NULL;

-- ============================================
-- 2. REPLACE (user_id, salon_id) UNIQUE CONSTRAINT
-- ============================================
-- A user can now have one salon-level review (barber_id NULL)
-- PLUS one review per barber at that salon. Postgres treats NULLs
-- as distinct in unique constraints, so a plain (user_id, salon_id,
-- barber_id) constraint would let a user insert unlimited salon-level
-- (barber_id NULL) reviews. A generated column normalizing NULL to a
-- sentinel UUID closes that gap while staying upsert-friendly
-- (supabase-js onConflict needs a plain column list, not a partial index).

ALTER TABLE salon_reviews ADD COLUMN IF NOT EXISTS barber_id_norm UUID
  GENERATED ALWAYS AS (COALESCE(barber_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

DO $$
DECLARE
  old_constraint TEXT;
BEGIN
  SELECT con.conname INTO old_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'salon_reviews'
    AND con.contype = 'u'
    AND con.conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = rel.oid AND attname IN ('user_id', 'salon_id')
    )
  LIMIT 1;

  IF old_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE salon_reviews DROP CONSTRAINT %I', old_constraint);
  END IF;
END $$;

ALTER TABLE salon_reviews DROP CONSTRAINT IF EXISTS salon_reviews_user_salon_barber_key;
ALTER TABLE salon_reviews ADD CONSTRAINT salon_reviews_user_salon_barber_key
  UNIQUE (user_id, salon_id, barber_id_norm);

-- ============================================
-- 3. TRIGGER: Auto-update barber rating stats
-- ============================================
-- Mirrors update_salon_rating_stats() (migration 024) but scoped to
-- barber_id, so a barber's own rating_avg/reviews_count only reflect
-- reviews written specifically for them.

CREATE OR REPLACE FUNCTION update_barber_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- barber_id changed on UPDATE: refresh the barber it moved away from too.
  IF TG_OP = 'UPDATE' AND OLD.barber_id IS DISTINCT FROM NEW.barber_id AND OLD.barber_id IS NOT NULL THEN
    UPDATE barbers SET
      rating_avg = COALESCE((SELECT AVG(rating)::NUMERIC(2,1) FROM salon_reviews WHERE barber_id = OLD.barber_id), 0),
      reviews_count = (SELECT COUNT(*) FROM salon_reviews WHERE barber_id = OLD.barber_id)
    WHERE id = OLD.barber_id;
  END IF;

  IF COALESCE(NEW.barber_id, OLD.barber_id) IS NOT NULL THEN
    UPDATE barbers SET
      rating_avg = COALESCE((SELECT AVG(rating)::NUMERIC(2,1) FROM salon_reviews WHERE barber_id = COALESCE(NEW.barber_id, OLD.barber_id)), 0),
      reviews_count = (SELECT COUNT(*) FROM salon_reviews WHERE barber_id = COALESCE(NEW.barber_id, OLD.barber_id))
    WHERE id = COALESCE(NEW.barber_id, OLD.barber_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_update_barber_rating ON salon_reviews;
CREATE TRIGGER trg_update_barber_rating
AFTER INSERT OR DELETE OR UPDATE OF rating, barber_id ON salon_reviews
FOR EACH ROW EXECUTE FUNCTION update_barber_rating_stats();

-- ============================================
-- Done! Barber-level reviews ready. Salon-level rating stats
-- (trg_update_salon_rating, migration 024) already fire on every
-- row regardless of barber_id, so barber reviews continue to
-- roll into the salon's own aggregate too.
-- ============================================
