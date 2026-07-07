-- 151: Add `loyalty_vouchers` to the supabase_realtime publication
--
-- When a barber redeems a customer's voucher (scans the QR code or types the
-- code) in the barber app, the shared `loyalty_vouchers` row flips
-- status 'active' → 'used' (and stamps used_at / used_by_barber_id). The
-- customer app's "Voucherele mele" list should reflect that immediately.
--
-- The `useMyVouchersRealtime` hook subscribes to postgres_changes on
-- `public.loyalty_vouchers` filtered by `user_id`, but the table was never
-- added to the supabase_realtime publication in any migration — so the
-- subscription connects yet never receives events. This migration makes
-- realtime delivery part of the schema.
--
-- RLS ("Users can view own vouchers": auth.uid() = user_id) already scopes
-- realtime events to the owning customer, so no row leaks to other users.
--
-- REPLICA IDENTITY FULL ensures UPDATE payloads carry the full OLD row too,
-- matching the convention used for other realtime tables (see migration 145).

ALTER TABLE public.loyalty_vouchers REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'loyalty_vouchers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.loyalty_vouchers;
  END IF;
END $$;
