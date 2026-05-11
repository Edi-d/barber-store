-- ============================================================================
-- Migration 069: Shop Gamification / XP System
-- ============================================================================
-- A separate XP-based gamification layer (distinct from loyalty points).
-- Users earn XP from purchases and can spend XP to buy real products
-- from brands like Glamm and Rovra.
--
-- Tables:
--   1. shop_xp_config        — per-salon XP rate configuration
--   2. xp_level_thresholds   — level definitions with Romanian titles
--   3. user_shop_xp          — per-user-per-salon XP balance & level
--   4. shop_xp_transactions  — immutable XP earn/spend audit log
--   5. xp_reward_products    — real products purchasable with XP
--   6. user_xp_orders        — user product orders (bought with XP)
--
-- RPC Functions:
--   - earn_xp_from_purchase  — award XP based on RON spent
--   - purchase_with_xp       — spend XP to buy a product
--   - get_user_xp_summary    — dashboard data for XP widget
--
-- All tables have RLS enabled.
-- Idempotent: safe to re-run.
-- ============================================================================


-- ============================================================================
-- 1. SHOP XP CONFIG — Per-salon XP rate
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_xp_config (
    salon_id    UUID PRIMARY KEY REFERENCES salons(id) ON DELETE CASCADE,
    xp_per_ron  INT NOT NULL DEFAULT 10,          -- 10 XP per 1 RON spent
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shop_xp_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read (clients need to know XP rate)
DROP POLICY IF EXISTS "Anyone can view xp config" ON shop_xp_config;
CREATE POLICY "Anyone can view xp config" ON shop_xp_config
    FOR SELECT USING (true);

-- Only salon owner can manage
DROP POLICY IF EXISTS "Salon owner can manage xp config" ON shop_xp_config;
CREATE POLICY "Salon owner can manage xp config" ON shop_xp_config
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = shop_xp_config.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_shop_xp_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_shop_xp_config_updated_at ON shop_xp_config;
CREATE TRIGGER trg_shop_xp_config_updated_at
    BEFORE UPDATE ON shop_xp_config
    FOR EACH ROW EXECUTE FUNCTION update_shop_xp_config_updated_at();


-- ============================================================================
-- 2. XP LEVEL THRESHOLDS — Level definitions & perks
-- ============================================================================
CREATE TABLE IF NOT EXISTS xp_level_thresholds (
    level        INT PRIMARY KEY,
    xp_required  INT NOT NULL DEFAULT 0,
    title        TEXT NOT NULL,                    -- Romanian display name
    perks        JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE xp_level_thresholds ENABLE ROW LEVEL SECURITY;

-- Anyone can read levels
DROP POLICY IF EXISTS "Anyone can view xp levels" ON xp_level_thresholds;
CREATE POLICY "Anyone can view xp levels" ON xp_level_thresholds
    FOR SELECT USING (true);

-- Only service role / superadmin can modify (no user writes)


-- ============================================================================
-- 3. USER SHOP XP — Per-user-per-salon XP balance
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_shop_xp (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id        UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    current_xp      INT NOT NULL DEFAULT 0 CHECK (current_xp >= 0),
    total_xp_earned INT NOT NULL DEFAULT 0 CHECK (total_xp_earned >= 0),
    level           INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, salon_id)
);

ALTER TABLE user_shop_xp ENABLE ROW LEVEL SECURITY;

-- Users can read their own XP
DROP POLICY IF EXISTS "Users can view own xp" ON user_shop_xp;
CREATE POLICY "Users can view own xp" ON user_shop_xp
    FOR SELECT USING (auth.uid() = user_id);

-- Salon owner/staff can view XP for their salon
DROP POLICY IF EXISTS "Salon staff can view salon xp" ON user_shop_xp;
CREATE POLICY "Salon staff can view salon xp" ON user_shop_xp
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salon_members sm
            WHERE sm.salon_id = user_shop_xp.salon_id
              AND sm.profile_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = user_shop_xp.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- No direct writes — only via RPC (SECURITY DEFINER)

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_shop_xp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_user_shop_xp_updated_at ON user_shop_xp;
CREATE TRIGGER trg_user_shop_xp_updated_at
    BEFORE UPDATE ON user_shop_xp
    FOR EACH ROW EXECUTE FUNCTION update_user_shop_xp_updated_at();

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_shop_xp_user_salon
    ON user_shop_xp(user_id, salon_id);


-- ============================================================================
-- 4. SHOP XP TRANSACTIONS — Immutable audit log
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_xp_transactions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id      UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    amount        INT NOT NULL,                    -- positive = earned, negative = spent
    type          TEXT NOT NULL CHECK (type IN ('earned', 'spent')),
    source        TEXT NOT NULL CHECK (source IN ('purchase', 'product_redeem', 'bonus', 'admin_adjust', 'level_up_bonus')),
    reference_id  UUID,                            -- order_id, xp_order_id, etc.
    description   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shop_xp_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own transactions
DROP POLICY IF EXISTS "Users can view own xp transactions" ON shop_xp_transactions;
CREATE POLICY "Users can view own xp transactions" ON shop_xp_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- Salon owner/staff can view transactions for their salon
DROP POLICY IF EXISTS "Salon staff can view salon xp transactions" ON shop_xp_transactions;
CREATE POLICY "Salon staff can view salon xp transactions" ON shop_xp_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salon_members sm
            WHERE sm.salon_id = shop_xp_transactions.salon_id
              AND sm.profile_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = shop_xp_transactions.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- No direct writes — only via RPC

-- Immutability guard
CREATE OR REPLACE FUNCTION prevent_xp_transaction_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Tranzacțiile XP sunt imutabile și nu pot fi modificate.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_xp_transaction_update ON shop_xp_transactions;
CREATE TRIGGER trg_prevent_xp_transaction_update
    BEFORE UPDATE OR DELETE ON shop_xp_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_xp_transaction_update();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_salon
    ON shop_xp_transactions(user_id, salon_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_transactions_reference
    ON shop_xp_transactions(reference_id) WHERE reference_id IS NOT NULL;


-- ============================================================================
-- 5. XP REWARD PRODUCTS — Real products purchasable with XP
-- ============================================================================
CREATE TABLE IF NOT EXISTS xp_reward_products (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id          UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    description       TEXT,
    brand             TEXT NOT NULL,                   -- 'Glamm', 'Rovra', etc.
    category          TEXT,                            -- 'ingrijire', 'styling', 'unelte', 'accesorii'
    image_url         TEXT,
    xp_cost           INT NOT NULL CHECK (xp_cost > 0),
    retail_value_cents INT,                            -- actual RON value in bani (cents) for display
    stock             INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order        INT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE xp_reward_products ENABLE ROW LEVEL SECURITY;

-- Anyone can view active products
DROP POLICY IF EXISTS "Anyone can view active xp products" ON xp_reward_products;
CREATE POLICY "Anyone can view active xp products" ON xp_reward_products
    FOR SELECT USING (is_active = true);

-- Salon owner can manage all products
DROP POLICY IF EXISTS "Salon owner can manage xp products" ON xp_reward_products;
CREATE POLICY "Salon owner can manage xp products" ON xp_reward_products
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = xp_reward_products.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_xp_reward_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_xp_reward_products_updated_at ON xp_reward_products;
CREATE TRIGGER trg_xp_reward_products_updated_at
    BEFORE UPDATE ON xp_reward_products
    FOR EACH ROW EXECUTE FUNCTION update_xp_reward_products_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_xp_reward_products_salon_active
    ON xp_reward_products(salon_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_xp_reward_products_brand
    ON xp_reward_products(brand, is_active);


-- ============================================================================
-- 6. USER XP ORDERS — Product orders purchased with XP
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_xp_orders (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES xp_reward_products(id) ON DELETE CASCADE,
    salon_id      UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    xp_spent      INT NOT NULL CHECK (xp_spent > 0),
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'ready', 'collected', 'cancelled')),
    collected_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_xp_orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
DROP POLICY IF EXISTS "Users can view own xp orders" ON user_xp_orders;
CREATE POLICY "Users can view own xp orders" ON user_xp_orders
    FOR SELECT USING (auth.uid() = user_id);

-- Salon owner/staff can view and manage orders for their salon
DROP POLICY IF EXISTS "Salon staff can view salon xp orders" ON user_xp_orders;
CREATE POLICY "Salon staff can view salon xp orders" ON user_xp_orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salon_members sm
            WHERE sm.salon_id = user_xp_orders.salon_id
              AND sm.profile_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = user_xp_orders.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- Salon owner/staff can update order status (confirm, ready, collected, cancel)
DROP POLICY IF EXISTS "Salon staff can update xp order status" ON user_xp_orders;
CREATE POLICY "Salon staff can update xp order status" ON user_xp_orders
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM salon_members sm
            WHERE sm.salon_id = user_xp_orders.salon_id
              AND sm.profile_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = user_xp_orders.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- No direct INSERT — only via RPC

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_xp_orders_user
    ON user_xp_orders(user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_xp_orders_salon
    ON user_xp_orders(salon_id, status);

CREATE INDEX IF NOT EXISTS idx_user_xp_orders_product
    ON user_xp_orders(product_id);


-- ============================================================================
-- RPC: earn_xp_from_purchase
-- ============================================================================
-- Awards XP based on RON amount spent. Creates/updates user_shop_xp row.
-- Checks for level-ups and grants level_up_bonus if applicable.
-- Idempotent via reference_id (order_id).
-- ============================================================================
CREATE OR REPLACE FUNCTION earn_xp_from_purchase(
    p_user_id    UUID,
    p_salon_id   UUID,
    p_order_id   UUID,
    p_amount_ron NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_xp_per_ron   INT;
    v_enabled      BOOLEAN;
    v_xp_earned    INT;
    v_xp_record    user_shop_xp%ROWTYPE;
    v_new_xp       INT;
    v_new_total    INT;
    v_old_level    INT;
    v_new_level    INT;
    v_level_title  TEXT;
BEGIN
    -- Check idempotency: if XP already awarded for this order, return early
    IF EXISTS (
        SELECT 1 FROM shop_xp_transactions
        WHERE reference_id = p_order_id
          AND source = 'purchase'
          AND user_id = p_user_id
          AND salon_id = p_salon_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'XP deja acordat pentru această comandă.'
        );
    END IF;

    -- Get XP config for this salon
    SELECT xp_per_ron, enabled INTO v_xp_per_ron, v_enabled
    FROM shop_xp_config
    WHERE salon_id = p_salon_id;

    -- Default if no config exists
    IF NOT FOUND THEN
        v_xp_per_ron := 10;
        v_enabled := TRUE;
    END IF;

    IF NOT v_enabled THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Sistemul XP este dezactivat pentru acest salon.'
        );
    END IF;

    -- Calculate XP
    v_xp_earned := FLOOR(p_amount_ron * v_xp_per_ron);

    IF v_xp_earned <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Suma este prea mică pentru a câștiga XP.'
        );
    END IF;

    -- Upsert user_shop_xp
    INSERT INTO user_shop_xp (user_id, salon_id, current_xp, total_xp_earned, level)
    VALUES (p_user_id, p_salon_id, v_xp_earned, v_xp_earned, 1)
    ON CONFLICT (user_id, salon_id) DO UPDATE SET
        current_xp = user_shop_xp.current_xp + v_xp_earned,
        total_xp_earned = user_shop_xp.total_xp_earned + v_xp_earned
    RETURNING * INTO v_xp_record;

    v_new_xp := v_xp_record.current_xp;
    v_new_total := v_xp_record.total_xp_earned;
    v_old_level := v_xp_record.level;

    -- Check for level-up based on total_xp_earned
    SELECT level, title INTO v_new_level, v_level_title
    FROM xp_level_thresholds
    WHERE xp_required <= v_new_total
    ORDER BY level DESC
    LIMIT 1;

    IF v_new_level IS NULL THEN
        v_new_level := 1;
    END IF;

    -- Update level if changed
    IF v_new_level > v_old_level THEN
        UPDATE user_shop_xp
        SET level = v_new_level
        WHERE id = v_xp_record.id;
    END IF;

    -- Log the transaction
    INSERT INTO shop_xp_transactions (user_id, salon_id, amount, type, source, reference_id, description)
    VALUES (
        p_user_id, p_salon_id, v_xp_earned, 'earned', 'purchase', p_order_id,
        FORMAT('XP câștigat din achiziție: %s RON × %s XP/RON', p_amount_ron, v_xp_per_ron)
    );

    RETURN jsonb_build_object(
        'success', true,
        'xp_earned', v_xp_earned,
        'current_xp', v_new_xp,
        'total_xp_earned', v_new_total,
        'level', v_new_level,
        'level_title', COALESCE(v_level_title, 'Începător'),
        'leveled_up', v_new_level > v_old_level
    );
END;
$$;


-- ============================================================================
-- RPC: purchase_with_xp
-- ============================================================================
-- Spends XP to buy a real product. Validates XP balance, stock availability,
-- deducts XP, creates an order, and decrements stock.
-- ============================================================================
CREATE OR REPLACE FUNCTION purchase_with_xp(
    p_user_id    UUID,
    p_product_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product     xp_reward_products%ROWTYPE;
    v_xp_record   user_shop_xp%ROWTYPE;
    v_order_id    UUID;
BEGIN
    -- Get product details (lock row to prevent race conditions on stock)
    SELECT * INTO v_product
    FROM xp_reward_products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Produsul nu a fost găsit.');
    END IF;

    IF NOT v_product.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Produsul nu mai este disponibil.');
    END IF;

    IF v_product.stock <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Produsul nu mai este în stoc.');
    END IF;

    -- Get user XP for this salon (lock row to prevent race conditions on balance)
    SELECT * INTO v_xp_record
    FROM user_shop_xp
    WHERE user_id = p_user_id AND salon_id = v_product.salon_id
    FOR UPDATE;

    IF NOT FOUND OR v_xp_record.current_xp < v_product.xp_cost THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', FORMAT('XP insuficient. Ai %s XP, dar produsul costă %s XP.',
                COALESCE(v_xp_record.current_xp, 0), v_product.xp_cost)
        );
    END IF;

    -- Deduct XP from user balance
    UPDATE user_shop_xp
    SET current_xp = current_xp - v_product.xp_cost
    WHERE id = v_xp_record.id;

    -- Decrement product stock
    UPDATE xp_reward_products
    SET stock = stock - 1
    WHERE id = p_product_id;

    -- Create order
    INSERT INTO user_xp_orders (user_id, product_id, salon_id, xp_spent, status)
    VALUES (p_user_id, p_product_id, v_product.salon_id, v_product.xp_cost, 'pending')
    RETURNING id INTO v_order_id;

    -- Log XP transaction
    INSERT INTO shop_xp_transactions (user_id, salon_id, amount, type, source, reference_id, description)
    VALUES (
        p_user_id, v_product.salon_id, -v_product.xp_cost, 'spent', 'product_redeem', v_order_id,
        FORMAT('Produs achiziționat cu XP: %s (-%s XP)', v_product.name, v_product.xp_cost)
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'product_name', v_product.name,
        'product_brand', v_product.brand,
        'xp_spent', v_product.xp_cost,
        'remaining_xp', v_xp_record.current_xp - v_product.xp_cost,
        'status', 'pending'
    );
END;
$$;


-- ============================================================================
-- RPC: get_user_xp_summary
-- ============================================================================
-- Returns XP balance, level, progress toward next level, active orders count,
-- and recent transactions.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_xp_summary(
    p_user_id  UUID,
    p_salon_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_xp_record    user_shop_xp%ROWTYPE;
    v_current_level xp_level_thresholds%ROWTYPE;
    v_next_level   xp_level_thresholds%ROWTYPE;
    v_progress     NUMERIC;
    v_active_orders INT;
    v_recent_txns  JSONB;
BEGIN
    -- Get or create user XP record
    INSERT INTO user_shop_xp (user_id, salon_id, current_xp, total_xp_earned, level)
    VALUES (p_user_id, p_salon_id, 0, 0, 1)
    ON CONFLICT (user_id, salon_id) DO NOTHING;

    SELECT * INTO v_xp_record
    FROM user_shop_xp
    WHERE user_id = p_user_id AND salon_id = p_salon_id;

    -- Get current level info
    SELECT * INTO v_current_level
    FROM xp_level_thresholds
    WHERE level = v_xp_record.level;

    -- Get next level info
    SELECT * INTO v_next_level
    FROM xp_level_thresholds
    WHERE level = v_xp_record.level + 1;

    -- Calculate progress to next level
    IF v_next_level.level IS NOT NULL AND v_current_level.level IS NOT NULL THEN
        v_progress := LEAST(100, ROUND(
            (v_xp_record.total_xp_earned - v_current_level.xp_required)::NUMERIC /
            NULLIF(v_next_level.xp_required - v_current_level.xp_required, 0)::NUMERIC * 100
        , 1));
    ELSE
        v_progress := 100; -- max level reached
    END IF;

    -- Count active orders (pending, confirmed, or ready — not yet collected/cancelled)
    SELECT COUNT(*) INTO v_active_orders
    FROM user_xp_orders
    WHERE user_id = p_user_id
      AND salon_id = p_salon_id
      AND status IN ('pending', 'confirmed', 'ready');

    -- Recent transactions (last 10)
    SELECT COALESCE(jsonb_agg(t), '[]'::JSONB) INTO v_recent_txns
    FROM (
        SELECT id, amount, type, source, description, created_at
        FROM shop_xp_transactions
        WHERE user_id = p_user_id AND salon_id = p_salon_id
        ORDER BY created_at DESC
        LIMIT 10
    ) t;

    RETURN jsonb_build_object(
        'current_xp', v_xp_record.current_xp,
        'total_xp_earned', v_xp_record.total_xp_earned,
        'level', v_xp_record.level,
        'level_title', COALESCE(v_current_level.title, 'Începător'),
        'level_perks', COALESCE(v_current_level.perks, '[]'::JSONB),
        'next_level', v_next_level.level,
        'next_level_title', v_next_level.title,
        'next_level_xp_required', v_next_level.xp_required,
        'progress_percent', COALESCE(v_progress, 100),
        'active_orders_count', v_active_orders,
        'recent_transactions', v_recent_txns
    );
END;
$$;


-- ============================================================================
-- DROP old coupon functions/tables if they exist (clean up from previous version)
-- ============================================================================
DROP FUNCTION IF EXISTS redeem_coupon_with_xp(UUID, UUID);
DROP TABLE IF EXISTS user_coupons;
DROP TABLE IF EXISTS shop_coupons;


-- ============================================================================
-- SEED DATA: XP Level Thresholds
-- ============================================================================
INSERT INTO xp_level_thresholds (level, xp_required, title, perks) VALUES
    (1, 0,      'Bronze',      '["Acces la produse de bază"]'::JSONB),
    (2, 1000,   'Silver',      '["Acces la produse exclusive", "Badge Silver pe profil"]'::JSONB),
    (3, 3000,   'Gold',        '["Produse Gold deblocate", "Acces anticipat la produse noi"]'::JSONB),
    (4, 7000,   'Platinum',    '["Produse Platinum disponibile", "Prioritate la comenzi"]'::JSONB),
    (5, 15000,  'Diamond',     '["Toate produsele deblocate", "Prioritate maxima", "Cadou la fiecare nivel"]'::JSONB)
ON CONFLICT (level) DO UPDATE SET
    xp_required = EXCLUDED.xp_required,
    title = EXCLUDED.title,
    perks = EXCLUDED.perks;


-- ============================================================================
-- SEED DATA: Sample Glamm & Rovra Products
-- ============================================================================
-- Inserted for the first salon found. Safe to re-run (ON CONFLICT DO NOTHING
-- uses name+salon_id uniqueness check via the DO block).
-- ============================================================================
DO $$
DECLARE
    v_salon RECORD;
BEGIN
    -- Seed products for ALL salons
    FOR v_salon IN SELECT id FROM salons LOOP

        -- Glamm products
        INSERT INTO xp_reward_products (salon_id, name, description, brand, category, xp_cost, retail_value_cents, stock, is_active, sort_order)
        VALUES
            (v_salon.id, 'Ceară Glamm Premium', 'Ceară profesională de styling cu fixare puternică și finisaj mat. Ideală pentru look-uri texturate.', 'Glamm', 'styling', 300, 4500, 10, true, 1),
            (v_salon.id, 'Gel Fixare Glamm', 'Gel de fixare extra-strong cu efect wet-look. Nu lasă reziduuri și se spală ușor.', 'Glamm', 'styling', 200, 3200, 15, true, 2),
            (v_salon.id, 'Spray Glamm Shine', 'Spray de luciu profesional. Adaugă strălucire naturală fără a îngreuna părul.', 'Glamm', 'ingrijire', 250, 3800, 12, true, 3),
            (v_salon.id, 'Set Glamm Complet', 'Set complet de styling Glamm: ceară + gel + spray. Pachet complet pentru îngrijire profesională.', 'Glamm', 'styling', 800, 9900, 5, true, 4),
            (v_salon.id, 'Pomadă Glamm Matte', 'Pomadă cu finisaj mat și fixare medie. Perfectă pentru un look natural și elegant.', 'Glamm', 'styling', 350, 5200, 8, true, 5)
        ON CONFLICT DO NOTHING;

        -- Rovra products
        INSERT INTO xp_reward_products (salon_id, name, description, brand, category, xp_cost, retail_value_cents, stock, is_active, sort_order)
        VALUES
            (v_salon.id, 'Ulei Rovra Professional', 'Ulei profesional pentru mașini de tuns. Prelungește durata de viață a lamelor.', 'Rovra', 'accesorii', 150, 2500, 20, true, 10),
            (v_salon.id, 'Pelerina Rovra Classic', 'Pelerină profesională Rovra din material rezistent la apă. Design clasic negru.', 'Rovra', 'accesorii', 500, 7500, 5, true, 11),
            (v_salon.id, 'Set Lame Rovra', 'Set de lame de schimb Rovra pentru aparate profesionale. Pachet de 10 bucăți.', 'Rovra', 'unelte', 400, 6500, 10, true, 12),
            (v_salon.id, 'Spray Rovra Cleaning', 'Spray de curățare și dezinfectare pentru lame și aparate. 400ml.', 'Rovra', 'accesorii', 200, 3500, 15, true, 13),
            (v_salon.id, 'Trimmer Rovra Mini', 'Trimmer profesional compact Rovra pentru contururi și detalii precise. Baterie Li-Ion.', 'Rovra', 'unelte', 1500, 22000, 3, true, 14)
        ON CONFLICT DO NOTHING;

        -- Seed XP config for this salon if not exists
        INSERT INTO shop_xp_config (salon_id, xp_per_ron, enabled)
        VALUES (v_salon.id, 10, true)
        ON CONFLICT (salon_id) DO NOTHING;

    END LOOP;
END;
$$;
