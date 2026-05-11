-- 106_notifications_triggers_extended.sql
-- Extended notification sources: live rewire (from 039), follows, reviews, loyalty, messages
-- Depends on: 105 (create_notification helper + dispatch trigger), 104, 060
-- Any source table whose schema isn't confirmed gets a conditional DO $$ block with RAISE NOTICE.
--
-- Design notes:
--   * All trigger functions are SECURITY DEFINER so they bypass RLS on
--     notification_log.
--   * Each function has an EXCEPTION WHEN OTHERS handler so a notification
--     failure NEVER blocks the source event.
--   * Display names are resolved from profiles as
--     COALESCE(display_name, username, 'Utilizator') — profiles.display_name
--     can be NULL; username is always present (001_initial_schema.sql).
--   * Migration 039 currently writes to the legacy `notifications` table with
--     type='live'. Section 1 below drops its trigger and replaces it with a
--     v2 function that writes to notification_log via create_notification().
--     The old notify_followers_on_live() function is LEFT INTACT so any other
--     dependent (none known at time of writing) doesn't break; only the
--     trigger binding is removed.
--   * Sections 3, 4, 5, 6 (reviews, loyalty_reward, loyalty_tier_up,
--     new_message) each wrap their DDL in a DO $$ block that first verifies
--     the expected tables/columns exist. If the schema has drifted they emit
--     a RAISE NOTICE and skip — the migration still applies cleanly.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LIVE_STARTING — rewire from legacy `notifications` to notification_log
-- ────────────────────────────────────────────────────────────────────────────
-- Migration 039 created trg_notify_on_live which writes into the legacy
-- `notifications` table and therefore bypasses the push dispatch trigger
-- added in 105. We replace that binding with a v2 function writing to
-- notification_log via create_notification(), so push delivery kicks in.

DROP TRIGGER IF EXISTS trg_notify_on_live ON public.lives;

CREATE OR REPLACE FUNCTION public.notify_followers_on_live_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_host_name TEXT;
    r RECORD;
BEGIN
    -- Only fire when status transitions into 'live'
    IF NEW.status IS DISTINCT FROM 'live'
       OR OLD.status IS NOT DISTINCT FROM 'live' THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(p.display_name, p.username, 'Utilizator')
      INTO v_host_name
      FROM public.profiles p
     WHERE p.id = NEW.host_id;

    FOR r IN
        SELECT f.follower_id
          FROM public.follows f
         WHERE f.following_id = NEW.host_id
           AND f.follower_id <> NEW.host_id
    LOOP
        PERFORM public.create_notification(
            r.follower_id,
            'live_starting',
            NULL, NULL,
            jsonb_build_object(
                'hostName',  COALESCE(v_host_name, 'Utilizator'),
                'liveTitle', COALESCE(NEW.title, '')
            ),
            '/social/live/' || NEW.id::text,
            1::smallint,
            jsonb_build_object(
                'live_id', NEW.id,
                'host_id', NEW.host_id
            ),
            NULL,     -- salon_id (not tracked on lives)
            'push'
        );
    END LOOP;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_followers_on_live_v2 failed for live %: %',
        NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_live_v2 ON public.lives;
CREATE TRIGGER trg_notify_on_live_v2
    AFTER UPDATE OF status ON public.lives
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_followers_on_live_v2();


