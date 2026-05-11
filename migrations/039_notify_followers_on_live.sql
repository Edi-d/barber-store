-- ============================================================================
-- Migration 039: Notify Followers When User Goes Live
-- ============================================================================
-- Adds a database trigger that automatically creates notifications for all
-- followers when a user starts a live stream (status changes to 'live').
-- ============================================================================

-- Function: notify_followers_on_live

CREATE OR REPLACE FUNCTION notify_followers_on_live()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when status changes to 'live'
  IF NEW.status = 'live' AND (OLD.status IS NULL OR OLD.status != 'live') THEN
    INSERT INTO notifications (user_id, type, actor_id, target_type, target_id)
    SELECT
      f.follower_id,
      'live',
      NEW.host_id,
      'live',
      NEW.id
    FROM follows f
    WHERE f.following_id = NEW.host_id
      AND f.follower_id != NEW.host_id;  -- Don't notify self
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on lives table

DROP TRIGGER IF EXISTS trg_notify_on_live ON lives;
CREATE TRIGGER trg_notify_on_live
  AFTER INSERT OR UPDATE ON lives
  FOR EACH ROW
  EXECUTE FUNCTION notify_followers_on_live();

-- ============================================================================
-- DONE! Followers will now be notified when a user goes live.
-- ============================================================================
