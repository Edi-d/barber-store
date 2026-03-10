-- ============================================================================
-- Migration 016: Add comment threading and edit tracking
-- ============================================================================
-- Enables nested replies (one level deep) by adding a self-referencing
-- parent_id column, and tracks edits with updated_at / is_edited fields.
-- ============================================================================

-- ─── 1. Threading: self-referencing parent_id ───────────────────────────────
-- NULL parent_id = top-level comment; non-NULL = reply to another comment.
-- CASCADE delete ensures removing a parent also removes all its replies.

ALTER TABLE comments
  ADD COLUMN parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;

-- Partial index for efficient reply lookups (only indexes rows that are replies)
CREATE INDEX idx_comments_parent
  ON comments(parent_id)
  WHERE parent_id IS NOT NULL;

-- ─── 2. Edit tracking columns ───────────────────────────────────────────────

ALTER TABLE comments
  ADD COLUMN updated_at TIMESTAMPTZ,
  ADD COLUMN is_edited  BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. RLS policy: allow users to edit their own comments ──────────────────

CREATE POLICY "Users can edit own comments"
  ON comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
