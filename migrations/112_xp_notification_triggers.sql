-- 112_xp_notification_triggers.sql
-- Platform XP / DIVE push notification triggers.
--
-- Adds AFTER-INSERT/UPDATE triggers that emit notification_log rows (picked
-- up by the push dispatch trigger from 105) for the DIVE universal loyalty
-- lifecycle: XP earned, tier level-up, platform voucher generated, voucher
-- redeemed at a salon (client + salon owner), salon marketplace credit
-- earned, and marketplace order shipped.
--
-- Depends on:
--   - 105_notifications_triggers.sql        (create_notification() helper,
--                                            notification_log push dispatch)
--   - 106_notifications_triggers_extended   (loyalty_tier_up template reuse)
--   - 107_platform_xp_foundation            (user_platform_xp,
--                                            platform_xp_transactions)
--   - 108_salon_marketplace_wallet          (salon_marketplace_credit_ledger,
--                                            salon_marketplace_wallet)
--   - 109_marketplace_catalog               (marketplace_orders,
--                                            marketplace_shipments)
--   - 111_platform_xp_rpcs                  (loyalty_vouchers widened:
--                                            source, value_cents,
--                                            redeemed_salon_id)
--
-- Rules for every trigger in this file:
--   * SECURITY DEFINER + `SET search_path = public, pg_temp`
--   * Wrap body in `EXCEPTION WHEN OTHERS THEN RAISE WARNING ...; RETURN NEW`
--     so notification emission NEVER blocks the underlying write.
--   * DROP TRIGGER IF EXISTS before CREATE so migration is idempotent.
--   * Mirror style of 106_notifications_triggers_extended.sql.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. loyalty_xp_earned — AFTER INSERT ON platform_xp_transactions
-- ────────────────────────────────────────────────────────────────────────────
-- Fires for positive XP grants only (earned from appointment / marketplace
-- order / admin grant). Voucher conversion, reversals and admin revokes are
-- skipped: the user doesn't need a push for self-initiated burns or for
-- silent accounting corrections.

