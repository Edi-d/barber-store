-- ============================================================================
-- Migration 143: Feed visibility fixes
-- ============================================================================
-- Investigated as part of the "missing posts" bug where content inserted with
-- the default status='draft' was invisible to everyone including its author.
--
-- Fix 1 — Authors can see their own non-published content (content RLS):
--   The sole SELECT policy on `content` has always been
--   "Published content is viewable by everyone" USING (status = 'published'),
--   first created in 013_comments_rls.sql and re-asserted idempotently in
--   045_complete_social_setup.sql and 050_complete_social_setup.sql.
--   A row created with the default status 'draft' (as defined in
--   001_initial_schema.sql) is therefore invisible to everyone — including
--   the author — until it is explicitly published.  Feed and profile queries
--   already filter on status='published', so public behaviour is unchanged;
--   this policy only makes drafts and hidden posts debuggable/visible to the
--   author in dev tooling and future author-facing UI.
--   We add a second, additive SELECT policy rather than altering the existing
--   one to minimise surface area.
--
-- Fix 2 — Add `comments` to the supabase_realtime publication:
--   035_realtime_publication.sql added content + likes.
--   051_notifications_realtime.sql added notifications.
--   052_comments_social_realtime.sql added comment_likes + comment_reactions.
--   073_subscription_realtime_and_view.sql added subscriptions.
--   074_stories_realtime_publication.sql added stories.
--   123_calendar_realtime_publication.sql added appointments + barber_breaks.
--   The `comments` table was never added, so any postgres_changes subscription
--   on comments receives zero events (new rows appear only on the next refetch).
--   The app only consumes INSERT events and id-only DELETE; no old-row data is
--   read, so REPLICA IDENTITY FULL is not set here.  This fix closes the gap
--   idempotently.
--
-- Safe to re-run: DROP POLICY IF EXISTS guards the RLS change; a DO block
-- guards the publication change — matching repo conventions.
-- ============================================================================

-- ─── Fix 1: Author draft visibility ──────────────────────────────────────────

-- Ensure RLS is enabled (no-op if already enabled).
ALTER TABLE content ENABLE ROW LEVEL SECURITY;

-- Add an additive policy so authors can SELECT their own rows regardless of
-- status.  The existing "Published content is viewable by everyone" policy
-- continues to serve anonymous and authenticated readers of published posts.
DROP POLICY IF EXISTS "Authors can view own content" ON content;
CREATE POLICY "Authors can view own content"
  ON content FOR SELECT
  USING (auth.uid() = author_id);

-- ─── Fix 2: comments realtime publication ────────────────────────────────────

-- Add comments to supabase_realtime idempotently.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE comments;
  END IF;
END $$;
