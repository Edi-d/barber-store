-- ============================================
-- Tapzi Barber — Business Signup Flow & Subscriptions
-- ============================================
-- Adds subscription billing infrastructure on top of the
-- existing salons tenant model. Updates handle_new_user to
-- auto-create the salon + owner membership when a salon
-- owner signs up (3-field signup: salon_name, email, password).
-- ============================================

-- ============================================
-- 1. SALONS — subscription columns
-- ============================================
ALTER TABLE salons ADD COLUMN IF NOT EXISTS cui TEXT;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'pending_activation';
  -- 'pending_activation' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
ALTER TABLE salons ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_salons_subscription_status ON salons(subscription_status);
CREATE INDEX IF NOT EXISTS idx_salons_stripe_customer ON salons(stripe_customer_id);

-- ============================================
-- 2. PLANS — catalog (seeded in Phase 3)
-- ============================================
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,            -- 'solo' | 'pro' | 'salon'
    name TEXT NOT NULL,
    description TEXT,
    stripe_price_id_monthly TEXT,
    stripe_price_id_yearly TEXT,
    price_monthly NUMERIC(10,2) NOT NULL,
    price_yearly NUMERIC(10,2),
    currency TEXT NOT NULL DEFAULT 'RON',
    included_staff INT NOT NULL DEFAULT 1,
    extra_staff_price NUMERIC(10,2),
    included_sms INT NOT NULL DEFAULT 0,
    trial_days INT NOT NULL DEFAULT 14,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plans are viewable by everyone" ON plans
    FOR SELECT USING (is_active);

-- ============================================
-- 3. SUBSCRIPTIONS — one active per salon
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL DEFAULT 'trialing',
      -- 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid'
    stripe_subscription_id TEXT UNIQUE,
    quantity INT NOT NULL DEFAULT 1,       -- total billed staff seats
    billing_interval TEXT NOT NULL DEFAULT 'month', -- 'month' | 'year'
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_sub_per_salon
    ON subscriptions(salon_id)
    WHERE status IN ('trialing','active','past_due','incomplete');
CREATE INDEX IF NOT EXISTS idx_subs_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subs_period_end ON subscriptions(current_period_end)
    WHERE status = 'active';

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Salon owner can read their subscription
CREATE POLICY "Salon owner can view subscription" ON subscriptions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = subscriptions.salon_id
            AND s.owner_id = auth.uid()
        )
    );

-- Writes happen via service_role only (Edge Functions / webhooks)

-- ============================================
-- 4. PAYMENTS — Stripe transaction history
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE RESTRICT,
    subscription_id UUID REFERENCES subscriptions(id),
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_invoice_id TEXT,
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RON',
    status TEXT NOT NULL,                  -- 'succeeded' | 'failed' | 'pending' | 'refunded'
    failure_reason TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_salon ON payments(salon_id, created_at DESC);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salon owner can view payments" ON payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = payments.salon_id
            AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 5. INVOICES — Oblio / SmartBill e-Factura
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE RESTRICT,
    subscription_id UUID REFERENCES subscriptions(id),
    payment_id UUID REFERENCES payments(id),
    stripe_invoice_id TEXT UNIQUE,
    provider TEXT,                         -- 'oblio' | 'smartbill'
    provider_invoice_id TEXT,
    number TEXT,                           -- serie + nr factura RO
    pdf_url TEXT,
    amount NUMERIC(10,2) NOT NULL,
    vat_amount NUMERIC(10,2),
    currency TEXT NOT NULL DEFAULT 'RON',
    status TEXT NOT NULL,                  -- 'draft' | 'issued' | 'paid' | 'void'
    issued_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_salon ON invoices(salon_id, issued_at DESC);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salon owner can view invoices" ON invoices
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = invoices.salon_id
            AND s.owner_id = auth.uid()
        )
    );

-- ============================================
-- 6. WEBHOOK_EVENTS — idempotency for Stripe
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL,                -- 'stripe' | 'oblio'
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ,
    error TEXT,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_unprocessed
    ON webhook_events(provider, received_at)
    WHERE processed_at IS NULL;

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only

-- ============================================
-- 7. ACTIVATION_TOKENS — one-time app→web bridge
-- ============================================
CREATE TABLE IF NOT EXISTS activation_tokens (
    token UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_tokens_salon ON activation_tokens(salon_id);

ALTER TABLE activation_tokens ENABLE ROW LEVEL SECURITY;
-- No client policies: created + consumed via Edge Functions

-- ============================================
-- 8. TRIGGER — updated_at on subscriptions
-- ============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_subs_updated ON subscriptions;
CREATE TRIGGER trg_subs_updated
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- 9. handle_new_user — auto-create salon for B2B signup
-- ============================================
-- When metadata.signup_flow = 'salon_owner', create:
--   profile (role=user, onboarding_role=salon_owner, onboarding_completed=true)
--   salon (name from metadata.salon_name)
--   salon_members (role=owner)
-- Otherwise (legacy / barber flow), keep existing behavior.
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    _username TEXT;
    _display_name TEXT;
    _signup_flow TEXT;
    _salon_name TEXT;
    _salon_id UUID;
BEGIN
    _signup_flow := NEW.raw_user_meta_data ->> 'signup_flow';
    _salon_name  := NEW.raw_user_meta_data ->> 'salon_name';

    -- Generate username from email (salon owners don't pick one manually)
    _username := COALESCE(
        NEW.raw_user_meta_data ->> 'username',
        LOWER(SPLIT_PART(NEW.email, '@', 1)) || '_' || SUBSTR(NEW.id::TEXT, 1, 4)
    );

    _display_name := COALESCE(
        NEW.raw_user_meta_data ->> 'display_name',
        _salon_name,
        _username
    );

    -- Always create the profile
    INSERT INTO public.profiles (id, username, display_name, role, onboarding_role, onboarding_completed)
    VALUES (
        NEW.id,
        _username,
        _display_name,
        'user',
        CASE WHEN _signup_flow = 'salon_owner' THEN 'salon_owner' ELSE NULL END,
        -- Stays FALSE for salon_owner until plan is activated. The AuthGuard
        -- branches on (onboarding_role='salon_owner') to route them to the
        -- activation flow instead of the legacy onboarding wizard.
        FALSE
    );

    -- For salon owner flow, also create the salon + owner membership
    IF _signup_flow = 'salon_owner' AND _salon_name IS NOT NULL THEN
        INSERT INTO public.salons (owner_id, name, subscription_status)
        VALUES (NEW.id, _salon_name, 'pending_activation')
        RETURNING id INTO _salon_id;

        INSERT INTO public.salon_members (salon_id, profile_id, role)
        VALUES (_salon_id, NEW.id, 'owner');
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger stays the same (AFTER INSERT ON auth.users)
-- Re-declaring is idempotent (CREATE OR REPLACE FUNCTION above)

-- ============================================
-- Done!
-- ============================================
