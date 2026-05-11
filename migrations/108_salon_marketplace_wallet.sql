-- ============================================================
-- Migration 108: Salon Marketplace Credit Wallet
-- ============================================================
-- When a client redeems a DIVE platform voucher at a salon, the
-- salon earns marketplace credit equal to the voucher value.
-- That credit funds the salon's purchases in the Professional
-- marketplace section (see 109).
--
-- Mirrors the credit_ledger pattern from migration 089, but
-- scoped to marketplace credit (not SMS/email packs).
--
-- Additive only: no ALTER on existing tables.
--
-- DIVE:
--  - salon_marketplace_wallet   = soldul marketplace al salonului
--  - salon_marketplace_credit_ledger = jurnal imutabil +/-
-- ============================================================

BEGIN;

-- ============================================================
-- 1. salon_marketplace_wallet — per-salon credit balance
-- ============================================================
-- DIVE: o linie per salon; sursa de adevar pentru soldul
-- de credit marketplace. Actualizata exclusiv prin trigger-ul
-- apply_credit_ledger_delta (vezi mai jos).
-- ============================================================
CREATE TABLE IF NOT EXISTS salon_marketplace_wallet (
    salon_id               UUID PRIMARY KEY REFERENCES salons(id) ON DELETE CASCADE,
    balance_cents          INT NOT NULL DEFAULT 0,
    lifetime_earned_cents  INT NOT NULL DEFAULT 0,
    lifetime_spent_cents   INT NOT NULL DEFAULT 0,
    version                INT NOT NULL DEFAULT 1,          -- optimistic locking
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT smw_balance_nonneg         CHECK (balance_cents >= 0),
    CONSTRAINT smw_lifetime_earned_nonneg CHECK (lifetime_earned_cents >= 0),
    CONSTRAINT smw_lifetime_spent_nonneg  CHECK (lifetime_spent_cents >= 0)
);

ALTER TABLE salon_marketplace_wallet ENABLE ROW LEVEL SECURITY;

-- RLS: salon owner / members can view their wallet
DROP POLICY IF EXISTS salon_marketplace_wallet_select ON salon_marketplace_wallet;
CREATE POLICY salon_marketplace_wallet_select ON salon_marketplace_wallet
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = salon_marketplace_wallet.salon_id
                   AND s.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_members sm
                    WHERE sm.salon_id = salon_marketplace_wallet.salon_id
                      AND sm.profile_id = auth.uid())
    );

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- All mutations happen via the ledger trigger under service_role.

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_salon_marketplace_wallet_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_salon_marketplace_wallet_updated_at ON salon_marketplace_wallet;
CREATE TRIGGER trg_salon_marketplace_wallet_updated_at
    BEFORE UPDATE ON salon_marketplace_wallet
    FOR EACH ROW EXECUTE FUNCTION update_salon_marketplace_wallet_updated_at();

-- ============================================================
-- 2. salon_marketplace_credit_ledger — append-only +/- log
-- ============================================================
-- DIVE: fiecare +/- de credit marketplace = un rand nou.
-- order_id FK catre marketplace_orders este adaugat DUPA ce
-- este creata tabela 109 (deferred FK la finalul lui 109).
-- ============================================================
CREATE TABLE IF NOT EXISTS salon_marketplace_credit_ledger (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id         UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    delta_cents      INT NOT NULL,                         -- signed
    reason           TEXT NOT NULL,
    voucher_id       UUID REFERENCES loyalty_vouchers(id) ON DELETE SET NULL,
    order_id         UUID,                                 -- FK added in 109
    idempotency_key  TEXT UNIQUE,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT smcl_reason_check CHECK (reason IN (
        'voucher_redemption',
        'marketplace_purchase',
        'refund',
        'adjustment'
    ))
);

