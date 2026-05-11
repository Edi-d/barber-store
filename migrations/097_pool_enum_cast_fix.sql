-- Migration 097: Fix all pool text/enum cast bugs in reserve/release functions.
-- Declares v_pool as public.credit_pool enum (instead of text), which enables
-- direct comparison with credit_ledger.pool column.

BEGIN;

-- ============================================================
-- 1. reserve_usage (single-unit, 3-tier)
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
  v_existing_funding   text;
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
  v_funding_source     text;
  v_pool               public.credit_pool;
  v_pack_balance       int;
  v_pack_balance_after int;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity' USING errcode = '22023';
  END IF;
  IF p_quantity <> 1 THEN
    RAISE EXCEPTION 'quantity_not_supported' USING errcode = '22023';
  END IF;

  BEGIN
    v_sku := p_sku::public.usage_sku;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_sku' USING errcode = '22023';
  END;

  IF p_idempotency_key IS NOT NULL THEN
    v_existing_id := (
      SELECT id FROM public.usage_events
       WHERE salon_id = p_salon_id AND idempotency_key = p_idempotency_key
       LIMIT 1
    );
    IF v_existing_id IS NOT NULL THEN
      v_existing_price   := (SELECT unit_price_cents FROM public.usage_events WHERE id = v_existing_id);
      v_existing_total   := (SELECT total_cents       FROM public.usage_events WHERE id = v_existing_id);
      v_existing_ref     := (SELECT external_ref      FROM public.usage_events WHERE id = v_existing_id);
      v_existing_status  := (SELECT status::text      FROM public.usage_events WHERE id = v_existing_id);
      v_existing_funding := (SELECT funding_source    FROM public.usage_events WHERE id = v_existing_id);

      RETURN jsonb_build_object(
        'status', 'duplicate',
        'reservation_id', v_existing_id,
        'unit_price_cents', v_existing_price,
        'total_cents', v_existing_total,
        'cost_cents', v_existing_total,
        'provider_id', v_existing_ref,
        'sent', v_existing_status = 'confirmed',
        'event_status', v_existing_status,
        'funding_source', v_existing_funding
      );
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_salon_id::text, 42));

  v_unit_price := (SELECT unit_price_cents FROM public.metered_skus WHERE sku = v_sku);
  IF v_unit_price IS NULL THEN
    RAISE EXCEPTION 'unknown_sku' USING errcode = 'P0002';
  END IF;

  v_plan_id := (
    SELECT s.plan_id FROM public.subscriptions s
     WHERE s.salon_id = p_salon_id AND s.status IN ('trialing','active','past_due')
     ORDER BY s.created_at DESC LIMIT 1
  );
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'no_active_plan' USING errcode = 'P0002';
  END IF;

  v_included := CASE p_sku
    WHEN 'sms_reminder'    THEN (SELECT COALESCE(included_sms_reminder, 0)    FROM public.plans WHERE id = v_plan_id)
    WHEN 'sms_marketing'   THEN (SELECT COALESCE(included_sms_marketing, 0)   FROM public.plans WHERE id = v_plan_id)
    WHEN 'email_reminder'  THEN (SELECT COALESCE(included_email_reminder, 0)  FROM public.plans WHERE id = v_plan_id)
    WHEN 'email_marketing' THEN (SELECT COALESCE(included_email_marketing, 0) FROM public.plans WHERE id = v_plan_id)
    ELSE 0
  END;
  v_included := COALESCE(v_included, 0);

  INSERT INTO public.salon_billing_config (salon_id) VALUES (p_salon_id)
    ON CONFLICT (salon_id) DO NOTHING;

  v_cap_cents := COALESCE((SELECT overage_cap_cents_per_month FROM public.salon_billing_config WHERE salon_id = p_salon_id), 20000);
  v_hard_cap  := COALESCE((SELECT hard_cap                    FROM public.salon_billing_config WHERE salon_id = p_salon_id), true);

  v_period_start := date_trunc('month', (now() AT TIME ZONE 'utc'))::date;
  v_period_end   := (v_period_start + INTERVAL '1 month')::date;

  INSERT INTO public.usage_periods (
    salon_id, period_start, period_end, sku, quota_included,
    quantity_used_confirmed, quantity_reserved
  )
  VALUES (p_salon_id, v_period_start, v_period_end, v_sku, v_included, 0, 0)
  ON CONFLICT (salon_id, period_start, sku) DO UPDATE
    SET quota_included = EXCLUDED.quota_included
  RETURNING id INTO v_period_id;

  v_used     := (SELECT quantity_used_confirmed FROM public.usage_periods WHERE id = v_period_id);
  v_reserved := (SELECT quantity_reserved       FROM public.usage_periods WHERE id = v_period_id);
  v_total_cents := p_quantity * v_unit_price;

  IF (v_used + v_reserved) < v_included THEN
    v_funding_source := 'included';
    v_overage_units  := 0;
    v_overage_cents  := 0;
  ELSE
    v_pool := CASE p_sku
      WHEN 'sms_reminder'    THEN 'sms_reminder'::public.credit_pool
      WHEN 'sms_marketing'   THEN 'sms_marketing'::public.credit_pool
      WHEN 'email_reminder'  THEN 'email'::public.credit_pool
      WHEN 'email_marketing' THEN 'email'::public.credit_pool
      ELSE NULL
    END;

    IF v_pool IS NOT NULL THEN
      v_pack_balance := (
        SELECT COALESCE(SUM(delta), 0)::int FROM public.credit_ledger
         WHERE salon_id = p_salon_id AND pool = v_pool
      );
    ELSE
      v_pack_balance := 0;
    END IF;

    IF v_pack_balance >= p_quantity THEN
      v_funding_source := 'pack';
      v_overage_units  := 0;
      v_overage_cents  := 0;
    ELSE
      v_funding_source := 'overage';
      v_overage_units  := p_quantity;
      v_overage_cents  := v_overage_units * v_unit_price;

      v_existing_over := (
        SELECT COALESCE(SUM(
          GREATEST(0, (up.quantity_used_confirmed + up.quantity_reserved) - COALESCE(up.quota_included, 0))
          * ms.unit_price_cents
        ), 0)
        FROM public.usage_periods up
        JOIN public.metered_skus ms ON ms.sku = up.sku
        WHERE up.salon_id = p_salon_id AND up.period_start = v_period_start
      );

      v_over_cap := (v_existing_over + v_overage_cents) > v_cap_cents AND v_overage_cents > 0;

      IF v_over_cap AND v_hard_cap THEN
        RETURN jsonb_build_object(
          'status', 'cap_exceeded',
          'overage_cents', v_overage_cents,
          'existing_overage', v_existing_over,
          'cap_cents', v_cap_cents,
          'cap_remaining', GREATEST(0, v_cap_cents - v_existing_over)
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.usage_events (
    salon_id, sku, units, unit_price_cents, total_cents,
    status, idempotency_key, period_id,
    related_entity_type, related_entity_id,
    billing_period_start, reserved_at, funding_source
  ) VALUES (
    p_salon_id, v_sku, p_quantity, v_unit_price, v_total_cents,
    'reserved', p_idempotency_key, v_period_id,
    p_related_entity_type, p_related_entity_id,
    v_period_start, now(), v_funding_source
  )
  RETURNING id INTO v_reservation_id;

  IF v_funding_source = 'pack' THEN
    INSERT INTO public.credit_ledger (salon_id, pool, delta, reason, usage_event_id)
    VALUES (p_salon_id, v_pool, -p_quantity, 'consumption', v_reservation_id);

    v_pack_balance_after := (
      SELECT COALESCE(SUM(delta), 0)::int FROM public.credit_ledger
       WHERE salon_id = p_salon_id AND pool = v_pool
    );
  END IF;

  UPDATE public.usage_periods SET quantity_reserved = quantity_reserved + p_quantity WHERE id = v_period_id;

  RETURN jsonb_build_object(
    'status', 'reserved',
    'reservation_id', v_reservation_id,
    'unit_price_cents', v_unit_price,
    'total_cents', v_total_cents,
    'cost_cents', v_total_cents,
    'funding_source', v_funding_source,
    'pack_balance_after', v_pack_balance_after,
    'over_cap', v_over_cap,
    'overage_units', v_overage_units,
    'overage_cents', v_overage_cents
  );
END;
$$;

-- ============================================================
-- 2. release_usage (single-unit, refunds pack on release)
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
  v_status    text;
  v_salon_id  uuid;
  v_units     int;
  v_period_id uuid;
  v_sku       text;
  v_funding   text;
  v_pool      public.credit_pool;
  v_exists    boolean;
BEGIN
  PERFORM 1 FROM public.usage_events WHERE id = p_reservation_id FOR UPDATE;
  v_exists := FOUND;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'reservation_not_found' USING errcode = 'P0002';
  END IF;

  v_status    := (SELECT status::text    FROM public.usage_events WHERE id = p_reservation_id);
  v_salon_id  := (SELECT salon_id        FROM public.usage_events WHERE id = p_reservation_id);
  v_units     := (SELECT units           FROM public.usage_events WHERE id = p_reservation_id);
  v_period_id := (SELECT period_id       FROM public.usage_events WHERE id = p_reservation_id);
  v_sku       := (SELECT sku::text       FROM public.usage_events WHERE id = p_reservation_id);
  v_funding   := (SELECT funding_source  FROM public.usage_events WHERE id = p_reservation_id);

  IF v_status IN ('released','expired','failed') THEN RETURN; END IF;

  v_pool := CASE v_sku
    WHEN 'sms_reminder'    THEN 'sms_reminder'::public.credit_pool
    WHEN 'sms_marketing'   THEN 'sms_marketing'::public.credit_pool
    WHEN 'email_reminder'  THEN 'email'::public.credit_pool
    WHEN 'email_marketing' THEN 'email'::public.credit_pool
    ELSE NULL
  END;

  IF v_status = 'confirmed' THEN
    UPDATE public.usage_events SET status = 'released', reason = p_reason, released_at = now() WHERE id = p_reservation_id;
    UPDATE public.usage_periods SET quantity_used_confirmed = GREATEST(0, quantity_used_confirmed - v_units) WHERE id = v_period_id;
    IF v_funding = 'pack' AND v_pool IS NOT NULL THEN
      INSERT INTO public.credit_ledger (salon_id, pool, delta, reason, usage_event_id)
      VALUES (v_salon_id, v_pool, v_units, 'refund', p_reservation_id);
    END IF;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_salon_id::text, 42));

  UPDATE public.usage_events SET status = 'released', reason = p_reason, released_at = now() WHERE id = p_reservation_id;
  UPDATE public.usage_periods SET quantity_reserved = GREATEST(0, quantity_reserved - v_units) WHERE id = v_period_id;

  IF v_funding = 'pack' AND v_pool IS NOT NULL THEN
    INSERT INTO public.credit_ledger (salon_id, pool, delta, reason, usage_event_id)
    VALUES (v_salon_id, v_pool, v_units, 'refund', p_reservation_id);
  END IF;
END;
$$;

-- ============================================================
-- Permissions (same as 090/092)
-- ============================================================
REVOKE ALL ON FUNCTION public.reserve_usage(uuid, text, int, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_usage(uuid, text)                        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_usage(uuid, text, int, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_usage(uuid, text)                        TO service_role;

-- ============================================================
-- NOTE: reserve_usage_bulk and release_usage_bulk in migration 092 also
-- have v_pool declared as text. If you use bulk flow, paste the bulk
-- variants separately as migration 098. For single-unit flow this is
-- sufficient.
-- ============================================================

COMMIT;
