-- Migration 118: barber_breaks table
--
-- Purpose:
--   Persist time-off blocks for individual barbers (lunch, vacation, training,
--   personal, ad-hoc). Supports recurring rules (DAILY + per-weekday WEEKLY_*)
--   and per-occurrence overrides via parent/child rows. A child row with
--   `is_exception_skip = true` acts as a tombstone for "delete just this
--   occurrence" of a recurring series; UI must filter those out.
--
-- Notes:
--   - When `recurrence_until` IS NULL and `recurrence_rule != 'NONE'`, the
--     series is conceptually infinite. The UI must clamp to a finite window
--     (e.g. one year out) when expanding occurrences.
--   - The GiST overlap index targets only NON-tombstone rows so range queries
--     on (barber_id, [start_at, end_at)) don't pick up exception_skip stubs.
--   - Recurring break collisions are NOT enforced by the appointments trigger
--     (see migration 120 for that trade-off rationale); only NON-recurring
--     barber_breaks are checked server-side. Recurring expansion + collision
--     is enforced in the client.
--
-- Depends on:
--   - 001 (salons, profiles)
--   - 004 (barbers)
--   - 081 (tg_set_updated_at, is_salon_member)

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Required extension for GiST btree-style operators (uuid + tstzrange).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.barber_breaks (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id            uuid        NOT NULL REFERENCES public.salons(id)   ON DELETE CASCADE,
  barber_id           uuid        NOT NULL REFERENCES public.barbers(id)  ON DELETE CASCADE,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  reason_type         text        NOT NULL DEFAULT 'other'
                                   CHECK (reason_type IN ('lunch','vacation','training','personal','other')),
  -- Optional custom title (typically used when reason_type = 'other').
  title               text        NULL,
  recurrence_rule     text        NOT NULL DEFAULT 'NONE'
                                   CHECK (recurrence_rule IN (
                                     'NONE','DAILY',
                                     'WEEKLY_MO','WEEKLY_TU','WEEKLY_WE','WEEKLY_TH',
                                     'WEEKLY_FR','WEEKLY_SA','WEEKLY_SU'
                                   )),
  -- NULL + recurrence != NONE => infinite series (UI clamps at query time).
  recurrence_until    date        NULL,
  -- Pointer back to the master row when this row is a one-occurrence override.
  parent_break_id     uuid        NULL REFERENCES public.barber_breaks(id) ON DELETE CASCADE,
  -- True + parent_break_id set => "delete only this occurrence" tombstone.
  is_exception_skip   boolean     NOT NULL DEFAULT false,
  notes               text        NULL,
  -- created_by: written as specified. ON DELETE SET DEFAULT will re-evaluate
  -- the default expression (auth.uid()) at delete time. In practice deletes
  -- of profiles in this app do not occur outside admin paths.
  created_by          uuid        NOT NULL DEFAULT auth.uid()
                                   REFERENCES public.profiles(id) ON DELETE SET DEFAULT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT barber_breaks_end_after_start CHECK (end_at > start_at)
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_barber_breaks_barber_start
  ON public.barber_breaks (barber_id, start_at DESC)
  WHERE NOT is_exception_skip;

CREATE INDEX IF NOT EXISTS idx_barber_breaks_salon_start
  ON public.barber_breaks (salon_id, start_at DESC)
  WHERE NOT is_exception_skip;

CREATE INDEX IF NOT EXISTS idx_barber_breaks_parent
  ON public.barber_breaks (parent_break_id, start_at)
  WHERE parent_break_id IS NOT NULL;

-- GiST overlap index on (barber_id, tstzrange(start_at, end_at, '[)'))
-- accelerates the appointments BEFORE-trigger collision check (migration 120).
CREATE INDEX IF NOT EXISTS idx_barber_breaks_range
  ON public.barber_breaks
  USING gist (barber_id, tstzrange(start_at, end_at, '[)'))
  WHERE NOT is_exception_skip;

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger (reuse public.tg_set_updated_at from 081)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS barber_breaks_set_updated_at ON public.barber_breaks;
CREATE TRIGGER barber_breaks_set_updated_at
  BEFORE UPDATE ON public.barber_breaks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.barber_breaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS barber_breaks_select ON public.barber_breaks;
CREATE POLICY barber_breaks_select
  ON public.barber_breaks
  FOR SELECT
  TO authenticated
  USING (public.is_salon_member(salon_id));

DROP POLICY IF EXISTS barber_breaks_insert ON public.barber_breaks;
CREATE POLICY barber_breaks_insert
  ON public.barber_breaks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_salon_member(salon_id));

DROP POLICY IF EXISTS barber_breaks_update ON public.barber_breaks;
CREATE POLICY barber_breaks_update
  ON public.barber_breaks
  FOR UPDATE
  TO authenticated
  USING (public.is_salon_member(salon_id))
  WITH CHECK (public.is_salon_member(salon_id));

DROP POLICY IF EXISTS barber_breaks_delete ON public.barber_breaks;
CREATE POLICY barber_breaks_delete
  ON public.barber_breaks
  FOR DELETE
  TO authenticated
  USING (public.is_salon_member(salon_id));

COMMIT;
