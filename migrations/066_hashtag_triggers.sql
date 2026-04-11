-- 066: Hashtag post_count triggers
-- Keeps hashtags.post_count accurate as content_hashtags rows are inserted/deleted.
-- Both functions run SECURITY DEFINER so they can write to hashtags regardless
-- of the calling user's RLS context.

-- ─── Trigger function: increment on INSERT ───────────────────────────────────

CREATE OR REPLACE FUNCTION increment_hashtag_post_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE hashtags
  SET post_count = post_count + 1
  WHERE id = NEW.hashtag_id;
  RETURN NEW;
END;
$$;

-- ─── Trigger function: decrement on DELETE ───────────────────────────────────

CREATE OR REPLACE FUNCTION decrement_hashtag_post_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE hashtags
  SET post_count = GREATEST(0, post_count - 1)
  WHERE id = OLD.hashtag_id;
  RETURN OLD;
END;
$$;

-- ─── Attach triggers to content_hashtags ─────────────────────────────────────

DROP TRIGGER IF EXISTS trg_increment_hashtag_post_count ON content_hashtags;
CREATE TRIGGER trg_increment_hashtag_post_count
  AFTER INSERT ON content_hashtags
  FOR EACH ROW
  EXECUTE FUNCTION increment_hashtag_post_count();

DROP TRIGGER IF EXISTS trg_decrement_hashtag_post_count ON content_hashtags;
CREATE TRIGGER trg_decrement_hashtag_post_count
  AFTER DELETE ON content_hashtags
  FOR EACH ROW
  EXECUTE FUNCTION decrement_hashtag_post_count();

-- ─── Backfill existing post_counts ───────────────────────────────────────────
-- Reset first to avoid double-counting if this migration is re-run.

UPDATE hashtags
SET post_count = 0;

UPDATE hashtags h
SET post_count = counts.n
FROM (
  SELECT hashtag_id, COUNT(*) AS n
  FROM content_hashtags
  GROUP BY hashtag_id
) AS counts
WHERE h.id = counts.hashtag_id;
