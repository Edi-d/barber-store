-- ============================================================
-- Migration 140: Storage bucket for marketplace product images
-- ============================================================
-- Creates the `marketplace-products` bucket and the storage
-- policies needed to serve and manage product images.
--
-- - Bucket is PUBLIC: anyone can render an image URL without
--   authentication (catalog browsing).
-- - Writes (INSERT/DELETE) are restricted to service_role —
--   the catalog is platform-managed; admins/edge functions
--   upload on behalf of the platform.
-- - The `WITH CHECK (auth.role() = 'service_role')` clause
--   means the policy only matches the service_role JWT;
--   regular authenticated users are blocked.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace-products', 'marketplace-products', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Public read
-- ============================================================
DROP POLICY IF EXISTS "Marketplace product images public read" ON storage.objects;
CREATE POLICY "Marketplace product images public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'marketplace-products');

-- ============================================================
-- Admin uploads (service_role only)
-- ============================================================
DROP POLICY IF EXISTS "Admin uploads marketplace product images" ON storage.objects;
CREATE POLICY "Admin uploads marketplace product images"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'marketplace-products'
        AND auth.role() = 'service_role'
    );

-- ============================================================
-- Admin deletes (service_role only)
-- ============================================================
DROP POLICY IF EXISTS "Admin deletes marketplace product images" ON storage.objects;
CREATE POLICY "Admin deletes marketplace product images"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'marketplace-products'
        AND auth.role() = 'service_role'
    );

-- ============================================================
-- Done — 140_marketplace_storage_bucket.sql
-- ============================================================
