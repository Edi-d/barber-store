-- Migration 116: Fix ON CONFLICT support for create_appointment_with_client
--
-- Migration 115 replaced the UNIQUE (salon_id, phone_e164) constraint with a
-- partial unique index (WHERE phone_e164 IS NOT NULL). PostgreSQL CAN use a
-- partial index for ON CONFLICT, but ONLY if the index predicate is repeated
-- inline in the ON CONFLICT clause. The RPC didn't include the predicate, so
-- the call fails with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--   specification".
--
-- Simpler fix: restore the full UNIQUE constraint. PostgreSQL's UNIQUE
-- treats NULLs as distinct (default `NULLS DISTINCT` semantics), so multiple
-- walk-in rows with NULL phones still coexist within the same salon.
-- Phone-less walk-ins continue to work — the RPC's `ELSE` branch already
-- inserts directly without ON CONFLICT for that case.

BEGIN;

-- Drop the partial index from migration 115.
DROP INDEX IF EXISTS public.salon_clients_salon_phone_uq;

-- Restore the named UNIQUE constraint that the RPC's ON CONFLICT relies on.
-- Idempotent guard: skip if a constraint with the same column tuple already
-- exists under any name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.salon_clients'::regclass
       AND contype  = 'u'
       AND conkey   = (
         SELECT array_agg(attnum ORDER BY attnum)
           FROM pg_attribute
          WHERE attrelid = 'public.salon_clients'::regclass
            AND attname  IN ('salon_id', 'phone_e164')
       )
  ) THEN
    ALTER TABLE public.salon_clients
      ADD CONSTRAINT salon_clients_salon_id_phone_e164_key
        UNIQUE (salon_id, phone_e164);
  END IF;
END
$$;

COMMIT;
