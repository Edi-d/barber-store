-- ============================================================================
-- Migration 061: Loyalty Seasonal Events
-- ============================================================================
-- Seasonal & special event system for the loyalty program:
--   - loyalty_events: time-bound campaigns (holidays, flash sales, collabs)
--   - event_participations: tracks who participated + rewards awarded
--   - check_and_apply_event_bonus() RPC: idempotent bonus awarding
--   - Seed templates for common Romanian holidays
--   - Full RLS: users see active events, salon owners manage their own
-- ============================================================================

-- ============================================================================
-- 1. LOYALTY_EVENTS — Seasonal / special event definitions
-- ============================================================================
-- Each salon can create events (or activate templates).
-- During an active event, completed appointments may earn bonus points
-- and/or unlock event-exclusive badges.
-- ============================================================================
CREATE TABLE IF NOT EXISTS loyalty_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'holiday',         -- national / religious holiday
        'seasonal',        -- season-based (back to school, summer, etc.)
        'flash',           -- short-duration surprise event
        'collaboration',   -- brand or influencer collab
        'weather',         -- weather-triggered (e.g. rainy day bonus)
        'sport'            -- sports event tie-in
    )),
    point_multiplier NUMERIC(3,1) NOT NULL DEFAULT 1.0,  -- 2.0 = double points
    bonus_points INT NOT NULL DEFAULT 0,                  -- flat bonus per visit during event
    badge_id UUID REFERENCES achievements(id),            -- event-exclusive badge (optional)
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    image_url TEXT,
    notification_title TEXT,                               -- push notification copy
    notification_body TEXT,
    max_participants INT,                                  -- NULL = unlimited
    participation_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_loyalty_events_salon_slug UNIQUE (salon_id, slug),
    CONSTRAINT chk_loyalty_events_dates CHECK (ends_at > starts_at),
    CONSTRAINT chk_loyalty_events_multiplier CHECK (point_multiplier >= 1.0),
    CONSTRAINT chk_loyalty_events_bonus CHECK (bonus_points >= 0)
);

ALTER TABLE loyalty_events ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_events_salon_active
    ON loyalty_events(salon_id, active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_events_type
    ON loyalty_events(event_type);
CREATE INDEX IF NOT EXISTS idx_loyalty_events_dates
    ON loyalty_events(starts_at, ends_at)
    WHERE active = TRUE;

-- RLS: Anyone can see active events (needed for client display)
DROP POLICY IF EXISTS "Anyone can view active events" ON loyalty_events;
CREATE POLICY "Anyone can view active events" ON loyalty_events
    FOR SELECT USING (active = TRUE);

-- RLS: Salon owners can see ALL their events (including inactive)
DROP POLICY IF EXISTS "Salon owner can view all own events" ON loyalty_events;
CREATE POLICY "Salon owner can view all own events" ON loyalty_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = loyalty_events.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- RLS: Salon owner can manage their events
DROP POLICY IF EXISTS "Salon owner can manage events" ON loyalty_events;
CREATE POLICY "Salon owner can manage events" ON loyalty_events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = loyalty_events.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- ============================================================================
-- 2. EVENT_PARTICIPATIONS — Track who participated
-- ============================================================================
-- One row per event + user + appointment.
-- The UNIQUE constraint ensures idempotency: calling the RPC twice
-- for the same appointment will not double-award.
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_participations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES loyalty_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    bonus_awarded INT NOT NULL DEFAULT 0,
    badge_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_event_participation UNIQUE (event_id, user_id, appointment_id)
);

ALTER TABLE event_participations ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_participations_user
    ON event_participations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_participations_event
    ON event_participations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participations_salon
    ON event_participations(salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_participations_appointment
    ON event_participations(appointment_id);

-- RLS: Users can see their own participations
DROP POLICY IF EXISTS "Users can view own event participations" ON event_participations;
CREATE POLICY "Users can view own event participations" ON event_participations
    FOR SELECT USING (auth.uid() = user_id);

-- RLS: Salon owner can see participations for their salon
DROP POLICY IF EXISTS "Salon owner can view salon participations" ON event_participations;
CREATE POLICY "Salon owner can view salon participations" ON event_participations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM salons s
            WHERE s.id = event_participations.salon_id
              AND s.owner_id = auth.uid()
        )
    );

-- RLS: System can insert (via RPC with SECURITY DEFINER)
DROP POLICY IF EXISTS "System can insert participations" ON event_participations;
CREATE POLICY "System can insert participations" ON event_participations
    FOR INSERT WITH CHECK (true);

