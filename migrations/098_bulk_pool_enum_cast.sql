-- Migration 098: Fix v_pool text/enum cast in reserve_usage_bulk and
-- release_usage_bulk (sibling fix to migration 097 for single-unit funcs).

BEGIN;

-- ============================================================
-- 1. reserve_usage_bulk (atomic N-unit, 3-tier)
-- ============================================================
DROP FUNCTION IF EXISTS public.reserve_usage_bulk(uuid, text, int, text, text, uuid);

CREATE FUNCTION public.reserve_usage_bulk(
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
  v_sku                public.usage_sku;
  v_existing_count     int;
  v_existing_ids       uuid[];
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
  v_remaining_included int;
  v_pool               public.credit_pool;
  v_pack_balance       int;
  v_existing_over      int;
  v_cap_remaining      int;
  v_adjusted_qty       int;
  v_units_capped       int;
  v_included_units     int;
  v_pack_units         int;
  v_overage_units      int;
  v_overage_cents      int;
  v_total_cost_cents   int;
  v_max_overage_units  int;
  v_reservation_ids    uuid[];
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity' USING errcode = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    RAISE EXCEPTION 'idempotency_key_required' USING errcode = '22023';
  END IF;

  BEGIN
    v_sku := p_sku::public.usage_sku;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_sku' USING errcode = '22023';
  END;

  v_existing_count := (
    SELECT COUNT(*)::int FROM public.usage_events
     WHERE salon_id = p_salon_id AND idempotency_key LIKE p_idempotency_key || ':%'
  );

  IF v_existing_count > 0 THEN
    v_existing_ids := (
      SELECT COALESCE(array_agg(id ORDER BY reserved_at, id), ARRAY[]::uuid[])
        FROM public.usage_events
       WHERE salon_id = p_salon_id AND idempotency_key LIKE p_idempotency_key || ':%'
    );
    v_total_cost_cents := (
      SELECT COALESCE(SUM(total_cents) FILTER (WHERE funding_source = 'overage'), 0)::int
        FROM public.usage_events
       WHERE salon_id = p_salon_id AND idempotency_key LIKE p_idempotency_key || ':%'
    );
    v_included_units := (
      SELECT COALESCE(SUM(units) FILTER (WHERE funding_source = 'included'), 0)::int
        FROM public.usage_events
       WHERE salon_id = p_salon_id AND idempotency_key LIKE p_idempotency_key || ':%'
    );
    v_pack_units := (
      SELECT COALESCE(SUM(units) FILTER (WHERE funding_source = 'pack'), 0)::int
        FROM public.usage_events
       WHERE salon_id = p_salon_id AND idempotency_key LIKE p_idempotency_key || ':%'
    );
    v_overage_units := (
      SELECT COALESCE(SUM(units) FILTER (WHERE funding_source = 'overage'), 0)::int
        FROM public.usage_events
       WHERE salon_id = p_salon_id AND idempotency_key LIKE p_idempotency_key || ':%'
    );
    v_cap_cents := COALESCE((SELECT overage_cap_cents_per_month FROM public.salon_billing_config WHERE salon_id = p_salon_id), 20000);

    RETURN jsonb_build_object(
      'status', 'duplicate',
      'reservation_ids', to_jsonb(v_existing_ids),
      'funding_breakdown', jsonb_build_object(
        'included_units', v_included_units,
        'pack_units', v_pack_units,
        'overage_units', v_overage_units,
        'included_cents', 0,
        'pack_cents', 0,
        'overage_cents', v_total_cost_cents
      ),
      'total_cost_cents', v_total_cost_cents,
      'units_reserved', v_existing_count,
      'units_capped', 0,
      'cap_remaining_cents', v_cap_cents
    );
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
  ) VALUES (p_salon_id, v_period_start, v_period_end, v_sku, v_included, 0, 0)
  ON CONFLICT (salon_id, period_start, sku) DO UPDATE
    SET quota_included = EXCLUDED.quota_included
  RETURNING id INTO v_period_id;

  v_used     := COALESCE((SELECT quantity_used_confirmed FROM public.usage_periods WHERE id = v_period_id), 0);
  v_reserved := COALESCE((SELECT quantity_reserved       FROM public.usage_periods WHERE id = v_period_id), 0);

  v_remaining_included := GREATEST(0, v_included - (v_used + v_reserved));

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
  v_pack_balance := COALESCE(v_pack_balance, 0);

  v_included_units := LEAST(p_quantity, v_remaining_included);
  v_pack_units     := LEAST(p_quantity - v_included_units, v_pack_balance);
  v_overage_units  := p_quantity - v_included_units - v_pack_units;
  v_overage_cents  := v_overage_units * v_unit_price;

  v_existing_over := COALESCE((
    SELECT SUM(
      GREATEST(0, (up.quantity_used_confirmed + up.quantity_reserved) - COALESCE(up.quota_included, 0))
      * ms.unit_price_cents
    )
    FROM public.usage_periods up
    JOIN public.metered_skus ms ON ms.sku = up.sku
    WHERE up.salon_id = p_salon_id AND up.period_start = v_period_start
  ), 0);

  v_cap_remaining := GREATEST(0, v_cap_cents - v_existing_over);
  v_units_capped  := 0;
  v_adjusted_qty  := p_quantity;

  IF v_hard_cap AND v_overage_units > 0 AND (v_existing_over + v_overage_cents) > v_cap_cents THEN
    v_max_overage_units := GREATEST(0, (v_cap_cents - v_existing_over) / v_unit_price);
    IF v_max_overage_units = 0 AND v_included_units = 0 AND v_pack_units = 0 THEN
      RETURN jsonb_build_object(
        'status', 'cap_exceeded',
        'reservation_ids', '[]'::jsonb,
        'funding_breakdown', jsonb_build_object(
          'included_units', 0, 'pack_units', 0, 'overage_units', 0,
          'included_cents', 0, 'pack_cents', 0, 'overage_cents', 0
        ),
        'total_cost_cents', 0,
        'units_reserved', 0,
        'units_capped', p_quantity,
        'cap_remaining_cents', v_cap_remaining
      );
    END IF;
    v_units_capped  := v_overage_units - v_max_overage_units;
    v_overage_units := v_max_overage_units;
    v_overage_cents := v_overage_units * v_unit_price;
    v_adjusted_qty  := v_included_units + v_pack_units + v_overage_units;
  END IF;

  IF v_adjusted_qty <= 0 THEN
    RETURN jsonb_build_object(
      'status', 'cap_exceeded',
      'reservation_ids', '[]'::jsonb,
      'funding_breakdown', jsonb_build_object(
        'included_units', 0, 'pack_units', 0, 'overage_units', 0,
        'included_cents', 0, 'pack_cents', 0, 'overage_cents', 0
      ),
      'total_cost_cents', 0,
      'units_reserved', 0,
      'units_capped', p_quantity,
      'cap_remaining_cents', v_cap_remaining
    );
  END IF;

  v_total_cost_cents := v_overage_cents;

  WITH inserted AS (
    INSERT INTO public.usage_events (
      salon_id, sku, units, unit_price_cents, total_cents,
      status, idempotency_key, period_id,
      related_entity_type, related_entity_id,
      billing_period_start, reserved_at, funding_source
    )
    SELECT
      p_salon_id, v_sku, 1, v_unit_price, v_unit_price,
      'reserved',
      p_idempotency_key || ':' || g::text,
      v_period_id,
      p_related_entity_type, p_related_entity_id,
      v_period_start, now(),
      CASE
        WHEN g <= v_included_units                              THEN 'included'
        WHEN g <= v_included_units + v_pack_units               THEN 'pack'
        ELSE 'overage'
      END
    FROM generate_series(1, v_adjusted_qty) AS g
    RETURNING id, reserved_at
  )
  SELECT COALESCE(array_agg(id ORDER BY reserved_at, id), ARRAY[]::uuid[])
    INTO v_reservation_ids
    FROM inserted;

  IF v_pack_units > 0 AND v_pool IS NOT NULL THEN
    INSERT INTO public.credit_ledger (salon_id, pool, delta, reason, usage_event_id)
    VALUES (p_salon_id, v_pool, -v_pack_units, 'consumption', v_reservation_ids[1]);
  END IF;

  UPDATE public.usage_periods
     SET quantity_reserved = quantity_reserved + v_adjusted_qty
   WHERE id = v_period_id;

  RETURN jsonb_build_object(
    'status', 'reserved',
    'reservation_ids', to_jsonb(v_reservation_ids),
    'funding_breakdown', jsonb_build_object(
      'included_units', v_included_units,
      'pack_units', v_pack_units,
      'overage_units', v_overage_units,
      'included_cents', 0,
      'pack_cents', 0,
      'overage_cents', v_overage_cents
    ),
    'total_cost_cents', v_total_cost_cents,
    'units_reserved', v_adjusted_qty,
    'units_capped', v_units_capped,
    'cap_remaining_cents', GREATEST(0, v_cap_cents - v_existing_over - v_overage_cents)
  );
