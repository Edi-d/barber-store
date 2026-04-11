-- ============================================================================
-- Migration 063: Fix get_loyalty_dashboard v_tier record not assigned
-- ============================================================================
-- The RECORD type v_tier crashes when accessed if never assigned via SELECT INTO.
-- Fix: use a separate boolean flag to track whether tier was found.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_loyalty_dashboard(p_salon_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_user_id       UUID;
    v_profile       loyalty_profiles%ROWTYPE;
    v_tier          RECORD;
    v_tier_found    BOOLEAN := false;
    v_next_tier     RECORD;
    v_streak        loyalty_streaks%ROWTYPE;
    v_result        JSONB;
    v_transactions  JSONB;
    v_rewards       JSONB;
    v_challenges    JSONB;
    v_multipliers   JSONB;
    v_tier_progress JSONB;
    v_achievements  JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'unauthenticated',
            'message', 'Trebuie sa fii autentificat');
    END IF;

    -- ---- Profile ----
    SELECT * INTO v_profile
    FROM loyalty_profiles
    WHERE user_id = v_user_id AND salon_id = p_salon_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'profile', NULL,
            'is_new', true,
            'message', 'Niciun profil de loialitate inca. Viziteaza salonul pentru a incepe!'
        );
    END IF;

    -- ---- Current tier info ----
    IF v_profile.current_tier_id IS NOT NULL THEN
        SELECT * INTO v_tier FROM loyalty_tiers WHERE id = v_profile.current_tier_id;
        IF FOUND THEN
            v_tier_found := true;
        END IF;
    END IF;

    -- ---- Next tier ----
    SELECT * INTO v_next_tier
    FROM loyalty_tiers
    WHERE salon_id = p_salon_id
      AND active = true
      AND min_lifetime_points > COALESCE(v_profile.lifetime_points, 0)
    ORDER BY min_lifetime_points ASC
    LIMIT 1;

    IF v_next_tier IS NOT NULL THEN
        v_tier_progress := jsonb_build_object(
            'next_tier_name',    v_next_tier.name,
            'next_tier_slug',    v_next_tier.slug,
            'points_needed',     v_next_tier.min_lifetime_points - COALESCE(v_profile.lifetime_points, 0),
            'next_threshold',    v_next_tier.min_lifetime_points,
            'current_lifetime',  COALESCE(v_profile.lifetime_points, 0),
            'progress_pct',      ROUND(
                COALESCE(v_profile.lifetime_points, 0)::NUMERIC
                / GREATEST(v_next_tier.min_lifetime_points, 1) * 100, 1
            )
        );
    ELSE
        v_tier_progress := jsonb_build_object(
            'next_tier_name', NULL,
            'message', 'Nivel maxim atins!',
            'current_lifetime', COALESCE(v_profile.lifetime_points, 0)
        );
    END IF;

    -- ---- Streak ----
    SELECT * INTO v_streak
    FROM loyalty_streaks
    WHERE user_id = v_user_id
      AND salon_id = p_salon_id
      AND streak_type = 'monthly_visit';

    -- ---- Recent transactions (last 10) ----
    SELECT COALESCE(jsonb_agg(t), '[]'::JSONB)
    INTO v_transactions
    FROM (
        SELECT
            pt.id,
            pt.type,
            pt.amount,
            pt.balance_after,
            pt.source,
            pt.description,
            pt.multiplier_applied,
            pt.created_at
        FROM point_transactions pt
        WHERE pt.user_id = v_user_id
          AND pt.salon_id = p_salon_id
        ORDER BY pt.created_at DESC
        LIMIT 10
    ) t;

    -- ---- Available rewards (affordable first, then by sort_order) ----
    SELECT COALESCE(jsonb_agg(r), '[]'::JSONB)
    INTO v_rewards
    FROM (
        SELECT
            rc.id,
            rc.name,
            rc.description,
            rc.image_url,
            rc.category,
            rc.reward_type,
            rc.reward_value,
            rc.points_cost,
            rc.min_tier_slug,
            rc.stock,
            rc.sort_order,
            (rc.points_cost <= v_profile.current_points) AS affordable
        FROM rewards_catalog rc
        WHERE rc.salon_id = p_salon_id
          AND rc.active = true
          AND (rc.valid_from IS NULL OR rc.valid_from <= NOW())
          AND (rc.valid_until IS NULL OR rc.valid_until >= NOW())
        ORDER BY
            (rc.points_cost <= v_profile.current_points) DESC,
            rc.sort_order ASC,
            rc.points_cost ASC
    ) r;

    -- ---- Active challenges with user progress ----
    SELECT COALESCE(jsonb_agg(c), '[]'::JSONB)
    INTO v_challenges
    FROM (
        SELECT
            ch.id,
            ch.name,
            ch.description,
            ch.icon_url,
            ch.category,
            ch.challenge_type,
            ch.target_value,
            ch.points_reward,
            ch.starts_at,
            ch.ends_at,
            COALESCE(uc.current_progress, 0) AS current_progress,
            COALESCE(uc.target_value, ch.target_value) AS target,
            COALESCE(uc.status, 'available') AS user_status
        FROM challenges ch
        LEFT JOIN user_challenges uc
            ON uc.challenge_id = ch.id AND uc.user_id = v_user_id
        WHERE ch.salon_id = p_salon_id
          AND ch.active = true
          AND ch.ends_at > NOW()
        ORDER BY ch.ends_at ASC
    ) c;

    -- ---- Active multipliers ----
    SELECT COALESCE(jsonb_agg(m), '[]'::JSONB)
    INTO v_multipliers
    FROM (
        SELECT
            pm.id,
            pm.name,
            pm.description,
            pm.applies_to,
            pm.multiplier,
            pm.starts_at,
            pm.ends_at
        FROM point_multipliers pm
        WHERE pm.salon_id = p_salon_id
          AND pm.active = true
          AND pm.starts_at <= NOW()
          AND pm.ends_at >= NOW()
        ORDER BY pm.multiplier DESC
    ) m;

    -- ---- Recent achievements (last 10) ----
    SELECT COALESCE(jsonb_agg(a), '[]'::JSONB)
    INTO v_achievements
    FROM (
        SELECT
            ach.id,
            ach.slug,
            ach.name,
            ach.description,
            ach.category,
            ach.rarity,
            ach.icon_url,
            ach.points_reward,
            ua.earned_at,
            ua.is_showcased
        FROM user_achievements ua
        JOIN achievements ach ON ach.id = ua.achievement_id
        WHERE ua.user_id = v_user_id
          AND ua.salon_id = p_salon_id
        ORDER BY ua.earned_at DESC
        LIMIT 10
    ) a;

    -- ---- Assemble result ----
    v_result := jsonb_build_object(
        'status', 'success',
        'profile', jsonb_build_object(
            'id',              v_profile.id,
            'current_points',  v_profile.current_points,
            'lifetime_points', COALESCE(v_profile.lifetime_points, 0),
            'total_visits',    v_profile.total_visits,
            'last_visit_at',   v_profile.last_visit_at,
            'referral_code',   v_profile.referral_code,
            'tier', CASE
                WHEN v_tier_found THEN jsonb_build_object(
                    'id',    v_tier.id,
                    'name',  v_tier.name,
                    'slug',  v_tier.slug,
                    'color', v_tier.color,
                    'icon_url', v_tier.icon_url,
                    'multiplier', v_tier.multiplier,
                    'perks', v_tier.perks
                )
                ELSE NULL
            END,
            'streak', jsonb_build_object(
                'current_count', COALESCE(v_streak.current_count, 0),
                'longest_count', COALESCE(v_streak.longest_count, 0),
                'last_activity', v_streak.last_activity_at,
                'grace_used',    COALESCE(v_streak.grace_period_used, false)
            )
        ),
        'tier_progress',    v_tier_progress,
        'transactions',     v_transactions,
        'rewards',          v_rewards,
        'challenges',       v_challenges,
        'multipliers',      v_multipliers,
        'achievements',     v_achievements
    );

    RETURN v_result;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_loyalty_dashboard(UUID) TO authenticated;
