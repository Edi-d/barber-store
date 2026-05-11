-- ============================================================
-- Migration 107: Platform XP Foundation (DIVE universal loyalty)
-- ============================================================
-- Introduces the DIVE universal XP system that sits ALONGSIDE
-- the per-salon loyalty (054/055). Points are earned across the
-- entire platform at 3 XP per 1 RON, never expire, and can be
-- converted into non-linear voucher tiers (1000 / 3000 / 6000
-- / 10000 pts).
--
-- This migration is ADDITIVE ONLY: no ALTER on existing tables,
-- no data migration. Tables, indexes, triggers, and RLS only.
-- RPC logic lands in a later migration once we flip the flag.
--
-- DIVE:
--  - user_platform_xp = soldul XP universal al clientului
--  - platform_xp_transactions = jurnal append-only (imutabil)
--  - xp_voucher_tiers = pragurile oficiale (1000/3000/6000/10000)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. user_platform_xp — per-user universal XP wallet
-- ============================================================
-- DIVE: o singura linie per client; sursa de adevar pentru XP.
-- Mutatiile trec DOAR prin RPC (service role).
-- ============================================================
CREATE TABLE IF NOT EXISTS user_platform_xp (
    user_id            UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    current_points     INT NOT NULL DEFAULT 0,
    lifetime_earned    INT NOT NULL DEFAULT 0,
    lifetime_redeemed  INT NOT NULL DEFAULT 0,
    level              TEXT NOT NULL DEFAULT 'rookie',
    version            INT NOT NULL DEFAULT 1,                 -- optimistic locking
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_platform_xp_points_nonneg CHECK (current_points >= 0),
    CONSTRAINT user_platform_xp_lifetime_earned_nonneg CHECK (lifetime_earned >= 0),
    CONSTRAINT user_platform_xp_lifetime_redeemed_nonneg CHECK (lifetime_redeemed >= 0),
    CONSTRAINT user_platform_xp_level_check
        CHECK (level IN ('rookie', 'regular', 'vip', 'elite'))
);

CREATE INDEX IF NOT EXISTS idx_user_platform_xp_level
    ON user_platform_xp(level);

ALTER TABLE user_platform_xp ENABLE ROW LEVEL SECURITY;

-- RLS: users can read their own XP row
DROP POLICY IF EXISTS user_platform_xp_select_own ON user_platform_xp;
CREATE POLICY user_platform_xp_select_own ON user_platform_xp
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- All mutations flow through SECURITY DEFINER RPCs (service_role).

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_platform_xp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_platform_xp_updated_at ON user_platform_xp;
CREATE TRIGGER trg_user_platform_xp_updated_at
    BEFORE UPDATE ON user_platform_xp
    FOR EACH ROW EXECUTE FUNCTION update_user_platform_xp_updated_at();

-- ============================================================
-- 2. platform_xp_transactions — immutable append-only ledger
-- ============================================================
-- DIVE: fiecare miscare de puncte (+/-) genereaza un rand.
-- Nu se face NICIODATA UPDATE/DELETE (blocat prin trigger).
-- idempotency_key previne dublarea ( ex. retry webhook ).
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_xp_transactions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount            INT NOT NULL,                  -- signed: + earn, - redeem/reversal
    balance_after     INT NOT NULL,                  -- snapshot dupa tranzactie
    source_type       TEXT NOT NULL,
    source_id         UUID,                          -- FK logic by source_type
    salon_id          UUID REFERENCES salons(id) ON DELETE SET NULL,
    ron_amount_cents  INT,                           -- cati bani au generat XP-ul (pt. audit)
    description       TEXT,
    idempotency_key   TEXT UNIQUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_xp_tx_source_type_check CHECK (source_type IN (
        'appointment',
        'marketplace_order',
        'voucher_convert',
        'reversal',
        'admin_grant',
        'admin_revoke'
    ))
);

