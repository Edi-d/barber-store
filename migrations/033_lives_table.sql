-- Migration 032: Lives Table for Live Streaming
-- Creates the lives table + RLS policies for barber live streaming

CREATE TABLE IF NOT EXISTS lives (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    cover_url     TEXT,
    room_name     TEXT NOT NULL UNIQUE,
    status        TEXT NOT NULL DEFAULT 'starting',  -- 'starting' | 'live' | 'ended'
    playback_url  TEXT,
    viewers_count INTEGER NOT NULL DEFAULT 0,
    started_at    TIMESTAMPTZ,
    ended_at      TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_lives_active ON lives(status, created_at DESC) WHERE status = 'live';
CREATE INDEX idx_lives_author ON lives(author_id, created_at DESC);

-- RLS
ALTER TABLE lives ENABLE ROW LEVEL SECURITY;

-- Everyone can see live streams
CREATE POLICY "Lives are viewable by everyone" ON lives FOR SELECT USING (true);

-- Authors can create their own lives
CREATE POLICY "Users can create own lives" ON lives FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Authors can update their own lives (status, viewers_count, etc.)
CREATE POLICY "Users can update own lives" ON lives FOR UPDATE USING (auth.uid() = author_id);

-- Authors can delete their own lives
CREATE POLICY "Users can delete own lives" ON lives FOR DELETE USING (auth.uid() = author_id);
