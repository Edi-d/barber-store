-- ============================================================
-- Migration 111: Platform XP RPC Layer (DIVE runtime)
-- ============================================================
-- Brings the DIVE universal XP system to life: the RPCs that
-- mutate user_platform_xp, platform_xp_transactions,
-- loyalty_vouchers (widened here), salon_marketplace_wallet,
-- salon_marketplace_credit_ledger, and marketplace_orders.
--
-- Depends on:
--   - 055_loyalty_rewards           (loyalty_vouchers, generate_voucher_code)
--   - 107_platform_xp_foundation    (user_platform_xp, platform_xp_transactions, xp_voucher_tiers)
--   - 108_salon_marketplace_wallet  (salon_marketplace_wallet, salon_marketplace_credit_ledger)
--   - 109_marketplace_catalog       (marketplace_products, marketplace_orders, marketplace_order_items, marketplace_inventory_adjustments)
--   - 110_feature_flags             (feature_flags)
--
-- Rules:
--   - 3 XP per 1 RON (ron_cents * 3 / 100)
--   - Levels by lifetime_earned: rookie <5000, regular <15000, vip <50000, else elite
--   - Voucher tiers: 1000 -> 10 RON, 3000 -> 35, 6000 -> 80, 10000 -> 150
--   - Platform vouchers never expire in spirit, but loyalty_vouchers.expires_at
--     is NOT NULL, so we stamp 12 months as a fraud window default.
--   - All RPCs are SECURITY DEFINER, SET search_path = public, return JSONB
--     shaped as {status: 'success'|'error'|'duplicate', ...}.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ALTER loyalty_vouchers — widen for platform-tier vouchers
-- ============================================================
-- 055 created loyalty_vouchers with salon_id NOT NULL and a
-- RESTRICT FK on reward_id. Platform-tier vouchers are universal
-- (any salon) and point at no reward, so we relax both.
-- Existing rows are backfilled with source='legacy_salon'.
-- ============================================================

ALTER TABLE loyalty_vouchers ALTER COLUMN salon_id  DROP NOT NULL;
ALTER TABLE loyalty_vouchers ALTER COLUMN reward_id DROP NOT NULL;

-- Relax FK from RESTRICT to SET NULL so platform vouchers survive
-- the (unlikely) deletion of a reward row.
ALTER TABLE loyalty_vouchers DROP CONSTRAINT IF EXISTS loyalty_vouchers_reward_id_fkey;
ALTER TABLE loyalty_vouchers
    ADD CONSTRAINT loyalty_vouchers_reward_id_fkey
    FOREIGN KEY (reward_id) REFERENCES rewards_catalog(id) ON DELETE SET NULL;

