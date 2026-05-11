-- ============================================================================
-- Migration 045: Complete Social Setup (Idempotent)
-- ============================================================================
-- A single comprehensive migration that ensures ALL social-feature tables,
-- columns, triggers, RLS policies, storage buckets, and indexes exist.
-- SAFE to run multiple times — uses IF NOT EXISTS, OR REPLACE, DO NOTHING,
-- and DO $$ guard blocks throughout.
-- ============================================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PROFILES — ensure all social columns exist
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_role TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- ============================================================================
-- 2. CONTENT — ensure all social columns exist
-- ============================================================================

-- likes_count and comments_count (may fail if already NOT NULL, so use DO block)
DO $$ BEGIN
  ALTER TABLE content ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE content ADD COLUMN IF NOT EXISTS comments_count INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE content ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE content ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- ============================================================================
-- 3. COMMENTS — ensure threading + edit columns exist
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ============================================================================
-- 4. FOLLOWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS follows (
    follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

-- no_self_follow constraint (skip if exists)
DO $$ BEGIN
  ALTER TABLE follows ADD CONSTRAINT no_self_follow CHECK (follower_id != following_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- RLS policies (drop-if-exists + create pattern for safety)
DO $$ BEGIN
  CREATE POLICY "Follows are viewable by everyone" ON follows FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create follows" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own follows" ON follows FOR DELETE USING (auth.uid() = follower_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 5. BOOKMARKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bookmarks (
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, content_id)
);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own bookmarks" ON bookmarks FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create bookmarks" ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own bookmarks" ON bookmarks FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 6. NOTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,   -- 'like' | 'comment' | 'reply' | 'follow' | 'mention' | 'live'
    actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    target_type TEXT,            -- 'content' | 'comment' | 'live' | 'profile'
    target_id   UUID,
    body        TEXT,
    read        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 7. STORIES + STORY_VIEWS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS stories (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    media_url     TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'image',  -- 'image' | 'video'
    expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Video support columns
ALTER TABLE stories ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Stories are viewable by everyone" ON stories FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own stories" ON stories FOR INSERT WITH CHECK (auth.uid() = author_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own stories" ON stories FOR DELETE USING (auth.uid() = author_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS story_views (
    story_id   UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    viewer_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (story_id, viewer_id)
);

ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Story authors can see views" ON story_views FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM stories WHERE stories.id = story_id AND stories.author_id = auth.uid())
      OR viewer_id = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can mark stories as viewed" ON story_views FOR INSERT WITH CHECK (auth.uid() = viewer_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 8. BLOCKS + REPORTS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS blocks (
    blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id)
);

DO $$ BEGIN
  ALTER TABLE blocks ADD CONSTRAINT no_self_block CHECK (blocker_id != blocked_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own blocks" ON blocks FOR SELECT USING (auth.uid() = blocker_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can block others" ON blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can unblock others" ON blocks FOR DELETE USING (auth.uid() = blocker_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Reports (001_initial_schema.sql created a basic version; 026 created a fuller version)
-- Ensure the table exists with all needed columns
CREATE TABLE IF NOT EXISTS reports (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id   UUID NOT NULL,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The code uses a 'details' column
ALTER TABLE reports ADD COLUMN IF NOT EXISTS details TEXT;

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can create reports" ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own reports" ON reports FOR SELECT USING (auth.uid() = reporter_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 9. HASHTAGS + CONTENT_HASHTAGS + TRENDING_TOPICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS hashtags (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT NOT NULL UNIQUE,
    post_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_hashtags (
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    hashtag_id UUID NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, hashtag_id)
);

ALTER TABLE hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_hashtags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Everyone can view hashtags" ON hashtags FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "System can manage hashtags" ON hashtags FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Everyone can view content_hashtags" ON content_hashtags FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can manage" ON content_hashtags FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS trending_topics (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT NOT NULL,
    category   TEXT,
    post_count INTEGER DEFAULT 0,
    is_active  BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trending_topics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Everyone can view active trending topics" ON trending_topics FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 10. COMMENT_LIKES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS comment_likes (
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, comment_id)
);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Everyone can view comment likes" ON comment_likes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can like comments" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can unlike comments" ON comment_likes FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 11. COMMENT_REACTIONS TABLE (emoji-based)
-- ============================================================================

CREATE TABLE IF NOT EXISTS comment_reactions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction   TEXT NOT NULL DEFAULT '❤️',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(comment_id, user_id, reaction)
);

ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "comment_reactions_select" ON comment_reactions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "comment_reactions_insert" ON comment_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "comment_reactions_delete" ON comment_reactions FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 12. STORAGE BUCKETS: content, avatars, stories, salon-media
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('content', 'content', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'stories', 'stories', true,
  52428800,  -- 50MB for video stories
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];

INSERT INTO storage.buckets (id, name, public)
VALUES ('salon-media', 'salon-media', true)
ON CONFLICT (id) DO NOTHING;

-- ─── Storage policies (idempotent via DO blocks) ──────────────────────────────

-- Avatars
DO $$ BEGIN
  CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Content
DO $$ BEGIN
  CREATE POLICY "Content is publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'content');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can upload content" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'content' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own content files" ON storage.objects FOR UPDATE USING (bucket_id = 'content' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own content files" ON storage.objects FOR DELETE USING (bucket_id = 'content' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stories
DO $$ BEGIN
  CREATE POLICY "Stories media is publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'stories');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can upload story media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'stories' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete story media" ON storage.objects FOR DELETE USING (bucket_id = 'stories' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Salon media
DO $$ BEGIN
  CREATE POLICY "Salon media is publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'salon-media');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can upload salon media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'salon-media' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can delete salon media" ON storage.objects FOR DELETE USING (bucket_id = 'salon-media' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 13. COUNTER TRIGGERS
-- ============================================================================

-- ─── likes_count on content ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_content_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE content SET likes_count = likes_count + 1 WHERE id = NEW.content_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_content_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE content SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.content_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_likes_count ON likes;
CREATE TRIGGER trg_increment_likes_count
  AFTER INSERT ON likes
  FOR EACH ROW EXECUTE FUNCTION increment_content_likes_count();

DROP TRIGGER IF EXISTS trg_decrement_likes_count ON likes;
CREATE TRIGGER trg_decrement_likes_count
  AFTER DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION decrement_content_likes_count();

-- ─── comments_count on content ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_content_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE content SET comments_count = comments_count + 1 WHERE id = NEW.content_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_content_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE content SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.content_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_comments_count ON comments;
CREATE TRIGGER trg_increment_comments_count
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION increment_content_comments_count();

DROP TRIGGER IF EXISTS trg_decrement_comments_count ON comments;
CREATE TRIGGER trg_decrement_comments_count
  AFTER DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION decrement_content_comments_count();

-- ─── followers_count / following_count on profiles ───────────────────────────

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

DROP TRIGGER IF EXISTS trg_follow_counts_insert ON follows;
CREATE TRIGGER trg_follow_counts_insert
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts_on_insert();

DROP TRIGGER IF EXISTS trg_follow_counts_delete ON follows;
CREATE TRIGGER trg_follow_counts_delete
  AFTER DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts_on_delete();

-- ============================================================================
-- 14. NOTIFICATION TRIGGERS
-- ============================================================================

-- ─── notify_on_like ──────────────────────────────────────────────────────────

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

DROP TRIGGER IF EXISTS trg_notify_on_like ON likes;
CREATE TRIGGER trg_notify_on_like
  AFTER INSERT ON likes
  FOR EACH ROW EXECUTE FUNCTION notify_on_like();

-- ─── notify_on_comment ───────────────────────────────────────────────────────

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

DROP TRIGGER IF EXISTS trg_notify_on_comment ON comments;
CREATE TRIGGER trg_notify_on_comment
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION notify_on_comment();

-- ─── notify_on_follow ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, actor_id, target_type, target_id)
  VALUES (NEW.following_id, 'follow', NEW.follower_id, 'profile', NEW.follower_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_on_follow ON follows;
CREATE TRIGGER trg_notify_on_follow
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION notify_on_follow();

-- ─── notify_followers_on_live ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_followers_on_live()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'live' AND (OLD.status IS NULL OR OLD.status != 'live') THEN
    INSERT INTO notifications (user_id, type, actor_id, target_type, target_id)
    SELECT f.follower_id, 'live', NEW.host_id, 'live', NEW.id
    FROM follows f
    WHERE f.following_id = NEW.host_id
      AND f.follower_id != NEW.host_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_on_live ON lives;
CREATE TRIGGER trg_notify_on_live
  AFTER INSERT OR UPDATE ON lives
  FOR EACH ROW EXECUTE FUNCTION notify_followers_on_live();

-- ============================================================================
-- 15. RLS POLICIES for core social tables (content, likes, comments)
-- ============================================================================

-- These tables have RLS enabled in earlier migrations; ensure policies exist.

ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Content
DO $$ BEGIN
  CREATE POLICY "Published content is viewable by everyone" ON content FOR SELECT USING (status = 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authors can create content" ON content FOR INSERT WITH CHECK (auth.uid() = author_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authors can update own content" ON content FOR UPDATE USING (auth.uid() = author_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authors can delete own content" ON content FOR DELETE USING (auth.uid() = author_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Likes
DO $$ BEGIN
  CREATE POLICY "Likes are viewable by everyone" ON likes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can like" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can unlike own likes" ON likes FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Comments
DO $$ BEGIN
  CREATE POLICY "Comments are viewable by everyone" ON comments FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can create comments" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own comments" ON comments FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can edit own comments" ON comments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 16. FULL-TEXT SEARCH TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_profiles_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.display_name, '') || ' ' || coalesce(NEW.username, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_search_vector ON profiles;
CREATE TRIGGER trg_profiles_search_vector
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_profiles_search_vector();

CREATE OR REPLACE FUNCTION update_content_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.caption, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_search_vector ON content;
CREATE TRIGGER trg_content_search_vector
  BEFORE INSERT OR UPDATE ON content
  FOR EACH ROW EXECUTE FUNCTION update_content_search_vector();

-- ============================================================================
-- 17. INDEXES for performance
-- ============================================================================

-- Follows
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- Bookmarks
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, created_at DESC);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_all ON notifications(user_id, created_at DESC);

-- Stories
CREATE INDEX IF NOT EXISTS idx_stories_active ON stories(author_id, expires_at DESC, created_at DESC);

-- Reports
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- Comments parent (replies)
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;

-- Comment likes
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);

-- Comment reactions
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user ON comment_reactions(user_id);

-- Hashtags
CREATE INDEX IF NOT EXISTS idx_hashtags_name ON hashtags(name);
CREATE INDEX IF NOT EXISTS idx_hashtags_post_count ON hashtags(post_count DESC);

-- Content hashtags
CREATE INDEX IF NOT EXISTS idx_content_hashtags_content ON content_hashtags(content_id);
CREATE INDEX IF NOT EXISTS idx_content_hashtags_hashtag ON content_hashtags(hashtag_id);

-- Full-text search GIN indexes
CREATE INDEX IF NOT EXISTS idx_profiles_search ON profiles USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_content_search ON content USING gin(search_vector);

-- Content feed (already in 001 but ensure)
CREATE INDEX IF NOT EXISTS idx_content_status_created ON content(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_author ON content(author_id);
CREATE INDEX IF NOT EXISTS idx_likes_content ON likes(content_id);
CREATE INDEX IF NOT EXISTS idx_comments_content ON comments(content_id, created_at DESC);

-- ============================================================================
-- 18. BACKFILL existing data (safe to re-run)
-- ============================================================================

-- Backfill search vectors for rows that have NULL search_vector
UPDATE profiles
  SET search_vector = to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(username, ''))
  WHERE search_vector IS NULL;

UPDATE content
  SET search_vector = to_tsvector('simple', coalesce(caption, ''))
  WHERE search_vector IS NULL;

-- Backfill follower/following counts
UPDATE profiles p SET followers_count = (
  SELECT COUNT(*) FROM follows f WHERE f.following_id = p.id
) WHERE EXISTS (SELECT 1 FROM follows f WHERE f.following_id = p.id);

UPDATE profiles p SET following_count = (
  SELECT COUNT(*) FROM follows f WHERE f.follower_id = p.id
) WHERE EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p.id);

-- Backfill likes_count and comments_count
UPDATE content c SET likes_count = (
  SELECT COUNT(*) FROM likes l WHERE l.content_id = c.id
) WHERE EXISTS (SELECT 1 FROM likes l WHERE l.content_id = c.id);

UPDATE content c SET comments_count = (
  SELECT COUNT(*) FROM comments cm WHERE cm.content_id = c.id
) WHERE EXISTS (SELECT 1 FROM comments cm WHERE cm.content_id = c.id);

-- ============================================================================
-- DONE! Complete social setup migration.
-- ============================================================================
