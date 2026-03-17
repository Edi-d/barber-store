-- Add content and likes tables to supabase_realtime publication
-- Required for postgres_changes subscriptions to receive events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'content'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE content;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'likes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE likes;
  END IF;
END $$;
