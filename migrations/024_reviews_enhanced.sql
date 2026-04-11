-- ============================================
-- Migration 024: Enhanced Reviews System
-- ============================================
-- Adds owner reply support, review stats RPC,
-- paginated review fetching, and auto-update
-- trigger for salon rating aggregates.
-- ============================================

-- ============================================
-- 1. ADD OWNER REPLY COLUMNS
-- ============================================

ALTER TABLE salon_reviews ADD COLUMN IF NOT EXISTS owner_reply TEXT;
ALTER TABLE salon_reviews ADD COLUMN IF NOT EXISTS owner_reply_at TIMESTAMPTZ;

-- ============================================
-- 2. ADD MISSING INDEX ON salon_id
-- ============================================

CREATE INDEX IF NOT EXISTS idx_salon_reviews_salon ON salon_reviews(salon_id);

-- ============================================
-- 3. RPC: get_review_stats
-- ============================================
-- Returns aggregate review statistics for a salon:
-- total_count, avg_rating, per-star counts,
-- replied_count, this_month_count, last_month_count

CREATE OR REPLACE FUNCTION get_review_stats(p_salon_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_count',      COUNT(*),
    'avg_rating',       COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0),
    'five_star',        COUNT(*) FILTER (WHERE rating = 5),
    'four_star',        COUNT(*) FILTER (WHERE rating = 4),
    'three_star',       COUNT(*) FILTER (WHERE rating = 3),
    'two_star',         COUNT(*) FILTER (WHERE rating = 2),
    'one_star',         COUNT(*) FILTER (WHERE rating = 1),
    'replied_count',    COUNT(*) FILTER (WHERE owner_reply IS NOT NULL),
    'this_month_count', COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())),
    'last_month_count', COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
                                           AND created_at < date_trunc('month', NOW()))
  ) INTO result
  FROM salon_reviews
  WHERE salon_id = p_salon_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. RPC: get_reviews_with_user
-- ============================================
-- Returns reviews joined with user profile data,
-- with pagination, filtering, and sorting.

CREATE OR REPLACE FUNCTION get_reviews_with_user(
  p_salon_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_rating_filter INT DEFAULT NULL,
  p_has_reply BOOLEAN DEFAULT NULL,
  p_sort TEXT DEFAULT 'newest'
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_data) INTO result
  FROM (
    SELECT
      r.id,
      r.rating,
      r.comment,
      r.created_at,
      r.owner_reply,
      r.owner_reply_at,
      COALESCE(p.display_name, p.username, 'Client anonim') AS user_display_name,
      p.avatar_url AS user_avatar_url
    FROM salon_reviews r
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE r.salon_id = p_salon_id
      AND (p_rating_filter IS NULL OR r.rating = p_rating_filter)
      AND (p_has_reply IS NULL
           OR (p_has_reply = TRUE AND r.owner_reply IS NOT NULL)
           OR (p_has_reply = FALSE AND r.owner_reply IS NULL))
    ORDER BY
      CASE WHEN p_sort = 'newest'  THEN r.created_at END DESC,
      CASE WHEN p_sort = 'oldest'  THEN r.created_at END ASC,
      CASE WHEN p_sort = 'highest' THEN r.rating END DESC,
      CASE WHEN p_sort = 'lowest'  THEN r.rating END ASC
    LIMIT p_limit
    OFFSET p_offset
  ) AS row_data;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. RLS POLICY: Salon owner can reply
-- ============================================
-- Allows salon owners to UPDATE owner_reply and
-- owner_reply_at on reviews for their salon.

DROP POLICY IF EXISTS "Salon owner can reply to reviews" ON salon_reviews;
CREATE POLICY "Salon owner can reply to reviews"
ON salon_reviews FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM salons s WHERE s.id = salon_id AND s.owner_id = auth.uid()
  )
);

-- ============================================
-- 6. TRIGGER: Auto-update salon rating stats
-- ============================================
-- Keeps salons.rating_avg and salons.reviews_count
-- in sync whenever reviews are inserted, deleted,
-- or have their rating updated.

CREATE OR REPLACE FUNCTION update_salon_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE salons SET
    rating_avg = COALESCE((SELECT AVG(rating)::NUMERIC(2,1) FROM salon_reviews WHERE salon_id = COALESCE(NEW.salon_id, OLD.salon_id)), 0),
    reviews_count = (SELECT COUNT(*) FROM salon_reviews WHERE salon_id = COALESCE(NEW.salon_id, OLD.salon_id))
  WHERE id = COALESCE(NEW.salon_id, OLD.salon_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_salon_rating ON salon_reviews;
CREATE TRIGGER trg_update_salon_rating
AFTER INSERT OR DELETE OR UPDATE OF rating ON salon_reviews
FOR EACH ROW EXECUTE FUNCTION update_salon_rating_stats();
