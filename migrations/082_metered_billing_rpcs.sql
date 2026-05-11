-- Migration 082: Metered Billing RPCs
-- Two-phase reserve/confirm pattern for metered SKUs.
-- Depends on migration 081.
--
-- NOTE: Rewritten to avoid `SELECT ... INTO` (triggers Supabase SQL Editor
-- parse bugs where plpgsql variables get treated as table names).
-- All lookups use scalar subquery assignments `v_X := (SELECT ... LIMIT 1);`
-- per the pattern in migration 072b. Paste this whole file as ONE SQL
-- editor request.

-- ============================================================
-- 1. reserve_usage
-- ============================================================
DROP FUNCTION IF EXISTS public.reserve_usage(uuid, text, int, text, text, uuid);

CREATE FUNCTION public.reserve_usage(
  p_salon_id uuid,
  p_sku text,
  p_quantity int,
  p_idempotency_key text,
  p_related_entity_type text DEFAULT NULL,
  p_related_entity_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id        uuid;
  v_existing_price     int;
  v_existing_total     int;
  v_existing_ref       text;
  v_existing_status    text;
  v_unit_price         int;
  v_plan_id            uuid;
  v_included           int;
  v_cap_cents          int;
  v_hard_cap           boolean;
  v_period_start       date;
  v_period_end         date;
  v_period_id          uuid;
  v_used               int;
  v_reserved           int;
  v_total_cents        int;
  v_overage_units      int;
  v_overage_cents      int;
  v_existing_over      int;
  v_reservation_id     uuid;
  v_over_cap           boolean := false;
  v_sku                public.usage_sku;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity' USING errcode = '22023';
  END IF;

  BEGIN
    v_sku := p_sku::public.usage_sku;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_sku' USING errcode = '22023';
  END;

  -- Idempotency short-circuit
  IF p_idempotency_key IS NOT NULL THEN
    v_existing_id := (
      SELECT id FROM public.usage_events
       WHERE salon_id = p_salon_id
         AND idempotency_key = p_idempotency_key
       LIMIT 1
    );

    IF v_existing_id IS NOT NULL THEN
      v_existing_price  := (SELECT unit_price_cents FROM public.usage_events WHERE id = v_existing_id);
      v_existing_total  := (SELECT total_cents       FROM public.usage_events WHERE id = v_existing_id);
      v_existing_ref    := (SELECT external_ref      FROM public.usage_events WHERE id = v_existing_id);
      v_existing_status := (SELECT status::text      FROM public.usage_events WHERE id = v_existing_id);

      RETURN jsonb_build_object(
        'status',           'duplicate',
        'reservation_id',   v_existing_id,
        'unit_price_cents', v_existing_price,
        'total_cents',      v_existing_total,
        'cost_cents',       v_existing_total,
        'provider_id',      v_existing_ref,
        'sent',             v_existing_status = 'confirmed',
        'event_status',     v_existing_status
      );
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_salon_id::text, 42));

  v_unit_price := (SELECT unit_price_cents FROM public.metered_skus WHERE sku = v_sku);

  IF v_unit_price IS NULL THEN
    RAISE EXCEPTION 'unknown_sku' USING errcode = 'P0002';
  END IF;

  v_plan_id := (
    SELECT s.plan_id
      FROM public.subscriptions s
     WHERE s.salon_id = p_salon_id
       AND s.status IN ('trialing','active','past_due')
     ORDER BY s.created_at DESC
     LIMIT 1
  );

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'no_active_plan' USING errcode = 'P0002';
  END IF;

  -- Per-sku included quota (CASE avoids dynamic SQL which also breaks editor)
  v_included := CASE p_sku
    WHEN 'sms_reminder'    THEN (SELECT COALESCE(included_sms_reminder, 0)    FROM public.plans WHERE id = v_plan_id)
    WHEN 'sms_marketing'   THEN (SELECT COALESCE(included_sms_marketing, 0)   FROM public.plans WHERE id = v_plan_id)
    WHEN 'email_reminder'  THEN (SELECT COALESCE(included_email_reminder, 0)  FROM public.plans WHERE id = v_plan_id)
    WHEN 'email_marketing' THEN (SELECT COALESCE(included_email_marketing, 0) FROM public.plans WHERE id = v_plan_id)
    ELSE 0
  END;
  v_included := COALESCE(v_included, 0);

  INSERT INTO public.salon_billing_config (salon_id)
    VALUES (p_salon_id)
    ON CONFLICT (salon_id) DO NOTHING;

  v_cap_cents := (SELECT overage_cap_cents_per_month FROM public.salon_billing_config WHERE salon_id = p_salon_id);
  v_hard_cap  := (SELECT hard_cap                    FROM public.salon_billing_config WHERE salon_id = p_salon_id);
  v_cap_cents := COALESCE(v_cap_cents, 20000);
  v_hard_cap  := COALESCE(v_hard_cap, true);

  v_period_start := date_trunc('month', (now() AT TIME ZONE 'utc'))::date;
  v_period_end   := (v_period_start + INTERVAL '1 month')::date;

  INSERT INTO public.usage_periods (
    salon_id, period_start, period_end, sku, quota_included,
    quantity_used_confirmed, quantity_reserved
  )
  VALUES (
    p_salon_id, v_period_start, v_period_end, v_sku, v_included, 0, 0
  )
  ON CONFLICT (salon_id, period_start, sku) DO UPDATE
    SET quota_included = EXCLUDED.quota_included
  RETURNING id INTO v_period_id;

  v_used     := (SELECT quantity_used_confirmed FROM public.usage_periods WHERE id = v_period_id);
  v_reserved := (SELECT quantity_reserved       FROM public.usage_periods WHERE id = v_period_id);

  v_existing_over := (
    SELECT COALESCE(SUM(
      GREATEST(0, (up.quantity_used_confirmed + up.quantity_reserved) - COALESCE(up.quota_included, 0))
      * ms.unit_price_cents
    ), 0)
    FROM public.usage_periods up
    JOIN public.metered_skus ms ON ms.sku = up.sku
    WHERE up.salon_id = p_salon_id
      AND up.period_start = v_period_start
  );

  v_overage_units := GREATEST(0, (v_used + v_reserved + p_quantity) - v_included)
                   - GREATEST(0, (v_used + v_reserved) - v_included);
  v_overage_cents := v_overage_units * v_unit_price;
  v_total_cents   := p_quantity * v_unit_price;
  v_over_cap      := (v_existing_over + v_overage_cents) > v_cap_cents AND v_overage_cents > 0;

  IF v_over_cap AND v_hard_cap THEN
    RETURN jsonb_build_object(
      'status',           'cap_exceeded',
      'overage_cents',    v_overage_cents,
      'existing_overage', v_existing_over,
      'cap_cents',        v_cap_cents,
      'cap_remaining',    GREATEST(0, v_cap_cents - v_existing_over)
    );
  END IF;

  INSERT INTO public.usage_events (
    salon_id, sku, units, unit_price_cents, total_cents,
    status, idempotency_key, period_id,
    related_entity_type, related_entity_id,
    billing_period_start, reserved_at
  )
  VALUES (
    p_salon_id, v_sku, p_quantity, v_unit_price, v_total_cents,
    'reserved', p_idempotency_key, v_period_id,
    p_related_entity_type, p_related_entity_id,
    v_period_start, now()
  )
  RETURNING id INTO v_reservation_id;

  UPDATE public.usage_periods
     SET quantity_reserved = quantity_reserved + p_quantity
   WHERE id = v_period_id;

  RETURN jsonb_build_object(
    'status',           'reserved',
    'reservation_id',   v_reservation_id,
    'unit_price_cents', v_unit_price,
    'total_cents',      v_total_cents,
    'cost_cents',       v_total_cents,
    'over_cap',         v_over_cap,
    'overage_units',    v_overage_units,
    'overage_cents',    v_overage_cents
  );
