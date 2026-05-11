-- Comment reactions (emoji-based, replaces simple like)
CREATE TABLE IF NOT EXISTS comment_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL DEFAULT '❤️',  -- emoji reaction type
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(comment_id, user_id, reaction)  -- one reaction type per user per comment
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user ON comment_reactions(user_id);

-- RLS
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone can view reactions
CREATE POLICY "comment_reactions_select" ON comment_reactions
    FOR SELECT USING (true);

-- Users can insert their own reactions
CREATE POLICY "comment_reactions_insert" ON comment_reactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reactions
CREATE POLICY "comment_reactions_delete" ON comment_reactions
    FOR DELETE USING (auth.uid() = user_id);