-- ============================================================================
-- 3. RPC: check_and_apply_event_bonus
-- ============================================================================
-- Called after an appointment is completed.
-- For each active event at the salon, awards bonus points and/or badge.
-- Idempotent: the UNIQUE constraint on event_participations prevents duplicates.
-- Returns the total bonus points awarded across all matching events.
-- ============================================================================
CREATE OR REPLACE FUNCTION check_and_apply_event_bonus(
    p_appointment_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appointment RECORD;
    v_salon_id UUID;
    v_event RECORD;
    v_total_bonus INT := 0;
    v_event_bonus INT := 0;
    v_badge_given BOOLEAN := FALSE;
    v_profile loyalty_profiles%ROWTYPE;
    v_new_balance INT;
BEGIN
    -- 1. Fetch appointment details (salon resolved via barber)
    SELECT a.id, a.user_id, a.barber_id, a.total_cents, a.status, a.scheduled_at
    INTO v_appointment
    FROM appointments a
    WHERE a.id = p_appointment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Programarea % nu a fost gasita', p_appointment_id;
    END IF;

    IF v_appointment.status <> 'completed' THEN
        RAISE EXCEPTION 'Programarea % nu este finalizata', p_appointment_id;
    END IF;

    -- Resolve salon_id through barber
    SELECT b.salon_id INTO v_salon_id
    FROM barbers b
    WHERE b.id = v_appointment.barber_id;

    IF v_salon_id IS NULL THEN
        RETURN 0;  -- no salon found, nothing to do
    END IF;

    -- 2. Find all active events for this salon at the time of the appointment
    FOR v_event IN
        SELECT le.*
        FROM loyalty_events le
        WHERE le.salon_id = v_salon_id
          AND le.active = TRUE
          AND v_appointment.scheduled_at >= le.starts_at
          AND v_appointment.scheduled_at <= le.ends_at
          AND (le.max_participants IS NULL OR le.participation_count < le.max_participants)
    LOOP
        v_event_bonus := 0;
        v_badge_given := FALSE;

        -- Flat bonus only; the multiplier is applied by earn_appointment_points
        v_event_bonus := v_event.bonus_points;

        -- 3. Award event-exclusive badge if configured
        IF v_event.badge_id IS NOT NULL THEN
            INSERT INTO user_achievements (user_id, achievement_id, salon_id)
            SELECT v_appointment.user_id, v_event.badge_id, v_salon_id
            WHERE NOT EXISTS (
                SELECT 1 FROM user_achievements ua
                WHERE ua.user_id = v_appointment.user_id
                  AND ua.achievement_id = v_event.badge_id
            );

            IF FOUND THEN
                v_badge_given := TRUE;
            END IF;
        END IF;

        -- 4. Record participation (idempotent via UNIQUE constraint)
        BEGIN
            INSERT INTO event_participations (
                event_id, user_id, salon_id, appointment_id,
                bonus_awarded, badge_awarded
            ) VALUES (
                v_event.id, v_appointment.user_id, v_salon_id,
                p_appointment_id, v_event_bonus, v_badge_given
            );

            -- 5. Increment participation count on the event
            UPDATE loyalty_events
            SET participation_count = participation_count + 1
            WHERE id = v_event.id;

            -- 6. Credit bonus points to loyalty profile + audit log (if any)
            IF v_event_bonus > 0 THEN
                -- Lock and update loyalty_profiles
                SELECT * INTO v_profile
                FROM loyalty_profiles
                WHERE user_id = v_appointment.user_id AND salon_id = v_salon_id
                FOR UPDATE;

                IF v_profile.id IS NOT NULL THEN
                    v_new_balance := v_profile.current_points + v_event_bonus;

                    UPDATE loyalty_profiles
                    SET current_points = v_new_balance,
                        lifetime_points = lifetime_points + v_event_bonus,
                        updated_at = NOW()
                    WHERE id = v_profile.id;

                    -- Insert audit log into point_transactions
                    INSERT INTO point_transactions (
                        loyalty_profile_id, salon_id, user_id, type, amount,
                        balance_after, source, source_id, description,
                        idempotency_key
                    ) VALUES (
                        v_profile.id, v_salon_id, v_appointment.user_id,
                        'earn_bonus', v_event_bonus,
                        v_new_balance, 'system', v_event.id,
                        'Bonus eveniment: ' || v_event.name,
                        'event_bonus_' || v_event.id::TEXT || '_' || p_appointment_id::TEXT
                    );
                END IF;
            END IF;

            v_total_bonus := v_total_bonus + v_event_bonus;

        EXCEPTION WHEN unique_violation THEN
            -- Already participated for this event + appointment — skip
            NULL;
        END;
    END LOOP;

    RETURN v_total_bonus;
END;
$$;

-- ============================================================================
-- 4. HELPER: get_active_event_multiplier
-- ============================================================================
-- Returns the highest point multiplier among active events for a salon
-- at a given timestamp. Used by the main point-earning RPC to apply
-- multiplied points on regular appointment earnings.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_active_event_multiplier(
    p_salon_id UUID,
    p_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS NUMERIC(3,1)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(MAX(point_multiplier), 1.0)
    FROM loyalty_events
    WHERE salon_id = p_salon_id
      AND active = TRUE
      AND p_at >= starts_at
      AND p_at <= ends_at;
$$;

-- ============================================================================
-- 5. SEED DATA — Romanian holiday event templates
-- ============================================================================
-- NOTE: These are TEMPLATES. They are inserted with active = FALSE.
-- The salon owner activates and customizes them from the management UI.
-- Each salon should copy these templates and adjust dates for the
-- current year, customize names, descriptions, and bonus amounts.
-- ============================================================================

-- We use a DO block so we can reference a salon_id variable.
-- In production, templates are created per-salon when the salon
-- enables the loyalty system. This seed uses a placeholder approach:
-- templates are stored as a comment/reference and inserted via
-- a helper function that salon onboarding calls.

CREATE OR REPLACE FUNCTION seed_event_templates(p_salon_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Ziua Barbatului (Men's Day) — Feb 22-23
    INSERT INTO loyalty_events (
        salon_id, slug, name, description, event_type,
        point_multiplier, bonus_points,
        starts_at, ends_at, active,
        notification_title, notification_body
    ) VALUES (
        p_salon_id,
        'ziua-barbatului',
        'Ziua Barbatului',
        'Sarbatoreste Ziua Barbatului cu puncte triple! Vino sa te rasfeti.',
        'holiday',
        3.0, 0,
        (date_trunc('year', NOW()) + INTERVAL '1 month 21 days')::TIMESTAMPTZ,
        (date_trunc('year', NOW()) + INTERVAL '1 month 22 days 23 hours 59 minutes')::TIMESTAMPTZ,
        FALSE,
        'Ziua Barbatului — Puncte Triple!',
        'Astazi castigi de 3x mai multe puncte. Programeaza-te acum!'
    ) ON CONFLICT (salon_id, slug) DO NOTHING;

    -- 1 Martie (Martisor) — March 1
    INSERT INTO loyalty_events (
        salon_id, slug, name, description, event_type,
        point_multiplier, bonus_points,
        starts_at, ends_at, active,
        notification_title, notification_body
    ) VALUES (
        p_salon_id,
        '1-martie',
        '1 Martie — Martisor',
        'Primavara incepe cu un bonus de 100 puncte la orice vizita!',
        'holiday',
        1.0, 100,
        (date_trunc('year', NOW()) + INTERVAL '2 months')::TIMESTAMPTZ,
        (date_trunc('year', NOW()) + INTERVAL '2 months 23 hours 59 minutes')::TIMESTAMPTZ,
        FALSE,
        'Martisor Fericit!',
        'Bonus de 100 puncte la vizita ta de 1 Martie.'
    ) ON CONFLICT (salon_id, slug) DO NOTHING;

    -- Paste (Easter) — Approximate: April 15-21 (owner should adjust yearly)
    INSERT INTO loyalty_events (
        salon_id, slug, name, description, event_type,
        point_multiplier, bonus_points,
        starts_at, ends_at, active,
        notification_title, notification_body
    ) VALUES (
        p_salon_id,
        'paste',
        'Fresh de Paste',
        'Pregateste-te de sarbatori cu puncte duble! Look fresh pentru masa de Paste.',
        'holiday',
        2.0, 0,
        (date_trunc('year', NOW()) + INTERVAL '3 months 14 days')::TIMESTAMPTZ,
        (date_trunc('year', NOW()) + INTERVAL '3 months 20 days 23 hours 59 minutes')::TIMESTAMPTZ,
        FALSE,
        'Fresh de Paste — Puncte Duble!',
        'Puncte duble toata saptamana dinaintea Pastelui.'
    ) ON CONFLICT (salon_id, slug) DO NOTHING;

    -- Back to School — Sept 1-14
    INSERT INTO loyalty_events (
        salon_id, slug, name, description, event_type,
        point_multiplier, bonus_points,
        starts_at, ends_at, active,
        notification_title, notification_body
    ) VALUES (
        p_salon_id,
        'back-to-school',
        'Back to School',
        'Incepe anul scolar cu un look nou! Puncte duble primele doua saptamani din septembrie.',
        'seasonal',
        2.0, 0,
        (date_trunc('year', NOW()) + INTERVAL '8 months')::TIMESTAMPTZ,
        (date_trunc('year', NOW()) + INTERVAL '8 months 13 days 23 hours 59 minutes')::TIMESTAMPTZ,
        FALSE,
        'Back to School — Puncte Duble!',
        'Look nou pentru noul an scolar. Puncte duble pana pe 14 septembrie!'
    ) ON CONFLICT (salon_id, slug) DO NOTHING;

    -- Craciun (Christmas) — Dec 20-23 (advent-style, different bonus each day)
    -- Day 1: 50 bonus, Day 2: 75 bonus, Day 3: 100 bonus, Day 4: 150 bonus
    INSERT INTO loyalty_events (
        salon_id, slug, name, description, event_type,
        point_multiplier, bonus_points,
        starts_at, ends_at, active,
        notification_title, notification_body
    ) VALUES (
        p_salon_id,
        'craciun-advent',
        'Calendarul Craciunului',
        'Bonus crescator in fiecare zi! 20 Dec: +50pt, 21 Dec: +75pt, 22 Dec: +100pt, 23 Dec: +150pt. Cu cat vii mai tarziu, cu atat castigi mai mult!',
        'holiday',
        1.0, 50,
        (date_trunc('year', NOW()) + INTERVAL '11 months 19 days')::TIMESTAMPTZ,
        (date_trunc('year', NOW()) + INTERVAL '11 months 22 days 23 hours 59 minutes')::TIMESTAMPTZ,
        FALSE,
        'Calendarul Craciunului — Bonusuri Zilnice!',
        'Deschide calendarul: bonus diferit in fiecare zi pana de Craciun!'
    ) ON CONFLICT (salon_id, slug) DO NOTHING;

    -- Revelion (New Year's Eve) — Dec 28-31
    INSERT INTO loyalty_events (
        salon_id, slug, name, description, event_type,
        point_multiplier, bonus_points,
        starts_at, ends_at, active,
        notification_title, notification_body
    ) VALUES (
        p_salon_id,
        'revelion',
        'Fresh de Revelion',
        'Intra in noul an cu stil! Puncte duble pentru ultimele zile din an.',
        'holiday',
        2.0, 0,
        (date_trunc('year', NOW()) + INTERVAL '11 months 27 days')::TIMESTAMPTZ,
        (date_trunc('year', NOW()) + INTERVAL '11 months 30 days 23 hours 59 minutes')::TIMESTAMPTZ,
        FALSE,
        'Fresh de Revelion — Puncte Duble!',
        'Ultimele zile din an = puncte duble. Programeaza-te!'
    ) ON CONFLICT (salon_id, slug) DO NOTHING;
END;
$$;

-- ============================================================================
-- 6. ADVENT CALENDAR HELPER
-- ============================================================================
-- For the Craciun advent-style event, this function returns the
-- correct bonus for a given day. Called by check_and_apply_event_bonus
-- or by the client to display the daily bonus.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_advent_bonus(
    p_event_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event RECORD;
    v_day_offset INT;
BEGIN
    SELECT * INTO v_event
    FROM loyalty_events
    WHERE id = p_event_id AND slug LIKE '%advent%';

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    v_day_offset := p_date - v_event.starts_at::DATE;

    -- Escalating bonus: 50, 75, 100, 150
    RETURN CASE v_day_offset
        WHEN 0 THEN 50
        WHEN 1 THEN 75
        WHEN 2 THEN 100
        WHEN 3 THEN 150
        ELSE 0
    END;
END;
$$;

-- ============================================================================
-- Done. Summary:
--   - loyalty_events: event campaigns with multipliers + flat bonuses
--   - event_participations: idempotent participation tracking
--   - check_and_apply_event_bonus(): RPC called after appointment completion
--   - get_active_event_multiplier(): helper for main point-earning RPC
--   - seed_event_templates(): creates 6 Romanian holiday templates per salon
--   - get_advent_bonus(): daily bonus lookup for advent-style events
-- ============================================================================
