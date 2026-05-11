-- ============================================================================
-- Migration 125: Include photo_urls in get_reviews_with_user RPC
-- ============================================================================
-- Reviews can already store photo_urls (text[]) since migration 024, and
-- review-photos storage bucket is wired. The owner-side reviews list (page
-- /management/reviews) renders via this RPC, so we extend the SELECT to
-- expose photos. UI shows thumbnails inline + lightbox on tap.
--
-- Re-runnable (CREATE OR REPLACE).
-- ============================================================================

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
      p.avatar_url AS user_avatar_url,
      COALESCE(r.photo_urls, ARRAY[]::text[]) AS photo_urls
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

-- ============================================================================
-- SEED: add photo URLs to a few existing Dive Software reviews so the new
-- thumbnails are visible in the UI immediately. Uses public Unsplash images
-- (barbershop / haircut / grooming) — purely for demo, idempotent via WHERE.
-- ============================================================================

UPDATE salon_reviews
SET photo_urls = ARRAY[
  'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600',
  'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600'
]
WHERE id = 'bbb00000-d10e-0004-0000-000000000001'
  AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL);

UPDATE salon_reviews
SET photo_urls = ARRAY[
  'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600',
  'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=600',
  'https://images.unsplash.com/photo-1622287162716-f311baa1a2b8?w=600'
]
WHERE id = 'bbb00000-d10e-0004-0000-000000000002'
  AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL);

UPDATE salon_reviews
SET photo_urls = ARRAY[
  'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=600'
]
WHERE id = 'bbb00000-d10e-0004-0000-000000000004'
  AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL);

UPDATE salon_reviews
SET photo_urls = ARRAY[
  'https://images.unsplash.com/photo-1622296089863-eb7fc530daa8?w=600',
  'https://images.unsplash.com/photo-1635273051936-4e8a3f9dc40e?w=600'
]
WHERE id = 'bbb00000-d10e-0004-0000-000000000007'
  AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL);
