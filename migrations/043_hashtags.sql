-- 038: Hashtags system
-- Tables for hashtags and content-hashtag relationships

CREATE TABLE IF NOT EXISTS hashtags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_hashtags (
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  hashtag_id UUID NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, hashtag_id)
);

ALTER TABLE hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view hashtags" ON hashtags FOR SELECT USING (true);
CREATE POLICY "System can manage hashtags" ON hashtags FOR ALL USING (true);
CREATE POLICY "Everyone can view content_hashtags" ON content_hashtags FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage" ON content_hashtags FOR ALL USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_hashtags_name ON hashtags(name);
CREATE INDEX idx_hashtags_post_count ON hashtags(post_count DESC);
