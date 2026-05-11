-- ============================================================
-- 128_billing_multi_entity.sql
--
-- Promotes salon_billing_details from one row per salon to N
-- rows per salon, supporting both legal persons (PJ — CUI, RECOM)
-- and natural persons (PF — CNP). Adds a default-entity flag so
-- existing single-entity callers keep working.
--
-- Also drops `efactura_enabled` — e-Factura SPV submission is
-- always-on now (no per-entity opt-in surfaced in the UI).
--
-- SAFE FOR EXISTING DATA: every existing row gets an auto-generated
-- id, entity_type='legal_person', is_default=true.
-- ============================================================

BEGIN;

-- ── 1. Add new columns ────────────────────────────────────────
ALTER TABLE salon_billing_details
    ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE salon_billing_details
    ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'legal_person';

ALTER TABLE salon_billing_details
    ADD COLUMN IF NOT EXISTS cnp TEXT;

ALTER TABLE salon_billing_details
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 2. Drop legacy PK + e-Factura toggle ──────────────────────
-- Drop the salon_id PK so we can have multiple rows per salon.
ALTER TABLE salon_billing_details
    DROP CONSTRAINT IF EXISTS salon_billing_details_pkey;

-- E-Factura is always-on for the salon globally; per-entity opt-in
-- has zero downstream readers (verified via grep across the repo
-- before writing this migration). Safe to drop.
ALTER TABLE salon_billing_details
    DROP COLUMN IF EXISTS efactura_enabled;

-- ── 3. New PK on id, keep salon_id as a regular FK ───────────
ALTER TABLE salon_billing_details
    ADD PRIMARY KEY (id);

-- Re-assert salon_id is non-null and indexed (was implicit via PK).
ALTER TABLE salon_billing_details
    ALTER COLUMN salon_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_salon_billing_details_salon
    ON salon_billing_details(salon_id);

-- ── 4. Make fiscal_code nullable; PF entities have CNP instead ─
-- Drop the legacy length CHECK that assumed fiscal_code is required;
-- replace with a per-entity-type rule below.
ALTER TABLE salon_billing_details
    DROP CONSTRAINT IF EXISTS salon_billing_details_fiscal_code_len;

ALTER TABLE salon_billing_details
    ALTER COLUMN fiscal_code DROP NOT NULL;

-- ── 5. Entity-type rules ──────────────────────────────────────
-- entity_type must be one of the two literals.
ALTER TABLE salon_billing_details
    DROP CONSTRAINT IF EXISTS salon_billing_details_entity_type_chk;

ALTER TABLE salon_billing_details
    ADD CONSTRAINT salon_billing_details_entity_type_chk
    CHECK (entity_type IN ('legal_person', 'natural_person'));

-- PJ requires fiscal_code (CUI/CIF) AND must NOT have a CNP.
-- PF requires CNP (13 digits) AND must NOT have a fiscal_code.
-- Strict mutual exclusion prevents inconsistent rows from a direct API
-- write that bypasses the form (`update({ entity_type: 'natural_person',
-- cnp: '...' })` against a PJ row would otherwise leave both columns set).
ALTER TABLE salon_billing_details
    DROP CONSTRAINT IF EXISTS salon_billing_details_id_required;

ALTER TABLE salon_billing_details
    ADD CONSTRAINT salon_billing_details_id_required
    CHECK (
        (entity_type = 'legal_person'
            AND fiscal_code IS NOT NULL AND length(trim(fiscal_code)) >= 2
            AND cnp IS NULL)
     OR (entity_type = 'natural_person'
            AND cnp IS NOT NULL AND length(trim(cnp)) = 13
            AND fiscal_code IS NULL)
    );

-- PF cannot be a VAT payer. Force the column to false in the CHECK
-- so app logic can't accidentally store a contradictory state.
ALTER TABLE salon_billing_details
    DROP CONSTRAINT IF EXISTS salon_billing_details_pf_not_vat;

ALTER TABLE salon_billing_details
    ADD CONSTRAINT salon_billing_details_pf_not_vat
    CHECK (entity_type = 'legal_person' OR is_vat_payer = FALSE);

-- ── 6. Tighten RLS — owner-only SELECT ────────────────────────
-- The original policy in migration 113 allowed any salon_member to
-- SELECT billing details. Pre-128 the worst leak was the CUI (public
-- info anyway). Post-128 the table holds CNP and IBAN, both PII the
-- staff doesn't need. Replace with owner-only SELECT to match the
-- write policy (which was already owner-only).
DROP POLICY IF EXISTS salon_billing_details_select ON salon_billing_details;
CREATE POLICY salon_billing_details_select ON salon_billing_details
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = salon_billing_details.salon_id
                   AND s.owner_id = auth.uid())
    );

-- ── 7. At most ONE default per salon ──────────────────────────
-- Partial unique index — postgres enforces at most one default,
-- but it's OK for a salon to have zero defaults transiently
-- (e.g., right after deleting the previous default and before the
-- user picks a new one). The app re-prompts in that case.
DROP INDEX IF EXISTS uniq_salon_billing_default;
CREATE UNIQUE INDEX uniq_salon_billing_default
    ON salon_billing_details(salon_id)
    WHERE is_default = TRUE;

-- ── 8. Order snapshot — capture entity_type + CNP ─────────────
-- marketplace_orders denormalizes the billing record at order time so
-- invoices reproduce the exact data even after the salon edits the
-- entity. Add the new fields so PF orders carry their CNP forward;
-- otherwise PF orders look like "no billing" to invoice consumers.
ALTER TABLE marketplace_orders
    ADD COLUMN IF NOT EXISTS billing_entity_type TEXT,
    ADD COLUMN IF NOT EXISTS billing_cnp TEXT;

COMMIT;