END;
$$;

-- ============================================================
-- 2. confirm_usage
-- ============================================================
DROP FUNCTION IF EXISTS public.confirm_usage(uuid, text, text);

CREATE FUNCTION public.confirm_usage(
  p_reservation_id uuid,
  p_provider_id text DEFAULT NULL,
  p_external_ref text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status          text;
  v_ext_ref         text;
  v_salon_id        uuid;
  v_units           int;
  v_period_id       uuid;
  v_ref             text;
  v_row_exists      boolean;
BEGIN
  v_ref := COALESCE(p_provider_id, p_external_ref);

  -- Lock row
  PERFORM 1 FROM public.usage_events WHERE id = p_reservation_id FOR UPDATE;
  v_row_exists := FOUND;
  IF NOT v_row_exists THEN
    RAISE EXCEPTION 'reservation_not_found' USING errcode = 'P0002';
  END IF;

  v_status    := (SELECT status::text  FROM public.usage_events WHERE id = p_reservation_id);
  v_ext_ref   := (SELECT external_ref  FROM public.usage_events WHERE id = p_reservation_id);
  v_salon_id  := (SELECT salon_id      FROM public.usage_events WHERE id = p_reservation_id);
  v_units     := (SELECT units         FROM public.usage_events WHERE id = p_reservation_id);
  v_period_id := (SELECT period_id     FROM public.usage_events WHERE id = p_reservation_id);

  IF v_status = 'confirmed' THEN
    IF v_ext_ref IS NULL AND v_ref IS NOT NULL THEN
      UPDATE public.usage_events SET external_ref = v_ref WHERE id = p_reservation_id;
    END IF;
    RETURN;
  END IF;

  IF v_status <> 'reserved' THEN
    RAISE EXCEPTION 'invalid_state_transition: status=%', v_status USING errcode = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_salon_id::text, 42));

  UPDATE public.usage_events
     SET status       = 'confirmed',
         external_ref = v_ref,
         confirmed_at = now()
   WHERE id = p_reservation_id;

  UPDATE public.usage_periods
     SET quantity_reserved       = GREATEST(0, quantity_reserved - v_units),
         quantity_used_confirmed = quantity_used_confirmed + v_units
   WHERE id = v_period_id;
