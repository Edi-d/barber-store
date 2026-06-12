-- 145: Add `lives` to the supabase_realtime publication
--
-- The `useRealtimeLives` hook subscribes to postgres_changes on `public.lives`
-- to add/remove live cards in the feed (e.g. drop a card when its status
-- becomes 'ended'). But `lives` was never added to the supabase_realtime
-- publication in any migration — it only worked on hosted DBs where it was
-- enabled manually via the dashboard. On any DB where that manual step is
-- missing, the subscription connects but never receives events, so ended
-- streams linger in the feed until the screen is remounted.
--
-- This migration makes realtime delivery for `lives` part of the schema.
--
-- REPLICA IDENTITY FULL ensures UPDATE/DELETE payloads carry the full OLD row
-- so DELETE handlers (which read `old.id`) and any future filtered
-- subscriptions receive complete data.

ALTER TABLE public.lives REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lives'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lives;
  END IF;
END $$;