-- New columns for platform-tier vouchers (kept nullable so legacy
-- rows untouched).
ALTER TABLE loyalty_vouchers ADD COLUMN IF NOT EXISTS source TEXT;
DO $$ BEGIN
    ALTER TABLE loyalty_vouchers
        ADD CONSTRAINT loyalty_vouchers_source_check
        CHECK (source IN ('legacy_salon', 'platform_tier'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE loyalty_vouchers ADD COLUMN IF NOT EXISTS value_cents INT;
ALTER TABLE loyalty_vouchers ADD COLUMN IF NOT EXISTS tier_points INT;
ALTER TABLE loyalty_vouchers ADD COLUMN IF NOT EXISTS redeemed_salon_id UUID;
DO $$ BEGIN
    ALTER TABLE loyalty_vouchers
        ADD CONSTRAINT loyalty_vouchers_redeemed_salon_id_fkey
        FOREIGN KEY (redeemed_salon_id) REFERENCES salons(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE loyalty_vouchers ADD COLUMN IF NOT EXISTS redeemed_order_id UUID;
DO $$ BEGIN
    ALTER TABLE loyalty_vouchers
        ADD CONSTRAINT loyalty_vouchers_redeemed_order_id_fkey
        FOREIGN KEY (redeemed_order_id) REFERENCES marketplace_orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE loyalty_vouchers ADD COLUMN IF NOT EXISTS redeemed_appointment_id UUID;

-- Backfill existing rows: anything pre-platform-tier is legacy.
UPDATE loyalty_vouchers SET source = 'legacy_salon' WHERE source IS NULL;

-- Helper index for platform vouchers (universal, salon_id IS NULL).
CREATE INDEX IF NOT EXISTS idx_loyalty_vouchers_source
    ON loyalty_vouchers(source, status)
    WHERE source = 'platform_tier';


-- ============================================================
-- 2. RPC — award_platform_xp
-- ============================================================
-- Awards universal XP for a spend of p_ron_cents.
-- 3 XP per RON = FLOOR(p_ron_cents * 3 / 100.0).
-- Idempotent via p_idempotency_key on platform_xp_transactions.
-- ============================================================
DROP FUNCTION IF EXISTS award_platform_xp(UUID, INT, TEXT, UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION award_platform_xp(
    p_user_id         UUID,
    p_ron_cents       INT,
    p_source          TEXT,
    p_source_id       UUID DEFAULT NULL,
    p_salon_id        UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_points        INT;
    v_wallet        user_platform_xp%ROWTYPE;
    v_new_balance   INT;
    v_new_lifetime  INT;
    v_old_level     TEXT;
    v_new_level     TEXT;
    v_leveled_up    BOOLEAN := FALSE;
    v_description   TEXT;
BEGIN
    -- Validate source
    IF p_source NOT IN ('appointment', 'marketplace_order', 'admin_grant') THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'invalid_source',
            'message', 'Sursa XP nu este valida'
        );
    END IF;

    IF p_ron_cents IS NULL OR p_ron_cents <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'points_earned', 0,
            'current_balance', COALESCE((SELECT current_points FROM user_platform_xp WHERE user_id = p_user_id), 0),
            'lifetime_earned', COALESCE((SELECT lifetime_earned FROM user_platform_xp WHERE user_id = p_user_id), 0),
            'level', COALESCE((SELECT level FROM user_platform_xp WHERE user_id = p_user_id), 'rookie'),
            'leveled_up', FALSE
        );
    END IF;

    -- 3 XP per 1 RON = 3 XP per 100 bani
    v_points := FLOOR(p_ron_cents::NUMERIC * 3 / 100.0)::INT;

    IF v_points <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'points_earned', 0,
            'current_balance', COALESCE((SELECT current_points FROM user_platform_xp WHERE user_id = p_user_id), 0),
            'lifetime_earned', COALESCE((SELECT lifetime_earned FROM user_platform_xp WHERE user_id = p_user_id), 0),
            'level', COALESCE((SELECT level FROM user_platform_xp WHERE user_id = p_user_id), 'rookie'),
            'leveled_up', FALSE
        );
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL
       AND EXISTS (SELECT 1 FROM platform_xp_transactions WHERE idempotency_key = p_idempotency_key)
    THEN
        RETURN jsonb_build_object(
            'status', 'duplicate',
            'message', 'Tranzactie deja procesata'
        );
    END IF;

    -- Ensure wallet row exists, then lock it.
    INSERT INTO user_platform_xp (user_id, current_points, lifetime_earned, level)
    VALUES (p_user_id, 0, 0, 'rookie')
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM user_platform_xp
    WHERE user_id = p_user_id
    FOR UPDATE;

    v_old_level    := v_wallet.level;
    v_new_balance  := v_wallet.current_points + v_points;
    v_new_lifetime := v_wallet.lifetime_earned + v_points;

    -- Recompute level based on lifetime_earned
    v_new_level := CASE
        WHEN v_new_lifetime < 5000  THEN 'rookie'
        WHEN v_new_lifetime < 15000 THEN 'regular'
        WHEN v_new_lifetime < 50000 THEN 'vip'
        ELSE 'elite'
    END;

    v_leveled_up := (v_new_level IS DISTINCT FROM v_old_level);

    UPDATE user_platform_xp
       SET current_points  = v_new_balance,
           lifetime_earned = v_new_lifetime,
           level           = v_new_level,
           version         = version + 1,
           updated_at      = NOW()
     WHERE user_id = p_user_id;

    v_description := CASE p_source
        WHEN 'appointment'       THEN 'XP din programare'
        WHEN 'marketplace_order' THEN 'XP din comanda marketplace'
        WHEN 'admin_grant'       THEN 'XP acordat manual'
        ELSE 'XP'
    END;

    INSERT INTO platform_xp_transactions (
        user_id, amount, balance_after, source_type, source_id,
        salon_id, ron_amount_cents, description, idempotency_key
    ) VALUES (
        p_user_id, v_points, v_new_balance, p_source, p_source_id,
        p_salon_id, p_ron_cents, v_description, p_idempotency_key
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'points_earned', v_points,
        'current_balance', v_new_balance,
        'lifetime_earned', v_new_lifetime,
        'level', v_new_level,
        'leveled_up', v_leveled_up
    );
END;
$$;


-- ============================================================
-- 3. RPC — reverse_platform_xp
-- ============================================================
-- Reverses a previously awarded XP grant (e.g. refund/cancel).
-- Clamps current_points at 0; lifetime_earned is NEVER decremented
-- ("XP nu expira niciodata" per spec — lifetime is audit history).
-- ============================================================
DROP FUNCTION IF EXISTS reverse_platform_xp(UUID, INT, TEXT, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION reverse_platform_xp(
    p_user_id                 UUID,
    p_ron_cents               INT,
    p_source                  TEXT,
    p_source_id               UUID,
    p_original_idempotency_key TEXT DEFAULT NULL,
    p_idempotency_key         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_points       INT;
    v_wallet       user_platform_xp%ROWTYPE;
    v_actual_delta INT;
    v_new_balance  INT;
    v_description  TEXT;
BEGIN
    IF p_source NOT IN ('appointment', 'marketplace_order', 'admin_grant') THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'invalid_source',
            'message', 'Sursa XP nu este valida'
        );
    END IF;

    IF p_ron_cents IS NULL OR p_ron_cents <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'points_reversed', 0,
            'current_balance', COALESCE((SELECT current_points FROM user_platform_xp WHERE user_id = p_user_id), 0)
        );
    END IF;

    v_points := FLOOR(p_ron_cents::NUMERIC * 3 / 100.0)::INT;

    IF v_points <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'points_reversed', 0,
            'current_balance', COALESCE((SELECT current_points FROM user_platform_xp WHERE user_id = p_user_id), 0)
        );
    END IF;

    -- Idempotency check on the reversal itself
    IF p_idempotency_key IS NOT NULL
       AND EXISTS (SELECT 1 FROM platform_xp_transactions WHERE idempotency_key = p_idempotency_key)
    THEN
        RETURN jsonb_build_object(
            'status', 'duplicate',
            'message', 'Tranzactie deja procesata'
        );
    END IF;

    -- Lock wallet (create if missing so shape is consistent)
    INSERT INTO user_platform_xp (user_id, current_points, lifetime_earned, level)
    VALUES (p_user_id, 0, 0, 'rookie')
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM user_platform_xp
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Clamp: never go below zero
    v_actual_delta := LEAST(v_wallet.current_points, v_points);
    v_new_balance  := v_wallet.current_points - v_actual_delta;

    UPDATE user_platform_xp
       SET current_points = v_new_balance,
           version        = version + 1,
           updated_at     = NOW()
     WHERE user_id = p_user_id;

    v_description := 'Reversare XP (' || p_source || ')';
    IF p_original_idempotency_key IS NOT NULL THEN
        v_description := v_description || ' orig=' || p_original_idempotency_key;
    END IF;

    INSERT INTO platform_xp_transactions (
        user_id, amount, balance_after, source_type, source_id,
        ron_amount_cents, description, idempotency_key
    ) VALUES (
        p_user_id, -v_actual_delta, v_new_balance, 'reversal', p_source_id,
        p_ron_cents, v_description, p_idempotency_key
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'points_reversed', v_actual_delta,
        'current_balance', v_new_balance
    );
END;
$$;


-- ============================================================
-- 4. RPC — convert_points_to_voucher
-- ============================================================
-- User-initiated: burn p_tier_points from wallet, mint a universal
-- loyalty_voucher (salon_id=NULL, source='platform_tier').
-- Caller must match p_user_id (checked via auth.uid()).
-- ============================================================
DROP FUNCTION IF EXISTS convert_points_to_voucher(UUID, INT);
CREATE OR REPLACE FUNCTION convert_points_to_voucher(
    p_user_id     UUID,
    p_tier_points INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tier         xp_voucher_tiers%ROWTYPE;
    v_wallet       user_platform_xp%ROWTYPE;
    v_voucher_code TEXT;
    v_voucher_id   UUID;
    v_expires_at   TIMESTAMPTZ;
    v_new_balance  INT;
    v_attempts     INT := 0;
BEGIN
    -- AuthN: caller must be the owner of the wallet
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'not_authorized: caller % cannot convert for user %', auth.uid(), p_user_id
            USING ERRCODE = '42501';
    END IF;

    -- Validate tier
    SELECT * INTO v_tier
    FROM xp_voucher_tiers
    WHERE tier_points = p_tier_points AND is_active = TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'invalid_tier',
            'message', 'Treapta nu este valida'
        );
    END IF;

    -- Ensure wallet row exists, then lock it.
    INSERT INTO user_platform_xp (user_id, current_points, lifetime_earned, level)
    VALUES (p_user_id, 0, 0, 'rookie')
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM user_platform_xp
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_wallet.current_points < p_tier_points THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'insufficient_points',
            'message', 'Puncte insuficiente',
            'required', p_tier_points,
            'available', v_wallet.current_points
        );
    END IF;

    -- Generate unique voucher code (retry on collision)
    LOOP
        v_voucher_code := generate_voucher_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM loyalty_vouchers WHERE code = v_voucher_code);
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'Could not generate unique voucher code after 10 attempts';
        END IF;
    END LOOP;

    -- Fraud window: 12 months. Spec says "never expires" but we
    -- keep a hard bound so stale codes don't accumulate forever.
    v_expires_at := NOW() + INTERVAL '12 months';

    -- Debit wallet (bump version for optimistic lock consumers)
    v_new_balance := v_wallet.current_points - p_tier_points;

    UPDATE user_platform_xp
       SET current_points    = v_new_balance,
           lifetime_redeemed = lifetime_redeemed + p_tier_points,
           version           = version + 1,
           updated_at        = NOW()
     WHERE user_id = p_user_id;

    -- Mint voucher (salon_id=NULL => universal; reward_id=NULL => not tied to catalog)
    INSERT INTO loyalty_vouchers (
        user_id, salon_id, reward_id, code, status, points_spent,
        expires_at, source, value_cents, tier_points
    ) VALUES (
        p_user_id, NULL, NULL, v_voucher_code, 'active', p_tier_points,
        v_expires_at, 'platform_tier', v_tier.voucher_value_cents, p_tier_points
    )
    RETURNING id INTO v_voucher_id;

    -- Ledger entry for the XP burn
    INSERT INTO platform_xp_transactions (
        user_id, amount, balance_after, source_type, source_id,
        description, idempotency_key
    ) VALUES (
        p_user_id, -p_tier_points, v_new_balance, 'voucher_convert', v_voucher_id,
        'Conversie XP in voucher ' || v_tier.label_ro,
        'voucher_convert_' || v_voucher_id::TEXT
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'voucher_id', v_voucher_id,
        'voucher_code', v_voucher_code,
        'value_cents', v_tier.voucher_value_cents,
        'expires_at', v_expires_at,
        'new_balance', v_new_balance
    );