END;
$$;

-- ============================================================
-- 2. release_usage_bulk (refund with proper enum cast)
-- ============================================================
DROP FUNCTION IF EXISTS public.release_usage_bulk(uuid[], text);

CREATE FUNCTION public.release_usage_bulk(
  p_reservation_ids uuid[],
  p_reason text DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_rec   record;
  v_pool  public.credit_pool;
BEGIN
  IF p_reservation_ids IS NULL OR array_length(p_reservation_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_rec IN
    SELECT id, salon_id, status::text AS status, units, period_id,
           sku::text AS sku, funding_source
      FROM public.usage_events
     WHERE id = ANY(p_reservation_ids)
     ORDER BY id
     FOR UPDATE
  LOOP
    IF v_rec.status IN ('released','expired','failed') THEN CONTINUE; END IF;

    v_pool := CASE v_rec.sku
      WHEN 'sms_reminder'    THEN 'sms_reminder'::public.credit_pool
      WHEN 'sms_marketing'   THEN 'sms_marketing'::public.credit_pool
      WHEN 'email_reminder'  THEN 'email'::public.credit_pool
      WHEN 'email_marketing' THEN 'email'::public.credit_pool
      ELSE NULL
    END;

    IF v_rec.status = 'confirmed' THEN
      UPDATE public.usage_events SET status = 'released', reason = p_reason, released_at = now() WHERE id = v_rec.id;
      UPDATE public.usage_periods SET quantity_used_confirmed = GREATEST(0, quantity_used_confirmed - v_rec.units) WHERE id = v_rec.period_id;
      IF v_rec.funding_source = 'pack' AND v_pool IS NOT NULL THEN
        INSERT INTO public.credit_ledger (salon_id, pool, delta, reason, usage_event_id)
        VALUES (v_rec.salon_id, v_pool, v_rec.units, 'refund', v_rec.id);
      END IF;
      v_count := v_count + 1;
      CONTINUE;
    END IF;

    IF v_rec.status = 'reserved' THEN
      UPDATE public.usage_events SET status = 'released', reason = p_reason, released_at = now() WHERE id = v_rec.id;
      UPDATE public.usage_periods SET quantity_reserved = GREATEST(0, quantity_reserved - v_rec.units) WHERE id = v_rec.period_id;
      IF v_rec.funding_source = 'pack' AND v_pool IS NOT NULL THEN
        INSERT INTO public.credit_ledger (salon_id, pool, delta, reason, usage_event_id)
        VALUES (v_rec.salon_id, v_pool, v_rec.units, 'refund', v_rec.id);
      END IF;
      v_count := v_count + 1;
      CONTINUE;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_usage_bulk(uuid, text, int, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_usage_bulk(uuid[], text)                      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_usage_bulk(uuid, text, int, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_usage_bulk(uuid[], text)                      TO service_role;

COMMIT;
