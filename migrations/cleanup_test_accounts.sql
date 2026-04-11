-- ============================================
-- CLEANUP: Delete ALL test data
-- ============================================
-- Run this in Supabase SQL Editor.
-- Uses TRUNCATE CASCADE to handle all FK deps.
-- ============================================

-- Truncate all app tables (CASCADE handles FKs automatically)
TRUNCATE TABLE
  appointments,
  barber_availability,
  barber_services,
  barbers,
  salon_favorites,
  salon_happy_hours,
  salon_photos,
  salon_reviews,
  salon_invites,
  salon_members,
  salons,
  follows,
  lesson_progress,
  lessons,
  course_modules,
  courses,
  order_items,
  orders,
  cart_items,
  carts,
  reports,
  blocks,
  events,
  likes,
  comments,
  content,
  lives,
  products,
  profiles
CASCADE;

-- Delete all auth users
DELETE FROM auth.users;

-- Verify
SELECT count(*) AS remaining_profiles FROM profiles;
SELECT count(*) AS remaining_users FROM auth.users;