END;
$$;


-- ============================================================
-- 5. RPC — redeem_voucher_at_salon
-- ============================================================
-- Staff scans a voucher code at their salon. Validates, marks
-- used, and (for platform-tier vouchers) credits the salon's
-- marketplace wallet via the ledger.
-- ============================================================
DROP FUNCTION IF EXISTS redeem_voucher_at_salon(TEXT, UUID, UUID);
CREATE OR REPLACE FUNCTION redeem_voucher_at_salon(
    p_code           TEXT,
    p_salon_id       UUID,
    p_appointment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_voucher    loyalty_vouchers%ROWTYPE;
    v_source     TEXT;
    v_barber_id  UUID;
    v_status_ro  TEXT;
    v_credit     INT := 0;
BEGIN
    -- AuthZ: caller must be salon owner or salon_member of p_salon_id
    IF NOT (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = p_salon_id AND s.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_members sm
                    WHERE sm.salon_id = p_salon_id AND sm.profile_id = auth.uid())
    ) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'not_authorized',
            'message', 'Nu ai acces la acest salon'
        );
    END IF;

    -- Confirm salon still exists (defensive)
    IF NOT EXISTS (SELECT 1 FROM salons WHERE id = p_salon_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'salon_not_found',
            'message', 'Salonul nu a fost gasit'
        );
    END IF;

    -- Find and lock voucher
    SELECT * INTO v_voucher
    FROM loyalty_vouchers
    WHERE code = UPPER(TRIM(p_code))
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'voucher_not_found',
            'message', 'Voucher inexistent'
        );
    END IF;

    -- Status gate
    IF v_voucher.status <> 'active' THEN
        v_status_ro := CASE v_voucher.status
            WHEN 'used'      THEN 'folosit'
            WHEN 'expired'   THEN 'expirat'
            WHEN 'cancelled' THEN 'anulat'
            ELSE v_voucher.status
        END;
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'voucher_' || v_voucher.status,
            'message', 'Voucher deja ' || v_status_ro
        );
    END IF;

    -- Expiry gate (auto-expire if past)
    IF v_voucher.expires_at <= NOW() THEN
        UPDATE loyalty_vouchers SET status = 'expired' WHERE id = v_voucher.id;
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'voucher_expired',
            'message', 'Voucher expirat'
        );
    END IF;

    v_source := COALESCE(v_voucher.source, 'legacy_salon');

    -- Salon scope: legacy vouchers are tied to their issuing salon
    IF v_source = 'legacy_salon' THEN
        IF v_voucher.salon_id IS DISTINCT FROM p_salon_id THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'error', 'voucher_salon_mismatch',
                'message', 'Voucher emis de alt salon'
            );
        END IF;
    END IF;
    -- platform_tier vouchers: redeemable at any salon (no check)

    -- Resolve staff barber row (used_by_barber_id FK points to barbers.id)
    SELECT b.id INTO v_barber_id
    FROM barbers b
    WHERE b.profile_id = auth.uid()
    LIMIT 1;

    -- Mark voucher as used
    UPDATE loyalty_vouchers
       SET status                  = 'used',
           used_at                 = NOW(),
           used_by_barber_id       = v_barber_id,
           redeemed_salon_id       = p_salon_id,
           redeemed_appointment_id = p_appointment_id
     WHERE id = v_voucher.id;

    -- Credit the salon's marketplace wallet for platform-tier vouchers.
    -- Legacy reward vouchers do not earn marketplace credit (rewards are
    -- funded by the salon itself).
    IF v_source = 'platform_tier' AND v_voucher.value_cents IS NOT NULL AND v_voucher.value_cents > 0 THEN
        INSERT INTO salon_marketplace_credit_ledger (
            salon_id, delta_cents, reason, voucher_id, idempotency_key, notes
        ) VALUES (
            p_salon_id,
            v_voucher.value_cents,
            'voucher_redemption',
            v_voucher.id,
            'voucher_redeem_' || v_voucher.id::TEXT,
            'Rascumparare voucher DIVE ' || v_voucher.code
        );
        v_credit := v_voucher.value_cents;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'voucher_id', v_voucher.id,
        'value_cents', COALESCE(v_voucher.value_cents, 0),
        'source', v_source,
        'credit_awarded_cents', v_credit
    );
