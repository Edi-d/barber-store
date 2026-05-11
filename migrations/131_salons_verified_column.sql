-- Migration 131: Add verified flag to salons (admin-set only)
ALTER TABLE salons ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_salons_verified ON salons(verified) WHERE verified = TRUE;

CREATE OR REPLACE FUNCTION prevent_admin_field_updates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.is_promoted IS DISTINCT FROM OLD.is_promoted THEN
    IF auth.role() <> 'service_role' THEN
      NEW.verified := OLD.verified;
      NEW.is_promoted := OLD.is_promoted;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_salons_admin_guard ON salons;
CREATE TRIGGER trg_salons_admin_guard
  BEFORE UPDATE ON salons
  FOR EACH ROW EXECUTE FUNCTION prevent_admin_field_updates();
