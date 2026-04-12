-- ============================================
-- Migration 070: Live streams staleness + cleanup
-- ============================================
-- 1. Deletes all seed/mock lives and any stale lives
--    left with status 'live' or 'starting' by broken sessions.
-- 2. Adds last_heartbeat_at column + trigger so the server
--    can auto-expire lives that stopped publishing.
-- 3. Creates an auto_expire function + pg_cron job that marks
--    lives with no heartbeat in the last 2 minutes as 'ended'.
-- ============================================

-- ── 1. Delete seed lives (defensive — seed files already removed) ───────────
DELETE FROM lives WHERE id IN (
    'cc111111-1111-1111-1111-111111111111',
    'cc222222-2222-2222-2222-222222222222',
    'cc333333-3333-3333-3333-333333333333',
    'cc444444-4444-4444-4444-444444444444',
    'cc555555-5555-5555-5555-555555555555',
    'cc666666-6666-6666-6666-666666666666'
);

-- ── 2. Mark any currently-stuck lives as ended ──────────────────────────────
-- Anything claiming to be 'live' or 'starting' older than 10 minutes without
-- a real LiveKit session is definitely dead. Clean slate for the new flow.
UPDATE lives
SET status = 'ended', ended_at = COALESCE(ended_at, NOW())
WHERE status IN ('live', 'starting')
  AND started_at < NOW() - INTERVAL '10 minutes';

-- ── 3. Add last_heartbeat_at column ─────────────────────────────────────────
ALTER TABLE lives
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Index for the auto-expire query
CREATE INDEX IF NOT EXISTS idx_lives_heartbeat_active
  ON lives(last_heartbeat_at)
  WHERE status IN ('live', 'starting');

-- ── 4. Keep heartbeat in sync on any update ─────────────────────────────────
-- Any client-side update (viewers_count, status) bumps the heartbeat.
CREATE OR REPLACE FUNCTION bump_live_heartbeat()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_heartbeat_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lives_bump_heartbeat ON lives;
CREATE TRIGGER lives_bump_heartbeat
  BEFORE UPDATE ON lives
  FOR EACH ROW
  WHEN (OLD.status IN ('live', 'starting'))
  EXECUTE FUNCTION bump_live_heartbeat();

-- ── 5. Auto-expire function ─────────────────────────────────────────────────
-- Marks any 'live'/'starting' without a heartbeat in the last 2 minutes
-- as 'ended'. Called by pg_cron every minute.
CREATE OR REPLACE FUNCTION expire_stale_lives()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE lives
  SET status = 'ended',
      ended_at = COALESCE(ended_at, NOW())
  WHERE status IN ('live', 'starting')
    AND last_heartbeat_at < NOW() - INTERVAL '2 minutes';

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Schedule pg_cron job (runs every minute) ─────────────────────────────
-- Requires pg_cron extension. Silently skip if not available.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any previous job with the same name
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-stale-lives';
    -- Schedule: every minute
    PERFORM cron.schedule(
      'expire-stale-lives',
      '* * * * *',
      $cron$SELECT expire_stale_lives();$cron$
    );
  END IF;
END $$;