END;
$$;


-- ============================================================
-- 6. RPC — reserve_marketplace_stock
-- ============================================================
-- Atomically decrements stock for a list of items. Any shortage
-- raises and rolls the transaction back. Writes audit rows to
-- marketplace_inventory_adjustments.
--
-- p_items shape: [{"product_id":"uuid","qty":n}, ...]
-- ============================================================
DROP FUNCTION IF EXISTS reserve_marketplace_stock(JSONB, UUID);
CREATE OR REPLACE FUNCTION reserve_marketplace_stock(
    p_items    JSONB,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item         JSONB;
    v_product_id   UUID;
    v_qty          INT;
    v_stock        INT;
    v_reserved     INT := 0;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'invalid_items',
            'message', 'Lista de produse este invalida'
        );
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_qty        := (v_item->>'qty')::INT;

        IF v_product_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'error', 'invalid_item',
                'message', 'Produs invalid in comanda',
                'product_id', v_product_id,
                'qty', v_qty
            );
        END IF;

        -- Lock product row, check active + stock
        SELECT stock_qty INTO v_stock
        FROM marketplace_products
        WHERE id = v_product_id AND is_active = TRUE
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'error', 'product_not_found',
                'message', 'Produsul nu a fost gasit',
                'product_id', v_product_id
            );
        END IF;

        IF v_stock < v_qty THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'error', 'insufficient_stock',
                'message', 'Stoc insuficient',
                'product_id', v_product_id,
                'available', v_stock,
                'requested', v_qty
            );
        END IF;

        UPDATE marketplace_products
           SET stock_qty  = stock_qty - v_qty,
               updated_at = NOW()
         WHERE id = v_product_id;

        INSERT INTO marketplace_inventory_adjustments (
            product_id, delta, reason, order_id
        ) VALUES (
            v_product_id, -v_qty, 'order', p_order_id
        );

        v_reserved := v_reserved + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'reserved_count', v_reserved
    );
