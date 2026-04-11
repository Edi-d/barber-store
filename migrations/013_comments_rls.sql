-- Enable RLS on comments, likes, and content tables
-- Both apps share the same Supabase DB so this covers both

-- ─── Comments RLS ───
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are viewable by everyone"
  ON comments FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create comments"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Likes RLS ───
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone"
  ON likes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can like"
  ON likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike own likes"
  ON likes FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Content RLS ───
ALTER TABLE content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published content is viewable by everyone"
  ON content FOR SELECT
  USING (status = 'published');

CREATE POLICY "Authors can create content"
  ON content FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own content"
  ON content FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own content"
  ON content FOR DELETE
  USING (auth.uid() = author_id);