CREATE OR REPLACE FUNCTION public.trg_notify_xp_earned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Only positive XP awards from user-visible sources
    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
        RETURN NEW;
    END IF;

    IF NEW.source_type NOT IN ('appointment', 'marketplace_order', 'admin_grant') THEN
        RETURN NEW;
    END IF;

    PERFORM public.create_notification(
        NEW.user_id,
        'loyalty_xp_earned',
        NULL, NULL,
        jsonb_build_object(
            'points', NEW.amount::TEXT,
            'total',  NEW.balance_after::TEXT
        ),
        '/loyalty',
        0::smallint,
        jsonb_build_object(
            'transaction_id', NEW.id,
            'source_type',    NEW.source_type,
            'source_id',      NEW.source_id
        ),
        NEW.salon_id,
        'push'
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_xp_earned failed for platform_xp_transactions.id=%: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_xp_tx_notify_earned ON public.platform_xp_transactions;
CREATE TRIGGER platform_xp_tx_notify_earned
    AFTER INSERT ON public.platform_xp_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_xp_earned();


-- ────────────────────────────────────────────────────────────────────────────
-- 2. loyalty_tier_up (platform) — AFTER UPDATE ON user_platform_xp
-- ────────────────────────────────────────────────────────────────────────────
-- Fires only on PROMOTION (rank goes up). A downgrade / no-op is ignored.
-- Reuses the existing `loyalty_tier_up` template registered in migration 106.
--
-- Rank map (matches 111 level computation):
--   rookie=1, regular=2, vip=3, elite=4

CREATE OR REPLACE FUNCTION public.trg_notify_level_up()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_rank INT;
    v_new_rank INT;
BEGIN
    IF NEW.level IS NOT DISTINCT FROM OLD.level THEN
        RETURN NEW;
    END IF;

    v_old_rank := CASE OLD.level
        WHEN 'rookie'  THEN 1
        WHEN 'regular' THEN 2
        WHEN 'vip'     THEN 3
        WHEN 'elite'   THEN 4
        ELSE 0
    END;

    v_new_rank := CASE NEW.level
        WHEN 'rookie'  THEN 1
        WHEN 'regular' THEN 2
        WHEN 'vip'     THEN 3
        WHEN 'elite'   THEN 4
        ELSE 0
    END;

    -- Only notify on promotion, never demotion / reset
    IF v_new_rank <= v_old_rank THEN
        RETURN NEW;
    END IF;

    PERFORM public.create_notification(
        NEW.user_id,
        'loyalty_tier_up',
        NULL, NULL,
        jsonb_build_object(
            'tierName',     NEW.level,
            'previousTier', COALESCE(OLD.level, 'rookie')
        ),
        '/loyalty',
        1::smallint,
        jsonb_build_object(
            'new_level',       NEW.level,
            'previous_level',  OLD.level,
            'lifetime_earned', NEW.lifetime_earned
        ),
        NULL,      -- platform level-up is not tied to a salon
        'push'
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_level_up failed for user_platform_xp.user_id=%: %',
        NEW.user_id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_platform_xp_notify_level_up ON public.user_platform_xp;
CREATE TRIGGER user_platform_xp_notify_level_up
    AFTER UPDATE OF level ON public.user_platform_xp
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_level_up();


-- ────────────────────────────────────────────────────────────────────────────
-- 3. loyalty_voucher_generated — AFTER INSERT ON loyalty_vouchers
-- ────────────────────────────────────────────────────────────────────────────
-- Fires only for platform-tier vouchers (DIVE conversion output). Legacy
-- salon vouchers have their own notification path via 106.

CREATE OR REPLACE FUNCTION public.trg_notify_voucher_generated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_amount_ron TEXT;
BEGIN
    IF COALESCE(NEW.source, 'legacy_salon') <> 'platform_tier' THEN
        RETURN NEW;
    END IF;

    IF NEW.value_cents IS NULL OR NEW.value_cents <= 0 THEN
        RETURN NEW;
    END IF;

    v_amount_ron := (NEW.value_cents / 100)::TEXT;

    PERFORM public.create_notification(
        NEW.user_id,
        'loyalty_voucher_generated',
        NULL, NULL,
        jsonb_build_object(
            'amount', v_amount_ron,
            'code',   NEW.code
        ),
        '/loyalty/voucher-detail/' || NEW.code,
        1::smallint,
        jsonb_build_object(
            'voucher_id',  NEW.id,
            'code',        NEW.code,
            'value_cents', NEW.value_cents,
            'tier_points', NEW.tier_points
        ),
        NULL,      -- universal voucher — no salon scope
        'push'
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_voucher_generated failed for loyalty_vouchers.id=%: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loyalty_vouchers_notify_generated ON public.loyalty_vouchers;
CREATE TRIGGER loyalty_vouchers_notify_generated
    AFTER INSERT ON public.loyalty_vouchers
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_voucher_generated();


-- ────────────────────────────────────────────────────────────────────────────
-- 4. voucher redeemed — AFTER UPDATE ON loyalty_vouchers (active -> used)
-- ────────────────────────────────────────────────────────────────────────────
-- Two notifications on a single state transition (status 'active' -> 'used')
-- for PLATFORM-TIER vouchers only:
--   a. client (voucher owner) gets 'loyalty_voucher_redeemed_at_salon'
--   b. salon owner gets 'salon_voucher_redeemed' so they know credit landed
--
-- Legacy salon-scoped vouchers don't mint marketplace credit (rewards are
-- funded by the salon), so skip both notifications for them.

CREATE OR REPLACE FUNCTION public.trg_notify_voucher_redeemed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_salon_name   TEXT;
    v_owner_id     UUID;
    v_client_name  TEXT;
    v_amount_ron   INT;
BEGIN
    -- Only fire on the active -> used transition
    IF NOT (COALESCE(OLD.status, '') = 'active' AND NEW.status = 'used') THEN
        RETURN NEW;
    END IF;

    -- Legacy salon vouchers: skip (no marketplace credit generated)
    IF COALESCE(NEW.source, 'legacy_salon') <> 'platform_tier' THEN
        RETURN NEW;
    END IF;

    v_amount_ron := COALESCE(NEW.value_cents, 0) / 100;

    -- Resolve redeeming salon + owner
    IF NEW.redeemed_salon_id IS NOT NULL THEN
        SELECT s.name, s.owner_id
          INTO v_salon_name, v_owner_id
          FROM public.salons s
         WHERE s.id = NEW.redeemed_salon_id;
    END IF;

    -- ── 4a. Notify the CLIENT (voucher owner) ───────────────────────
    BEGIN
        PERFORM public.create_notification(
            NEW.user_id,
            'loyalty_voucher_redeemed_at_salon',
            NULL, NULL,
            jsonb_build_object(
                'salonName', COALESCE(v_salon_name, ''),
                'amount',    v_amount_ron
            ),
            '/loyalty/voucher-list',
            1::smallint,
            jsonb_build_object(
                'voucher_id',        NEW.id,
                'code',              NEW.code,
                'redeemed_salon_id', NEW.redeemed_salon_id,
                'value_cents',       NEW.value_cents
            ),
            NEW.redeemed_salon_id,
            'push'
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'trg_notify_voucher_redeemed (client) failed for voucher %: %',
            NEW.id, SQLERRM;
    END;

    -- ── 4b. Notify the SALON OWNER (credit landed) ───────────────────
    IF v_owner_id IS NOT NULL THEN
        BEGIN
            SELECT COALESCE(p.display_name, p.username, 'un client')
              INTO v_client_name
              FROM public.profiles p
             WHERE p.id = NEW.user_id;

            PERFORM public.create_notification(
                v_owner_id,
                'salon_voucher_redeemed',
                NULL, NULL,
                jsonb_build_object(
                    'amount',     v_amount_ron,
                    'clientName', COALESCE(v_client_name, 'un client'),
                    'code',       NEW.code
                ),
                '/management/marketplace-credits',
                1::smallint,
                jsonb_build_object(
                    'voucher_id',  NEW.id,
                    'code',        NEW.code,
                    'value_cents', NEW.value_cents,
                    'client_id',   NEW.user_id
                ),
                NEW.redeemed_salon_id,
                'push'
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'trg_notify_voucher_redeemed (owner) failed for voucher %: %',
                NEW.id, SQLERRM;
        END;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_voucher_redeemed failed for loyalty_vouchers.id=%: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loyalty_vouchers_notify_redeemed ON public.loyalty_vouchers;
CREATE TRIGGER loyalty_vouchers_notify_redeemed
    AFTER UPDATE OF status ON public.loyalty_vouchers
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_voucher_redeemed();


-- ────────────────────────────────────────────────────────────────────────────
-- 5. marketplace_credit_earned — AFTER INSERT ON salon_marketplace_credit_ledger
-- ────────────────────────────────────────────────────────────────────────────
-- Fires when a positive credit lands in a salon's marketplace wallet because
-- a platform voucher was redeemed. This may fire ALONGSIDE the
-- `salon_voucher_redeemed` notification in section 4b — that's intentional
-- for v1: two signals are clearer than one. Product can dedupe later if the
-- combined noise is a problem.

CREATE OR REPLACE FUNCTION public.trg_notify_marketplace_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_id      UUID;
    v_amount_ron    INT;
    v_balance_ron   INT;
BEGIN
    IF NEW.reason <> 'voucher_redemption' THEN
        RETURN NEW;
    END IF;

    IF NEW.delta_cents IS NULL OR NEW.delta_cents <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT s.owner_id INTO v_owner_id
      FROM public.salons s
     WHERE s.id = NEW.salon_id;

    IF v_owner_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_amount_ron := NEW.delta_cents / 100;

    SELECT (balance_cents / 100) INTO v_balance_ron
      FROM public.salon_marketplace_wallet
     WHERE salon_id = NEW.salon_id;

    PERFORM public.create_notification(
        v_owner_id,
        'marketplace_credit_earned',
        NULL, NULL,
        jsonb_build_object(
            'amount',  v_amount_ron,
            'balance', COALESCE(v_balance_ron, v_amount_ron)
        ),
        '/management/marketplace',
        1::smallint,
        jsonb_build_object(
            'ledger_id',   NEW.id,
            'salon_id',    NEW.salon_id,
            'voucher_id',  NEW.voucher_id,
            'delta_cents', NEW.delta_cents
        ),
        NEW.salon_id,
        'push'
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_marketplace_credit failed for ledger.id=%: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS salon_marketplace_credit_ledger_notify ON public.salon_marketplace_credit_ledger;
CREATE TRIGGER salon_marketplace_credit_ledger_notify
    AFTER INSERT ON public.salon_marketplace_credit_ledger
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_marketplace_credit();


-- ────────────────────────────────────────────────────────────────────────────
-- 6. marketplace_order_shipped — AFTER UPDATE ON marketplace_orders
-- ────────────────────────────────────────────────────────────────────────────
-- Fires on status transition into 'shipped'. Only v1 recipient is the CLIENT
-- buyer (buyer_type='client'); salon buyers see shipments on their dashboard
-- and are skipped for now.

CREATE OR REPLACE FUNCTION public.trg_notify_marketplace_order_shipped()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_awb      TEXT;
BEGIN
    -- Only fire on the transition INTO 'shipped'
    IF NEW.status IS DISTINCT FROM 'shipped' THEN
        RETURN NEW;
    END IF;

    IF COALESCE(OLD.status, '') = 'shipped' THEN
        RETURN NEW;
    END IF;

    -- v1: only notify client buyers. Salon buyers view status in dashboard.
    IF NEW.buyer_type <> 'client' OR NEW.buyer_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT tracking_number INTO v_awb
      FROM public.marketplace_shipments
     WHERE order_id = NEW.id
     LIMIT 1;

    PERFORM public.create_notification(
        NEW.buyer_user_id,
        'marketplace_order_shipped',
        NULL, NULL,
        jsonb_build_object(
            'orderId',     NEW.order_number,
            'productName', 'comanda ta',
            'days',        '3-5',
            'awb',         COALESCE(v_awb, 'in curs')
        ),
        '/marketplace/order/' || NEW.id::TEXT,
        1::smallint,
        jsonb_build_object(
            'order_id',     NEW.id,
            'order_number', NEW.order_number,
            'awb',          v_awb
        ),
        NULL,
        'push'
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_marketplace_order_shipped failed for marketplace_orders.id=%: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_orders_notify_shipped ON public.marketplace_orders;
CREATE TRIGGER marketplace_orders_notify_shipped
    AFTER UPDATE OF status ON public.marketplace_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_marketplace_order_shipped();


COMMIT;

-- ============================================================================
-- Done — 112_xp_notification_triggers.sql
-- ============================================================================
-- Triggers added (all fire-and-forget; notification failure never blocks the
-- underlying write):
--
--   1. platform_xp_tx_notify_earned
--        AFTER INSERT ON platform_xp_transactions
--        -> loyalty_xp_earned (positive earn, user-visible sources only)
--
--   2. user_platform_xp_notify_level_up
--        AFTER UPDATE OF level ON user_platform_xp
--        -> loyalty_tier_up (promotion only; rookie<regular<vip<elite)
--
--   3. loyalty_vouchers_notify_generated
--        AFTER INSERT ON loyalty_vouchers (source='platform_tier')
--        -> loyalty_voucher_generated
--
--   4. loyalty_vouchers_notify_redeemed
--        AFTER UPDATE OF status ON loyalty_vouchers (active -> used,
--        platform_tier only)
--        -> loyalty_voucher_redeemed_at_salon (to client)
--        -> salon_voucher_redeemed            (to salon owner)
--
--   5. salon_marketplace_credit_ledger_notify
--        AFTER INSERT ON salon_marketplace_credit_ledger
--            (reason='voucher_redemption', delta_cents > 0)
--        -> marketplace_credit_earned (to salon owner)
--
--   6. marketplace_orders_notify_shipped
--        AFTER UPDATE OF status ON marketplace_orders (* -> 'shipped',
--        buyer_type='client')
--        -> marketplace_order_shipped
--
-- All functions are SECURITY DEFINER with SET search_path = public, pg_temp.
-- ============================================================================