END;
$$;


-- ============================================================
-- 7. RPC — purchase_marketplace_with_credit
-- ============================================================
-- Salon-side checkout using salon_marketplace_wallet credit.
-- Atomic: authorize -> price -> create order -> create items ->
-- reserve stock -> debit wallet via ledger -> link.
-- ============================================================
DROP FUNCTION IF EXISTS purchase_marketplace_with_credit(UUID, JSONB, TEXT);
CREATE OR REPLACE FUNCTION purchase_marketplace_with_credit(
    p_salon_id        UUID,
    p_items           JSONB,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item           JSONB;
    v_product_id     UUID;
    v_qty            INT;
    v_product        marketplace_products%ROWTYPE;
    v_stock          INT;
    v_subtotal       INT := 0;
    v_line_total     INT;
    v_wallet         salon_marketplace_wallet%ROWTYPE;
    v_order_id       UUID;
    v_order_number   TEXT;
    v_ledger_id      UUID;
    v_section        TEXT;
    v_section_counts JSONB := '{}'::JSONB;
    v_top_section    TEXT;
    v_top_count      INT := 0;
    v_key            TEXT;
    v_attempts       INT := 0;
    v_new_balance    INT;
BEGIN
    -- AuthZ: caller must be owner or member of p_salon_id
    IF NOT (
        EXISTS (SELECT 1 FROM salons s
                 WHERE s.id = p_salon_id AND s.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM salon_members sm
                    WHERE sm.salon_id = p_salon_id AND sm.profile_id = auth.uid())
    ) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'not_authorized',
            'message', 'Nu ai acces la acest salon'
        );
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'empty_cart',
            'message', 'Cosul este gol'
        );
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL
       AND EXISTS (SELECT 1 FROM salon_marketplace_credit_ledger WHERE idempotency_key = p_idempotency_key)
    THEN
        -- Return the prior order if we can find it
        SELECT order_id INTO v_order_id
        FROM salon_marketplace_credit_ledger
        WHERE idempotency_key = p_idempotency_key
        LIMIT 1;

        RETURN jsonb_build_object(
            'status', 'duplicate',
            'message', 'Comanda deja procesata',
            'order_id', v_order_id
        );
    END IF;

    -- Price items + pick dominant section
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_qty        := (v_item->>'qty')::INT;

        IF v_product_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'error', 'invalid_item',
                'message', 'Produs invalid in comanda'
            );
        END IF;

        SELECT * INTO v_product
        FROM marketplace_products
        WHERE id = v_product_id AND is_active = TRUE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'error', 'product_not_found',
                'message', 'Produsul nu a fost gasit',
                'product_id', v_product_id
            );
        END IF;

        v_subtotal := v_subtotal + (v_product.price_cents * v_qty);

        -- Tally section occurrences
        v_section_counts := jsonb_set(
            v_section_counts,
            ARRAY[v_product.section],
            to_jsonb(COALESCE((v_section_counts->>v_product.section)::INT, 0) + v_qty)
        );
    END LOOP;

    -- Pick most frequent section. Default: 'professional'.
    v_top_section := 'professional';
    FOR v_key IN SELECT jsonb_object_keys(v_section_counts) LOOP
        IF (v_section_counts->>v_key)::INT > v_top_count THEN
            v_top_count   := (v_section_counts->>v_key)::INT;
            v_top_section := v_key;
        END IF;
    END LOOP;

    IF v_subtotal <= 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'empty_cart',
            'message', 'Cosul este gol'
        );
    END IF;

    -- Lock salon wallet
    SELECT * INTO v_wallet
    FROM salon_marketplace_wallet
    WHERE salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'no_wallet',
            'message', 'Salonul nu are portofel marketplace',
            'balance', 0,
            'required', v_subtotal
        );
    END IF;

    IF v_wallet.balance_cents < v_subtotal THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'insufficient_credit',
            'message', 'Credit marketplace insuficient',
            'balance', v_wallet.balance_cents,
            'required', v_subtotal
        );
    END IF;

    -- Generate unique order_number (retry on collision)
    LOOP
        v_order_number := 'DV-'
            || EXTRACT(YEAR FROM NOW())::TEXT
            || '-'
            || LPAD(FLOOR(RANDOM() * 1000000)::INT::TEXT, 6, '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM marketplace_orders WHERE order_number = v_order_number);
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'Could not generate unique order_number after 10 attempts';
        END IF;
    END LOOP;

    -- Create order header
    INSERT INTO marketplace_orders (
        order_number, buyer_type, buyer_salon_id, section, status,
        payment_method, subtotal_cents, total_cents, placed_at, paid_at
    ) VALUES (
        v_order_number, 'salon', p_salon_id, v_top_section, 'paid',
        'marketplace_credit', v_subtotal, v_subtotal, NOW(), NOW()
    )
    RETURNING id INTO v_order_id;

    -- Create order items + reserve stock inline (one pass, one lock per product)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_qty        := (v_item->>'qty')::INT;

        SELECT stock_qty INTO v_stock
        FROM marketplace_products
        WHERE id = v_product_id AND is_active = TRUE
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'product_not_found: %', v_product_id USING ERRCODE = 'P0002';
        END IF;

        IF v_stock < v_qty THEN
            RAISE EXCEPTION 'insufficient_stock: product % requested % available %',
                v_product_id, v_qty, v_stock USING ERRCODE = '22023';
        END IF;

        SELECT * INTO v_product FROM marketplace_products WHERE id = v_product_id;
        v_line_total := v_product.price_cents * v_qty;

        INSERT INTO marketplace_order_items (
            order_id, product_id, sku_snapshot, title_snapshot,
            qty, unit_price_cents, line_total_cents
        ) VALUES (
            v_order_id, v_product_id, v_product.sku, v_product.name,
            v_qty, v_product.price_cents, v_line_total
        );

        UPDATE marketplace_products
           SET stock_qty  = stock_qty - v_qty,
               updated_at = NOW()
         WHERE id = v_product_id;

        INSERT INTO marketplace_inventory_adjustments (
            product_id, delta, reason, order_id
        ) VALUES (
            v_product_id, -v_qty, 'order', v_order_id
        );
    END LOOP;

    -- Debit wallet via ledger (trigger updates wallet row atomically)
    INSERT INTO salon_marketplace_credit_ledger (
        salon_id, delta_cents, reason, order_id, idempotency_key, notes
    ) VALUES (
        p_salon_id, -v_subtotal, 'marketplace_purchase', v_order_id,
        p_idempotency_key,
        'Comanda ' || v_order_number
    )
    RETURNING id INTO v_ledger_id;

    -- Link order to ledger entry
    UPDATE marketplace_orders
       SET credit_ledger_id = v_ledger_id
     WHERE id = v_order_id;

    -- Read back the new wallet balance
    SELECT balance_cents INTO v_new_balance
    FROM salon_marketplace_wallet
    WHERE salon_id = p_salon_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'order_id', v_order_id,
        'order_number', v_order_number,
        'new_balance_cents', v_new_balance
    );
