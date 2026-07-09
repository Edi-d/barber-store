-- ============================================================================
-- Migration 155: Per-salon "dependents" (book for a child / another person)
-- ============================================================================
--
-- A logged-in customer can book for their child (or another person) who has no
-- Tapzi account of their own. The dependent is stored as a normal salon_clients
-- row (the per-salon CRM identity) whose managed_by_profile_id points at the
-- parent's auth profile, so the same child is remembered and reusable for future
-- bookings AT THAT SALON. The parent account holder stays the contact for
-- confirmations; the dependent carries no phone/email of its own.
--
-- Distinct from linked_profile_id (that client IS an app user) and from the
-- owner/staff walk-in path.
--
-- Shared Supabase project with the web app (tazpi-website), which ships the same
-- changes as 20260709_salon_client_dependents.sql + _source_dependent.sql. Every
-- statement here is additive and idempotent, so applying from either repo (or
-- twice) is safe.
-- ============================================================================

BEGIN;

-- ─── 1. managed_by_profile_id: marks a row as a dependent + who manages it ──
ALTER TABLE public.salon_clients
  ADD COLUMN IF NOT EXISTS managed_by_profile_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS salon_clients_managed_by_idx
  ON public.salon_clients (managed_by_profile_id);

COMMENT ON COLUMN public.salon_clients.managed_by_profile_id IS
  'When set, this salon_clients row is a dependent (e.g. a child) managed by the referenced parent auth profile, who books on its behalf. Null for normal / self / staff-created clients.';

-- ─── 2. Allow a NULL phone for dependents ───────────────────────────────────
-- Mobile migration 091 declared phone_e164 NOT NULL, but a dependent has no
-- phone of its own (the parent stays the contact). The CHECK on the column only
-- constrains non-null values, so dropping NOT NULL is enough. No-op if the
-- shared project already relaxed it.
ALTER TABLE public.salon_clients
  ALTER COLUMN phone_e164 DROP NOT NULL;

-- ─── 3. Widen the source CHECK to allow 'client_dependent' ──────────────────
-- Migration 091 defined source CHECK (source IN ('appointment','manual','import',
-- 'app_user')). The dependent row is inserted with source = 'client_dependent',
-- which that CHECK rejects with a 23514. Drop whatever single-column CHECK
-- currently governs `source` (matched by constrained column so we're robust to
-- its name) and recreate it with the new value. Additive: no existing row uses
-- it, and the other apps keep writing the four legacy values.
DO $$
DECLARE
  src_attnum smallint;
  con        record;
BEGIN
  SELECT attnum INTO src_attnum
    FROM pg_attribute
   WHERE attrelid = 'public.salon_clients'::regclass
     AND attname = 'source'
     AND NOT attisdropped;

  FOR con IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.salon_clients'::regclass
       AND contype = 'c'
       AND conkey = ARRAY[src_attnum]
  LOOP
    EXECUTE format('ALTER TABLE public.salon_clients DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.salon_clients
  ADD CONSTRAINT salon_clients_source_check
  CHECK (source IN ('appointment','manual','import','app_user','client_dependent'));

-- ─── 4. RLS: let a parent read the dependents they manage ───────────────────
-- Additive permissive SELECT policy so the customer app can list "book for"
-- options. Coexists with the existing staff-scoped read policy (policies are
-- OR'd). Writes go through the SECURITY DEFINER book_appointment RPC, so they
-- don't depend on any client-side insert policy.
DROP POLICY IF EXISTS "salon_clients_read_own_dependents" ON public.salon_clients;
CREATE POLICY "salon_clients_read_own_dependents" ON public.salon_clients
  FOR SELECT TO authenticated
  USING (managed_by_profile_id = auth.uid());

COMMIT;
