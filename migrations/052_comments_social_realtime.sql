-- 052: Add comment_likes and comment_reactions to supabase_realtime publication
-- Required for postgres_changes subscriptions (e.g. useCommentReactions hook)
-- to receive INSERT / DELETE events on these tables in real time.
-- Safe to run multiple times — each block checks pg_publication_tables first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'comment_likes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE comment_likes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'comment_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE comment_reactions;
  END IF;
END $$;
