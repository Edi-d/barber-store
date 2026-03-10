-- ============================================================================
-- Migration 015: Denormalize likes_count and comments_count on content table
-- ============================================================================
-- Eliminates expensive COUNT(*) subqueries on every feed load by maintaining
-- pre-computed counters that stay in sync via triggers.
-- ============================================================================

-- ─── 1. Add counter columns ─────────────────────────────────────────────────

ALTER TABLE content
  ADD COLUMN likes_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN comments_count INTEGER NOT NULL DEFAULT 0;

-- ─── 2. Backfill from existing data ─────────────────────────────────────────

UPDATE content
SET likes_count = (
  SELECT COUNT(*)
  FROM likes
  WHERE likes.content_id = content.id
);

UPDATE content
SET comments_count = (
  SELECT COUNT(*)
  FROM comments
  WHERE comments.content_id = content.id
);

-- ─── 3. Trigger functions ───────────────────────────────────────────────────

-- Increment likes_count when a new like is inserted
CREATE OR REPLACE FUNCTION increment_content_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE content
  SET likes_count = likes_count + 1
  WHERE id = NEW.content_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Decrement likes_count when a like is removed
CREATE OR REPLACE FUNCTION decrement_content_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE content
  SET likes_count = GREATEST(likes_count - 1, 0)
  WHERE id = OLD.content_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Increment comments_count when a new comment is inserted
CREATE OR REPLACE FUNCTION increment_content_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE content
  SET comments_count = comments_count + 1
  WHERE id = NEW.content_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Decrement comments_count when a comment is deleted
CREATE OR REPLACE FUNCTION decrement_content_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE content
  SET comments_count = GREATEST(comments_count - 1, 0)
  WHERE id = OLD.content_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ─── 4. Attach triggers to likes and comments tables ────────────────────────

CREATE TRIGGER trg_increment_likes_count
  AFTER INSERT ON likes
  FOR EACH ROW
  EXECUTE FUNCTION increment_content_likes_count();

CREATE TRIGGER trg_decrement_likes_count
  AFTER DELETE ON likes
  FOR EACH ROW
  EXECUTE FUNCTION decrement_content_likes_count();

CREATE TRIGGER trg_increment_comments_count
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION increment_content_comments_count();

CREATE TRIGGER trg_decrement_comments_count
  AFTER DELETE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION decrement_content_comments_count();
