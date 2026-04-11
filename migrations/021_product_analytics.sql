-- ============================================
-- Migration 021: Product Sales Analytics &
--   Recommendation System
-- ============================================
-- Complete BI functions for salon product sales:
-- revenue, top sellers, cross-sell, stock,
-- customer purchase behavior, cart abandonment.
-- ============================================
-- NOTE: The current `products` table is global
-- (no salon_id). This migration adds salon_id
-- to products and extends orders with salon_id
-- so analytics can be scoped per salon.
-- ============================================

-- ============================================
-- 0. SCHEMA EXTENSIONS
-- ============================================

-- 0a. Link products to salons
ALTER TABLE products ADD COLUMN IF NOT EXISTS salon_id UUID REFERENCES salons(id) ON DELETE CASCADE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'altele';
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_cents INT;          -- cost price for margin calc
ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price_cents INT;  -- RRP for discount display
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INT DEFAULT 5;

CREATE INDEX IF NOT EXISTS idx_products_salon ON products(salon_id) WHERE salon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(salon_id, category);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL;

-- 0b. Link orders to salons
ALTER TABLE orders ADD COLUMN IF NOT EXISTS salon_id UUID REFERENCES salons(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_salon ON orders(salon_id, created_at DESC) WHERE salon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);

-- 0c. Add cost_cents to order_items for margin analysis
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_cents INT;

-- 0d. Cart items: add created_at index for abandonment analysis
CREATE INDEX IF NOT EXISTS idx_cart_items_created ON cart_items(created_at);

-- ============================================
-- 1. VENITURI DIN PRODUSE (Product Revenue)
-- ============================================