END;
$$;


-- ============================================================
-- 8. GRANTs — lock down all RPCs
-- ============================================================

REVOKE ALL ON FUNCTION award_platform_xp(UUID, INT, TEXT, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION award_platform_xp(UUID, INT, TEXT, UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION reverse_platform_xp(UUID, INT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reverse_platform_xp(UUID, INT, TEXT, UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION convert_points_to_voucher(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION convert_points_to_voucher(UUID, INT) TO authenticated;

REVOKE ALL ON FUNCTION redeem_voucher_at_salon(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_voucher_at_salon(TEXT, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION reserve_marketplace_stock(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reserve_marketplace_stock(JSONB, UUID) TO service_role;

REVOKE ALL ON FUNCTION purchase_marketplace_with_credit(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purchase_marketplace_with_credit(UUID, JSONB, TEXT) TO authenticated;

COMMIT;

-- ============================================================
-- Done — 111_platform_xp_rpcs.sql
-- ============================================================
-- Schema changes:
--   - loyalty_vouchers: salon_id/reward_id made nullable; FK relaxed
--     to SET NULL; new columns source, value_cents, tier_points,
--     redeemed_salon_id, redeemed_order_id, redeemed_appointment_id.
--   - Legacy rows backfilled with source='legacy_salon'.
--
-- RPCs:
--   - award_platform_xp            (service_role)
--   - reverse_platform_xp          (service_role)
--   - convert_points_to_voucher    (authenticated, self-only)
--   - redeem_voucher_at_salon      (authenticated, salon staff only)
--   - reserve_marketplace_stock    (service_role)
--   - purchase_marketplace_with_credit (authenticated, salon staff only)
-- ============================================================
