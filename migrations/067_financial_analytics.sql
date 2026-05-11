-- ============================================================
-- 067 — Financial Analytics: tables + RPC functions
-- ============================================================

-- ─── 1. Salon Overhead Config ───────────────────────────────
CREATE TABLE IF NOT EXISTS salon_overhead_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  overhead_type TEXT NOT NULL,          -- 'per_service_pct', 'fixed_monthly'
  label TEXT NOT NULL,                  -- Romanian label e.g. 'Chirie', 'Utilitati'
  amount_cents INT NOT NULL DEFAULT 0,
  is_percentage BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salon_overhead_config_salon
  ON salon_overhead_config(salon_id);

ALTER TABLE salon_overhead_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their overhead config"
  ON salon_overhead_config FOR ALL
  USING (salon_id IN (SELECT id FROM salons WHERE owner_id = auth.uid()))
  WITH CHECK (salon_id IN (SELECT id FROM salons WHERE owner_id = auth.uid()));

-- ─── 2. Smart Alerts ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS smart_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'client_churn','revenue_decline','low_occupancy',
    'staff_performance','inventory_low','trend_change','opportunity'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical','warning','info','opportunity')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_alerts_salon
  ON smart_alerts(salon_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_smart_alerts_unread
  ON smart_alerts(salon_id, is_read) WHERE NOT is_read;

ALTER TABLE smart_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their alerts"
  ON smart_alerts FOR ALL
  USING (salon_id IN (SELECT id FROM salons WHERE owner_id = auth.uid()))
  WITH CHECK (salon_id IN (SELECT id FROM salons WHERE owner_id = auth.uid()));

-- ─── 3. Salon Expenses ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS salon_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('fixed','variable','marketing','other')),
  subcategory TEXT NOT NULL,            -- 'chirie', 'utilitati', 'produse', etc.
  description TEXT,
  amount_cents INT NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recurring BOOLEAN DEFAULT false,
  recurring_period TEXT CHECK (recurring_period IN ('monthly','weekly','yearly')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salon_expenses_salon_date
  ON salon_expenses(salon_id, expense_date DESC);

ALTER TABLE salon_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their expenses"
  ON salon_expenses FOR ALL
  USING (salon_id IN (SELECT id FROM salons WHERE owner_id = auth.uid()))
  WITH CHECK (salon_id IN (SELECT id FROM salons WHERE owner_id = auth.uid()));


-- ═══════════════════════════════════════════════════════════
-- RPC: get_service_profitability
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_service_profitability(
  p_salon_id UUID,
  p_start DATE,
  p_end DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_services JSONB;
  v_total_revenue BIGINT := 0;
  v_total_cost BIGINT := 0;
  v_total_profit BIGINT := 0;
  v_service_count INT := 0;
  v_margin_sum NUMERIC := 0;
BEGIN
  -- Build per-service profitability
  WITH service_revenue AS (
    SELECT
      a.service_id,
      bs.name AS service_name,
      bs.category,
      bs.duration_min,
      COUNT(*) AS appointment_count,
      COALESCE(SUM(a.total_cents), 0) AS revenue_cents
    FROM appointments a
    JOIN barbers bk ON bk.id = a.barber_id
    JOIN barber_services bs ON bs.id = a.service_id
    WHERE bk.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at::date BETWEEN p_start AND p_end
    GROUP BY a.service_id, bs.name, bs.category, bs.duration_min
  ),
  service_product_cost AS (
    SELECT
      csu.service_id,
      COALESCE(SUM(csu.quantity_per_use * sc.cost_per_unit_cents), 0) AS product_cost_per_appointment
    FROM consumable_service_usage csu
    JOIN salon_consumables sc ON sc.id = csu.consumable_id
    WHERE sc.salon_id = p_salon_id
    GROUP BY csu.service_id
  ),
  overhead_pct AS (
    SELECT COALESCE(SUM(amount_cents), 0) AS total_pct
    FROM salon_overhead_config
    WHERE salon_id = p_salon_id AND is_percentage = true
  ),
  combined AS (
    SELECT
      sr.service_id,
      sr.service_name,
      sr.category,
      sr.appointment_count,
      sr.revenue_cents,
      (COALESCE(spc.product_cost_per_appointment, 0) * sr.appointment_count) AS product_cost_cents,
      -- Labor estimate: assume 50 RON/hr (5000 cents) base rate
      ((sr.duration_min::numeric / 60.0) * 5000 * sr.appointment_count)::bigint AS labor_cost_cents,
      -- Overhead: proportional percentage from config
      ((sr.revenue_cents * COALESCE(op.total_pct, 0)) / 10000)::bigint AS overhead_cents
    FROM service_revenue sr
    LEFT JOIN service_product_cost spc ON spc.service_id = sr.service_id
    CROSS JOIN overhead_pct op
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'service_id', c.service_id,
      'service_name', c.service_name,
      'category', c.category,
      'appointment_count', c.appointment_count,
      'revenue_cents', c.revenue_cents,
      'product_cost_cents', c.product_cost_cents,
      'labor_cost_cents', c.labor_cost_cents,
      'overhead_cents', c.overhead_cents,
      'net_profit_cents', c.revenue_cents - c.product_cost_cents - c.labor_cost_cents - c.overhead_cents,
      'margin_pct', CASE WHEN c.revenue_cents > 0
        THEN ROUND(((c.revenue_cents - c.product_cost_cents - c.labor_cost_cents - c.overhead_cents)::numeric / c.revenue_cents) * 100, 1)
        ELSE 0 END
    ) ORDER BY (c.revenue_cents - c.product_cost_cents - c.labor_cost_cents - c.overhead_cents) DESC
  ) INTO v_services
  FROM combined c;

  -- Compute totals
  SELECT
    COALESCE(SUM((s->>'revenue_cents')::bigint), 0),
    COALESCE(SUM((s->>'product_cost_cents')::bigint + (s->>'labor_cost_cents')::bigint + (s->>'overhead_cents')::bigint), 0),
    COALESCE(SUM((s->>'net_profit_cents')::bigint), 0),
    COUNT(*),
    COALESCE(SUM((s->>'margin_pct')::numeric), 0)
  INTO v_total_revenue, v_total_cost, v_total_profit, v_service_count, v_margin_sum
  FROM jsonb_array_elements(COALESCE(v_services, '[]'::jsonb)) s;

  v_result := jsonb_build_object(
    'services', COALESCE(v_services, '[]'::jsonb),
    'summary', jsonb_build_object(
      'total_revenue_cents', v_total_revenue,
      'total_cost_cents', v_total_cost,
      'total_profit_cents', v_total_profit,
      'avg_margin_pct', CASE WHEN v_service_count > 0
        THEN ROUND(v_margin_sum / v_service_count, 1)
        ELSE 0 END
    )
  );

  RETURN v_result;
END;
$$;


-- ═══════════════════════════════════════════════════════════
-- RPC: generate_smart_alerts
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION generate_smart_alerts(
  p_salon_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_alerts JSONB := '[]'::jsonb;
  v_alert JSONB;
  rec RECORD;
BEGIN
  -- Clear old unread alerts older than 7 days
  DELETE FROM smart_alerts
  WHERE salon_id = p_salon_id
    AND created_at < now() - interval '7 days'
    AND is_read = true;

  -- ── 1. Inventory Low ──────────────────────────────────────
  FOR rec IN
    SELECT sc.name, sc.stock_quantity, sc.min_stock_level
    FROM salon_consumables sc
    WHERE sc.salon_id = p_salon_id
      AND sc.stock_quantity <= sc.min_stock_level
      AND sc.min_stock_level > 0
  LOOP
    v_alert := jsonb_build_object(
      'type', 'inventory_low',
      'severity', CASE WHEN rec.stock_quantity = 0 THEN 'critical' ELSE 'warning' END,
      'title', 'Stoc scazut: ' || rec.name,
      'description', 'Produsul "' || rec.name || '" are doar ' || rec.stock_quantity || ' unitati (minim: ' || rec.min_stock_level || ').',
      'meta', jsonb_build_object('product_name', rec.name, 'current_stock', rec.stock_quantity, 'min_level', rec.min_stock_level)
    );
    v_alerts := v_alerts || v_alert;

    INSERT INTO smart_alerts (salon_id, type, severity, title, description, meta)
    VALUES (
      p_salon_id,
      'inventory_low',
      CASE WHEN rec.stock_quantity = 0 THEN 'critical' ELSE 'warning' END,
      'Stoc scazut: ' || rec.name,
      'Produsul "' || rec.name || '" are doar ' || rec.stock_quantity || ' unitati (minim: ' || rec.min_stock_level || ').',
      jsonb_build_object('product_name', rec.name, 'current_stock', rec.stock_quantity, 'min_level', rec.min_stock_level)
    );
  END LOOP;

  -- ── 2. Revenue Decline ────────────────────────────────────
  FOR rec IN
    WITH current_period AS (
      SELECT bs.name AS service_name, COALESCE(SUM(a.total_cents), 0) AS current_revenue
      FROM appointments a
      JOIN barbers bk ON bk.id = a.barber_id
      JOIN barber_services bs ON bs.id = a.service_id
      WHERE bk.salon_id = p_salon_id
        AND a.status = 'completed'
        AND a.scheduled_at >= now() - interval '14 days'
        AND a.scheduled_at < now() - interval '7 days'
      GROUP BY bs.name
    ),
    previous_period AS (
      SELECT bs.name AS service_name, COALESCE(SUM(a.total_cents), 0) AS prev_revenue
      FROM appointments a
      JOIN barbers bk2 ON bk2.id = a.barber_id
      JOIN barber_services bs ON bs.id = a.service_id
      WHERE bk2.salon_id = p_salon_id
        AND a.status = 'completed'
        AND a.scheduled_at >= now() - interval '21 days'
        AND a.scheduled_at < now() - interval '14 days'
      GROUP BY bs.name
    )
    SELECT
      cp.service_name,
      cp.current_revenue,
      pp.prev_revenue,
      CASE WHEN pp.prev_revenue > 0
        THEN ROUND(((pp.prev_revenue - cp.current_revenue)::numeric / pp.prev_revenue) * 100, 1)
        ELSE 0 END AS decline_pct
    FROM current_period cp
    JOIN previous_period pp ON pp.service_name = cp.service_name
    WHERE pp.prev_revenue > 0
      AND ((pp.prev_revenue - cp.current_revenue)::numeric / pp.prev_revenue) > 0.15
  LOOP
    v_alert := jsonb_build_object(
      'type', 'revenue_decline',
      'severity', 'warning',
      'title', 'Scadere venituri: ' || rec.service_name,
      'description', 'Serviciul "' || rec.service_name || '" a scazut cu ' || rec.decline_pct || '% fata de saptamana anterioara.',
      'meta', jsonb_build_object('service_name', rec.service_name, 'decline_pct', rec.decline_pct)
    );
    v_alerts := v_alerts || v_alert;

    INSERT INTO smart_alerts (salon_id, type, severity, title, description, meta)
    VALUES (
      p_salon_id, 'revenue_decline', 'warning',
      'Scadere venituri: ' || rec.service_name,
      'Serviciul "' || rec.service_name || '" a scazut cu ' || rec.decline_pct || '% fata de saptamana anterioara.',
      jsonb_build_object('service_name', rec.service_name, 'decline_pct', rec.decline_pct)
    );
  END LOOP;

  -- ── 3. Low Occupancy (next 7 days) ───────────────────────
  FOR rec IN
    WITH day_slots AS (
      SELECT
        d::date AS day,
        10 AS total_slots -- assume 10 slots/day (configurable later)
      FROM generate_series(now()::date, (now() + interval '6 days')::date, '1 day') d
    ),
    booked AS (
      SELECT
        a.scheduled_at::date AS day,
        COUNT(*) AS booked_count
      FROM appointments a
      JOIN barbers bk ON bk.id = a.barber_id
      WHERE bk.salon_id = p_salon_id
        AND a.status IN ('confirmed','pending')
        AND a.scheduled_at::date BETWEEN now()::date AND (now() + interval '6 days')::date
      GROUP BY a.scheduled_at::date
    )
    SELECT
      ds.day,
      COALESCE(b.booked_count, 0) AS booked,
      ds.total_slots,
      ROUND((COALESCE(b.booked_count, 0)::numeric / ds.total_slots) * 100, 0) AS occupancy_pct
    FROM day_slots ds
    LEFT JOIN booked b ON b.day = ds.day
    WHERE (COALESCE(b.booked_count, 0)::numeric / ds.total_slots) < 0.5
      AND ds.day > now()::date  -- skip today
  LOOP
    v_alert := jsonb_build_object(
      'type', 'low_occupancy',
      'severity', CASE WHEN rec.occupancy_pct < 20 THEN 'warning' ELSE 'info' END,
      'title', 'Ocupare scazuta: ' || to_char(rec.day, 'DD Mon'),
      'description', 'Doar ' || rec.booked || ' din ' || rec.total_slots || ' sloturi ocupate (' || rec.occupancy_pct || '%).',
      'meta', jsonb_build_object('day', rec.day, 'booked', rec.booked, 'total_slots', rec.total_slots, 'occupancy_pct', rec.occupancy_pct)
    );
    v_alerts := v_alerts || v_alert;

    INSERT INTO smart_alerts (salon_id, type, severity, title, description, meta)
    VALUES (
      p_salon_id, 'low_occupancy',
      CASE WHEN rec.occupancy_pct < 20 THEN 'warning' ELSE 'info' END,
      'Ocupare scazuta: ' || to_char(rec.day, 'DD Mon'),
      'Doar ' || rec.booked || ' din ' || rec.total_slots || ' sloturi ocupate (' || rec.occupancy_pct || '%).',
      jsonb_build_object('day', rec.day, 'booked', rec.booked, 'total_slots', rec.total_slots, 'occupancy_pct', rec.occupancy_pct)
    );
  END LOOP;

  -- ── 4. Opportunity: top performing staff ──────────────────
  FOR rec IN
    SELECT
      p.display_name AS barber_name,
      COUNT(*) AS completed_count,
      COALESCE(SUM(a.total_cents), 0) AS revenue_cents
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    JOIN profiles p ON p.id = b.profile_id
    WHERE b.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at >= now() - interval '7 days'
    GROUP BY p.display_name
    ORDER BY revenue_cents DESC
    LIMIT 1
  LOOP
    IF rec.completed_count > 0 THEN
      v_alert := jsonb_build_object(
        'type', 'opportunity',
        'severity', 'opportunity',
        'title', 'Top performer: ' || COALESCE(rec.barber_name, 'N/A'),
        'description', COALESCE(rec.barber_name, 'N/A') || ' a generat ' || (rec.revenue_cents / 100) || ' RON din ' || rec.completed_count || ' programari saptamana aceasta.',
        'meta', jsonb_build_object('barber_name', rec.barber_name, 'revenue_cents', rec.revenue_cents, 'appointments', rec.completed_count)
      );
      v_alerts := v_alerts || v_alert;

      INSERT INTO smart_alerts (salon_id, type, severity, title, description, meta)
      VALUES (
        p_salon_id, 'opportunity', 'opportunity',
        'Top performer: ' || COALESCE(rec.barber_name, 'N/A'),
        COALESCE(rec.barber_name, 'N/A') || ' a generat ' || (rec.revenue_cents / 100) || ' RON din ' || rec.completed_count || ' programari saptamana aceasta.',
        jsonb_build_object('barber_name', rec.barber_name, 'revenue_cents', rec.revenue_cents, 'appointments', rec.completed_count)
      );
    END IF;
  END LOOP;

  RETURN v_alerts;
END;
$$;


-- ═══════════════════════════════════════════════════════════
-- RPC: get_profit_loss
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_profit_loss(
  p_salon_id UUID,
  p_start DATE,
  p_end DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_period_days INT;
  v_prev_start DATE;
  v_prev_end DATE;
  v_service_revenue BIGINT := 0;
  v_product_revenue BIGINT := 0;
  v_prev_service_revenue BIGINT := 0;
  v_prev_product_revenue BIGINT := 0;
  v_total_revenue BIGINT;
  v_prev_total_revenue BIGINT;
  v_fixed_expenses BIGINT := 0;
  v_variable_expenses BIGINT := 0;
  v_marketing_expenses BIGINT := 0;
  v_other_expenses BIGINT := 0;
  v_total_expenses BIGINT;
  v_prev_total_expenses BIGINT := 0;
  v_auto_product_cost BIGINT := 0;
  v_monthly_breakdown JSONB;
  v_result JSONB;
BEGIN
  -- Compute period length and previous period
  v_period_days := p_end - p_start + 1;
  v_prev_end := p_start - interval '1 day';
  v_prev_start := v_prev_end - (v_period_days - 1);

  -- ── Service revenue (current) ─────────────────────────────
  SELECT COALESCE(SUM(a.total_cents), 0)
  INTO v_service_revenue
  FROM appointments a
  JOIN barbers bk ON bk.id = a.barber_id
  WHERE bk.salon_id = p_salon_id
    AND a.status = 'completed'
    AND a.scheduled_at::date BETWEEN p_start AND p_end;

  -- ── Service revenue (previous) ────────────────────────────
  SELECT COALESCE(SUM(a.total_cents), 0)
  INTO v_prev_service_revenue
  FROM appointments a
  JOIN barbers bk ON bk.id = a.barber_id
  WHERE bk.salon_id = p_salon_id
    AND a.status = 'completed'
    AND a.scheduled_at::date BETWEEN v_prev_start AND v_prev_end;

  -- ── Product revenue (current) ─────────────────────────────
  SELECT COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0)
  INTO v_product_revenue
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.salon_id = p_salon_id
    AND o.status = 'completed'
    AND o.created_at::date BETWEEN p_start AND p_end;

  -- ── Product revenue (previous) ────────────────────────────
  SELECT COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0)
  INTO v_prev_product_revenue
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.salon_id = p_salon_id
    AND o.status = 'completed'
    AND o.created_at::date BETWEEN v_prev_start AND v_prev_end;

  v_total_revenue := v_service_revenue + v_product_revenue;
  v_prev_total_revenue := v_prev_service_revenue + v_prev_product_revenue;

  -- ── Expenses by category (current) ────────────────────────
  SELECT
    COALESCE(SUM(CASE WHEN category = 'fixed' THEN amount_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN category = 'variable' THEN amount_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN category = 'marketing' THEN amount_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN category = 'other' THEN amount_cents ELSE 0 END), 0)
  INTO v_fixed_expenses, v_variable_expenses, v_marketing_expenses, v_other_expenses
  FROM salon_expenses
  WHERE salon_id = p_salon_id
    AND expense_date BETWEEN p_start AND p_end;

  -- ── Auto product cost (consumables used in completed appointments) ──
  SELECT COALESCE(SUM(csu.quantity_per_use * sc.cost_per_unit_cents * sub.cnt), 0)
  INTO v_auto_product_cost
  FROM consumable_service_usage csu
  JOIN salon_consumables sc ON sc.id = csu.consumable_id AND sc.salon_id = p_salon_id
  JOIN (
    SELECT a.service_id, COUNT(*) AS cnt
    FROM appointments a
    JOIN barbers bk ON bk.id = a.barber_id
    WHERE bk.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at::date BETWEEN p_start AND p_end
    GROUP BY a.service_id
  ) sub ON sub.service_id = csu.service_id;

  v_variable_expenses := v_variable_expenses + v_auto_product_cost;
  v_total_expenses := v_fixed_expenses + v_variable_expenses + v_marketing_expenses + v_other_expenses;

  -- ── Previous period total expenses ────────────────────────
  SELECT COALESCE(SUM(amount_cents), 0)
  INTO v_prev_total_expenses
  FROM salon_expenses
  WHERE salon_id = p_salon_id
    AND expense_date BETWEEN v_prev_start AND v_prev_end;

  -- ── Monthly breakdown ─────────────────────────────────────
  WITH monthly AS (
    SELECT
      to_char(scheduled_at, 'YYYY-MM') AS month,
      to_char(scheduled_at, 'Mon YYYY') AS month_label,
      COALESCE(SUM(a.total_cents), 0) AS revenue_cents
    FROM appointments a
    JOIN barbers bk ON bk.id = a.barber_id
    WHERE bk.salon_id = p_salon_id
      AND a.status = 'completed'
      AND a.scheduled_at::date BETWEEN p_start AND p_end
    GROUP BY to_char(a.scheduled_at, 'YYYY-MM'), to_char(a.scheduled_at, 'Mon YYYY')
  ),
  monthly_expenses AS (
    SELECT
      to_char(expense_date, 'YYYY-MM') AS month,
      COALESCE(SUM(amount_cents), 0) AS expense_cents
    FROM salon_expenses
    WHERE salon_id = p_salon_id
      AND expense_date BETWEEN p_start AND p_end
    GROUP BY to_char(expense_date, 'YYYY-MM')
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'month', m.month,
      'month_label', m.month_label,
      'revenue_cents', m.revenue_cents,
      'expense_cents', COALESCE(me.expense_cents, 0),
      'profit_cents', m.revenue_cents - COALESCE(me.expense_cents, 0)
    ) ORDER BY m.month
  ) INTO v_monthly_breakdown
  FROM monthly m
  LEFT JOIN monthly_expenses me ON me.month = m.month;

  -- ── Build result ──────────────────────────────────────────
  v_result := jsonb_build_object(
    'revenue', jsonb_build_object(
      'service_revenue_cents', v_service_revenue,
      'product_revenue_cents', v_product_revenue,
      'total_revenue_cents', v_total_revenue
    ),
    'expenses', jsonb_build_object(
      'fixed_cents', v_fixed_expenses,
      'variable_cents', v_variable_expenses,
      'marketing_cents', v_marketing_expenses,
      'other_cents', v_other_expenses,
      'total_expenses_cents', v_total_expenses,
      'auto_product_cost_cents', v_auto_product_cost
    ),
    'profit', jsonb_build_object(
      'net_profit_cents', v_total_revenue - v_total_expenses,
      'margin_pct', CASE WHEN v_total_revenue > 0
        THEN ROUND(((v_total_revenue - v_total_expenses)::numeric / v_total_revenue) * 100, 1)
        ELSE 0 END
    ),
    'comparison', jsonb_build_object(
      'prev_revenue_cents', v_prev_total_revenue,
      'prev_expenses_cents', v_prev_total_expenses,
      'prev_profit_cents', v_prev_total_revenue - v_prev_total_expenses,
      'revenue_change_pct', CASE WHEN v_prev_total_revenue > 0
        THEN ROUND(((v_total_revenue - v_prev_total_revenue)::numeric / v_prev_total_revenue) * 100, 1)
        ELSE 0 END,
      'expense_change_pct', CASE WHEN v_prev_total_expenses > 0
        THEN ROUND(((v_total_expenses - v_prev_total_expenses)::numeric / v_prev_total_expenses) * 100, 1)
        ELSE 0 END,
      'profit_change_pct', CASE WHEN (v_prev_total_revenue - v_prev_total_expenses) <> 0
        THEN ROUND((((v_total_revenue - v_total_expenses) - (v_prev_total_revenue - v_prev_total_expenses))::numeric / ABS(v_prev_total_revenue - v_prev_total_expenses)) * 100, 1)
        ELSE 0 END
    ),
    'monthly_breakdown', COALESCE(v_monthly_breakdown, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;