-- 1a. Venitul total din produse + comparatie cu perioada anterioara
-- KPI: "Venituri produse", Display: number + trend arrow, Priority: P0
-- Sfat: "Compara veniturile din produse luna aceasta vs luna trecuta
--        pentru a vedea trendul de crestere."
CREATE OR REPLACE FUNCTION get_product_revenue_summary(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    total_revenue_cents BIGINT,
    prev_period_revenue_cents BIGINT,
    revenue_growth_pct NUMERIC,
    total_orders BIGINT,
    prev_period_orders BIGINT,
    orders_growth_pct NUMERIC,
    avg_order_value_cents BIGINT,
    prev_avg_order_value_cents BIGINT,
    total_units_sold BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH current_period AS (
        SELECT
            COALESCE(SUM(o.total_cents), 0) AS revenue,
            COUNT(o.id) AS orders,
            COALESCE(SUM(oi.qty), 0) AS units
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    prev_period AS (
        SELECT
            COALESCE(SUM(o.total_cents), 0) AS revenue,
            COUNT(o.id) AS orders
        FROM orders o
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days * 2 || ' days')::INTERVAL
          AND o.created_at < NOW() - (p_days || ' days')::INTERVAL
    )
    SELECT
        cp.revenue AS total_revenue_cents,
        pp.revenue AS prev_period_revenue_cents,
        CASE WHEN pp.revenue > 0
            THEN ROUND((cp.revenue - pp.revenue)::NUMERIC / pp.revenue * 100, 1)
            ELSE 0
        END AS revenue_growth_pct,
        cp.orders AS total_orders,
        pp.orders AS prev_period_orders,
        CASE WHEN pp.orders > 0
            THEN ROUND((cp.orders - pp.orders)::NUMERIC / pp.orders * 100, 1)
            ELSE 0
        END AS orders_growth_pct,
        CASE WHEN cp.orders > 0
            THEN cp.revenue / cp.orders
            ELSE 0
        END AS avg_order_value_cents,
        CASE WHEN pp.orders > 0
            THEN pp.revenue / pp.orders
            ELSE 0
        END AS prev_avg_order_value_cents,
        cp.units AS total_units_sold
    FROM current_period cp
    CROSS JOIN prev_period pp;
$$;


-- 1b. Venituri produse pe perioada (zilnic/saptamanal/lunar)
-- KPI: "Evolutia vanzarilor", Display: line chart, Priority: P0
-- Sfat: "Urmareste tendintele de vanzare pentru a optimiza
--        stocul si campaniile promotionale."
CREATE OR REPLACE FUNCTION get_product_revenue_trends(
    p_salon_id UUID,
    p_period TEXT DEFAULT 'daily',  -- daily | weekly | monthly
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    period_label TEXT,
    period_start DATE,
    revenue_cents BIGINT,
    order_count BIGINT,
    units_sold BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        CASE p_period
            WHEN 'daily'   THEN TO_CHAR(o.created_at, 'DD Mon')
            WHEN 'weekly'  THEN 'Sapt ' || EXTRACT(WEEK FROM o.created_at)::TEXT
            WHEN 'monthly' THEN TO_CHAR(o.created_at, 'Mon YYYY')
        END AS period_label,
        CASE p_period
            WHEN 'daily'   THEN DATE_TRUNC('day', o.created_at)::DATE
            WHEN 'weekly'  THEN DATE_TRUNC('week', o.created_at)::DATE
            WHEN 'monthly' THEN DATE_TRUNC('month', o.created_at)::DATE
        END AS period_start,
        COALESCE(SUM(o.total_cents), 0) AS revenue_cents,
        COUNT(DISTINCT o.id) AS order_count,
        COALESCE(SUM(oi.qty), 0) AS units_sold
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.salon_id = p_salon_id
      AND o.status IN ('paid', 'shipped')
      AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY period_label, period_start
    ORDER BY period_start;
$$;


-- 1c. Venituri pe categorie de produs
-- KPI: "Venituri pe categorie", Display: donut/pie chart, Priority: P0
-- Sfat: "Identifica categoriile cele mai profitabile si
--        concentreaza-te pe extinderea gamei in acele categorii."
CREATE OR REPLACE FUNCTION get_product_revenue_by_category(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    category TEXT,
    category_label TEXT,
    revenue_cents BIGINT,
    units_sold BIGINT,
    order_count BIGINT,
    revenue_share_pct NUMERIC,
    avg_item_price_cents BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH cat_rev AS (
        SELECT
            COALESCE(p.category, 'altele') AS category,
            SUM(oi.price_cents * oi.qty) AS revenue_cents,
            SUM(oi.qty) AS units_sold,
            COUNT(DISTINCT o.id) AS order_count
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY p.category
    ),
    total AS (
        SELECT GREATEST(SUM(revenue_cents), 1) AS total_rev FROM cat_rev
    )
    SELECT
        cr.category,
        -- Map category slug to Romanian label
        CASE cr.category
            WHEN 'clippers' THEN 'Masini de tuns'
            WHEN 'trimmers' THEN 'Contur'
            WHEN 'wax' THEN 'Ceara'
            WHEN 'combs' THEN 'Piepteni'
            WHEN 'aftershave' THEN 'After shave'
            WHEN 'scissors' THEN 'Foarfece'
            WHEN 'dye' THEN 'Vopsea'
            WHEN 'shampoo' THEN 'Sampon'
            WHEN 'gel' THEN 'Gel'
            WHEN 'powder' THEN 'Pudra'
            WHEN 'cream' THEN 'Crema'
            WHEN 'spray' THEN 'Spray/Fixativ'
            WHEN 'fragrance' THEN 'Parfumuri'
            WHEN 'grooming' THEN 'Ingrijire'
            WHEN 'care' THEN 'Tratamente'
            WHEN 'shaving' THEN 'Ras'
            ELSE cr.category
        END AS category_label,
        cr.revenue_cents,
        cr.units_sold,
        cr.order_count,
        ROUND(cr.revenue_cents::NUMERIC / t.total_rev * 100, 1) AS revenue_share_pct,
        CASE WHEN cr.units_sold > 0
            THEN cr.revenue_cents / cr.units_sold
            ELSE 0
        END AS avg_item_price_cents
    FROM cat_rev cr, total t
    ORDER BY cr.revenue_cents DESC;
$$;


-- ============================================
-- 2. TOP / WORST PRODUSE (Product Rankings)
-- ============================================

-- 2a. Cele mai vandute produse (dupa cantitate SI venit)
-- KPI: "Top produse", Display: ranking list, Priority: P0
-- Sfat: "Promoveaza top produse pe pagina principala a shopului
--        si asigura-te ca ai stoc suficient."
CREATE OR REPLACE FUNCTION get_top_products(
    p_salon_id UUID,
    p_days INT DEFAULT 30,
    p_sort_by TEXT DEFAULT 'revenue',  -- revenue | quantity
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    product_sku TEXT,
    brand TEXT,
    category TEXT,
    units_sold BIGINT,
    revenue_cents BIGINT,
    margin_cents BIGINT,
    margin_pct NUMERIC,
    current_stock INT,
    rank BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH product_sales AS (
        SELECT
            p.id AS product_id,
            p.title AS product_name,
            p.sku AS product_sku,
            p.brand,
            p.category,
            SUM(oi.qty) AS units_sold,
            SUM(oi.price_cents * oi.qty) AS revenue_cents,
            CASE WHEN p.cost_cents IS NOT NULL
                THEN SUM((oi.price_cents - COALESCE(oi.cost_cents, p.cost_cents, 0)) * oi.qty)
                ELSE 0
            END AS margin_cents,
            p.stock AS current_stock
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY p.id, p.title, p.sku, p.brand, p.category, p.cost_cents, p.stock
    )
    SELECT
        ps.product_id,
        ps.product_name,
        ps.product_sku,
        ps.brand,
        ps.category,
        ps.units_sold,
        ps.revenue_cents,
        ps.margin_cents,
        CASE WHEN ps.revenue_cents > 0
            THEN ROUND(ps.margin_cents::NUMERIC / ps.revenue_cents * 100, 1)
            ELSE 0
        END AS margin_pct,
        ps.current_stock,
        ROW_NUMBER() OVER (
            ORDER BY
                CASE WHEN p_sort_by = 'revenue' THEN ps.revenue_cents END DESC,
                CASE WHEN p_sort_by = 'quantity' THEN ps.units_sold END DESC
        ) AS rank
    FROM product_sales ps
    ORDER BY rank
    LIMIT p_limit;
$$;


-- 2b. Produse cu performanta slaba (vanzari mici sau zero)
-- KPI: "Produse neperformante", Display: alert list, Priority: P1
-- Sfat: "Incearca promotii sau pachete cu produsele care
--        nu se vand. Daca persista, inlocuieste-le din oferta."
CREATE OR REPLACE FUNCTION get_worst_performing_products(
    p_salon_id UUID,
    p_days INT DEFAULT 60,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    brand TEXT,
    category TEXT,
    units_sold BIGINT,
    revenue_cents BIGINT,
    days_in_stock INT,
    current_stock INT,
    price_cents INT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        p.id AS product_id,
        p.title AS product_name,
        p.brand,
        p.category,
        COALESCE(SUM(oi.qty), 0) AS units_sold,
        COALESCE(SUM(oi.price_cents * oi.qty), 0) AS revenue_cents,
        EXTRACT(DAY FROM NOW() - p.created_at)::INT AS days_in_stock,
        p.stock AS current_stock,
        p.price_cents
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
        AND EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = oi.order_id
              AND o.salon_id = p_salon_id
              AND o.status IN ('paid', 'shipped')
              AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
        )
    WHERE p.salon_id = p_salon_id
      AND p.active = true
    GROUP BY p.id, p.title, p.brand, p.category, p.stock, p.price_cents, p.created_at
    ORDER BY units_sold ASC, revenue_cents ASC
    LIMIT p_limit;
$$;


-- ============================================
-- 3. STOC & REAPROVIZIONARE (Stock & Restock)
-- ============================================

-- 3a. Rata de rotatie a stocului + alerte stoc scazut
-- KPI: "Alerte stoc", Display: alert list with badges, Priority: P0
-- Sfat: "Comanda din timp produsele cu rotatie mare.
--        Stocul scazut inseamna vanzari pierdute!"
CREATE OR REPLACE FUNCTION get_stock_alerts(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    brand TEXT,
    current_stock INT,
    low_stock_threshold INT,
    units_sold_last_period BIGINT,
    daily_sales_velocity NUMERIC,
    estimated_days_remaining NUMERIC,
    alert_level TEXT  -- critical | warning | ok
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH sales AS (
        SELECT
            oi.product_id,
            SUM(oi.qty) AS units_sold
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY oi.product_id
    )
    SELECT
        p.id AS product_id,
        p.title AS product_name,
        p.brand,
        p.stock AS current_stock,
        p.low_stock_threshold,
        COALESCE(s.units_sold, 0) AS units_sold_last_period,
        ROUND(COALESCE(s.units_sold, 0)::NUMERIC / GREATEST(p_days, 1), 2) AS daily_sales_velocity,
        CASE WHEN COALESCE(s.units_sold, 0) > 0
            THEN ROUND(p.stock::NUMERIC / (s.units_sold::NUMERIC / GREATEST(p_days, 1)), 1)
            ELSE 999
        END AS estimated_days_remaining,
        CASE
            WHEN p.stock <= 0 THEN 'critical'
            WHEN p.stock <= p.low_stock_threshold THEN 'warning'
            WHEN COALESCE(s.units_sold, 0) > 0
                 AND p.stock::NUMERIC / (s.units_sold::NUMERIC / GREATEST(p_days, 1)) < 7 THEN 'warning'
            ELSE 'ok'
        END AS alert_level
    FROM products p
    LEFT JOIN sales s ON s.product_id = p.id
    WHERE p.salon_id = p_salon_id
      AND p.active = true
      AND (
          p.stock <= p.low_stock_threshold
          OR p.stock <= 0
          OR (
              COALESCE(s.units_sold, 0) > 0
              AND p.stock::NUMERIC / (s.units_sold::NUMERIC / GREATEST(p_days, 1)) < 14
          )
      )
    ORDER BY
        CASE
            WHEN p.stock <= 0 THEN 0
            WHEN p.stock <= p.low_stock_threshold THEN 1
            ELSE 2
        END,
        estimated_days_remaining ASC;
$$;


-- 3b. Rata de rotatie a stocului pe produs
-- KPI: "Rotatie stoc", Display: bar chart, Priority: P1
-- Sfat: "Rata de rotatie ridicata = produs popular.
--        Rata scazuta = capital blocat in stoc."
CREATE OR REPLACE FUNCTION get_stock_turnover(
    p_salon_id UUID,
    p_days INT DEFAULT 90
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    category TEXT,
    current_stock INT,
    units_sold BIGINT,
    turnover_rate NUMERIC,  -- units_sold / avg_stock
    days_of_supply NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH sales AS (
        SELECT
            oi.product_id,
            SUM(oi.qty) AS units_sold
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY oi.product_id
    )
    SELECT
        p.id AS product_id,
        p.title AS product_name,
        p.category,
        p.stock AS current_stock,
        COALESCE(s.units_sold, 0) AS units_sold,
        CASE WHEN p.stock > 0
            THEN ROUND(COALESCE(s.units_sold, 0)::NUMERIC / p.stock, 2)
            ELSE 0
        END AS turnover_rate,
        CASE WHEN COALESCE(s.units_sold, 0) > 0
            THEN ROUND(p.stock::NUMERIC / (s.units_sold::NUMERIC / GREATEST(p_days, 1)), 1)
            ELSE 999
        END AS days_of_supply
    FROM products p
    LEFT JOIN sales s ON s.product_id = p.id
    WHERE p.salon_id = p_salon_id
      AND p.active = true
    ORDER BY turnover_rate DESC;
$$;


-- ============================================
-- 4. CROSS-SELL: Serviciu → Produs
-- ============================================

-- 4a. "Clientii care au facut [serviciu] cumpara frecvent [produs]"
-- KPI: "Recomandari cross-sell", Display: card list, Priority: P1
-- Sfat: "Recomandeaza aceste produse clientilor dupa programare.
--        Frigul + ingrijire barba = oportunitate de vanzare!"
CREATE OR REPLACE FUNCTION get_service_product_crosssell(
    p_salon_id UUID,
    p_days INT DEFAULT 90,
    p_min_occurrences INT DEFAULT 3
)
RETURNS TABLE (
    service_id UUID,
    service_name TEXT,
    product_id UUID,
    product_name TEXT,
    product_brand TEXT,
    times_bought_together BIGINT,
    pct_of_service_customers NUMERIC,
    recommendation_ro TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH service_customers AS (
        -- Customers who completed a specific service
        SELECT
            a.service_id,
            bs.name AS service_name,
            a.user_id,
            COUNT(*) AS service_visits
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        JOIN barber_services bs ON bs.id = a.service_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY a.service_id, bs.name, a.user_id
    ),
    service_totals AS (
        SELECT service_id, service_name, COUNT(DISTINCT user_id) AS total_customers
        FROM service_customers
        GROUP BY service_id, service_name
    ),
    customer_purchases AS (
        -- Products bought by those same customers
        SELECT
            sc.service_id,
            sc.service_name,
            oi.product_id,
            p.title AS product_name,
            p.brand AS product_brand,
            COUNT(DISTINCT sc.user_id) AS buyers
        FROM service_customers sc
        JOIN orders o ON o.user_id = sc.user_id
            AND o.salon_id = p_salon_id
            AND o.status IN ('paid', 'shipped')
            AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        GROUP BY sc.service_id, sc.service_name, oi.product_id, p.title, p.brand
    )
    SELECT
        cp.service_id,
        cp.service_name,
        cp.product_id,
        cp.product_name,
        cp.product_brand,
        cp.buyers AS times_bought_together,
        ROUND(cp.buyers::NUMERIC / GREATEST(st.total_customers, 1) * 100, 1) AS pct_of_service_customers,
        'Clientii care au facut ' || cp.service_name
            || ' cumpara frecvent ' || cp.product_name
            || ' (' || cp.product_brand || ')' AS recommendation_ro
    FROM customer_purchases cp
    JOIN service_totals st ON st.service_id = cp.service_id
    WHERE cp.buyers >= p_min_occurrences
    ORDER BY cp.buyers DESC;
$$;


-- 4b. Produse cu potential ridicat de marja
-- KPI: "Produse cu marja ridicata", Display: ranking list, Priority: P1
-- Sfat: "Promoveaza activ produsele cu marja mare.
--        Ofera-le ca upsell dupa fiecare programare."
CREATE OR REPLACE FUNCTION get_high_margin_products(
    p_salon_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    brand TEXT,
    category TEXT,
    price_cents INT,
    cost_cents INT,
    margin_cents INT,
    margin_pct NUMERIC,
    current_stock INT,
    is_active BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        p.id AS product_id,
        p.title AS product_name,
        p.brand,
        p.category,
        p.price_cents,
        COALESCE(p.cost_cents, 0) AS cost_cents,
        p.price_cents - COALESCE(p.cost_cents, 0) AS margin_cents,
        CASE WHEN p.price_cents > 0
            THEN ROUND((p.price_cents - COALESCE(p.cost_cents, 0))::NUMERIC / p.price_cents * 100, 1)
            ELSE 0
        END AS margin_pct,
        p.stock AS current_stock,
        p.active AS is_active
    FROM products p
    WHERE p.salon_id = p_salon_id
      AND p.cost_cents IS NOT NULL
      AND p.active = true
    ORDER BY margin_pct DESC, margin_cents DESC
    LIMIT p_limit;
$$;


-- ============================================
-- 5. ACHIZITII CLIENTI (Customer Purchase Insights)
-- ============================================

-- 5a. Rata de cross-sell (% clienti programare care cumpara si produse)
-- KPI: "Rata cross-sell", Display: gauge/number, Priority: P0
-- Sfat: "Daca rata e sub 10%, antreneaza echipa sa recomande
--        produse dupa fiecare serviciu."
CREATE OR REPLACE FUNCTION get_product_crosssell_rate(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    appointment_customers BIGINT,
    product_customers BIGINT,
    crosssell_customers BIGINT,
    crosssell_rate_pct NUMERIC,
    product_only_customers BIGINT,
    appointment_only_customers BIGINT,
    avg_product_spend_cents BIGINT,
    avg_product_spend_crosssell_cents BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH appt_customers AS (
        SELECT DISTINCT a.user_id
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    order_customers AS (
        SELECT DISTINCT o.user_id
        FROM orders o
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    crosssell AS (
        SELECT ac.user_id
        FROM appt_customers ac
        INNER JOIN order_customers oc ON oc.user_id = ac.user_id
    ),
    spending AS (
        SELECT
            o.user_id,
            SUM(o.total_cents) AS total_spent
        FROM orders o
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY o.user_id
    )
    SELECT
        (SELECT COUNT(*) FROM appt_customers) AS appointment_customers,
        (SELECT COUNT(*) FROM order_customers) AS product_customers,
        (SELECT COUNT(*) FROM crosssell) AS crosssell_customers,
        CASE WHEN (SELECT COUNT(*) FROM appt_customers) > 0
            THEN ROUND((SELECT COUNT(*) FROM crosssell)::NUMERIC /
                        (SELECT COUNT(*) FROM appt_customers) * 100, 1)
            ELSE 0
        END AS crosssell_rate_pct,
        (SELECT COUNT(*) FROM order_customers oc
         WHERE NOT EXISTS (SELECT 1 FROM appt_customers ac WHERE ac.user_id = oc.user_id)
        ) AS product_only_customers,
        (SELECT COUNT(*) FROM appt_customers ac
         WHERE NOT EXISTS (SELECT 1 FROM order_customers oc WHERE oc.user_id = ac.user_id)
        ) AS appointment_only_customers,
        COALESCE((SELECT ROUND(AVG(total_spent)) FROM spending), 0) AS avg_product_spend_cents,
        COALESCE((
            SELECT ROUND(AVG(s.total_spent))
            FROM spending s
            INNER JOIN crosssell cs ON cs.user_id = s.user_id
        ), 0) AS avg_product_spend_crosssell_cents;
$$;


-- 5b. Rata de recumparare produse
-- KPI: "Rata recumparare", Display: number + chart, Priority: P1
-- Sfat: "O rata de recumparare peste 30% indica produse excelente.
--        Sub 15%? Verifica calitatea sau pretul."
CREATE OR REPLACE FUNCTION get_product_repeat_purchase_rate(
    p_salon_id UUID,
    p_days INT DEFAULT 90
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    brand TEXT,
    total_buyers BIGINT,
    repeat_buyers BIGINT,
    repeat_rate_pct NUMERIC,
    avg_orders_per_buyer NUMERIC,
    avg_days_between_purchases NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH purchases AS (
        SELECT
            oi.product_id,
            o.user_id,
            o.created_at,
            ROW_NUMBER() OVER (
                PARTITION BY oi.product_id, o.user_id
                ORDER BY o.created_at
            ) AS purchase_num,
            LAG(o.created_at) OVER (
                PARTITION BY oi.product_id, o.user_id
                ORDER BY o.created_at
            ) AS prev_purchase_at
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    buyer_stats AS (
        SELECT
            product_id,
            user_id,
            COUNT(*) AS order_count,
            AVG(
                CASE WHEN prev_purchase_at IS NOT NULL
                    THEN EXTRACT(DAY FROM created_at - prev_purchase_at)
                    ELSE NULL
                END
            ) AS avg_days_between
        FROM purchases
        GROUP BY product_id, user_id
    )
    SELECT
        p.id AS product_id,
        p.title AS product_name,
        p.brand,
        COUNT(DISTINCT bs.user_id) AS total_buyers,
        COUNT(DISTINCT bs.user_id) FILTER (WHERE bs.order_count > 1) AS repeat_buyers,
        CASE WHEN COUNT(DISTINCT bs.user_id) > 0
            THEN ROUND(
                COUNT(DISTINCT bs.user_id) FILTER (WHERE bs.order_count > 1)::NUMERIC
                / COUNT(DISTINCT bs.user_id) * 100, 1
            )
            ELSE 0
        END AS repeat_rate_pct,
        ROUND(AVG(bs.order_count), 1) AS avg_orders_per_buyer,
        ROUND(AVG(bs.avg_days_between), 0) AS avg_days_between_purchases
    FROM products p
    JOIN buyer_stats bs ON bs.product_id = p.id
    WHERE p.salon_id = p_salon_id
      AND p.active = true
    GROUP BY p.id, p.title, p.brand
    HAVING COUNT(DISTINCT bs.user_id) >= 2
    ORDER BY repeat_rate_pct DESC;
$$;


-- 5c. Cei mai fideli clienti pe produse
-- KPI: "Top clienti produse", Display: ranking list, Priority: P1
-- Sfat: "Ofera reduceri de fidelitate clientilor din top 10.
--        Sunt ambasadorii brandului tau!"
CREATE OR REPLACE FUNCTION get_top_product_customers(
    p_salon_id UUID,
    p_days INT DEFAULT 90,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    customer_id UUID,
    customer_name TEXT,
    total_spent_cents BIGINT,
    total_orders BIGINT,
    total_units BIGINT,
    avg_order_value_cents BIGINT,
    last_order_at TIMESTAMPTZ,
    favorite_product TEXT,
    also_has_appointments BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH customer_stats AS (
        SELECT
            o.user_id,
            SUM(o.total_cents) AS total_spent,
            COUNT(DISTINCT o.id) AS total_orders,
            SUM(oi.qty) AS total_units,
            MAX(o.created_at) AS last_order
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY o.user_id
        ORDER BY total_spent DESC
        LIMIT p_limit
    ),
    fav_product AS (
        SELECT DISTINCT ON (o.user_id)
            o.user_id,
            p.title AS product_name
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY o.user_id, p.title
        ORDER BY o.user_id, SUM(oi.qty) DESC
    )
    SELECT
        cs.user_id AS customer_id,
        COALESCE(pr.display_name, pr.username, 'Anonim') AS customer_name,
        cs.total_spent AS total_spent_cents,
        cs.total_orders,
        cs.total_units,
        CASE WHEN cs.total_orders > 0
            THEN cs.total_spent / cs.total_orders
            ELSE 0
        END AS avg_order_value_cents,
        cs.last_order AS last_order_at,
        fp.product_name AS favorite_product,
        EXISTS (
            SELECT 1 FROM appointments a
            JOIN barbers b ON b.id = a.barber_id
            WHERE b.salon_id = p_salon_id
              AND a.user_id = cs.user_id
              AND a.status = 'completed'
        ) AS also_has_appointments
    FROM customer_stats cs
    LEFT JOIN profiles pr ON pr.id = cs.user_id
    LEFT JOIN fav_product fp ON fp.user_id = cs.user_id
    ORDER BY cs.total_spent DESC;
$$;


-- ============================================
-- 6. OPERATIONAL (Cart & Conversion)
-- ============================================

-- 6a. Rata de abandonare cos
-- KPI: "Cosuri abandonate", Display: number + trend, Priority: P1
-- Sfat: "Trimite notificari push clientilor cu cosuri abandonate.
--        Ofera un mic discount pentru finalizare."
CREATE OR REPLACE FUNCTION get_cart_abandonment_stats(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    active_carts BIGINT,
    total_cart_value_cents BIGINT,
    avg_cart_value_cents BIGINT,
    carts_with_items BIGINT,
    completed_orders BIGINT,
    abandonment_rate_pct NUMERIC,
    oldest_cart_days INT,
    top_abandoned_product TEXT,
    top_abandoned_product_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH cart_data AS (
        SELECT
            ci.user_id,
            SUM(ci.qty * p.price_cents) AS cart_value,
            MIN(ci.created_at) AS oldest_item
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        WHERE p.salon_id = p_salon_id
          AND ci.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY ci.user_id
    ),
    order_data AS (
        SELECT COUNT(DISTINCT o.user_id) AS buyers
        FROM orders o
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    top_abandoned AS (
        SELECT p.title AS product_name, COUNT(*) AS cnt
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        WHERE p.salon_id = p_salon_id
          AND ci.created_at >= NOW() - (p_days || ' days')::INTERVAL
          AND NOT EXISTS (
              SELECT 1 FROM orders o
              WHERE o.user_id = ci.user_id
                AND o.salon_id = p_salon_id
                AND o.status IN ('paid', 'shipped')
                AND o.created_at > ci.created_at
          )
        GROUP BY p.title
        ORDER BY cnt DESC
        LIMIT 1
    )
    SELECT
        (SELECT COUNT(*) FROM cart_data) AS active_carts,
        COALESCE((SELECT SUM(cart_value) FROM cart_data), 0) AS total_cart_value_cents,
        COALESCE((SELECT ROUND(AVG(cart_value)) FROM cart_data), 0) AS avg_cart_value_cents,
        (SELECT COUNT(*) FROM cart_data) AS carts_with_items,
        COALESCE(od.buyers, 0) AS completed_orders,
        CASE WHEN ((SELECT COUNT(*) FROM cart_data) + COALESCE(od.buyers, 0)) > 0
            THEN ROUND(
                (SELECT COUNT(*) FROM cart_data)::NUMERIC /
                ((SELECT COUNT(*) FROM cart_data) + COALESCE(od.buyers, 0)) * 100, 1
            )
            ELSE 0
        END AS abandonment_rate_pct,
        COALESCE(EXTRACT(DAY FROM NOW() - (SELECT MIN(oldest_item) FROM cart_data))::INT, 0)
            AS oldest_cart_days,
        ta.product_name AS top_abandoned_product,
        COALESCE(ta.cnt, 0) AS top_abandoned_product_count
    FROM order_data od
    LEFT JOIN top_abandoned ta ON true;
$$;


-- 6b. Timpul intre programare si achizitie produs
-- KPI: "Timp programare → cumparare", Display: number, Priority: P2
-- Sfat: "Daca clientii cumpara in 24h dupa programare,
--        trimite oferte personalizate imediat dupa vizita."
CREATE OR REPLACE FUNCTION get_appointment_to_purchase_time(
    p_salon_id UUID,
    p_days INT DEFAULT 90
)
RETURNS TABLE (
    avg_hours_to_purchase NUMERIC,
    median_hours_to_purchase NUMERIC,
    within_24h_pct NUMERIC,
    within_48h_pct NUMERIC,
    within_7d_pct NUMERIC,
    total_linked_purchases BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH linked AS (
        SELECT
            EXTRACT(EPOCH FROM (o.created_at - a.scheduled_at)) / 3600.0 AS hours_diff
        FROM orders o
        JOIN appointments a ON a.user_id = o.user_id
        JOIN barbers b ON b.id = a.barber_id
        WHERE o.salon_id = p_salon_id
          AND b.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND a.status = 'completed'
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
          AND o.created_at >= a.scheduled_at                -- purchased after appointment
          AND o.created_at <= a.scheduled_at + INTERVAL '30 days'  -- within 30 days
    )
    SELECT
        ROUND(AVG(hours_diff)::NUMERIC, 1) AS avg_hours_to_purchase,
        ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours_diff))::NUMERIC, 1)
            AS median_hours_to_purchase,
        ROUND(COUNT(*) FILTER (WHERE hours_diff <= 24)::NUMERIC
              / GREATEST(COUNT(*), 1) * 100, 1) AS within_24h_pct,
        ROUND(COUNT(*) FILTER (WHERE hours_diff <= 48)::NUMERIC
              / GREATEST(COUNT(*), 1) * 100, 1) AS within_48h_pct,
        ROUND(COUNT(*) FILTER (WHERE hours_diff <= 168)::NUMERIC
              / GREATEST(COUNT(*), 1) * 100, 1) AS within_7d_pct,
        COUNT(*) AS total_linked_purchases
    FROM linked;
$$;


-- 6c. Venituri produse ca % din venitul total salon
-- KPI: "Ponderea produselor in venit", Display: gauge, Priority: P0
-- Sfat: "Salonurile de succes au 15-25% din venituri din produse.
--        Daca esti sub 10%, ai potential enorm de crestere!"
CREATE OR REPLACE FUNCTION get_product_revenue_share(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    service_revenue_cents BIGINT,
    product_revenue_cents BIGINT,
    total_revenue_cents BIGINT,
    product_share_pct NUMERIC,
    service_share_pct NUMERIC,
    product_revenue_trend TEXT  -- growing | stable | declining
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH service_rev AS (
        SELECT COALESCE(SUM(a.total_cents), 0) AS revenue
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    product_rev_current AS (
        SELECT COALESCE(SUM(o.total_cents), 0) AS revenue
        FROM orders o
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    product_rev_prev AS (
        SELECT COALESCE(SUM(o.total_cents), 0) AS revenue
        FROM orders o
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days * 2 || ' days')::INTERVAL
          AND o.created_at < NOW() - (p_days || ' days')::INTERVAL
    )
    SELECT
        sr.revenue AS service_revenue_cents,
        prc.revenue AS product_revenue_cents,
        sr.revenue + prc.revenue AS total_revenue_cents,
        CASE WHEN (sr.revenue + prc.revenue) > 0
            THEN ROUND(prc.revenue::NUMERIC / (sr.revenue + prc.revenue) * 100, 1)
            ELSE 0
        END AS product_share_pct,
        CASE WHEN (sr.revenue + prc.revenue) > 0
            THEN ROUND(sr.revenue::NUMERIC / (sr.revenue + prc.revenue) * 100, 1)
            ELSE 0
        END AS service_share_pct,
        CASE
            WHEN prp.revenue = 0 AND prc.revenue > 0 THEN 'growing'
            WHEN prp.revenue > 0 AND prc.revenue > prp.revenue * 1.1 THEN 'growing'
            WHEN prp.revenue > 0 AND prc.revenue < prp.revenue * 0.9 THEN 'declining'
            ELSE 'stable'
        END AS product_revenue_trend
    FROM service_rev sr
    CROSS JOIN product_rev_current prc
    CROSS JOIN product_rev_prev prp;
$$;


-- ============================================
-- 7. TENDINTE SEZONIERE (Seasonal Trends)
-- ============================================

-- 7a. Tendinte lunare per categorie (12 luni)
-- KPI: "Tendinte sezoniere", Display: heatmap/multi-line chart, Priority: P2
-- Sfat: "Pregateste stoc de ceara si gel in lunile de varf.
--        Samponul anti-matreata se vinde mai mult iarna."
CREATE OR REPLACE FUNCTION get_seasonal_product_trends(
    p_salon_id UUID
)
RETURNS TABLE (
    month_num INT,
    month_name TEXT,
    category TEXT,
    units_sold BIGINT,
    revenue_cents BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        EXTRACT(MONTH FROM o.created_at)::INT AS month_num,
        CASE EXTRACT(MONTH FROM o.created_at)::INT
            WHEN 1  THEN 'Ianuarie'
            WHEN 2  THEN 'Februarie'
            WHEN 3  THEN 'Martie'
            WHEN 4  THEN 'Aprilie'
            WHEN 5  THEN 'Mai'
            WHEN 6  THEN 'Iunie'
            WHEN 7  THEN 'Iulie'
            WHEN 8  THEN 'August'
            WHEN 9  THEN 'Septembrie'
            WHEN 10 THEN 'Octombrie'
            WHEN 11 THEN 'Noiembrie'
            WHEN 12 THEN 'Decembrie'
        END AS month_name,
        COALESCE(p.category, 'altele') AS category,
        SUM(oi.qty) AS units_sold,
        SUM(oi.price_cents * oi.qty) AS revenue_cents
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    WHERE o.salon_id = p_salon_id
      AND o.status IN ('paid', 'shipped')
      AND o.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY month_num, month_name, p.category
    ORDER BY month_num, revenue_cents DESC;
$$;


-- ============================================
-- 8. DASHBOARD KPI COMPLET PRODUSE (single call)
-- ============================================

-- All-in-one product analytics KPIs
-- KPI: "Dashboard produse", Display: multi-widget dashboard, Priority: P0
-- Sfat: "Verifica acest dashboard zilnic. Fiecare KPI rosu
--        este o oportunitate pierduta."
CREATE OR REPLACE FUNCTION get_product_dashboard_kpis(
    p_salon_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    -- Revenue
    product_revenue_cents BIGINT,
    product_revenue_growth_pct NUMERIC,
    avg_order_value_cents BIGINT,
    total_orders BIGINT,
    total_units_sold BIGINT,
    -- Rankings
    top_product_name TEXT,
    top_product_revenue BIGINT,
    worst_product_name TEXT,
    worst_product_units BIGINT,
    -- Stock
    products_critical_stock BIGINT,
    products_warning_stock BIGINT,
    total_active_products BIGINT,
    -- Cross-sell
    crosssell_rate_pct NUMERIC,
    product_revenue_share_pct NUMERIC,
    -- Cart
    abandoned_carts BIGINT,
    abandoned_cart_value_cents BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    WITH rev_current AS (
        SELECT
            COALESCE(SUM(o.total_cents), 0) AS revenue,
            COUNT(DISTINCT o.id) AS orders,
            COALESCE(SUM(oi.qty), 0) AS units
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    rev_prev AS (
        SELECT COALESCE(SUM(o.total_cents), 0) AS revenue
        FROM orders o
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days * 2 || ' days')::INTERVAL
          AND o.created_at < NOW() - (p_days || ' days')::INTERVAL
    ),
    top_prod AS (
        SELECT p.title, SUM(oi.price_cents * oi.qty) AS rev
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE o.salon_id = p_salon_id
          AND o.status IN ('paid', 'shipped')
          AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY p.title
        ORDER BY rev DESC
        LIMIT 1
    ),
    worst_prod AS (
        SELECT p.title, COALESCE(SUM(oi.qty), 0) AS units
        FROM products p
        LEFT JOIN order_items oi ON oi.product_id = p.id
            AND EXISTS (
                SELECT 1 FROM orders o
                WHERE o.id = oi.order_id
                  AND o.salon_id = p_salon_id
                  AND o.status IN ('paid', 'shipped')
                  AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
            )
        WHERE p.salon_id = p_salon_id AND p.active = true
        GROUP BY p.title
        ORDER BY units ASC
        LIMIT 1
    ),
    stock_alerts AS (
        SELECT
            COUNT(*) FILTER (WHERE p.stock <= 0) AS critical,
            COUNT(*) FILTER (WHERE p.stock > 0 AND p.stock <= p.low_stock_threshold) AS warning,
            COUNT(*) AS total_active
        FROM products p
        WHERE p.salon_id = p_salon_id AND p.active = true
    ),
    crosssell AS (
        SELECT
            COUNT(DISTINCT a.user_id) AS appt_customers,
            COUNT(DISTINCT a.user_id) FILTER (
                WHERE EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.user_id = a.user_id
                      AND o.salon_id = p_salon_id
                      AND o.status IN ('paid', 'shipped')
                      AND o.created_at >= NOW() - (p_days || ' days')::INTERVAL
                )
            ) AS crosssell_customers
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    service_rev AS (
        SELECT COALESCE(SUM(a.total_cents), 0) AS revenue
        FROM appointments a
        JOIN barbers b ON b.id = a.barber_id
        WHERE b.salon_id = p_salon_id
          AND a.status = 'completed'
          AND a.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    ),
    cart_stats AS (
        SELECT
            COUNT(DISTINCT ci.user_id) AS carts,
            COALESCE(SUM(ci.qty * p.price_cents), 0) AS value
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        WHERE p.salon_id = p_salon_id
    )
    SELECT
        rc.revenue AS product_revenue_cents,
        CASE WHEN rp.revenue > 0
            THEN ROUND((rc.revenue - rp.revenue)::NUMERIC / rp.revenue * 100, 1)
            ELSE 0
        END AS product_revenue_growth_pct,
        CASE WHEN rc.orders > 0 THEN rc.revenue / rc.orders ELSE 0 END AS avg_order_value_cents,
        rc.orders AS total_orders,
        rc.units AS total_units_sold,
        tp.title AS top_product_name,
        COALESCE(tp.rev, 0) AS top_product_revenue,
        wp.title AS worst_product_name,
        COALESCE(wp.units, 0) AS worst_product_units,
        sa.critical AS products_critical_stock,
        sa.warning AS products_warning_stock,
        sa.total_active AS total_active_products,
        CASE WHEN cs.appt_customers > 0
            THEN ROUND(cs.crosssell_customers::NUMERIC / cs.appt_customers * 100, 1)
            ELSE 0
        END AS crosssell_rate_pct,
        CASE WHEN (sr.revenue + rc.revenue) > 0
            THEN ROUND(rc.revenue::NUMERIC / (sr.revenue + rc.revenue) * 100, 1)
            ELSE 0
        END AS product_revenue_share_pct,
        cts.carts AS abandoned_carts,
        cts.value AS abandoned_cart_value_cents
    FROM rev_current rc
    CROSS JOIN rev_prev rp
    LEFT JOIN top_prod tp ON true
    LEFT JOIN worst_prod wp ON true
    CROSS JOIN stock_alerts sa
    CROSS JOIN crosssell cs
    CROSS JOIN service_rev sr
    CROSS JOIN cart_stats cts;
$$;


-- ============================================
-- 9. INDEXES for product analytics queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_order_items_product
    ON order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_orders_salon_status_created
    ON orders(salon_id, status, created_at DESC)
    WHERE salon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_salon_active
    ON products(salon_id, active)
    WHERE active = true;


-- ============================================
-- Done! Product Analytics & Recommendation
-- system ready.
-- ============================================
