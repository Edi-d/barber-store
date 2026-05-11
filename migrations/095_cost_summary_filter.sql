-- Migration 095: Fix get_campaign_cost_summary to only count overage.
-- Previous version summed total_cents across all funding tiers, showing
-- "gross cost" post-send instead of "billable cost". Aligns with compose-time
-- estimate which only shows overage.
--
-- Note: migration 090 already filters aggregate_confirmed_usage by
-- funding_source='overage' for Stripe reporting — this is the sibling fix.

BEGIN;

DROP FUNCTION IF EXISTS public.get_campaign_cost_summary(uuid);

CREATE FUNCTION public.get_campaign_cost_summary(
  p_campaign_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_total_reservations int;
  v_sent_count         int;
  v_failed_count       int;
  v_billable_cents     int;
  v_gross_cents        int;
  v_included_units     int;
  v_pack_units         int;
  v_overage_units      int;
BEGIN
  v_total_reservations := (
    SELECT COUNT(*)::int FROM public.usage_events
     WHERE related_entity_type = 'campaign' AND related_entity_id = p_campaign_id
  );

  v_sent_count := (
    SELECT COUNT(*)::int FROM public.usage_events
     WHERE related_entity_type = 'campaign' AND related_entity_id = p_campaign_id
       AND status = 'confirmed'
  );

  v_failed_count := (
    SELECT COUNT(*)::int FROM public.usage_events
     WHERE related_entity_type = 'campaign' AND related_entity_id = p_campaign_id
       AND status IN ('released','failed','expired')
  );

  -- Billable = what the salon actually pays (overage only).
  v_billable_cents := (
    SELECT COALESCE(SUM(total_cents), 0)::int FROM public.usage_events
     WHERE related_entity_type = 'campaign' AND related_entity_id = p_campaign_id
       AND status = 'confirmed'
       AND funding_source = 'overage'
  );

  -- Gross = what the campaign WOULD cost at overage rate (for comparison).
  v_gross_cents := (
    SELECT COALESCE(SUM(total_cents), 0)::int FROM public.usage_events
     WHERE related_entity_type = 'campaign' AND related_entity_id = p_campaign_id
       AND status = 'confirmed'
  );

  v_included_units := (
    SELECT COALESCE(SUM(units), 0)::int FROM public.usage_events
     WHERE related_entity_type = 'campaign' AND related_entity_id = p_campaign_id
       AND status = 'confirmed' AND funding_source = 'included'
  );

  v_pack_units := (
    SELECT COALESCE(SUM(units), 0)::int FROM public.usage_events
     WHERE related_entity_type = 'campaign' AND related_entity_id = p_campaign_id
       AND status = 'confirmed' AND funding_source = 'pack'
  );

  v_overage_units := (
    SELECT COALESCE(SUM(units), 0)::int FROM public.usage_events
     WHERE related_entity_type = 'campaign' AND related_entity_id = p_campaign_id
       AND status = 'confirmed' AND funding_source = 'overage'
  );

  RETURN jsonb_build_object(
    'total_reservations',  v_total_reservations,
    'sent_count',          v_sent_count,
    'failed_count',        v_failed_count,
    'total_cost_cents',    v_billable_cents,  -- what user was billed
    'gross_cost_cents',    v_gross_cents,     -- hypothetical if all overage
    'from_included_units', v_included_units,
    'from_pack_units',     v_pack_units,
    'overage_units',       v_overage_units,
    'overage_cents',       v_billable_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_campaign_cost_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campaign_cost_summary(uuid) TO authenticated, service_role;

COMMIT;