END;
$$;

-- ============================================================
-- 3. release_usage
-- ============================================================
DROP FUNCTION IF EXISTS public.release_usage(uuid, text);

CREATE FUNCTION public.release_usage(
  p_reservation_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status      text;
  v_salon_id    uuid;
  v_units       int;
  v_period_id   uuid;
  v_row_exists  boolean;
BEGIN
  PERFORM 1 FROM public.usage_events WHERE id = p_reservation_id FOR UPDATE;
  v_row_exists := FOUND;
  IF NOT v_row_exists THEN
    RAISE EXCEPTION 'reservation_not_found' USING errcode = 'P0002';
  END IF;

  v_status    := (SELECT status::text FROM public.usage_events WHERE id = p_reservation_id);
  v_salon_id  := (SELECT salon_id     FROM public.usage_events WHERE id = p_reservation_id);
  v_units     := (SELECT units        FROM public.usage_events WHERE id = p_reservation_id);
  v_period_id := (SELECT period_id    FROM public.usage_events WHERE id = p_reservation_id);

  IF v_status IN ('released','expired','failed') THEN
    RETURN;
  END IF;

  IF v_status = 'confirmed' THEN
    -- After-the-fact refund (e.g. marketing SMS bounced)
    UPDATE public.usage_events
       SET status      = 'released',
           reason      = p_reason,
           released_at = now()
     WHERE id = p_reservation_id;

    UPDATE public.usage_periods
       SET quantity_used_confirmed = GREATEST(0, quantity_used_confirmed - v_units)
     WHERE id = v_period_id;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_salon_id::text, 42));

  UPDATE public.usage_events
     SET status      = 'released',
         reason      = p_reason,
         released_at = now()
   WHERE id = p_reservation_id;

  UPDATE public.usage_periods
     SET quantity_reserved = GREATEST(0, quantity_reserved - v_units)
   WHERE id = v_period_id;
