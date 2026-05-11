-- ============================================================
-- 066 — Client Intelligence RPC functions
-- ============================================================

-- ─── 1. get_client_intelligence ─────────────────────────────
-- Returns detailed client analytics for a salon: CLV, churn risk,
-- segmentation, visit patterns, and spend data.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_client_intelligence(p_salon_id UUID)
RETURNS TABLE (
  user_id           UUID,
  display_name      TEXT,
  avatar_url        TEXT,
  clv_score         NUMERIC,
  churn_risk_score  INT,
  segment           TEXT,
  last_visit_date   DATE,
  visit_count       BIGINT,
  total_spent_cents BIGINT,
  avg_spent_per_visit NUMERIC,
  avg_days_between_visits NUMERIC,
  days_since_last_visit INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Ownership / membership check
  SELECT s.owner_id INTO v_owner_id
  FROM salons s
  WHERE s.id = p_salon_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Salon not found';
  END IF;

  IF v_owner_id != auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM salon_members sm
       WHERE sm.salon_id = p_salon_id AND sm.profile_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH client_appointments AS (
    SELECT
      a.user_id AS cid,
      COUNT(*)::BIGINT AS cnt,
      SUM(a.total_cents)::BIGINT AS total_cents,
      AVG(a.total_cents)::NUMERIC AS avg_cents,
      MAX(a.scheduled_at::date) AS last_visit,
      MIN(a.scheduled_at::date) AS first_visit,
      (CURRENT_DATE - MAX(a.scheduled_at::date))::INT AS days_since
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status = 'completed'
    GROUP BY a.user_id
  ),
  client_cycle AS (
    SELECT
      ca.cid,
      ca.cnt,
      ca.total_cents,
      ca.avg_cents,
      ca.last_visit,
      ca.first_visit,
      ca.days_since,
      CASE
        WHEN ca.cnt > 1
        THEN ((ca.last_visit - ca.first_visit)::NUMERIC / (ca.cnt - 1))
        ELSE NULL
      END AS avg_cycle
    FROM client_appointments ca
  ),
  client_metrics AS (
    SELECT
      cc.cid,
      cc.cnt,
      cc.total_cents,
      cc.avg_cents,
      cc.last_visit,
      cc.days_since,
      COALESCE(cc.avg_cycle, 30) AS avg_cycle,
      -- CLV = avg_revenue * visits_per_year * predicted_years
      CASE
        WHEN cc.avg_cycle > 0
        THEN (cc.avg_cents / 100.0) * (365.0 / GREATEST(COALESCE(cc.avg_cycle, 30), 1)) *
             LEAST(GREATEST(cc.cnt::NUMERIC / 4.0, 1), 5)
        ELSE (cc.avg_cents / 100.0) * 12
      END AS clv,
      -- Churn risk scoring (0-100)
      CASE
        WHEN cc.cnt = 1 AND cc.days_since > 60 THEN 80
        WHEN cc.cnt = 1 THEN 40
        WHEN cc.avg_cycle IS NOT NULL AND cc.avg_cycle > 0 THEN
          LEAST(100, GREATEST(0,
            ROUND((cc.days_since::NUMERIC / GREATEST(cc.avg_cycle, 1)) * 40)::INT
          ))
        ELSE 50
      END AS risk,
      -- Segmentation
      CASE
        WHEN cc.cnt >= 10 AND cc.total_cents >= 200000 THEN 'vip'
        WHEN cc.days_since > 180 THEN 'lost'
        WHEN cc.avg_cycle IS NOT NULL AND cc.days_since > cc.avg_cycle * 2 THEN 'at_risk'
        WHEN cc.cnt = 1 AND cc.days_since <= 60 THEN 'new'
        WHEN cc.cnt >= 4 THEN 'regular'
        ELSE 'occasional'
      END AS seg
    FROM client_cycle cc
  )
  SELECT
    cm.cid AS user_id,
    COALESCE(p.display_name, p.username, 'Client')::TEXT AS display_name,
    p.avatar_url::TEXT,
    ROUND(cm.clv, 2) AS clv_score,
    cm.risk AS churn_risk_score,
    cm.seg AS segment,
    cm.last_visit AS last_visit_date,
    cm.cnt AS visit_count,
    cm.total_cents AS total_spent_cents,
    ROUND(cm.avg_cents, 0) AS avg_spent_per_visit,
    ROUND(cm.avg_cycle, 1) AS avg_days_between_visits,
    cm.days_since AS days_since_last_visit
  FROM client_metrics cm
  JOIN profiles p ON p.id = cm.cid
  ORDER BY cm.clv DESC;
END;
$$;


-- ─── 2. get_cohort_retention ────────────────────────────────
-- Returns month-over-month cohort retention analysis as JSONB.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_cohort_retention(
  p_salon_id UUID,
  p_months   INT DEFAULT 12
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_result   JSONB;
BEGIN
  -- Ownership / membership check
  SELECT s.owner_id INTO v_owner_id
  FROM salons s
  WHERE s.id = p_salon_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Salon not found';
  END IF;

  IF v_owner_id != auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM salon_members sm
       WHERE sm.salon_id = p_salon_id AND sm.profile_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH first_visits AS (
    -- Each client's first completed visit month
    SELECT
      a.user_id,
      DATE_TRUNC('month', MIN(a.scheduled_at))::DATE AS cohort_month
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at >= (CURRENT_DATE - (p_months || ' months')::INTERVAL)
    GROUP BY a.user_id
  ),
  all_visit_months AS (
    -- Every month each client visited
    SELECT DISTINCT
      a.user_id,
      DATE_TRUNC('month', a.scheduled_at)::DATE AS visit_month
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at >= (CURRENT_DATE - (p_months || ' months')::INTERVAL)
  ),
  cohort_data AS (
    SELECT
      fv.cohort_month,
      COUNT(DISTINCT fv.user_id) AS new_clients,
      vm.visit_month,
      -- months_since = difference in months between visit_month and cohort_month
      EXTRACT(YEAR FROM AGE(vm.visit_month, fv.cohort_month)) * 12
        + EXTRACT(MONTH FROM AGE(vm.visit_month, fv.cohort_month)) AS months_since,
      COUNT(DISTINCT vm.user_id) AS active_clients
    FROM first_visits fv
    LEFT JOIN all_visit_months vm
      ON vm.user_id = fv.user_id
      AND vm.visit_month >= fv.cohort_month
    GROUP BY fv.cohort_month, vm.visit_month
  ),
  cohort_sizes AS (
    SELECT cohort_month, COUNT(DISTINCT user_id) AS size
    FROM first_visits
    GROUP BY cohort_month
  ),
  retention_arrays AS (
    SELECT
      cs.cohort_month,
      cs.size AS new_clients,
      COALESCE(
        jsonb_agg(
          ROUND((cd.active_clients::NUMERIC / GREATEST(cs.size, 1)) * 100, 1)
          ORDER BY cd.months_since
        ) FILTER (WHERE cd.months_since IS NOT NULL AND cd.months_since >= 0),
        '[]'::JSONB
      ) AS retention
    FROM cohort_sizes cs
    LEFT JOIN cohort_data cd
      ON cd.cohort_month = cs.cohort_month
    GROUP BY cs.cohort_month, cs.size
  ),
  summary AS (
    SELECT
      ROUND(
        AVG(
          CASE WHEN jsonb_array_length(ra.retention) > 1
          THEN (ra.retention->1)::NUMERIC
          ELSE NULL END
        ), 1
      ) AS overall_retention_rate,
      (SELECT TO_CHAR(ra2.cohort_month, 'YYYY-MM')
       FROM retention_arrays ra2
       WHERE jsonb_array_length(ra2.retention) > 1
       ORDER BY (ra2.retention->1)::NUMERIC DESC
       LIMIT 1
      ) AS best_cohort,
      (SELECT TO_CHAR(ra3.cohort_month, 'YYYY-MM')
       FROM retention_arrays ra3
       WHERE jsonb_array_length(ra3.retention) > 1
       ORDER BY (ra3.retention->1)::NUMERIC ASC
       LIMIT 1
      ) AS worst_cohort,
      ROUND(AVG(jsonb_array_length(ra.retention))::NUMERIC, 1) AS avg_lifetime_months
    FROM retention_arrays ra
  )
  SELECT jsonb_build_object(
    'cohorts', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'cohort_month', TO_CHAR(ra.cohort_month, 'YYYY-MM'),
          'new_clients', ra.new_clients,
          'retention', ra.retention
        )
        ORDER BY ra.cohort_month
      ), '[]'::JSONB)
      FROM retention_arrays ra
    ),
    'summary', (
      SELECT jsonb_build_object(
        'overall_retention_rate', COALESCE(s.overall_retention_rate, 0),
        'best_cohort', COALESCE(s.best_cohort, ''),
        'worst_cohort', COALESCE(s.worst_cohort, ''),
        'avg_lifetime_months', COALESCE(s.avg_lifetime_months, 0)
      )
      FROM summary s
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ─── 3. get_noshow_predictions ──────────────────────────────
-- Returns risk-scored predictions for today's appointments.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_noshow_predictions(
  p_salon_id UUID,
  p_date     DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_result   JSONB;
BEGIN
  -- Ownership / membership check
  SELECT s.owner_id INTO v_owner_id
  FROM salons s
  WHERE s.id = p_salon_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Salon not found';
  END IF;

  IF v_owner_id != auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM salon_members sm
       WHERE sm.salon_id = p_salon_id AND sm.profile_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH today_appointments AS (
    SELECT
      a.id AS appt_id,
      a.user_id,
      a.barber_id,
      a.service_id,
      a.scheduled_at,
      a.total_cents,
      a.created_at AS booked_at,
      COALESCE(p.display_name, p.username, 'Client')::TEXT AS client_name,
      COALESCE(bs.name, 'Serviciu')::TEXT AS service_name,
      COALESCE(bp.display_name, bp.username, 'Barber')::TEXT AS barber_name
    FROM appointments a
    JOIN barbers bk ON bk.id = a.barber_id
    JOIN profiles p ON p.id = a.user_id
    LEFT JOIN barber_services bs ON bs.id = a.service_id
    LEFT JOIN profiles bp ON bp.id = bk.profile_id
    WHERE bk.salon_id = p_salon_id
      AND a.scheduled_at::DATE = p_date
      AND a.status IN ('confirmed', 'pending')
  ),
  client_history AS (
    SELECT
      hist.user_id,
      COUNT(*) FILTER (WHERE hist.status = 'completed') AS completed_count,
      COUNT(*) FILTER (WHERE hist.status = 'no_show') AS noshow_count,
      COUNT(*) FILTER (WHERE hist.status = 'cancelled') AS cancel_count,
      COUNT(*) AS total_count
    FROM appointments hist
    JOIN barbers bh ON bh.id = hist.barber_id
    WHERE bh.salon_id = p_salon_id
      AND hist.user_id IN (SELECT DISTINCT ta.user_id FROM today_appointments ta)
      AND hist.scheduled_at < p_date
    GROUP BY hist.user_id
  ),
  day_of_week_stats AS (
    SELECT
      a.user_id,
      COUNT(*) FILTER (WHERE a.status = 'no_show') AS dow_noshows,
      COUNT(*) AS dow_total
    FROM appointments a
    JOIN barbers bd ON bd.id = a.barber_id
    WHERE bd.salon_id = p_salon_id
      AND a.user_id IN (SELECT DISTINCT ta.user_id FROM today_appointments ta)
      AND EXTRACT(DOW FROM a.scheduled_at) = EXTRACT(DOW FROM p_date)
      AND a.scheduled_at < p_date
    GROUP BY a.user_id
  ),
  scored AS (
    SELECT
      ta.appt_id,
      ta.client_name,
      ta.scheduled_at,
      ta.service_name,
      ta.barber_name,
      ta.total_cents,
      -- Historical no-show rate (40%)
      COALESCE(
        ROUND((ch.noshow_count::NUMERIC / GREATEST(ch.total_count, 1)) * 100 * 0.40),
        20  -- default risk if no history
      )
      -- Days since booking factor (20%): longer gap = higher risk
      + LEAST(20, ROUND(
          GREATEST(EXTRACT(EPOCH FROM (ta.scheduled_at - ta.booked_at)) / 86400.0, 0) * 0.7
        ))
      -- Day-of-week pattern (20%)
      + COALESCE(
          ROUND((dw.dow_noshows::NUMERIC / GREATEST(dw.dow_total, 1)) * 100 * 0.20),
          5
        )
      -- Cancellation history (20%)
      + COALESCE(
          ROUND((ch.cancel_count::NUMERIC / GREATEST(ch.total_count, 1)) * 100 * 0.20),
          5
        )
      AS risk_raw
    FROM today_appointments ta
    LEFT JOIN client_history ch ON ch.user_id = ta.user_id
    LEFT JOIN day_of_week_stats dw ON dw.user_id = ta.user_id
  ),
  final_scored AS (
    SELECT
      s.*,
      LEAST(100, GREATEST(0, s.risk_raw::INT)) AS risk_score,
      CASE
        WHEN s.risk_raw >= 60 THEN 'Confirma telefonic'
        WHEN s.risk_raw >= 30 THEN 'Cere depozit'
        ELSE 'Trimite reminder'
      END AS suggested_action
    FROM scored s
  ),
  predictions AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'appointment_id', fs.appt_id,
        'client_name', fs.client_name,
        'scheduled_time', TO_CHAR(fs.scheduled_at, 'HH24:MI'),
        'service_name', fs.service_name,
        'barber_name', fs.barber_name,
        'risk_score', fs.risk_score,
        'suggested_action', fs.suggested_action
      )
      ORDER BY fs.risk_score DESC
    ), '[]'::JSONB) AS items
    FROM final_scored fs
  ),
  summary_data AS (
    SELECT
      COUNT(*) AS total_appointments,
      COALESCE(SUM(CASE WHEN fs.risk_score >= 50 THEN 1 ELSE 0 END), 0) AS expected_noshows,
      COALESCE(SUM(CASE WHEN fs.risk_score >= 50 THEN fs.total_cents ELSE 0 END), 0) AS revenue_at_risk
    FROM final_scored fs
  )
  SELECT jsonb_build_object(
    'predictions', pred.items,
    'summary', jsonb_build_object(
      'total_appointments', sd.total_appointments,
      'expected_noshows', sd.expected_noshows,
      'revenue_at_risk', sd.revenue_at_risk
    )
  )
  INTO v_result
  FROM predictions pred, summary_data sd;

  RETURN v_result;
END;
$$;
