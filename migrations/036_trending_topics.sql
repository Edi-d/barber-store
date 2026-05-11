-- 036_trending_topics.sql
-- Dynamic trending topics for the social search modal

CREATE TABLE IF NOT EXISTS trending_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT,
  post_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trending_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active trending topics"
  ON trending_topics FOR SELECT
  USING (is_active = true);

-- Seed initial data
INSERT INTO trending_topics (name, category) VALUES
  ('Fade', 'Tunsori'),
  ('Barba', 'Ingrijire'),
  ('Mullet', 'Tunsori'),
  ('Pompadour', 'Tunsori'),
  ('Taper', 'Tunsori'),
  ('Beard Oil', 'Produse');
