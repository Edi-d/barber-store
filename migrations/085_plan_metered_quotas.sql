-- ============================================
-- Tapzi Barber — 085: Plan metered quotas + features refresh
-- ============================================
-- Populates the per-plan monthly included quotas for the 4 metered SKUs
-- (columns added in migration 081) and refreshes the Romanian `features`
-- jsonb on each plan so the pricing UI advertises the new quotas instead
-- of the legacy "50 SMS gateway" line.
--
-- Plans already exist (seeded in 072). This migration only UPDATEs them.
-- No schema changes. No breaking changes to existing columns.
--
-- Metered SKU rows already exist in metered_skus (seeded in 081). The
-- stripe_meter_id and stripe_price_id columns are left NULL here — fill
-- them in after creating the Billing Meters and Prices in Stripe (see
-- docs/stripe-metered-setup.md).
-- ============================================

BEGIN;

-- ============================================
-- 1. Update plans with monthly included quotas per metered SKU
-- ============================================
UPDATE public.plans
SET
  included_sms_reminder    = 60,
  included_sms_marketing   = 0,
  included_email_reminder  = 300,
  included_email_marketing = 50,
  features = '[
    "1 calendar profesionist",
    "60 SMS reminder/luna incluse",
    "300 email reminder/luna incluse",
    "50 email marketing/luna incluse",
    "SMS marketing la cerere (0.45 lei/sms)",
    "Push notifications nelimitate",
    "Programari online 24/7",
    "Pagina profil publica",
    "Recenzii & rating clienti",
    "Calendar smart cu intervale",
    "Notificari real-time"
  ]'::jsonb
WHERE code = 'solo';

UPDATE public.plans
SET
  included_sms_reminder    = 150,
  included_sms_marketing   = 50,
  included_email_reminder  = 500,
  included_email_marketing = 200,
  features = '[
    "Tot din SOLO",
    "150 SMS reminder/luna incluse",
    "50 SMS marketing/luna incluse",
    "500 email reminder/luna incluse",
    "200 email marketing/luna incluse",
    "Extra SMS: 0.35 lei reminder / 0.45 lei marketing",
    "Extra email: 0.10 lei/email",
    "Program Loialitate XP inclus",
    "Rapoarte Avansate incluse",
    "Lista de asteptare smart",
    "Blocare clienti neseriosi",
    "Prioritate in cautari",
    "Widget booking pentru site/social"
  ]'::jsonb
WHERE code = 'pro';

UPDATE public.plans
SET
  included_sms_reminder    = 200,
  included_sms_marketing   = 60,
  included_email_reminder  = 800,
  included_email_marketing = 300,
  features = '[
    "Tot din PRO per frizer",
    "Baza: 2 frizeri inclusi",
    "Fiecare frizer extra: +20 lei/luna",
    "200 SMS reminder/luna incluse",
    "60 SMS marketing/luna incluse",
    "800 email reminder/luna incluse",
    "300 email marketing/luna incluse",
    "Extra SMS: 0.35 lei reminder / 0.45 lei marketing",
    "Extra email: 0.10 lei/email",
    "Dashboard owner cu overview",
    "Comisioane & pontaj angajati",
    "Calendar multi-profesionist",
    "Rapoarte per angajat",
    "Facturare integrata",
    "Suport prioritar",
    "Boost profil in marketplace"
  ]'::jsonb
WHERE code = 'salon';

-- ============================================
-- 2. Stripe Meter / Price IDs for metered SKUs
-- ============================================
-- The metered_skus.stripe_meter_id and stripe_price_id columns already
-- exist (migration 081). After creating the 4 Billing Meters + 4 metered
-- Prices in the Stripe Dashboard (see docs/stripe-metered-setup.md),
-- uncomment and run the UPDATEs below with the real IDs.
--
-- TODO(stripe): fill in after creating in Stripe dashboard
-- UPDATE public.metered_skus SET
--   stripe_meter_id = 'mtr_XXXXXXXXXXXXXXXX',
--   stripe_price_id = 'price_XXXXXXXXXXXXXXXX'
-- WHERE sku = 'sms_reminder';
--
-- UPDATE public.metered_skus SET
--   stripe_meter_id = 'mtr_XXXXXXXXXXXXXXXX',
--   stripe_price_id = 'price_XXXXXXXXXXXXXXXX'
-- WHERE sku = 'sms_marketing';
--
-- UPDATE public.metered_skus SET
--   stripe_meter_id = 'mtr_XXXXXXXXXXXXXXXX',
--   stripe_price_id = 'price_XXXXXXXXXXXXXXXX'
-- WHERE sku = 'email_reminder';
--
-- UPDATE public.metered_skus SET
--   stripe_meter_id = 'mtr_XXXXXXXXXXXXXXXX',
--   stripe_price_id = 'price_XXXXXXXXXXXXXXXX'
-- WHERE sku = 'email_marketing';

COMMIT;