-- ────────────────────────────────────────────────────────────────────────────
-- 2. NEW_FOLLOWER — AFTER INSERT ON follows
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_notify_new_follower()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_follower_name TEXT;
BEGIN
    -- Self-follow safeguard (DB already has a CHECK constraint, but defensive
    -- in case it's ever relaxed).
    IF NEW.follower_id = NEW.following_id THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(p.display_name, p.username, 'Un utilizator')
      INTO v_follower_name
      FROM public.profiles p
     WHERE p.id = NEW.follower_id;

    PERFORM public.create_notification(
        NEW.following_id,
        'new_follower',
        NULL, NULL,
        jsonb_build_object(
            'followerName', COALESCE(v_follower_name, 'Un utilizator')
        ),
        '/profile/' || NEW.follower_id::text,
        0::smallint,
        jsonb_build_object('follower_id', NEW.follower_id),
        NULL,
        'push'
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_new_follower failed for follower=%, following=%: %',
        NEW.follower_id, NEW.following_id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_notify_new_follower ON public.follows;
CREATE TRIGGER follows_notify_new_follower
    AFTER INSERT ON public.follows
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_new_follower();


-- ────────────────────────────────────────────────────────────────────────────
-- 3. REVIEW_RECEIVED — AFTER INSERT ON salon_reviews
-- ────────────────────────────────────────────────────────────────────────────
-- Source table: salon_reviews (migration 010 + 024).
-- Columns: id, user_id (client who left review), salon_id, rating, comment,
--          created_at, owner_reply, owner_reply_at.
-- Recipient: the salon owner (salons.owner_id). Wrapped in a schema-guard
-- DO $$ block so the migration applies cleanly if the schema has moved.

DO $$
DECLARE
    v_has_salon_reviews BOOLEAN;
    v_has_rating        BOOLEAN;
    v_has_salon_id      BOOLEAN;
    v_has_user_id       BOOLEAN;
    v_has_salons_owner  BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='salon_reviews')
      INTO v_has_salon_reviews;

    IF NOT v_has_salon_reviews THEN
        RAISE NOTICE 'salon_reviews table not found — review_received trigger skipped';
        RETURN;
    END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='salon_reviews'
                      AND column_name='rating')    INTO v_has_rating;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='salon_reviews'
                      AND column_name='salon_id')  INTO v_has_salon_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='salon_reviews'
                      AND column_name='user_id')   INTO v_has_user_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='salons'
                      AND column_name='owner_id')  INTO v_has_salons_owner;

    IF NOT (v_has_rating AND v_has_salon_id AND v_has_user_id AND v_has_salons_owner) THEN
        RAISE NOTICE 'salon_reviews or salons schema not confirmed — review_received trigger skipped';
        RETURN;
    END IF;

    -- Install function + trigger via dynamic SQL so it only runs when guarded.
    EXECUTE $FN$
        CREATE OR REPLACE FUNCTION public.trg_notify_review_received()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $BODY$
        DECLARE
            v_client_name TEXT;
            v_owner_id    UUID;
        BEGIN
            -- Resolve the salon owner — that's who receives the notification.
            SELECT s.owner_id INTO v_owner_id
              FROM public.salons s
             WHERE s.id = NEW.salon_id;

            -- Nothing to do if the salon has no owner (e.g., seed data).
            IF v_owner_id IS NULL THEN
                RETURN NEW;
            END IF;

            -- Don't notify owner when they review their own salon.
            IF v_owner_id = NEW.user_id THEN
                RETURN NEW;
            END IF;

            SELECT COALESCE(p.display_name, p.username, 'Un client')
              INTO v_client_name
              FROM public.profiles p
             WHERE p.id = NEW.user_id;

            PERFORM public.create_notification(
                v_owner_id,
                'review_received',
                NULL, NULL,
                jsonb_build_object(
                    'clientName', COALESCE(v_client_name, 'Un client'),
                    'rating',     NEW.rating
                ),
                '/reviews/' || NEW.id::text,
                1::smallint,
                jsonb_build_object(
                    'review_id', NEW.id,
                    'salon_id',  NEW.salon_id,
                    'rating',    NEW.rating
                ),
                NEW.salon_id,
                'push'
            );

            RETURN NEW;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'trg_notify_review_received failed for review %: %',
                NEW.id, SQLERRM;
            RETURN NEW;
        END;
        $BODY$;
    $FN$;

    EXECUTE 'DROP TRIGGER IF EXISTS salon_reviews_notify_received ON public.salon_reviews';
    EXECUTE 'CREATE TRIGGER salon_reviews_notify_received
                 AFTER INSERT ON public.salon_reviews
                 FOR EACH ROW
                 EXECUTE FUNCTION public.trg_notify_review_received()';
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. LOYALTY_REWARD — AFTER INSERT ON reward_redemptions
-- ────────────────────────────────────────────────────────────────────────────
-- Source table: reward_redemptions (migration 060). Fires when a user redeems
-- a reward — status starts as 'pending'. Reward name via rewards.name; salon
-- name via salons.name.

