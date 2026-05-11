-- Migration 031: Fix seed user display names and avatars
-- Problem: Seed users were inserted with ON CONFLICT DO NOTHING,
--          so profiles created by the auth trigger have NULL display_name/avatar_url.
-- Safe to re-run (idempotent): always sets display_name, only sets avatar_url if NULL.

UPDATE profiles SET
  display_name = 'Andrei Vlad',
  avatar_url = COALESCE(avatar_url, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200')
WHERE id = '11111111-aaaa-bbbb-cccc-111111111111';

UPDATE profiles SET
  display_name = 'Maria Popescu',
  avatar_url = COALESCE(avatar_url, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200')
WHERE id = '22222222-aaaa-bbbb-cccc-222222222222';

UPDATE profiles SET
  display_name = 'Ion Dumitrescu',
  avatar_url = COALESCE(avatar_url, 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200')
WHERE id = '33333333-aaaa-bbbb-cccc-333333333333';

UPDATE profiles SET
  display_name = 'Elena Marin',
  avatar_url = COALESCE(avatar_url, 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200')
WHERE id = '44444444-aaaa-bbbb-cccc-444444444444';

UPDATE profiles SET
  display_name = 'Radu Stanescu',
  avatar_url = COALESCE(avatar_url, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200')
WHERE id = '55555555-aaaa-bbbb-cccc-555555555555';

UPDATE profiles SET
  display_name = 'Ana Constantinescu',
  avatar_url = COALESCE(avatar_url, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200')
WHERE id = '66666666-aaaa-bbbb-cccc-666666666666';

UPDATE profiles SET
  display_name = 'Bogdan Popa',
  avatar_url = COALESCE(avatar_url, 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200')
WHERE id = '77777777-aaaa-bbbb-cccc-777777777777';

UPDATE profiles SET
  display_name = 'Cristina Lazar',
  avatar_url = COALESCE(avatar_url, 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200')
WHERE id = '88888888-aaaa-bbbb-cccc-888888888888';
