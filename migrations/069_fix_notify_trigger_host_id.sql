-- ============================================================================
-- Migration 069: Fix notify_followers_on_live trigger — author_id -> host_id
-- ============================================================================
-- Migration 044 created the trigger referencing NEW.author_id, but the actual
-- column in the lives table (defined in migration 033) is host_id.
-- This migration drops and recreates the trigger and function with the correct
-- column name so followers are properly notified when a user goes live.
-- ============================================================================

-- Fix: notify_followers_on_live trigger used NEW.author_id but column is host_id
DROP TRIGGER IF EXISTS trg_notify_on_live ON lives;
DROP FUNCTION IF EXISTS notify_followers_on_live();

CREATE OR REPLACE FUNCTION notify_followers_on_live()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when status changes to 'live'
  IF NEW.status = 'live' AND (OLD IS NULL OR OLD.status != 'live') THEN
    INSERT INTO notifications (user_id, type, target_type, actor_id, target_id)
    SELECT
      f.follower_id,
      'live',
      'live',
      NEW.host_id,
      NEW.id
    FROM follows f
    WHERE f.following_id = NEW.host_id
      AND f.follower_id != NEW.host_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_on_live
  AFTER INSERT OR UPDATE ON lives
  FOR EACH ROW
  EXECUTE FUNCTION notify_followers_on_live();

-- ============================================================================
-- DONE! Trigger now correctly references host_id on the lives table.
-- ============================================================================
