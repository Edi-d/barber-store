-- 025: Add photo support to salon reviews
-- Adds photo_url column to salon_reviews table and creates storage bucket

-- Add photo_url column
ALTER TABLE salon_reviews
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Create storage bucket for review photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: authenticated users can upload their own review photos
CREATE POLICY "Users can upload review photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'review-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policy: anyone can view review photos
CREATE POLICY "Review photos are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'review-photos');

-- Storage policy: users can delete their own review photos
CREATE POLICY "Users can delete own review photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'review-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
