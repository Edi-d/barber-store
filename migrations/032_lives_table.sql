-- ============================================================================
-- Migration 032: Lives Table — Add LiveKit columns for live streaming
-- ============================================================================
-- The lives table already exists (001_initial_schema.sql) with host_id.
-- This migration adds the missing columns needed for LiveKit integration.
-- ============================================================================

-- Add room_name for LiveKit room identification
ALTER TABLE lives ADD COLUMN IF NOT EXISTS room_name TEXT UNIQUE;

-- viewers_count already exists (added in 005_live_seed_data.sql)

-- ─── RLS (skip if already enabled) ────────────────────────────────────────

-- Drop existing policies if they exist, then recreate
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lives' AND policyname = 'Lives are viewable by everyone'
  ) THEN
    ALTER TABLE lives ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Lives are viewable by everyone" ON lives FOR SELECT USING (true);
    CREATE POLICY "Users can create own lives" ON lives FOR INSERT WITH CHECK (auth.uid() = host_id);
    CREATE POLICY "Users can update own lives" ON lives FOR UPDATE USING (auth.uid() = host_id);
    CREATE POLICY "Users can delete own lives" ON lives FOR DELETE USING (auth.uid() = host_id);
  END IF;
END $$;