CREATE INDEX IF NOT EXISTS idx_smcl_salon_created
    ON salon_marketplace_credit_ledger(salon_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_smcl_voucher
    ON salon_marketplace_credit_ledger(voucher_id)
    WHERE voucher_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_smcl_order
    ON salon_marketplace_credit_ledger(order_id)
    WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_smcl_idempotency
    ON salon_marketplace_credit_ledger(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

ALTER TABLE salon_marketplace_credit_ledger ENABLE ROW LEVEL SECURITY;

-- RLS: salon owner / members can read their salon's ledger
DROP POLICY IF EXISTS smcl_select ON salon_marketplace_credit_ledger;
CREATE POLICY smcl_select ON salon_marketplace_credit_ledger
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = salon_marketplace_credit_ledger.salon_id
                   AND s.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_members sm
                    WHERE sm.salon_id = salon_marketplace_credit_ledger.salon_id
                      AND sm.profile_id = auth.uid())
    );

-- No INSERT/UPDATE/DELETE policies — RPC only (service_role).

-- ============================================================
-- 2a. Immutability trigger — append-only audit log
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_smcl_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'salon_marketplace_credit_ledger is immutable: % operations are not allowed', TG_OP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_smcl_immutable_update ON salon_marketplace_credit_ledger;
CREATE TRIGGER trg_smcl_immutable_update
    BEFORE UPDATE ON salon_marketplace_credit_ledger
    FOR EACH ROW EXECUTE FUNCTION prevent_smcl_mutation();

DROP TRIGGER IF EXISTS trg_smcl_immutable_delete ON salon_marketplace_credit_ledger;
CREATE TRIGGER trg_smcl_immutable_delete
    BEFORE DELETE ON salon_marketplace_credit_ledger
    FOR EACH ROW EXECUTE FUNCTION prevent_smcl_mutation();

-- ============================================================
-- 3. apply_credit_ledger_delta — atomic wallet updater
-- ============================================================
-- DIVE: fiecare INSERT in ledger actualizeaza atomic wallet-ul.
-- Creeaza wallet-ul daca lipseste. Refuza daca soldul ar deveni
-- negativ (protectie stricta).
-- ============================================================
CREATE OR REPLACE FUNCTION apply_credit_ledger_delta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_balance INT;
BEGIN
    -- Make sure a wallet row exists (idempotent).
    INSERT INTO salon_marketplace_wallet (salon_id)
    VALUES (NEW.salon_id)
    ON CONFLICT (salon_id) DO NOTHING;

    -- Atomic update: balance + lifetime counters.
    UPDATE salon_marketplace_wallet
       SET balance_cents         = balance_cents + NEW.delta_cents,
           lifetime_earned_cents = lifetime_earned_cents + GREATEST(NEW.delta_cents, 0),
           lifetime_spent_cents  = lifetime_spent_cents  + GREATEST(-NEW.delta_cents, 0),
           version               = version + 1,
           updated_at            = NOW()
     WHERE salon_id = NEW.salon_id
    RETURNING balance_cents INTO v_new_balance;

    IF v_new_balance IS NULL THEN
        RAISE EXCEPTION 'salon_marketplace_wallet missing for salon %', NEW.salon_id
            USING errcode = 'P0002';
    END IF;

    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'insufficient_marketplace_credit: salon % balance would become % cents',
            NEW.salon_id, v_new_balance
            USING errcode = '22023';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_smcl_apply_delta ON salon_marketplace_credit_ledger;
CREATE TRIGGER trg_smcl_apply_delta
    AFTER INSERT ON salon_marketplace_credit_ledger
    FOR EACH ROW EXECUTE FUNCTION apply_credit_ledger_delta();

COMMIT;

-- ============================================================
-- Done — 108_salon_marketplace_wallet.sql
-- ============================================================
-- Tables:
--   - salon_marketplace_wallet              (per-salon balance)
--   - salon_marketplace_credit_ledger       (immutable +/- log)
--
-- Triggers:
--   - trg_smcl_apply_delta             (AFTER INSERT -> wallet)
--   - trg_smcl_immutable_update/delete (append-only)
--   - trg_salon_marketplace_wallet_updated_at
--
-- RLS:
--   - Salon owner/members SELECT own wallet & ledger
--   - No direct writes; INSERT via SECURITY DEFINER RPC later
-- ============================================================
