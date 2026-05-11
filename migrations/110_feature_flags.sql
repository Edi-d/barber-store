-- ============================================================
-- Migration 110: Feature Flags (rollout gating)
-- ============================================================
-- Gating for the DIVE universal XP + voucher + marketplace
-- system. Global flag default OFF; pilot salons can opt in via
-- salon_feature_overrides.
--
-- The is_feature_enabled() RPC is called by client and edge
-- code to decide whether to show/use the new features.
--
-- Additive only, fully idempotent.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. feature_flags — global flag registry
-- ============================================================
CREATE TABLE IF NOT EXISTS feature_flags (
    key          TEXT PRIMARY KEY,
    enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    config       JSONB NOT NULL DEFAULT '{}'::jsonb,
    description  TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read the registry (UI needs it).
DROP POLICY IF EXISTS feature_flags_select ON feature_flags;
CREATE POLICY feature_flags_select ON feature_flags
    FOR SELECT TO authenticated USING (true);

-- Only service_role can write (no INSERT/UPDATE/DELETE policy for authenticated).

CREATE OR REPLACE FUNCTION update_feature_flags_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER trg_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION update_feature_flags_updated_at();

-- Seed the main DIVE flag (idempotent).
INSERT INTO feature_flags (key, enabled, config, description)
VALUES (
    'loyalty_universal_xp',
    FALSE,
    '{}'::jsonb,
    'Gates the new DIVE universal XP + voucher + marketplace system'
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. salon_feature_overrides — pilot-salon opt-in
-- ============================================================
-- DIVE: pentru beta / pilot. Daca exista un rand pentru
-- (salon_id, flag_key), override-ul are intaietate fata de
-- feature_flags.enabled global.
-- ============================================================
CREATE TABLE IF NOT EXISTS salon_feature_overrides (
    salon_id   UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    flag_key   TEXT NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
    enabled    BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (salon_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_salon_feature_overrides_flag
    ON salon_feature_overrides(flag_key);

ALTER TABLE salon_feature_overrides ENABLE ROW LEVEL SECURITY;

-- A salon's owner / members can read their own overrides.
DROP POLICY IF EXISTS salon_feature_overrides_select ON salon_feature_overrides;
CREATE POLICY salon_feature_overrides_select ON salon_feature_overrides
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = salon_feature_overrides.salon_id
                   AND s.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_members sm
                    WHERE sm.salon_id = salon_feature_overrides.salon_id
                      AND sm.profile_id = auth.uid())
    );

-- Only service_role can write.

CREATE OR REPLACE FUNCTION update_salon_feature_overrides_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_salon_feature_overrides_updated_at ON salon_feature_overrides;
CREATE TRIGGER trg_salon_feature_overrides_updated_at
    BEFORE UPDATE ON salon_feature_overrides
    FOR EACH ROW EXECUTE FUNCTION update_salon_feature_overrides_updated_at();

-- ============================================================
-- 3. RPC: is_feature_enabled(p_key, p_salon_id)
-- ============================================================
-- Override takes precedence; otherwise global flag.
-- Returns FALSE when the key is unknown.
-- ============================================================
DROP FUNCTION IF EXISTS is_feature_enabled(TEXT, UUID);

CREATE FUNCTION is_feature_enabled(
    p_key      TEXT,
    p_salon_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_override BOOLEAN;
    v_global   BOOLEAN;
BEGIN
    IF p_key IS NULL THEN
        RETURN FALSE;
    END IF;

    IF p_salon_id IS NOT NULL THEN
        v_override := (
            SELECT enabled
              FROM salon_feature_overrides
             WHERE salon_id = p_salon_id
               AND flag_key = p_key
             LIMIT 1
        );

        IF v_override IS NOT NULL THEN
            RETURN v_override;
        END IF;
    END IF;

    v_global := (
        SELECT enabled
          FROM feature_flags
         WHERE key = p_key
         LIMIT 1
    );

    RETURN COALESCE(v_global, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION is_feature_enabled(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_feature_enabled(TEXT, UUID) TO authenticated, service_role;

COMMIT;

-- ============================================================
-- Done — 110_feature_flags.sql
-- ============================================================
-- Tables:
--   - feature_flags            (seeded: loyalty_universal_xp = false)
--   - salon_feature_overrides  (pilot-salon opt-in)
--
-- RPC:
--   - is_feature_enabled(p_key, p_salon_id) -> boolean
--     * override wins, else global, else FALSE
--     * SECURITY DEFINER, granted to authenticated + service_role
--
-- RLS:
--   - feature_flags: everyone SELECT; writes service_role only
--   - salon_feature_overrides: salon owner/members SELECT; writes service_role
-- ============================================================
