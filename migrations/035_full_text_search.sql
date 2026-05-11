-- 035: Add full-text search with tsvector columns and GIN indexes
-- Replaces ILIKE-based search with PostgreSQL full-text search

-- Add tsvector columns for full-text search
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE content ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN indexes
CREATE INDEX IF NOT EXISTS idx_profiles_search ON profiles USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_content_search ON content USING gin(search_vector);

-- Update existing data
UPDATE profiles SET search_vector = to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(username, ''));
UPDATE content SET search_vector = to_tsvector('simple', coalesce(caption, ''));

-- Create trigger function to keep profiles search_vector updated
CREATE OR REPLACE FUNCTION update_profiles_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.display_name, '') || ' ' || coalesce(NEW.username, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists to avoid duplicates, then create
DROP TRIGGER IF EXISTS trg_profiles_search_vector ON profiles;
CREATE TRIGGER trg_profiles_search_vector
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_profiles_search_vector();

-- Create trigger function to keep content search_vector updated
CREATE OR REPLACE FUNCTION update_content_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.caption, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists to avoid duplicates, then create
DROP TRIGGER IF EXISTS trg_content_search_vector ON content;
CREATE TRIGGER trg_content_search_vector
  BEFORE INSERT OR UPDATE ON content
  FOR EACH ROW EXECUTE FUNCTION update_content_search_vector();