DO $$
DECLARE
    v_has_reward_redemptions BOOLEAN;
    v_has_rewards            BOOLEAN;
    v_has_rr_user_id         BOOLEAN;
    v_has_rr_reward_id       BOOLEAN;
    v_has_rr_salon_id        BOOLEAN;
    v_has_rewards_name       BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='reward_redemptions')
      INTO v_has_reward_redemptions;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='rewards')
      INTO v_has_rewards;

    IF NOT (v_has_reward_redemptions AND v_has_rewards) THEN
        RAISE NOTICE 'reward_redemptions/rewards schema not confirmed — loyalty_reward trigger skipped';
        RETURN;
    END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='reward_redemptions'
                      AND column_name='user_id')    INTO v_has_rr_user_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='reward_redemptions'
                      AND column_name='reward_id')  INTO v_has_rr_reward_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='reward_redemptions'
                      AND column_name='salon_id')   INTO v_has_rr_salon_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='rewards'
                      AND column_name='name')       INTO v_has_rewards_name;

    IF NOT (v_has_rr_user_id AND v_has_rr_reward_id AND v_has_rr_salon_id AND v_has_rewards_name) THEN
        RAISE NOTICE 'reward_redemptions/rewards columns not confirmed — loyalty_reward trigger skipped';
        RETURN;
    END IF;

    EXECUTE $FN$
        CREATE OR REPLACE FUNCTION public.trg_notify_loyalty_reward()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $BODY$
        DECLARE
            v_reward_name TEXT;
            v_salon_name  TEXT;
        BEGIN
            SELECT r.name INTO v_reward_name
              FROM public.rewards r
             WHERE r.id = NEW.reward_id;

            SELECT s.name INTO v_salon_name
              FROM public.salons s
             WHERE s.id = NEW.salon_id;

            PERFORM public.create_notification(
                NEW.user_id,
                'loyalty_reward',
                NULL, NULL,
                jsonb_build_object(
                    'rewardName', COALESCE(v_reward_name, 'Recompensa'),
                    'salonName',  COALESCE(v_salon_name, '')
                ),
                '/loyalty',
                1::smallint,
                jsonb_build_object(
                    'redemption_id', NEW.id,
                    'reward_id',     NEW.reward_id,
                    'salon_id',      NEW.salon_id
                ),
                NEW.salon_id,
                'push'
            );

            RETURN NEW;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'trg_notify_loyalty_reward failed for redemption %: %',
                NEW.id, SQLERRM;
            RETURN NEW;
        END;
        $BODY$;
    $FN$;

    EXECUTE 'DROP TRIGGER IF EXISTS reward_redemptions_notify ON public.reward_redemptions';
    EXECUTE 'CREATE TRIGGER reward_redemptions_notify
                 AFTER INSERT ON public.reward_redemptions
                 FOR EACH ROW
                 EXECUTE FUNCTION public.trg_notify_loyalty_reward()';
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. LOYALTY_TIER_UP — AFTER UPDATE OF current_tier_id ON loyalty_profiles
-- ────────────────────────────────────────────────────────────────────────────
-- Source table: loyalty_profiles (migration 054_loyalty_gamification.sql).
-- Per-user-per-salon. Tier changes via current_tier_id (UUID FK to
-- loyalty_tiers). We fire when current_tier_id moves to a tier with a higher
-- min_lifetime_points than the previous tier (real promotion, not demotion
-- or NULL-to-NULL no-op).
--
-- Note: migration 054_loyalty_core.sql defined a competing loyalty_profiles
-- with a plain TEXT `tier` column. We prefer current_tier_id (the gamification
-- variant which 063's dashboard RPC uses) — and gracefully skip if that
-- column is missing.

DO $$
DECLARE
    v_has_loyalty_profiles  BOOLEAN;
    v_has_current_tier_id   BOOLEAN;
    v_has_loyalty_tiers     BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='loyalty_profiles')
      INTO v_has_loyalty_profiles;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='loyalty_profiles'
                      AND column_name='current_tier_id')
      INTO v_has_current_tier_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='loyalty_tiers')
      INTO v_has_loyalty_tiers;

    IF NOT (v_has_loyalty_profiles AND v_has_current_tier_id AND v_has_loyalty_tiers) THEN
        RAISE NOTICE 'loyalty_profiles.current_tier_id / loyalty_tiers not confirmed — loyalty_tier_up trigger skipped';
        RETURN;
    END IF;

    EXECUTE $FN$
        CREATE OR REPLACE FUNCTION public.trg_notify_loyalty_tier_up()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $BODY$
        DECLARE
            v_new_tier_name      TEXT;
            v_new_tier_min_pts   INT;
            v_old_tier_min_pts   INT := 0;
            v_salon_name         TEXT;
        BEGIN
            -- Skip if tier didn't actually change
            IF NEW.current_tier_id IS NOT DISTINCT FROM OLD.current_tier_id THEN
                RETURN NEW;
            END IF;

            -- Skip if new tier is NULL (demotion / reset)
            IF NEW.current_tier_id IS NULL THEN
                RETURN NEW;
            END IF;

            SELECT name, min_lifetime_points
              INTO v_new_tier_name, v_new_tier_min_pts
              FROM public.loyalty_tiers
             WHERE id = NEW.current_tier_id;

            -- Resolve OLD tier threshold for comparison (if any)
            IF OLD.current_tier_id IS NOT NULL THEN
                SELECT min_lifetime_points INTO v_old_tier_min_pts
                  FROM public.loyalty_tiers
                 WHERE id = OLD.current_tier_id;
            END IF;

            -- Only fire on promotion (higher threshold), never demotion
            IF v_new_tier_min_pts IS NULL
               OR COALESCE(v_new_tier_min_pts, 0) <= COALESCE(v_old_tier_min_pts, 0) THEN
                RETURN NEW;
            END IF;

            SELECT s.name INTO v_salon_name
              FROM public.salons s
             WHERE s.id = NEW.salon_id;

            PERFORM public.create_notification(
                NEW.user_id,
                'loyalty_tier_up',
                NULL, NULL,
                jsonb_build_object(
                    'tierName',  COALESCE(v_new_tier_name, 'Nivel nou'),
                    'salonName', COALESCE(v_salon_name, '')
                ),
                '/loyalty',
                1::smallint,
                jsonb_build_object(
                    'loyalty_profile_id', NEW.id,
                    'tier_id',            NEW.current_tier_id,
                    'salon_id',           NEW.salon_id
                ),
                NEW.salon_id,
                'push'
            );

            RETURN NEW;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'trg_notify_loyalty_tier_up failed for profile %: %',
                NEW.id, SQLERRM;
            RETURN NEW;
        END;
        $BODY$;
    $FN$;

    EXECUTE 'DROP TRIGGER IF EXISTS loyalty_profiles_notify_tier_up ON public.loyalty_profiles';
    EXECUTE 'CREATE TRIGGER loyalty_profiles_notify_tier_up
                 AFTER UPDATE OF current_tier_id ON public.loyalty_profiles
                 FOR EACH ROW
                 EXECUTE FUNCTION public.trg_notify_loyalty_tier_up()';
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. NEW_MESSAGE — AFTER INSERT ON (DM / chat message table)
-- ────────────────────────────────────────────────────────────────────────────
-- No dedicated DM / chat_messages / direct_messages / conversations table
-- exists in this codebase as of migration 105. We scan a few likely candidate
-- names and gracefully skip if none are present. Once a DM feature lands,
-- replace this block with a real trigger (and solve the burst-dedup issue
-- noted below).
--
-- TODO: burst dedup — message triggers can fire many times per conversation
-- in a short window (typing-then-send patterns). When the real DM table
-- lands, collapse notifications per (recipient, conversation_id) within a
-- short window (e.g. via a per-conversation last_notified_at column, or a
-- dedup key in notification_log.meta checked by the Edge Function).

