-- ============================================
-- Tapzi Barber — Plans Seed + Trial Activation RPC
-- ============================================
-- Seeds the 3 plans (SOLO / PRO / SALON) and adds a SECURITY DEFINER
-- function start_salon_trial() that the web /activate flow calls to
-- start a 14-day trial for the currently-logged-in salon owner.
-- No payment required — Stripe comes later.
-- ============================================

-- ============================================
-- 1. SEED PLANS
-- ============================================
INSERT INTO plans (code, name, description, price_monthly, price_yearly, currency,
                   included_staff, extra_staff_price, included_sms, trial_days,
                   features, is_active, sort_order)
VALUES
  ('solo', 'SOLO', 'Frizer independent',
    19.99, NULL, 'RON',
    1, NULL, 50, 14,
    '[
      "1 calendar profesionist",
      "50 SMS gateway/luna incluse",
      "Push notifications nelimitate",
      "Programari online 24/7",
      "Pagina profil publica",
      "Recenzii & rating clienti",
      "Calendar smart cu intervale",
      "Notificari real-time"
    ]'::jsonb,
    TRUE, 10),

  ('pro', 'PRO', 'Profesionist complet',
    34.99, NULL, 'RON',
    1, NULL, 50, 14,
    '[
      "Tot din SOLO",
      "50 SMS gateway cu tracking",
      "Program Loialitate XP inclus",
      "Rapoarte Avansate incluse",
      "SMS marketing (0.45 lei/sms)",
      "Lista de asteptare smart",
      "Blocare clienti neseriosi",
      "Prioritate in cautari",
      "Widget booking pentru site/social"
    ]'::jsonb,
    TRUE, 20),

  ('salon', 'SALON', 'Echipa & Multi-scaun',
    49.99, NULL, 'RON',
    2, 20.00, 60, 14,
    '[
      "Tot din PRO per frizer",
      "Baza: 2 frizeri inclusi",
      "Fiecare frizer extra: +20 lei/luna",
      "30 SMS gateway per frizer",
      "Dashboard owner cu overview",
      "Comisioane & pontaj angajati",
      "Calendar multi-profesionist",
      "Rapoarte per angajat",
      "Facturare integrata",
      "Suport prioritar",
      "Boost profil in marketplace"
    ]'::jsonb,
    TRUE, 30)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  included_staff = EXCLUDED.included_staff,
  extra_staff_price = EXCLUDED.extra_staff_price,
  included_sms = EXCLUDED.included_sms,
  trial_days = EXCLUDED.trial_days,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;

-- ============================================
-- 2. RPC: start_salon_trial — see migrations/072b_start_salon_trial_rpc.sql
-- ============================================
-- Run the RPC migration as a SEPARATE SQL editor request. Supabase's SQL
-- editor occasionally splits CREATE FUNCTION bodies on internal semicolons
-- when combined with multi-statement scripts, which produces misleading
-- errors like "relation v_salon_id does not exist".
-- ============================================
