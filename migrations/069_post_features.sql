-- 069: Add rich post features (tags, location, mood, privacy settings, alt text)

ALTER TABLE content
  ADD COLUMN IF NOT EXISTS tagged_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS location_salon_id uuid REFERENCES salons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mood text,
  ADD COLUMN IF NOT EXISTS comments_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_likes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alt_text text;

CREATE INDEX IF NOT EXISTS content_tagged_user_ids_idx ON content USING gin (tagged_user_ids);
CREATE INDEX IF NOT EXISTS content_location_salon_idx ON content(location_salon_id) WHERE location_salon_id IS NOT NULL;

ALTER TABLE content
  ADD CONSTRAINT content_mood_check CHECK (
    mood IS NULL OR mood IN ('classic', 'fresh_fade', 'chill', 'energic', 'elegant', 'old_school')
  );
