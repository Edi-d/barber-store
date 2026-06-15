-- Migration 147: Backfill onboarding_completed for pre-existing accounts
-- ============================================================================
-- Why: Routing previously gated on "has a profile row" (session && profile).
-- The handle_new_user() trigger creates a profile row for EVERY new auth user
-- with onboarding_completed = FALSE, so the onboarding screen was effectively
-- unreachable and the flag was never flipped to TRUE for existing users.
--
-- The client now gates on profiles.onboarding_completed (app/index.tsx). Without
-- this backfill, every existing/configured account would be re-onboarded on the
-- next app open. Mark all currently-existing profiles as completed; brand-new
-- signups after this runs still get FALSE from the trigger and see onboarding.
-- ============================================================================

UPDATE public.profiles
SET onboarding_completed = TRUE
WHERE onboarding_completed IS DISTINCT FROM TRUE;
