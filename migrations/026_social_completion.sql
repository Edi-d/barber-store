-- ============================================================================
-- Migration 026: Social System Completion
-- ============================================================================
-- Adds notifications, bookmarks, stories tables and completes storage policies
-- for content, course_media, and product_images buckets.
-- ============================================================================

-- ─── 1. NOTIFICATIONS TABLE ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,  -- 'like' | 'comment' | 'reply' | 'follow' | 'mention' | 'live'
    actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    target_type TEXT,           -- 'content' | 'comment' | 'live' | 'profile'
    target_id   UUID,
    body        TEXT,
    read        BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread
    ON notifications(user_id, created_at DESC)
    WHERE read = false;

CREATE INDEX idx_notifications_user_all
    ON notifications(user_id, created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
    ON notifications FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
    ON notifications FOR DELETE
    USING (auth.uid() = user_id);

-- ─── 2. BOOKMARKS TABLE ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookmarks (
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, content_id)
);

CREATE INDEX idx_bookmarks_user ON bookmarks(user_id, created_at DESC);

-- RLS
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks"
    ON bookmarks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create bookmarks"
    ON bookmarks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
    ON bookmarks FOR DELETE
    USING (auth.uid() = user_id);

-- ─── 3. STORIES TABLE ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    media_url  TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'image',  -- 'image' | 'video'
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stories_active
    ON stories(author_id, expires_at DESC, created_at DESC);

-- RLS
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories are viewable by everyone"
    ON stories FOR SELECT
    USING (true);

CREATE POLICY "Users can create own stories"
    ON stories FOR INSERT
    WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete own stories"
    ON stories FOR DELETE
    USING (auth.uid() = author_id);

-- ─── 4. STORY VIEWS TABLE ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS story_views (
    story_id   UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    viewer_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (story_id, viewer_id)
);

-- RLS
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story authors can see views"
    ON story_views FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM stories WHERE stories.id = story_id AND stories.author_id = auth.uid()
        )
        OR viewer_id = auth.uid()
    );

CREATE POLICY "Users can mark stories as viewed"
    ON story_views FOR INSERT
    WITH CHECK (auth.uid() = viewer_id);

-- ─── 5. BLOCKS TABLE ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blocks (
    blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE blocks ADD CONSTRAINT no_self_block CHECK (blocker_id != blocked_id);

-- RLS
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks"
    ON blocks FOR SELECT
    USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block others"
    ON blocks FOR INSERT
    WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can unblock others"
    ON blocks FOR DELETE
    USING (auth.uid() = blocker_id);

-- ─── 6. REPORTS TABLE ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,  -- 'content' | 'comment' | 'profile'
    target_id   UUID NOT NULL,
    reason      TEXT NOT NULL,  -- 'spam' | 'harassment' | 'inappropriate' | 'other'
    details     TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'reviewed' | 'dismissed'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_status ON reports(status, created_at DESC);

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports"
    ON reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own reports"
    ON reports FOR SELECT
    USING (auth.uid() = reporter_id);

-- ─── 7. FOLLOWERS/FOLLOWING COUNT ON PROFILES ────────────────────────────────

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;

-- Backfill
UPDATE profiles SET followers_count = (
    SELECT COUNT(*) FROM follows WHERE follows.following_id = profiles.id
);
UPDATE profiles SET following_count = (
    SELECT COUNT(*) FROM follows WHERE follows.follower_id = profiles.id
);

-- Triggers for follow counts
CREATE OR REPLACE FUNCTION update_follow_counts_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_follow_counts_on_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
    UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_follow_counts_insert
    AFTER INSERT ON follows
    FOR EACH ROW EXECUTE FUNCTION update_follow_counts_on_insert();

CREATE TRIGGER trg_follow_counts_delete
    AFTER DELETE ON follows
    FOR EACH ROW EXECUTE FUNCTION update_follow_counts_on_delete();

-- ─── 8. NOTIFICATION TRIGGERS ────────────────────────────────────────────────

-- Auto-notify on like
CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER AS $$
DECLARE
    v_author_id UUID;
BEGIN
    SELECT author_id INTO v_author_id FROM content WHERE id = NEW.content_id;
    IF v_author_id IS NOT NULL AND v_author_id != NEW.user_id THEN
        INSERT INTO notifications (user_id, type, actor_id, target_type, target_id)
        VALUES (v_author_id, 'like', NEW.user_id, 'content', NEW.content_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_on_like
    AFTER INSERT ON likes
    FOR EACH ROW EXECUTE FUNCTION notify_on_like();

-- Auto-notify on comment
CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER AS $$
DECLARE
    v_author_id UUID;
    v_parent_user_id UUID;
BEGIN
    -- Notify content author
    SELECT author_id INTO v_author_id FROM content WHERE id = NEW.content_id;
    IF v_author_id IS NOT NULL AND v_author_id != NEW.user_id THEN
        INSERT INTO notifications (user_id, type, actor_id, target_type, target_id, body)
        VALUES (v_author_id, 'comment', NEW.user_id, 'content', NEW.content_id, LEFT(NEW.text, 100));
    END IF;
    -- Notify parent comment author (for replies)
    IF NEW.parent_id IS NOT NULL THEN
        SELECT user_id INTO v_parent_user_id FROM comments WHERE id = NEW.parent_id;
        IF v_parent_user_id IS NOT NULL AND v_parent_user_id != NEW.user_id AND v_parent_user_id != v_author_id THEN
            INSERT INTO notifications (user_id, type, actor_id, target_type, target_id, body)
            VALUES (v_parent_user_id, 'reply', NEW.user_id, 'comment', NEW.parent_id, LEFT(NEW.text, 100));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_on_comment
    AFTER INSERT ON comments
    FOR EACH ROW EXECUTE FUNCTION notify_on_comment();

-- Auto-notify on follow
CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notifications (user_id, type, actor_id, target_type, target_id)
    VALUES (NEW.following_id, 'follow', NEW.follower_id, 'profile', NEW.follower_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_on_follow
    AFTER INSERT ON follows
    FOR EACH ROW EXECUTE FUNCTION notify_on_follow();

-- ─── 9. COMPLETE STORAGE POLICIES ───────────────────────────────────────────

-- Content bucket: add UPDATE and DELETE
CREATE POLICY "Users can update own content files"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'content'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete own content files"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'content'
    AND auth.role() = 'authenticated'
);

-- Course media: add INSERT, UPDATE, DELETE
CREATE POLICY "Authenticated users can upload course media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'course_media'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update course media"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'course_media'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete course media"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'course_media'
    AND auth.role() = 'authenticated'
);

-- Product images: add INSERT, UPDATE, DELETE
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'product_images'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update product images"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'product_images'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete product images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'product_images'
    AND auth.role() = 'authenticated'
);

-- Stories bucket: create + full policies
-- INSERT INTO storage.buckets (id, name, public) VALUES ('stories', 'stories', true);

CREATE POLICY "Stories media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'stories');

CREATE POLICY "Users can upload story media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'stories'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete story media"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'stories'
    AND auth.role() = 'authenticated'
);

-- ============================================================================
-- DONE! Social system completion migration.
-- ============================================================================