CREATE INDEX IF NOT EXISTS idx_platform_xp_tx_user_created
    ON platform_xp_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_xp_tx_salon_created
    ON platform_xp_transactions(salon_id, created_at DESC)
    WHERE salon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_xp_tx_source
    ON platform_xp_transactions(source_type, source_id)
    WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_xp_tx_idempotency
    ON platform_xp_transactions(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

ALTER TABLE platform_xp_transactions ENABLE ROW LEVEL SECURITY;

-- RLS: users read own transactions only
DROP POLICY IF EXISTS platform_xp_tx_select_own ON platform_xp_transactions;
CREATE POLICY platform_xp_tx_select_own ON platform_xp_transactions
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for authenticated users — RPC only.

-- ============================================================
-- 2a. Immutability trigger — append-only audit log
-- ============================================================
-- Mirrors the prevent_point_transaction_mutation pattern from
-- migration 054: hard-blocks UPDATE and DELETE on the ledger.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_platform_xp_tx_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'platform_xp_transactions is immutable: % operations are not allowed', TG_OP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_xp_tx_immutable_update ON platform_xp_transactions;
CREATE TRIGGER trg_platform_xp_tx_immutable_update
    BEFORE UPDATE ON platform_xp_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_platform_xp_tx_mutation();

DROP TRIGGER IF EXISTS trg_platform_xp_tx_immutable_delete ON platform_xp_transactions;
CREATE TRIGGER trg_platform_xp_tx_immutable_delete
    BEFORE DELETE ON platform_xp_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_platform_xp_tx_mutation();

-- ============================================================
-- 3. xp_voucher_tiers — official DIVE conversion ladder
-- ============================================================
-- DIVE: pragurile oficiale de conversie XP -> voucher.
-- bonus_pct = cat % extra primesti fata de rata lineara 1000pts=10 lei.
-- is_active permite dezactivarea temporara fara DELETE.
-- ============================================================
CREATE TABLE IF NOT EXISTS xp_voucher_tiers (
    tier_points         INT PRIMARY KEY,
    voucher_value_cents INT NOT NULL,
    label_ro            TEXT NOT NULL,
    bonus_pct           INT NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order          INT NOT NULL DEFAULT 0,
    CONSTRAINT xp_voucher_tiers_points_positive CHECK (tier_points > 0),
    CONSTRAINT xp_voucher_tiers_value_positive  CHECK (voucher_value_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_xp_voucher_tiers_active_sort
    ON xp_voucher_tiers(is_active, sort_order);

ALTER TABLE xp_voucher_tiers ENABLE ROW LEVEL SECURITY;

-- RLS: everyone authenticated can read the ladder (UI needs it)
DROP POLICY IF EXISTS xp_voucher_tiers_select_all ON xp_voucher_tiers;
CREATE POLICY xp_voucher_tiers_select_all ON xp_voucher_tiers
    FOR SELECT TO authenticated
    USING (true);

-- Only service_role can write (no authenticated policy).

-- Seed the official DIVE tiers (idempotent via ON CONFLICT).
INSERT INTO xp_voucher_tiers
    (tier_points, voucher_value_cents, label_ro, bonus_pct, is_active, sort_order)
VALUES
    ( 1000,  1000, '10 lei',   0, TRUE, 1),
    ( 3000,  3500, '35 lei',  17, TRUE, 2),
    ( 6000,  8000, '80 lei',  33, TRUE, 3),
    (10000, 15000, '150 lei', 50, TRUE, 4)
ON CONFLICT (tier_points) DO UPDATE
    SET voucher_value_cents = EXCLUDED.voucher_value_cents,
        label_ro            = EXCLUDED.label_ro,
        bonus_pct           = EXCLUDED.bonus_pct,
        is_active           = EXCLUDED.is_active,
        sort_order          = EXCLUDED.sort_order;

COMMIT;

-- ============================================================
-- Done — 107_platform_xp_foundation.sql
-- ============================================================
-- Tables:
--   - user_platform_xp           (per-user universal wallet)
--   - platform_xp_transactions   (immutable ledger)
--   - xp_voucher_tiers           (conversion ladder, seeded)
--
-- Triggers:
--   - trg_user_platform_xp_updated_at (BEFORE UPDATE)
--   - trg_platform_xp_tx_immutable_update/delete
--
-- RLS:
--   - SELECT own rows (users)
--   - SELECT all (xp_voucher_tiers — catalog)
--   - NO direct writes; all mutations via future RPCs (service_role)
-- ============================================================
