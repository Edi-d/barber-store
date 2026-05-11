-- Migration 123: Enable Supabase realtime for appointments + barber_breaks
--
-- Why: when an owner creates an appointment via QuickBookModal or a break
-- via BreakModal — sometimes from the global FAB in (tabs)/_layout.tsx
-- which lives in a different React subtree than the calendar screen — the
-- calendar's local state doesn't know to refetch and the user has to pull
-- to refresh. Subscribing to postgres_changes via the supabase_realtime
-- publication lets the calendar refetch automatically on INSERT / UPDATE /
-- DELETE without any cross-tree state plumbing.
--
-- Idempotent: skipped per-table if already in the publication. Safe to
-- re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'appointments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'barber_breaks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.barber_breaks';
  END IF;
END $$;
