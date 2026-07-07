-- 152: Add `platform_xp_transactions` to the supabase_realtime publication
--
-- The customer app reflects the user's loyalty points from
-- `platform_xp_transactions`: the balance/level hero (useLoyaltyProfile), the
-- points-earned toast (useLoyaltyNotifications) and the transaction history
-- lists. All three already open Realtime subscriptions on this table, but it
-- was never added to the supabase_realtime publication in any migration — so
-- those subscriptions connect and never receive a single event. Points only
-- refreshed on remount / window focus, never live.
--
-- This migration makes realtime delivery part of the schema, so a new earn /
-- redemption / adjustment row updates the balance and history the instant it
-- lands (mirrors migration 151 for loyalty_vouchers).
--
-- RLS on platform_xp_transactions already scopes SELECT to auth.uid() = user_id,
-- and every subscription filters on user_id=eq.<uid>, so no row leaks.
--
-- REPLICA IDENTITY FULL keeps UPDATE/DELETE payloads complete, matching the
-- convention used for the other realtime tables (see migrations 145 / 151).

ALTER TABLE public.platform_xp_transactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'platform_xp_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_xp_transactions;
  END IF;
END $$;