END;
$$;

-- ============================================================
-- 4. get_usage_summary
-- ============================================================
DROP FUNCTION IF EXISTS public.get_usage_summary(uuid, date);

CREATE FUNCTION public.get_usage_summary(
  p_salon_id uuid,
  p_period_start date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_plan_id     uuid;
  v_cap_cents   int;
  v_hard_cap    boolean;
  v_period      date;
  v_per_sku     jsonb;
  v_total       int;
BEGIN
  v_period := COALESCE(p_period_start, date_trunc('month', (now() AT TIME ZONE 'utc'))::date);

  v_plan_id := (
    SELECT s.plan_id FROM public.subscriptions s
     WHERE s.salon_id = p_salon_id
       AND s.status IN ('trialing','active','past_due')
     ORDER BY s.created_at DESC LIMIT 1
  );

  v_cap_cents := (SELECT overage_cap_cents_per_month FROM public.salon_billing_config WHERE salon_id = p_salon_id);
  v_hard_cap  := (SELECT hard_cap                    FROM public.salon_billing_config WHERE salon_id = p_salon_id);
  v_cap_cents := COALESCE(v_cap_cents, 20000);
  v_hard_cap  := COALESCE(v_hard_cap, true);

  v_per_sku := (
    SELECT COALESCE(jsonb_agg(to_jsonb(t.*) ORDER BY t.sku), '[]'::jsonb)
    FROM (
      SELECT
        ms.sku::text                                       AS sku,
        CASE ms.sku::text
          WHEN 'sms_reminder'    THEN (SELECT COALESCE(included_sms_reminder, 0)    FROM public.plans WHERE id = v_plan_id)
          WHEN 'sms_marketing'   THEN (SELECT COALESCE(included_sms_marketing, 0)   FROM public.plans WHERE id = v_plan_id)
          WHEN 'email_reminder'  THEN (SELECT COALESCE(included_email_reminder, 0)  FROM public.plans WHERE id = v_plan_id)
          WHEN 'email_marketing' THEN (SELECT COALESCE(included_email_marketing, 0) FROM public.plans WHERE id = v_plan_id)
          ELSE 0
        END                                                AS quota_included,
        COALESCE(up.quantity_used_confirmed, 0)            AS used,
        COALESCE(up.quantity_reserved, 0)                  AS reserved,
        GREATEST(
          0,
          COALESCE(up.quantity_used_confirmed, 0)
          + COALESCE(up.quantity_reserved, 0)
          - CASE ms.sku::text
              WHEN 'sms_reminder'    THEN (SELECT COALESCE(included_sms_reminder, 0)    FROM public.plans WHERE id = v_plan_id)
              WHEN 'sms_marketing'   THEN (SELECT COALESCE(included_sms_marketing, 0)   FROM public.plans WHERE id = v_plan_id)
              WHEN 'email_reminder'  THEN (SELECT COALESCE(included_email_reminder, 0)  FROM public.plans WHERE id = v_plan_id)
              WHEN 'email_marketing' THEN (SELECT COALESCE(included_email_marketing, 0) FROM public.plans WHERE id = v_plan_id)
              ELSE 0
            END
        )                                                  AS overage_units,
        GREATEST(
          0,
          COALESCE(up.quantity_used_confirmed, 0)
          + COALESCE(up.quantity_reserved, 0)
          - CASE ms.sku::text
              WHEN 'sms_reminder'    THEN (SELECT COALESCE(included_sms_reminder, 0)    FROM public.plans WHERE id = v_plan_id)
              WHEN 'sms_marketing'   THEN (SELECT COALESCE(included_sms_marketing, 0)   FROM public.plans WHERE id = v_plan_id)
              WHEN 'email_reminder'  THEN (SELECT COALESCE(included_email_reminder, 0)  FROM public.plans WHERE id = v_plan_id)
              WHEN 'email_marketing' THEN (SELECT COALESCE(included_email_marketing, 0) FROM public.plans WHERE id = v_plan_id)
              ELSE 0
            END
        ) * ms.unit_price_cents                            AS overage_cents,
        ms.unit_price_cents                                AS unit_price_cents
      FROM public.metered_skus ms
      LEFT JOIN public.usage_periods up
             ON up.salon_id = p_salon_id
            AND up.period_start = v_period
            AND up.sku = ms.sku
    ) t
  );

  v_total := (
    SELECT COALESCE(SUM((elem->>'overage_cents')::int), 0)
    FROM jsonb_array_elements(v_per_sku) elem
  );

  RETURN jsonb_build_object(
    'period_start',        v_period,
    'per_sku',             v_per_sku,
    'total_overage_cents', v_total,
    'cap_cents',           v_cap_cents,
    'hard_cap',            v_hard_cap,
    'cap_reached',         v_total >= v_cap_cents AND v_cap_cents > 0
  );
END;
$$;

-- ============================================================
-- 5. expire_stale_reservations
-- ============================================================
DROP FUNCTION IF EXISTS public.expire_stale_reservations();

CREATE FUNCTION public.expire_stale_reservations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_rec   record;
BEGIN
  FOR v_rec IN
    SELECT id, period_id, units
      FROM public.usage_events
     WHERE status = 'reserved'
       AND reserved_at < now() - INTERVAL '10 minutes'
     ORDER BY reserved_at
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.usage_events
       SET status      = 'expired',
           reason      = 'stale_reservation_timeout',
           released_at = now()
     WHERE id = v_rec.id;

    UPDATE public.usage_periods
       SET quantity_reserved = GREATEST(0, quantity_reserved - v_rec.units)
     WHERE id = v_rec.period_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================
-- 6. update_salon_billing_config
-- ============================================================
DROP FUNCTION IF EXISTS public.update_salon_billing_config(uuid, int, boolean);

CREATE FUNCTION public.update_salon_billing_config(
  p_salon_id uuid,
  p_cap_cents int,
  p_hard_cap boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner  boolean;
  v_auto_topup boolean;
BEGIN
  v_is_owner := EXISTS (
    SELECT 1 FROM public.salons WHERE id = p_salon_id AND owner_id = auth.uid()
  );

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'not_salon_owner' USING errcode = '42501';
  END IF;

  IF p_cap_cents IS NULL OR p_cap_cents < 5000 OR p_cap_cents > 100000 THEN
    RAISE EXCEPTION 'cap_out_of_range' USING errcode = '22023';
  END IF;

  IF p_hard_cap IS NULL THEN
    RAISE EXCEPTION 'hard_cap_required' USING errcode = '22023';
  END IF;

  INSERT INTO public.salon_billing_config (salon_id, overage_cap_cents_per_month, hard_cap)
    VALUES (p_salon_id, p_cap_cents, p_hard_cap)
  ON CONFLICT (salon_id) DO UPDATE
    SET overage_cap_cents_per_month = EXCLUDED.overage_cap_cents_per_month,
        hard_cap                    = EXCLUDED.hard_cap;

  v_auto_topup := (SELECT auto_topup FROM public.salon_billing_config WHERE salon_id = p_salon_id);

  RETURN jsonb_build_object(
    'salon_id',                     p_salon_id,
    'overage_cap_cents_per_month',  p_cap_cents,
    'overage_cap_ron_per_month',    p_cap_cents / 100.0,
    'hard_cap',                     p_hard_cap,
    'auto_topup',                   v_auto_topup
  );
END;
$$;

-- ============================================================
-- Permissions
-- ============================================================
REVOKE ALL ON FUNCTION public.reserve_usage(uuid, text, int, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_usage(uuid, text, text)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_usage(uuid, text)                        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_usage_summary(uuid, date)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_stale_reservations()                      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_salon_billing_config(uuid, int, boolean)  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reserve_usage(uuid, text, int, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_usage(uuid, text, text)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_usage(uuid, text)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.get_usage_summary(uuid, date)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_reservations()                      TO service_role;
GRANT EXECUTE ON FUNCTION public.update_salon_billing_config(uuid, int, boolean)  TO authenticated;
