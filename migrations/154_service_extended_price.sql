-- ============================================================================
-- Migration 154: Per-service extended-hours price (price_cents_extended)
-- ============================================================================
--
-- A salon owner can set an exact price that a service charges ONLY while the
-- salon is in its after-close "program prelungit" (extended-hours) window. This
-- is the per-service analog of the day-level extended surcharge, but an owner-
-- chosen amount instead of a computed markup.
--
-- Precedence (enforced in book_appointment, migration 156; previewed client-side
-- in lib/extended-hours.finalBookingTotalCents):
--   When a slot starts in the extended window AND a service has a non-null
--   price_cents_extended (> 0), that price REPLACES the service's base price AND
--   the day-level surcharge for that service. Services with no extended price
--   keep the existing flow: base price -> surcharge.
--
-- Null = no special extended-hours price (the service falls back to price_cents).
--
-- Shared Supabase project with the web app (tazpi-website) and the salon
-- business app (tapzi-barber); the web repo ships the same column as
-- 20260709_service_extended_price.sql. `if not exists` keeps it safe to apply
-- from whichever repo runs first.
-- ============================================================================

BEGIN;

ALTER TABLE public.barber_services
  ADD COLUMN IF NOT EXISTS price_cents_extended integer;

COMMENT ON COLUMN public.barber_services.price_cents_extended IS
  'Optional per-service price (in cents) that applies only while the salon is in its extended-hours ("program prelungit") window. Null = no special extended-hours price; the service falls back to price_cents. When set (> 0) for a slot in the extended window it replaces base price and the day-level surcharge for that service.';

COMMIT;
