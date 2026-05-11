-- ============================================
-- Tapzi Barber — Add seat price ID for SALON extra staff
-- ============================================
-- SALON plan has base subscription + per-seat extra price (2 items).
-- This migration adds the column + populates all 3 price IDs.
-- ============================================

ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS stripe_seat_price_id TEXT;

-- Seed Stripe test-mode price IDs
UPDATE plans SET stripe_price_id_monthly = 'price_1TNyOjBBGC4q6pq7xrhUaiZ5' WHERE code = 'solo';
UPDATE plans SET stripe_price_id_monthly = 'price_1TNyOkBBGC4q6pq7o31ENUgt' WHERE code = 'pro';
UPDATE plans SET stripe_price_id_monthly = 'price_1TNyOlBBGC4q6pq7DSGL8nxR',
                 stripe_seat_price_id    = 'price_1TNyOmBBGC4q6pq75my0CrEc'
            WHERE code = 'salon';