DO $$
DECLARE
    v_has_direct_messages BOOLEAN;
    v_has_chat_messages   BOOLEAN;
    v_has_messages        BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='direct_messages')
      INTO v_has_direct_messages;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='chat_messages')
      INTO v_has_chat_messages;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='messages')
      INTO v_has_messages;

    IF NOT (v_has_direct_messages OR v_has_chat_messages OR v_has_messages) THEN
        RAISE NOTICE 'No direct_messages / chat_messages / messages table found — new_message trigger skipped (implement once DM schema lands; remember burst dedup)';
        RETURN;
    END IF;

    -- A table exists under one of those names; but we haven't confirmed its
    -- columns (sender/recipient/body/conversation_id). Conservative skip
    -- with a clear NOTICE so the next iteration wires it up explicitly
    -- rather than guessing.
    RAISE NOTICE 'A messages-like table exists but its schema is unverified — new_message trigger skipped (confirm columns then replace this block with a concrete trigger)';
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. GRANTS
-- ────────────────────────────────────────────────────────────────────────────
-- The trigger functions are SECURITY DEFINER; they run as the migration
-- owner. No additional EXECUTE grants are needed at the function level
-- because triggers invoke them directly.

COMMIT;

-- ============================================================================
-- MANUAL TODO AFTER APPLYING THIS MIGRATION
-- ============================================================================
-- 1. Confirm the new live-starting push works end-to-end — migration 039's
--    trigger on `lives` is gone; only `trg_notify_on_live_v2` remains.
-- 2. Once a DM / direct_messages table is introduced, replace section 6 with
--    a real trigger AND implement burst dedup (see TODO above).
-- 3. If your deployment uses migration 054_loyalty_core.sql's loyalty_profiles
--    schema (text `tier` column) instead of 054_loyalty_gamification.sql's
--    (current_tier_id UUID), the tier_up trigger is skipped automatically;
--    write a dedicated trigger against the TEXT column in that case.
-- 4. review_received fires for salon owners. If you later want to notify a
--    specific barber instead (e.g. when salon_reviews gains a barber_id),
--    extend section 3 accordingly.
-- ============================================================================
