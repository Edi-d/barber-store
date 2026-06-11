# Supabase Integration Reference — Tapzi Consumer App

> Generated 2026-06-11 — reflects migrations through **144**.
>
> **Audience:** developers of the Tapzi web app and the Taopzi salon-side app who must
> integrate against the **same Supabase project** and stay compatible with the consumer
> app. Source of truth is the live hosted DB; migration files are applied by hand and
> contain numbering duplicates — treat the DB, not the folder, as authoritative.

---

## Table of Contents

1. [Overview & Project Setup](#1-overview--project-setup)
2. [Auth & Profiles](#2-auth--profiles)
3. [Booking & Appointments](#3-booking--appointments)
4. [Social](#4-social)
5. [Marketplace & Orders](#5-marketplace--orders)
6. [Loyalty, Notifications & Support](#6-loyalty-notifications--support)
7. [Discover & Salons](#7-discover--salons)
8. [Storage Buckets](#8-storage-buckets)
9. [Edge Functions](#9-edge-functions)
10. [Realtime Catalog](#10-realtime-catalog)
11. [Cross-App Compatibility Rules](#11-cross-app-compatibility-rules)
12. [Known Caveats & Recommendations](#12-known-caveats--recommendations)

---

## 1. Overview & Project Setup

### Client initialization

File: `lib/supabase.ts`

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: <platform adapter>,   // SecureStore (native) | localStorage (web)
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,      // URLs are parsed manually — see Auth section
    },
  }
);
```

**Required env vars**

| Var | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key (safe for clients) |
| `EXPO_PUBLIC_LIVEKIT_URL` | LiveKit server (`wss://...`) — social, not Supabase |
| `EXPO_PUBLIC_GEMINI_API_KEY` | Gemini direct-from-device key — hairstyle tryon |
| `EXPO_PUBLIC_CATALOG_SOURCE` | `'nop'` (default) or `'supabase'` — marketplace catalog source |

**Storage adapters**

| Platform | Adapter | Session key |
|---|---|---|
| Native (iOS/Android) | `expo-secure-store` via `SecureStore.getItemAsync` | `sb-<ref>-auth-token` (default, not customized) |
| Web | `localStorage` | same key |

### Key libraries

- `@supabase/supabase-js` v2 — all DB/auth/realtime/storage/functions calls
- `react-query` (TanStack Query) — data fetching cache; cache keys documented per domain
- `zustand` — global stores (`authStore`, `notificationStore`, `cartStore`)
- `lib/realtime.ts` — singleton channel registry (`getOrCreateChannel`, `subscribeChannel`, `removeChannel`, `cleanupAllChannels`); deduplicates channels across StrictMode double-mounts; all domains except `useLiveChat`/`useLiveViewers` use this registry

### Migration convention

Migrations live in `migrations/` and are applied manually in the Supabase SQL editor. There is no Supabase CLI history. Several migration numbers are duplicated because of a 2026-05-11 directory merge — functionally identical files share the same purpose. Known byte-identical pairs: `025=026`, `030=031`, `011=056`, `020=057`, `041=046`, `042=047`. Never rely on migration numbers as a sequence — rely on the live DB schema.

---

## 2. Auth & Profiles

### Auth API surface

| Call | Purpose | Caller |
|---|---|---|
| `auth.getSession()` | Hydrate session on app start | `stores/authStore.ts` |
| `auth.onAuthStateChange(cb)` | Sync session + fetch profile | `stores/authStore.ts` |
| `auth.signInWithPassword({ email, password })` | Sign in | `stores/authStore.ts` |
| `auth.signUp({ email, password, options: { emailRedirectTo: "tapzi://auth/callback", data: { signup_source: "customer_app" } } })` | Register; email confirmation required; no session returned | `stores/authStore.ts` |
| `auth.resend({ type: "signup", email })` | Resend confirmation | `app/(auth)/confirm-email.tsx` |
| `auth.resetPasswordForEmail(email, { redirectTo: "tapzi://reset-password" })` | Start password reset | `stores/authStore.ts` |
| `auth.verifyOtp({ email, token, type: "recovery" })` | 6-digit OTP from reset email | `stores/authStore.ts` |
| `auth.verifyOtp({ token_hash, type })` | Deep-link `?token_hash=…&type=signup|recovery` | `app/_layout.tsx` |
| `auth.setSession({ access_token, refresh_token })` | Deep-link `#access_token=…` implicit-flow fallback | `app/_layout.tsx` |
| `auth.updateUser({ password })` | New password after recovery | `stores/authStore.ts` |
| `auth.signOut()` | Signs out; must be preceded by `cleanupAllChannels()` | `stores/authStore.ts` |

Deep links parsed by `handleAuthUrl` in `app/_layout.tsx`:
- `tapzi://auth/callback` — signup email confirmation
- `tapzi://reset-password` — password recovery

Both the `token_hash` querystring format AND the `access_token` fragment format must be supported (`detectSessionInUrl: false` means the app parses both manually).

The salon app should set `signup_source` to its own value in `raw_user_meta_data` to distinguish account origin.

### `profiles` table

Schema: `id UUID PK REFERENCES auth.users CASCADE`, `username TEXT UNIQUE NOT NULL`, `display_name TEXT`, `avatar_url TEXT`, `bio TEXT`, `role TEXT DEFAULT 'user'`, `created_at TIMESTAMPTZ`, `verified BOOLEAN DEFAULT FALSE`, `followers_count INT DEFAULT 0`, `following_count INT DEFAULT 0`, `onboarding_completed BOOLEAN DEFAULT FALSE`, `onboarding_role TEXT`, `search_vector tsvector`.

| Operation | Columns written | Caller |
|---|---|---|
| **SELECT** `*` `.maybeSingle()` | — | `stores/authStore.ts` (`fetchProfile`) |
| **UPDATE** `username, display_name, bio, onboarding_completed=true` | Only `.eq("id", auth.uid())` | `stores/authStore.ts` (`createProfile`) |
| **UPDATE** `avatar_url` | Only `.eq("id", auth.uid())` | `stores/authStore.ts` (`updateProfile`) |

**No client INSERT or DELETE.** Row creation is handled by the `on_auth_user_created` DB trigger (`handle_new_user()`, AFTER INSERT ON `auth.users`, SECURITY DEFINER). It inserts `profiles` with `role='user'`, `onboarding_completed=FALSE`. Username default: `raw_user_meta_data->>'username'` or `split_part(email,'@',1) || '_' || substr(id::text,1,4)`. A second client MUST NOT insert its own `profiles` row; update the trigger-created one.

**RLS:** SELECT `USING (true)` (world-readable including anon). UPDATE `USING/WITH CHECK (auth.uid() = id)` (own row only). No DELETE policy.

**Denormalized counters** — never write directly:
- `followers_count`, `following_count` — maintained by `trg_follow_counts_insert/delete` triggers on `follows`
- `search_vector` — maintained by `trg_profiles_search_vector` trigger

**Onboarding**: complete is signaled by `onboarding_completed = true` set in the same UPDATE that writes `username`/`display_name`/`bio`. Routing gates on this field — set it identically or users will be re-onboarded on every app open. Client-side username rule (NOT DB-enforced): `/^[a-zA-Z0-9_]+$/`, minimum 3 chars.

**`useAuth()` hook** (`providers/auth-provider.tsx`) is a thin shim over the Zustand `authStore`; returns `{ session, user, profile, loading }`. `<AuthProvider>` is a no-op wrapper.

---

## 3. Booking & Appointments

This is the most complex domain. Migration 144 (`144_booking_hardening.sql`) introduced a new booking architecture. The section below documents the **new contract (migration 144+)**.

### 3.1 Core tables

#### `appointments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL FK profiles CASCADE | booker |
| `barber_id` | uuid NOT NULL FK barbers RESTRICT | |
| `service_id` | uuid NOT NULL FK barber_services RESTRICT | primary/first service (backward-compat) |
| `scheduled_at` | timestamptz NOT NULL | stored in UTC; working-hours logic uses `Europe/Bucharest` |
| `duration_min` | int NOT NULL | sum of all selected services |
| `status` | text NOT NULL DEFAULT `'pending'` | `pending|confirmed|completed|cancelled|no_show` — text, not a PG enum; CHECK enforced |
| `notes` | text | nullable; max 500 chars enforced by `book_appointment` RPC |
| `total_cents` | int NOT NULL | sum of all selected services; never trust client-supplied price |
| `currency` | text NOT NULL DEFAULT `'RON'` | |
| `service_ids` | uuid[] DEFAULT `'{}'` | **legacy array from mig 038** — not maintained by this client; junction table is source of truth |
| `salon_client_id` | uuid FK salon_clients SET NULL | back-filled by autolink trigger |
| `reminder_24h_sent` | boolean DEFAULT false | |
| `reminder_1h_sent` | boolean DEFAULT false | |
| `created_at`, `updated_at` | timestamptz | `updated_at` trigger-maintained |

**No `salon_id` column** — salon is always derived via `barber_id → barbers.salon_id`.

Key indexes: `idx_appointments_user (user_id, scheduled_at DESC)`, `idx_appointments_barber (barber_id, scheduled_at)`, `idx_appointments_status (status, scheduled_at)` — all from mig 004. The mig 144 overlap trigger filters by `barber_id` first and is served by `idx_appointments_barber` (no expression index is possible: `timestamptz + interval` is STABLE, not IMMUTABLE).

#### `appointment_services` (junction)

| Column | Type |
|---|---|
| `id` | uuid PK |
| `appointment_id` | uuid FK appointments CASCADE |
| `service_id` | uuid FK barber_services CASCADE |
| `duration_min` | int NOT NULL |
| `price_cents` | int NOT NULL >= 0 |
| `sort_order` | int DEFAULT 0 (selection order) |

UNIQUE: `(appointment_id, service_id)`.

#### `barber_availability`

Weekly schedule template. Columns: `barber_id`, `day_of_week INT CHECK 0–6` (0=Sunday), `start_time TIME`, `end_time TIME`, `is_available BOOL DEFAULT TRUE`. UNIQUE `(barber_id, day_of_week)`.

**Schedule precedence rule (authoritative for both client and server):** When ANY `barber_availability` rows exist for a barber (including `is_available=false` rows), that barber owns their own schedule entirely — only `is_available=true` days work, and there is NO fallback to `salon_hours`. When zero rows exist, fall back to `salon_hours` (`is_open=true` days). This rule is mirrored in `lib/booking.ts` (`resolveSchedule`) and enforced in the `book_appointment` RPC.

#### `salon_hours`

Owner-published salon schedule. Columns: `salon_id`, `day_of_week INT 0–6`, `is_open BOOL DEFAULT TRUE`, `open_time TIME DEFAULT '09:00'`, `close_time TIME DEFAULT '18:00'`. UNIQUE `(salon_id, day_of_week)`.

Used as the fallback when a barber has zero `barber_availability` rows.

#### `barber_breaks`

Barber time-off (vacation, lunch, recurring blocks). Key columns: `salon_id`, `barber_id`, `start_at/end_at timestamptz`, `reason_type TEXT CHECK IN ('lunch','vacation','training','personal','other')`, `recurrence_rule TEXT CHECK IN ('NONE','DAILY','WEEKLY_MO'…'WEEKLY_SU')`, `recurrence_until DATE NULL` (NULL + recurring = infinite), `parent_break_id uuid FK barber_breaks CASCADE` (occurrence override), `is_exception_skip BOOL DEFAULT false` (tombstone for single-occurrence deletion), `color TEXT NULL` matching `^#[0-9A-Fa-f]{6}$`.

A GiST index on `(barber_id, tstzrange(start_at, end_at, '[)'))` exists (requires `btree_gist`).

View `v_barber_breaks_active` (mig 121) — now `security_invoker = on` (mig 144), so RLS applies under the caller's identity. Consumer app has no reads of this view; the salon app reads it as an authenticated member.

#### `appointment_reminders`

Rows scheduled by trigger on `status='confirmed'`. Columns: `appointment_id`, `salon_id`, `channel TEXT CHECK IN ('sms','email')`, `scheduled_for`, `status TEXT CHECK IN ('pending','sent','failed','skipped','cancelled')`. UNIQUE `(appointment_id, channel)`.

Companion: `salon_reminder_preferences (salon_id PK, sms_enabled, email_enabled, hours_before CHECK IN (1,2,3,4,6,12,24) DEFAULT 2)`.

### 3.2 Status lifecycle

```
         (insert)          (salon confirms)         (completed)
pending ──────────────► confirmed ──────────────► completed
   │                       │
   └──────────────► cancelled ◄──── (customer or salon cancels)
                            ▲
no_show ────────────────────┘
```

**"Blocking" convention** (used everywhere for availability and slot math):
```
status NOT IN ('cancelled', 'no_show')
```
This is the single canonical definition used by all overlap checks, triggers, and RPCs. Do not invent alternatives.

- Consumer app always inserts `'pending'`
- `book_appointment` RPC forces `status='pending'`
- `create_appointment_with_client` RPC forces `status='confirmed'`
- `update_appointment_with_services` RPC forces `status='confirmed'` on every edit
- Cancel = UPDATE `status='cancelled'` — never DELETE

### 3.3 New booking RPCs (migration 144)

#### `get_barber_busy_intervals(p_barber_id uuid, p_from timestamptz, p_to timestamptz)`

- **Security:** SECURITY DEFINER; GRANT EXECUTE TO authenticated; raises `42501 not_authenticated` if `auth.uid() IS NULL`
- **Window validation:** `p_to > p_from`; max 60 days; raises `22023 invalid_window` on violation
- **Returns:** `TABLE(busy_start timestamptz, busy_end timestamptz)`
  - All appointments for the barber where `status NOT IN ('cancelled', 'no_show')` that overlap the window (anonymized — no user PII)
  - All barber break occurrences (non-recurring + full recurring expansion in `Europe/Bucharest` wall-clock including tombstone skips) via internal helper `_barber_break_occurrences`
- **Purpose:** replaces direct `appointments` SELECTs by customers, which are RLS-blind (customers cannot see other users' rows). This RPC is the **authoritative availability data source** for slot generation.
- **Client usage:** `lib/booking.ts` → `fetchBusyIntervals()` → `supabase.rpc("get_barber_busy_intervals", { p_barber_id, p_from, p_to })`

#### `book_appointment(p_barber_id uuid, p_service_ids uuid[], p_scheduled_at timestamptz, p_notes text DEFAULT NULL)`

- **Security:** SECURITY DEFINER; GRANT EXECUTE TO authenticated
- **Returns:** `TABLE(id uuid, scheduled_at timestamptz, duration_min int, total_cents int, currency text, status text)` — one row
- **Atomic steps:**
  1. Auth gate — `42501 not_authenticated` if no session
  2. Load barber (`invalid_barber` `22023` if not found or inactive)
  3. Dedupe and validate service IDs — all must be active and belong to the barber's salon (`invalid_services` `22023`)
  4. Check `barber_service_assignments` — if ANY rows exist for this barber, all requested services must be assigned (`service_not_assigned` `22023`)
  5. Aggregate `duration_min` and `total_cents` server-side from `barber_services` rows (client-supplied price is ignored)
  6. Past-slot guard (`past_slot` `22023` if `p_scheduled_at <= now()`)
  7. Notes validation (max 500 chars, `notes_too_long` `22023`)
  8. Working-hours check in `Europe/Bucharest` — uses `barber_availability` when ANY rows exist, else `salon_hours` (`outside_working_hours` `22023`)
  9. Per-barber advisory lock via `pg_advisory_xact_lock(hashtextextended('booking:' || barber_id, 0))` — serializes concurrent bookings
  10. Appointment overlap check (`slot_taken` `23P01`)
  11. Barber break overlap check via `_barber_break_occurrences` (`barber_break` `23P01`)
  12. INSERT into `appointments` (`status='pending'`) + INSERT all `appointment_services` rows atomically
- **Price:** always server-computed from `barber_services.price_cents`; never trust the client
- **Notes:** btrim'd; empty → NULL

**Full error-code contract (every client MUST implement):**

| SQLSTATE | Message key | Meaning | Client action |
|---|---|---|---|
| `23P01` | `slot_taken` | Overlap with another appointment | Refresh availability; show "slot unavailable" |
| `23P01` | `barber_break` | Overlap with a barber break | Refresh availability; show "barber unavailable" |
| `23P01` | _(trigger text)_ | Overlap caught by `appointments_check_overlap` trigger | Same as slot_taken |
| `22023` | `invalid_barber` | Barber not found or inactive | Reload barber list |
| `22023` | `invalid_services` | Service not found, inactive, or wrong salon | Reload service list |
| `22023` | `service_not_assigned` | Service not assigned to this barber | Reload service list |
| `22023` | `outside_working_hours` | Slot outside barber/salon working hours | Reload slots |
| `22023` | `past_slot` | Slot is in the past | Reload slots |
| `22023` | `notes_too_long` | Notes > 500 chars | Validate client-side |
| `22023` | `invalid_window` | Bad window for `get_barber_busy_intervals` | Fix query parameters |
| `22023` | `cannot_edit_cancelled` | Trying to edit a cancelled/no_show appointment via `update_appointment_with_services` | Do not call RPC on cancelled rows |
| `42501` | `not_authenticated` | No active session | Re-authenticate |
| `42501` | `clients may only cancel or edit notes` | Customer tried to mutate barber/service/time | Block in UI |
| `42501` | `forbidden: not a salon member` | Non-member called `update_appointment_with_services` | Block in UI |

### 3.4 Salon-side booking RPCs

These are called by the salon/web app, not the consumer app.

#### `create_appointment_with_client(...)` (mig 115, superseded body by mig 117)

```
p_salon_id uuid, p_barber_id uuid, p_service_id uuid,
p_scheduled_at timestamptz, p_duration_min int, p_total_cents int,
p_currency text, p_existing_client_id uuid, p_client_first text,
p_client_last text, p_client_phone text, p_notes text DEFAULT NULL
RETURNS uuid
```

- Gates on `is_salon_member(p_salon_id)` — currently owner-only (see §11)
- Phone must match `^\+40[0-9]{9}$`; raises `22023` on mismatch
- Inserts with `status='confirmed'` (never `pending`)
- **Does NOT check appointment-vs-appointment overlap** — this gap was closed by the mig 144 overlap trigger (`appointments_check_overlap`). After mig 144 the salon app MUST handle `23P01` from both `slot_taken` (trigger text) and the trigger's own message format

#### `update_appointment_with_services(...)` (mig 124, guard added by mig 144)

```
p_appointment_id uuid, p_salon_id uuid, p_barber_id uuid,
p_service_ids uuid[], p_service_durations int[], p_service_prices int[],
p_scheduled_at timestamptz, p_duration_min int, p_total_cents int,
p_currency text, p_existing_client_id uuid, p_client_first text,
p_client_last text, p_client_phone text, p_notes text DEFAULT NULL
RETURNS uuid
```

- Validates membership, barber-in-salon, array lengths, phone
- **New (mig 144):** rejects `cancelled`/`no_show` rows (`cannot_edit_cancelled`, `22023`)
- Overlap check via `tstzrange` + `FOR UPDATE` scan (note: no advisory lock — the mig 144 trigger provides defense-in-depth here)
- Forces `status='confirmed'` on every edit
- Deletes + reinserts all `appointment_services` rows

#### `create_barber_break(...)` / `update_barber_break(...)` / `delete_barber_break(...)`

See §3.6 (barber breaks). All are owner-only, accept scope `one|future|all`.

### 3.5 DB-level guards affecting ALL writers (new in migration 144)

Every INSERT or UPDATE on `appointments` now fires these triggers in order:

**BEFORE INSERT OR UPDATE OF `scheduled_at, duration_min, barber_id, status`:**

1. `appointments_check_break_collision` (mig 120) — rejects overlap with **non-recurring** `barber_breaks` rows; raises `23P01`. Recurring breaks are not checked here (they are checked inside `book_appointment` RPC via `_barber_break_occurrences`).

2. `appointments_check_overlap` (mig 144) — **NEW defense-in-depth trigger**. Skips `cancelled`/`no_show` writes. Acquires the same advisory lock key as `book_appointment`. Checks `tstzrange` overlap against all non-cancelled appointments for the same barber (excluding `self` on UPDATE). Raises `23P01` with message `'appointment overlaps another appointment (id <uuid>)'`. Fires for ALL writers including `create_appointment_with_client` and direct inserts.

3. `appointments_guard_client_updates` (mig 144) — **NEW customer update guard**. When `auth.uid() IS NOT NULL` (JWT present) AND the caller is the appointment owner AND NOT a salon member: allows only `status` (pending/confirmed→cancelled) and `notes` changes; everything else raises `42501`. Service-role / SECURITY DEFINER contexts (no JWT) pass through untouched.

4. `appointments_notify_updated` (mig 127) — pushes `booking_confirmed`, `booking_cancelled`, `booking_rescheduled` notifications; resets reminder flags on reschedule.

5. `trg_appointments_updated_at` — sets `updated_at = NOW()`.

**AFTER INSERT:**

1. `appointments_after_insert_schedule_reminders` (mig 087) — if `status='confirmed'`, calls `schedule_appointment_reminders(id)` (idempotent, inserts `appointment_reminders` rows).
2. `appointments_autolink_salon_client` (mig 126, rewritten by mig 144) — creates/upserts a `salon_clients` row for the booker, back-fills `appointments.salon_client_id` via UPDATE. Race-safe upsert on `uq_salon_clients_salon_profile`.
3. `appointments_notify_created` (mig 127) — owner gets `booking_received`; client gets `booking_confirmed` only if `status='confirmed'` at insert.
4. `appointments_touch_salon_client` (mig 115) — bumps CRM counters when `salon_client_id` set.

**AFTER UPDATE (WHEN-gated):**

- `appointments_after_update_reminders` — cancels/reschedules `appointment_reminders` when status or `scheduled_at` changes.
- `trg_award_platform_xp_on_appointment_complete` — awards XP on `→completed`.
- `trg_award_points_on_complete`, `trg_appointment_consumable_deduction/reversal` — loyalty/consumables on `→completed`.

**Known latent bug:** `qualify_referral_on_appointment_complete` (mig 057) references non-existent `appointments.salon_id` column — if that migration was applied on the hosted DB, every `→completed` transition would abort. Verify against the live DB.

### 3.6 Barber breaks RPCs

All are SECURITY DEFINER, GRANT TO authenticated, gated by `is_salon_member` (owner-only in practice).

| RPC | Key params | Returns | Notes |
|---|---|---|---|
| `create_barber_break` | `p_salon_id, p_barber_ids uuid[], p_start_at, p_end_at, p_reason_type, p_title, p_recurrence_rule, p_recurrence_until, p_notes, p_color DEFAULT NULL` | `uuid[]` | One row per barber; 10-arg sig from mig 122 supersedes 9-arg from 119 — both overloads may be callable |
| `update_barber_break` | `p_break_id, p_scope ('one'|'future'|'all'), p_occurrence_date, p_start_at, p_end_at, ...` | `uuid` | `all`=update master; `future`=clamp until + new master; `one`=child override. In mig 122, `p_start_at`/`p_end_at` are required (no COALESCE) |
| `delete_barber_break` | `p_break_id, p_scope, p_occurrence_date` | `uuid` | `all`=DELETE cascade; `future`=clamp; `one`=tombstone (`is_exception_skip=true`) |

### 3.7 Client-side slot generation

`lib/booking.ts` implements slot generation and first-available-date search.

**Slot generation (`generateTimeSlots`):**
1. Resolve working hours via `resolveSchedule` (direct `barber_availability` + `salon_hours` fallback — see precedence rule in §3.1)
2. Fetch busy intervals via `get_barber_busy_intervals` RPC for a `[startOfDay, endOfDay]` window
3. Generate 30-minute grid from schedule start to end; a slot is offered when:
   - `slotStart + totalDuration <= end_time` (fits within working hours)
   - Slot range does NOT intersect any busy interval (`slotStart < busy_end && slotEnd > busy_start`)
   - Slot start is not in the past (today only)

**First-available-date (`findFirstAvailableDate`):** Two queries (schedule + busy intervals for 14-day window), computed client-side without N sequential calls.

**Time format:** DB returns `"HH:MM:SS"` for TIME columns; UI strips seconds (`time.slice(0,5)`). Comparisons use integer minutes-of-day. `day_of_week = 0` = Sunday (matches JS `Date.getDay()`).

### 3.8 RLS summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `appointments` | Own rows OR salon member | Own `user_id` OR salon member | Own `user_id` (WITH CHECK, mig 144) OR salon member (WITH CHECK, mig 144) | None |
| `appointment_services` | Owner-or-salon-member (tightened by mig 144; was `USING (true)`) | Appointment owner or salon member | None (RPC uses SECURITY DEFINER) | Appointment owner or salon member |
| `barber_availability` | Everyone | None (service_role/definer only) | None | None |
| `salon_hours` | Everyone | Salon owner only | Salon owner only | None |
| `barber_breaks` | `is_salon_member` (owner-only) | `is_salon_member` | `is_salon_member` | `is_salon_member` |
| `appointment_reminders` | Salon owner or member | None (trigger/cron only) | None | None |
| `salon_clients` | `is_salon_member` (owner-only) | `is_salon_member` or SECURITY DEFINER triggers | `is_salon_member` | `is_salon_member` |

### 3.9 React-Query cache keys

Invalidated by the consumer app after booking writes:

| Key | Trigger |
|---|---|
| `["appointments", userId]` | Any booking write |
| `["appointments-upcoming", userId]` | Any booking write |
| `["next-appointment", userId]` | Any booking write |
| `["today-appointments-all"]` | Any booking write |
| `["time-slots", barberId, dateISO, totalDurationMin]` | After booking |
| `["first-available-date", barberId, totalDurationMin]` | After booking |
| `["barbers", salonId|"all"]` | Load |
| `["barber-services", salonId|"all"]` | Load |
| `["salon-member-roles", salonId]` | Load |

### 3.10 Reschedule deep-link params

Navigating from appointments list to the booking screen passes:

| Param | Type | Notes |
|---|---|---|
| `salonId` | string (UUID) | Optional — scopes barber/service lists |
| `barberId` | string (UUID) | Pre-selects the barber |
| `serviceIds` | string (CSV of UUIDs) | Comma-separated list from `appointment_services`; falls back to single `service_id` |

### 3.11 Realtime

`appointments` and `barber_breaks` are in the `supabase_realtime` publication (mig 123). The consumer app does **not** subscribe to any booking channel — it polls at 60s intervals via react-query `refetchInterval`. The salon-side calendar app subscribes via `postgres_changes` (INSERT/UPDATE/DELETE) on both tables.

Every consumer booking or cancel fires the realtime publication so the salon calendar auto-updates.

---

## 4. Social

### Tables

| Table | Consumer app reads | Consumer app writes |
|---|---|---|
| `content` | SELECT published posts (embed `profiles!author_id`) | None — authored outside this repo |
| `likes` | SELECT own `content_id`s | INSERT `{user_id, content_id}` / DELETE (PK `(user_id, content_id)`) |
| `comments` | SELECT with cursor pagination | INSERT `{content_id, user_id, text, parent_id}`; UPDATE `{text, updated_at, is_edited}`; DELETE |
| `comment_reactions` | SELECT `comment_id, reaction, user_id` in batch | INSERT / DELETE (`UNIQUE(comment_id, user_id, reaction)`) |
| `comment_likes` | — | UPSERT `{comment_id, user_id}` `onConflict:'user_id,comment_id'` / DELETE |
| `follows` | SELECT own following set; single-pair state | INSERT `{follower_id, following_id}` / DELETE (PK `(follower_id, following_id)`) |
| `stories` | SELECT active (`expires_at > now()`), grouped by author | None |
| `story_views` | — | UPSERT `{story_id, viewer_id}` `ignoreDuplicates:true` |
| `lives` | SELECT active (`status IN ('live','starting')`, heartbeat filter) | None |
| `hashtags` | SELECT by `ilike` on `name` | None |
| `content_hashtags` | SELECT `content_id` for a hashtag | None |
| `trending_topics` | SELECT `is_active=true, order post_count desc` | None |
| `notifications` | SELECT own with pagination; UPDATE `read=true` | None (trigger-generated) |

**Key embed aliases** (depend on FK names — do not rename FKs):
- `profiles!author_id` — `content`, `stories`
- `profiles!user_id` — `comments`
- `profiles!host_id` — `lives`
- `profiles!actor_id` — `notifications`

**Status/type enums:**
- `content.status`: `'draft' | 'published' | 'hidden'` — every reader filters `status='published'`; content without explicit `'published'` is invisible
- `content.type`: `'video' | 'image' | 'text' | 'live_placeholder'`
- `lives.status`: `'starting' | 'live' | 'ended'`
- `stories.type`: `'image' | 'video'`
- `notifications.type`: `'like' | 'comment' | 'reply' | 'follow' | 'mention' | 'live' | 'appointment_reminder'`
- `notifications.target_type`: `'content' | 'comment' | 'live' | 'profile'`
- `comment_reactions.reaction`: constrained client-side to `['❤️','😂','👍','🔥','😮','😢']`; DB UNIQUE on `(comment_id, user_id, reaction)`

**Denormalized counters — never write directly:**
- `content.likes_count` / `comments_count` — trigger-maintained (`trg_increment/decrement_likes_count/comments_count`)
- `profiles.followers_count` / `following_count` — trigger-maintained (`trg_follow_counts_insert/delete`)
- `hashtags.post_count` — trigger-maintained (`trg_increment/decrement_hashtag_post_count`, SECURITY DEFINER)
- `lives.viewers_count` — written by the creator/salon side

**Triggers that fire on consumer writes (side effects a second client also gets):**
- `likes` INSERT → `trg_notify_on_like` → `notifications` row `type='like'`
- `comments` INSERT → `trg_notify_on_comment` → `type='comment'` (for post author) and/or `type='reply'` (for parent-comment author)
- `follows` INSERT → `trg_notify_on_follow` / `follows_notify_new_follower` → `type='follow'`

**Pagination conventions:**
- Feed (newest): composite keyset cursor `(created_at, id)` — values must be **quoted** in the PostgREST `or` filter because timestamps contain `:` and `+` (unquoted breaks parsing)
- Feed (most-liked): offset `.range()` — dup/skip risk; deduplicated client-side by id
- Comments, notifications, hashtag pages: plain `lt(created_at)` cursor, page size 20/20/10
- Feed page size: 10

**React-Query cache keys:**
`['feed', activeFilter, effectiveSort, followingToken]`, `['following', userId]`, `['stories', userId]`, `['comments', contentId]`, `['hashtag-posts', name]`, `['post', id]`, `['trending-topics']`, `['search', 'profiles'|'salons'|'posts', q]`

### Realtime channels (social)

All except `live-chat` and `live-viewers` go through the registry in `lib/realtime.ts`.

| Channel name | Type | Filter | Purpose |
|---|---|---|---|
| `feed:content` | postgres_changes | UPDATE + INSERT `public.content` WHERE `status=eq.published`; DELETE `public.content` | Patch `likes_count`/`comments_count` in feed caches (100 ms debounce); "N postări noi" banner |
| `feed:comments` | postgres_changes | INSERT `public.comments` | Increment `comments_count` in caches |
| `feed:likes:{userId}` | postgres_changes | INSERT + DELETE `public.likes` WHERE `user_id=eq.{userId}` | Confirm optimistic like toggles |
| `realtime-lives` | postgres_changes | `*` on `public.lives` | Add/update/remove live cards |
| `stories-inserts` | postgres_changes | INSERT `public.stories` | Invalidate stories cache |
| `comment-reactions:{contentId}` | postgres_changes | INSERT + DELETE `public.comment_reactions` | Per-emoji tallies while comments sheet is open |
| `notifications-store-{userId}` | postgres_changes | INSERT + UPDATE `public.notifications` WHERE `user_id=eq.{userId}` | Prepend new notifications; sync `read` state |
| `live-chat:{liveId}` | **broadcast** | event `message` | Ephemeral chat; never persisted to DB; 150-message ring buffer |
| `live-viewers:{liveId}` | **presence** | `config: {presence: {key: userId}}` | Track viewer count; `track({user_id, display_name, avatar_url, joined_at})` |

**Important:** `lives` table is NOT in the `supabase_realtime` publication in any repo migration — it must have been enabled manually on the hosted DB. A fresh environment must run `ALTER PUBLICATION supabase_realtime ADD TABLE lives;` or live section realtime dies silently.

**Replica identity note:** `likes` PK is `(user_id, content_id)` so DELETE payloads carry `content_id`. `comment_reactions` has a surrogate `id` PK and no `REPLICA IDENTITY FULL` in any migration — DELETE payloads may carry only `{id}`, but `useCommentReactions` reads `old.comment_id/reaction/user_id`. Either REPLICA IDENTITY FULL was set manually, or reaction-removal decrements silently no-op. Verify on the hosted DB.

### Edge function: `token-livekit`

```
supabase.functions.invoke("token-livekit", {
  body: { room: string, canPublish?: boolean /* default false */ }
})
// Returns: { token: string }  (LiveKit JWT, TTL 2h)
```

- `identity` in the payload is **ignored** — the function derives it from the authenticated user
- Consumer app always calls with `canPublish: false` (viewer)
- Requires `Authorization` header (anon-key client with forwarded header)
- Server env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- Client pairs the token with `EXPO_PUBLIC_LIVEKIT_URL`

---

## 5. Marketplace & Orders

There are **two parallel commerce systems** — do not mix them.

### 5.1 Legacy shop

Tables: `products`, `cart_items`, `orders`, `order_items`

| Table | Consumer app ops |
|---|---|
| `cart_items` | SELECT own; INSERT `{user_id, product_id, qty}`; UPDATE `{qty}`; DELETE own |
| `orders` | SELECT `*, items:order_items(*, product:products(*))`; INSERT `{user_id, status:'pending', total_cents, currency, shipping_address}` |
| `order_items` | INSERT bulk `{order_id, product_id, qty, price_cents}` |

Status: `pending|paid|shipped|cancelled`. This system is not extended — use the marketplace system for new orders.

Cart data lives in Zustand + AsyncStorage (`barber_marketplace_cart_items`) for the marketplace path. Legacy cart is Supabase-persisted.

### 5.2 Marketplace system

**Catalog source:** default is external nopCommerce REST API (`EXPO_PUBLIC_CATALOG_SOURCE='nop'`). When set to `'supabase'`, reads from `marketplace_products`.

| Table | Consumer app ops |
|---|---|
| `marketplace_products` | SELECT active, by category/section (when catalog source = supabase) |
| `marketplace_categories` | SELECT active, ordered by `sort_order` |
| `marketplace_brands` | SELECT active — degrades gracefully if table absent |
| `marketplace_orders` | SELECT own (`buyer_type='client'`); no direct INSERT (RLS blocks; use RPC) |
| `marketplace_order_items` | SELECT `product_id, sku_snapshot, title_snapshot, qty, unit_price_cents, line_total_cents, nop_product_id` |
| `marketplace_shipping_addresses` | Full CRUD own rows |
| `marketplace_stock_notifications` | UPSERT `{product_id, user_id, salon_id}` onConflict; SELECT own; DELETE |
| `loyalty_vouchers` | SELECT own; no writes (RPC mints/burns) |

**Marketplace status enum** (CHECK constraint): `placed | paid | preparing | shipped | delivered | cancelled | returned | refunded`

**Single-default invariant** for `marketplace_shipping_addresses`: demote old default before inserting/promoting. No atomic RPC — use the demote-then-write pattern.

### 5.3 Marketplace RPCs

#### `place_marketplace_order(p_items JSONB, p_payment_method TEXT, p_shipping JSONB, p_voucher_code TEXT DEFAULT NULL, p_section TEXT DEFAULT 'consumer') RETURNS JSONB`

```json
// p_items: [{ "nop_product_id": "...", "sku": "...", "title": "...", "qty": 1, "unit_price_cents": 1000 }]
// p_shipping: { "name": ..., "phone": ..., "email": ..., "address_line1": ..., "city": ...,
//               "county": ..., "postal": ..., "notes": ... }  ← key is "postal" NOT "postal_code"
// Returns success: { "status": "success", "order_id": "...", "order_number": "MK-2026-XXXXXX", "total_cents": N }
// Returns error:   { "status": "error", "error": "not_authenticated|bad_payment_method|empty_cart|invalid_item" }
```

- Prices come from client snapshots (nopCommerce is price source-of-truth for client orders)
- `shipping_cents` hardcoded `0` regardless of quote — quote and placement WILL disagree; match this behavior in the web client (show free shipping at client checkout)
- `'stripe'` → order lands `paid` instantly (Stripe is mocked); `'cod'` → `placed`
- `product_id = NULL`, `nop_product_id` set in order items (nop path)
- Optional voucher: matched uppercase-trimmed, scope `IN ('all','marketplace')`, burned on success
- Order numbers: `MK-<year>-<6 random digits>`; do not invent another format
- UI maps `'card'` → `'stripe'` before calling

#### `calc_marketplace_quote(p_items JSONB, p_buyer_type TEXT DEFAULT 'client') RETURNS JSONB`

```json
// p_items: [{ "product_id": "<uuid>", "qty": N }]  ← only works with marketplace_products UUIDs, not nop ids
// Returns: { subtotal_cents, tier_savings_cents, shipping_cents, free_shipping_threshold_cents,
//            missing_for_free_shipping_cents, total_cents,
//            items: [{ product_id, qty, base_price_cents, unit_price_cents, line_total_cents, savings_cents }] }
```

- Pure read, no mutation; debounced 250 ms client-side
- Free-shipping thresholds differ by `buyer_type`: client 150 RON (1500 cents), salon 300 RON (3000 cents)

#### `salon_marketplace_spending(p_salon_id UUID, p_since TIMESTAMPTZ DEFAULT NOW()-30d) RETURNS JSONB`

Spend aggregate for salon owners/members. Returns `total_cents, order_count, avg_order_cents, top_products[]`.

#### `get_salon_reorder_suggestions(p_salon_id UUID, p_limit INT DEFAULT 10) RETURNS SETOF`

Order-history-based suggestions; `due_now` when older than `reorder_reminder_days` setting. Auth: owner/member.

#### `add_to_recurring_list(p_salon_id UUID, p_product_id UUID, p_qty INT) RETURNS JSONB`

Auto-creates default "Lista mea" recurring list. **On conflict, qty is ADDED (not replaced)** — calling twice with qty 2 yields qty 4.

### 5.4 Salon billing details

Table `salon_billing_details`: `entity_type IN ('legal_person','natural_person')`. DB CHECKs: legal person → `fiscal_code` required, `cnp NULL`; natural person → `cnp` exactly 13 chars, `fiscal_code NULL`, `is_vat_payer = false`. RLS SELECT is salon-**owner**-only (rows contain CNP/IBAN).

Two identical hook files exist: `hooks/use-salon-billing-details.ts` and `hooks/use-default-salon-billing.ts` — verbatim duplicates. A single-default partial unique index exists; clients must demote the old default before inserting/promoting a new one (no atomic RPC).

### 5.5 Triggers

- `trg_marketplace_order_status_log` (BEFORE UPDATE on `marketplace_orders`) — any status update auto-appends to `marketplace_order_status_history` and stamps `preparing_at/shipped_at/delivered_at/refunded_at` on first entry. Do not write history rows manually.
- `trg_marketplace_products_notify_stock` (AFTER UPDATE OF `stock_qty`) — on 0→>0 transition inserts `user_notifications` and stamps `notified_at` on pending subscriptions.
- `tg_set_updated_at` — trigger-maintained `updated_at` on marketplace tables; never set manually.

### 5.6 nop vs UUID product identity

For client orders, product IDs are nopCommerce integer ids as strings; stored in `marketplace_order_items.nop_product_id` with `product_id = NULL`. `calc_marketplace_quote` / tier pricing / recurring lists / stock notifications work only with `marketplace_products` UUIDs (salon/B2B path). Do not mix the two id spaces.

---

## 6. Loyalty, Notifications & Support

### 6.1 Loyalty tables

| Table | Consumer ops |
|---|---|
| `platform_xp_transactions` | SELECT own (balance = latest `balance_after`; lifetime = client-side SUM of positive `amount`) — no writes; immutable via trigger |
| `xp_level_thresholds` | SELECT all ordered by `level` |
| `loyalty_vouchers` | SELECT own with `status, value_cents, scope, expires_at` |
| `xp_voucher_tiers` | SELECT active ordered by `sort_order` |

`source_type` CHECK on transactions: `'appointment' | 'marketplace_order' | 'voucher_convert' | 'reversal' | 'admin_grant' | 'admin_revoke'`.

Voucher `status`: `'active' | 'used' | 'expired' | 'cancelled'`. Voucher `scope`: `'all' | 'services' | 'marketplace'`. Expiry is lazy — `redeem_voucher_at_salon` flips status on scan. Clients must treat `status='active' AND expires_at < now()` as expired. Codes are compared uppercase.

**Level model note:** The consumer app uses its own 5-tier `LEVEL_CONFIG` (`constants/loyalty.ts`) keyed on XP thresholds (Bronze 0 / Silver 1000 / Gold 3000 / Platinum 7000 / Diamond 15000) mirroring `xp_level_thresholds`. The DB `user_platform_xp.level` column uses a different 4-tier enum (`rookie/regular/vip/elite`). For visual parity use `LEVEL_CONFIG`, not the DB column.

### 6.2 Loyalty RPCs

#### `convert_points_to_voucher(p_user_id uuid, p_tier_points int) RETURNS JSONB`

- GRANT TO authenticated; enforces `auth.uid() = p_user_id` (raises `42501`)
- Returns success: `{status:'success', voucher_id, voucher_code, value_cents, expires_at, new_balance}`
- Returns error: `{status:'error', error:'invalid_tier'|'insufficient_points', message, required?, available?}`
- Locks `user_platform_xp`, debits `current_points`, mints a `loyalty_vouchers` row (`expires_at = NOW()+12 months`, `source='platform_tier'`)

**Server-only RPCs (not called by consumer app; required for salon/web app):**

| RPC | Caller | Notes |
|---|---|---|
| `award_platform_xp(p_user_id, p_ron_cents, p_source, p_source_id, p_salon_id, p_idempotency_key)` | service_role | 3 XP per 1 RON; returns `{leveled_up}` |
| `reverse_platform_xp(...)` | service_role | Clamps balance at 0; never decrements `lifetime_earned` |
| `redeem_voucher_at_salon(p_code, p_salon_id, p_appointment_id)` | authenticated owner/member | Lazy expiry flip; burns voucher; credits `salon_marketplace_credit_ledger` for `platform_tier` source |
| `create_notification(p_user_id, p_type, p_title, p_body, p_params, p_deep_link, p_priority, p_data, p_salon_id, p_channel)` | authenticated + service_role | Inserts into `notification_log`; triggers `send-push` edge function |

### 6.3 Notifications

**Two parallel notification systems:**

| System | Table | Purpose | Written by |
|---|---|---|---|
| Legacy social inbox | `notifications` | In-app feed: likes, comments, follows, live, appointment reminders | DB triggers; consumer reads + marks read |
| Push pipeline | `notification_log` | Push/SMS/email dispatch + i18n; all event types | `create_notification()` / service_role triggers |

The consumer app subscribes to `notifications` only. It does NOT read or write `notification_log`. Migration 105/106 added the push pipeline in parallel — `notification_log` INSERT triggers `send-push` edge function via `pg_net`. The `send-push` function handles preference gating (`user_notification_prefs.push_enabled` + category toggles) and i18n.

**`notification_log` type catalog** (deep-link conventions in parentheses):
`booking_confirmed` (`/bookings/<id>`), `booking_cancelled`, `booking_rescheduled`, `booking_reminder_24h`, `booking_reminder_1h`, `live_starting` (`/social/live/<id>`), `new_follower` (`/profile/<id>`), `review_received`, `loyalty_reward` (`/loyalty`), `loyalty_tier_up`, `loyalty_xp_earned`, `loyalty_voucher_generated` (`/loyalty/voucher-detail/<code>`), `loyalty_voucher_redeemed_at_salon`, `salon_voucher_redeemed` (`/management/marketplace-credits`), `marketplace_credit_earned`, `marketplace_order_shipped` (`/marketplace/order/<id>`).

**Two reminder pipelines (both live in parallel):**
- Mig 087: salon-configurable SMS/email at `T - hours_before` (`salon_reminder_preferences.hours_before`), `confirmed` only, via `process-reminders` edge function called by pg_cron every 5 min
- Mig 105: client push at T-24h/T-1h (`pending+confirmed`), deduped via `reminder_24h_sent`/`reminder_1h_sent` flags, via `emit_booking_reminders_24h/1h()` (service_role, pg_cron `*/5 * * * *`)

**`push_tokens`** table (`user_id, token, platform('expo'|'apns'|'fcm'), active, device_id, app_version`): documented contract is upsert on `onConflict:'user_id,token'`. **No registration code exists in this app yet** — push tokens are never submitted. The web app must implement registration to receive push notifications.

### 6.4 XP realtime channels

| Channel | Filter | Notes |
|---|---|---|
| `notifications-store-{userId}` | INSERT+UPDATE `notifications` WHERE `user_id=eq.{userId}` | Social inbox; realtime actor join absent → name falls back to `'Utilizator'` |
| `xp_notifications:{userId}` | INSERT `platform_xp_transactions` WHERE `user_id=eq.{userId}` | XP earned toasts + level-up modal |
| `xp_balance:{userId}` | INSERT `platform_xp_transactions` WHERE `user_id=eq.{userId}` | Invalidates `['xp-balance', userId]` |

**`platform_xp_transactions` is NOT in `supabase_realtime` by any migration** — it was enabled manually. A fresh environment must run `ALTER PUBLICATION supabase_realtime ADD TABLE platform_xp_transactions;` or XP events are never delivered.

### 6.5 Support tickets

Table `support_tickets`: `user_id, subject, message, category TEXT CHECK IN ('general','appointment','order','account','bug')`, `status TEXT CHECK IN ('open','in_progress','resolved','closed') DEFAULT 'open'`, `admin_reply TEXT`, timestamps.

RLS: SELECT and INSERT own rows; UPDATE own only while `status='open'`. `admin_reply` and status changes beyond `open` require elevated access (no end-user policy exists in repo migrations).

React-Query cache key: `['support-tickets', userId]`.

---

## 7. Discover & Salons

### Salons table

| Column | Notes |
|---|---|
| `id, owner_id, name, address, city, phone` | |
| `avatar_url, cover_url` | Full public URLs |
| `bio, specialties` | |
| `latitude, longitude` | Discover filters on `NOT NULL`; default map center Bucharest `[26.1025, 44.4268]` |
| `rating_avg NUMERIC(2,1), reviews_count` | **Denormalized** — maintained by `trg_update_salon_rating` trigger on `salon_reviews`; never write directly |
| `avg_price_cents` | Denormalized via mig 132 |
| `is_promoted` | Boosts "recommended" sort |
| `amenities TEXT[]` | Valid keys: `parking, pets, card, cash, wifi, ac, coffee` |
| `salon_types SalonType[]` | `'barbershop' | 'coafor'`; `salon_type` (singular) is a legacy alias |
| `active BOOL` | Discover lists only `active=true` |

Discover query includes only `active=true AND latitude IS NOT NULL`.

### Salon-related tables

| Table | Consumer ops |
|---|---|
| `salon_favorites` | SELECT own `salon_id`s; INSERT `{user_id, salon_id}` / DELETE; PK `(user_id, salon_id)` |
| `salon_happy_hours` | SELECT active+current (`active=true, starts_at<=now<ends_at`); polled 60s |
| `salon_photos` | SELECT `*` per salon or all (discover) |
| `salon_reviews` | SELECT with profile embed; UPSERT `{user_id, salon_id, rating, comment, photo_urls}` onConflict `user_id,salon_id` |
| `salon_members` | SELECT `profile_id, role` per salon — authoritative role source (NOT `barbers.role`) |
| `barbers` | SELECT `*, profile:profiles(avatar_url)` (embed backfills NULL `barbers.avatar_url`) |
| `barber_services` | SELECT active, grouped by `category || 'Altele'`; price range per salon |
| `api_usage_logs` | INSERT per hairstyle tryon call (fire-and-forget) |

**Review side effect:** `salon_reviews_notify_received` trigger pushes `review_received` to the salon owner. Triggered by any insert, including the consumer upsert (not self-reviews).

**Roles:** `salon_members.role` (keyed by `profile_id`) is authoritative. `barbers.role` defaults to `'owner'` and is unreliable. Role display labels: `owner→Proprietar`, `manager→Manager`, `receptionist→Recepție`, else `Frizer`.

**Happy hour discount** is display-only math (`price_cents * (1 - discount_percent/100)`); never persisted.

**Service category display order:** `Tuns, Barbă, Colorare, Pachete, Altele`; `category = NULL` buckets into `Altele`.

**Pricing:** all prices in integer cents RON (`Intl.NumberFormat("ro-RO")`). Display price range = min/max over active `barber_services.price_cents` per salon.

**Discover "available now":** a barber slot covering now plus a free 30-min window within 60 min (15-min step), falling back to `salon_hours` when no `barber_availability` rows exist (`lib/discover.ts`).

**React-Query cache keys (60s refetch on time-sensitive):** `salons-active`, `salon-favorites`, `happy-hours-active`, `barber-availability-all`, `salon-hours-today`, `today-appointments-all`, `salon-price-ranges`, `salon-services-full`, `salon-photos-all`, `appointments-upcoming`, `salon`, `salon-team`, `salon-member-roles`, `salon-photos`, `services-grouped`, `salon-availability`, `salon-reviews`, `salon-happy-hour`, `salon-is-favorite`.

### Edge function: `hairstyle-tryon`

The function at `supabase/functions/hairstyle-tryon/index.ts` is deployed but **orphaned** — the consumer app calls the Gemini API directly from the device instead. The web app could use this function to avoid embedding the Gemini key client-side.

```
POST supabase/functions/hairstyle-tryon
Body: { imageBase64: string, hairstyleName: string, hairstylePrompt: string }
Returns 200: { imageBase64, mimeType, description? }
Returns 400: { error, blocked: true }  // Gemini SAFETY block
Returns 502: { error }  // Gemini API error
```

---

## 8. Storage Buckets

All buckets are **public**; all reads use `getPublicUrl` (no signed URLs anywhere in the consumer app).

| Bucket | Path convention | Writer | Access | Notes |
|---|---|---|---|---|
| `avatars` | `avatars/${profileId}.${ext}` (note: `avatars/` prefix inside the bucket creates path `avatars/avatars-bucket/...` effectively) | `app/(auth)/onboarding.tsx`, `app/settings.tsx` | Public read; authenticated INSERT/UPDATE (no per-user path check in RLS) | `upsert: true`; `settings.tsx` appends `?t=${Date.now()}` cache-buster to `avatar_url` |
| `review-photos` | `${userId}/${Date.now()}_${index}.${ext}` | `lib/salon.ts` (`uploadReviewPhotos`) | Public read; INSERT requires `storage.foldername(name)[1] = auth.uid()::text` | `ext = png` if `image/png`, else `jpg`; URLs stored in `salon_reviews.photo_urls TEXT[]` |
| `marketplace-products` | Platform-managed | service_role only | Public read | Product images consumed as URL strings from `marketplace_products.images JSONB`; never via signed URL |
| `content` | Creator-managed | creator app / content pipeline | Public read | Consumer app reads `content.media_url` / `thumb_url` — no storage calls |
| `stories` | Creator-managed (`storage_path` column) | salon / creator app | Public read; 50MB limit; mimetypes `image/jpeg, image/png, image/webp, video/mp4, video/quicktime` | Hourly pg_cron `cleanup_expired_stories()` deletes rows + storage objects via `storage_path`; a second client uploading stories MUST populate `storage_path` for cleanup to work |
| `salon-media` | Salon-managed | salon app | Public read | |

**Critical:** `review-photos` RLS enforces `{auth.uid()}/...` as the first path segment. A second client must use the same `{uid}/...` prefix or uploads will fail with RLS error.

**`profiles.avatar_url` stores full public URLs** (sometimes with `?t=` suffix), not storage paths.

---

## 9. Edge Functions

Located at `supabase/functions/` (two deployed):

| Function | Caller | Payload | Returns | Notes |
|---|---|---|---|---|
| `token-livekit` | `lib/livekit.ts` → `hooks/useLiveConnection.ts` | `{ room: string, canPublish?: boolean }` | `{ token: string }` (LiveKit JWT, TTL 2h) | Auth required; `identity` field ignored — derived from `auth.getUser()`; consumer always `canPublish: false` |
| `hairstyle-tryon` | Orphaned — NOT called by consumer app | `{ imageBase64, hairstyleName, hairstylePrompt }` | `{ imageBase64, mimeType, description? }` | Uses `gemini-2.0-flash-exp` server-side; web clients could use this instead of embedding a key |

**Server-side functions (invoked via pg_net or service_role, not by clients):**
- `send-push` — invoked by `notification_log_send_push` trigger (AFTER INSERT ON `notification_log`) via `net.http_post`; handles push preference gating and i18n
- `process-reminders` (appointment SMS/email reminders) — invoked by pg_cron every 5 min; reads `appointment_reminders` with `status='pending'`

---

## 10. Realtime Catalog

### Tables in `supabase_realtime` publication

| Table | Added by | Notes |
|---|---|---|
| `content` | mig 035 | |
| `likes` | mig 035 | REPLICA IDENTITY: PK `(user_id, content_id)` → DELETE carries `content_id` |
| `notifications` | mig 051 | |
| `comment_likes` | mig 052 | |
| `comment_reactions` | mig 052 | No `REPLICA IDENTITY FULL` in any migration — DELETE payloads may omit `comment_id/reaction/user_id`; verify on hosted DB |
| `stories` | mig 074 | |
| `appointments` | mig 123 | RLS applies; salon calendar uses this |
| `barber_breaks` | mig 123 | RLS applies (owner-only via `is_salon_member`) |
| `comments` | mig 143 | INSERT-only consumption; mig 143 explicitly did not set REPLICA IDENTITY |
| `notification_log` | mig 104 | Push pipeline |

**Tables that must be added manually to new environments (not in any migration):**
- `lives` — required for `useRealtimeLives`
- `platform_xp_transactions` — required for XP toasts and balance auto-refresh

### All channel name patterns

| Channel name pattern | Type | Tables / events | Domain |
|---|---|---|---|
| `feed:content` | postgres_changes | UPDATE+INSERT+DELETE `content` WHERE `status=eq.published` | Social |
| `feed:comments` | postgres_changes | INSERT `comments` | Social |
| `feed:likes:{userId}` | postgres_changes | INSERT+DELETE `likes` WHERE `user_id=eq.{userId}` | Social |
| `realtime-lives` | postgres_changes | `*` on `lives` | Social |
| `stories-inserts` | postgres_changes | INSERT `stories` | Social |
| `comment-reactions:{contentId}` | postgres_changes | INSERT+DELETE `comment_reactions` | Social |
| `notifications-store-{userId}` | postgres_changes | INSERT+UPDATE `notifications` WHERE `user_id=eq.{userId}` | Social + Loyalty |
| `xp_notifications:{userId}` | postgres_changes | INSERT `platform_xp_transactions` WHERE `user_id=eq.{userId}` | Loyalty |
| `xp_balance:{userId}` | postgres_changes | INSERT `platform_xp_transactions` WHERE `user_id=eq.{userId}` | Loyalty |
| `live-chat:{liveId}` | broadcast | event `message` | Social |
| `live-viewers:{liveId}` | presence | `{key: userId}` | Social |

**Channel registry** (`lib/realtime.ts`): all channels except `live-chat` and `live-viewers` go through `getOrCreateChannel(name)` → `subscribeChannel(channel, callbacks)` → `removeChannel(name)`. On sign-out: `cleanupAllChannels()` removes every entry. This must be called **before** `supabase.auth.signOut()`.

**Note:** channel name separators are inconsistent — `notifications-store-{uuid}` uses `-` while `xp_notifications:{uuid}` and `xp_balance:{uuid}` use `:`. Channel names are per-user singletons in the registry.

---

## 11. Cross-App Compatibility Rules

### Status enums and blocking convention

| Enum | Values | Blocking (slot math) |
|---|---|---|
| `appointments.status` | `pending \| confirmed \| completed \| cancelled \| no_show` | `NOT IN ('cancelled', 'no_show')` |
| `marketplace_orders.status` | `placed \| paid \| preparing \| shipped \| delivered \| cancelled \| returned \| refunded` | n/a |
| `loyalty_vouchers.status` | `active \| used \| expired \| cancelled` | `status='active' AND expires_at >= now()` |
| `support_tickets.status` | `open \| in_progress \| resolved \| closed` | n/a |
| `content.status` | `draft \| published \| hidden` | readers filter `='published'` |
| `appointment_reminders.status` | `pending \| sent \| failed \| skipped \| cancelled` | n/a |

### Denormalized counters — trigger-owned, never write directly

| Column | Table | Trigger |
|---|---|---|
| `likes_count`, `comments_count` | `content` | `trg_increment/decrement_likes_count/comments_count` |
| `followers_count`, `following_count` | `profiles` | `trg_follow_counts_insert/delete` |
| `hashtags.post_count` | `hashtags` | `trg_increment/decrement_hashtag_post_count` |
| `rating_avg`, `reviews_count` | `salons` | `trg_update_salon_rating` |
| `avg_price_cents` | `salons` | mig 132 trigger |

### Price computation

`total_cents` on `appointments` is **always server-computed** by `book_appointment` RPC from `barber_services.price_cents`. The legacy direct-INSERT path in the consumer app accepts `total_cents` from the client — this is a known gap closed by migrating to the RPC. The web/salon app MUST use `book_appointment` or `create_appointment_with_client` (where price is accepted from the caller — the salon app trusts its own UI); never trust `total_cents` from an untrusted client.

Marketplace order prices are from nopCommerce snapshots (client path) or `marketplace_products.price_cents` (salon/B2B path). `calc_marketplace_quote` is the authoritative quote source; `place_marketplace_order` currently overrides shipping to 0.

### `Europe/Bucharest` timezone convention

`salon_hours.open_time / close_time` and `barber_availability.start_time / end_time` are `TIME` columns representing **local wall-clock hours** in `Europe/Bucharest` (not UTC offsets). All booking logic — both the `book_appointment` RPC and `lib/booking.ts` — converts `scheduled_at` to `Europe/Bucharest` before comparing against these values. A second client must do the same.

Appointment `scheduled_at` is stored as UTC timestamptz; notification copy formats times in `Europe/Bucharest`.

### Error-code contract for booking writes

Every client writing to `appointments` (direct insert, `book_appointment`, `create_appointment_with_client`, `update_appointment_with_services`) MUST handle:

| SQLSTATE | Meaning | Action |
|---|---|---|
| `23P01` | Slot conflict (appointment overlap OR break overlap) | Refresh availability, show error |
| `22023` | Validation failure (see message for which field) | Show appropriate message |
| `42501` | Auth / permission failure | Re-authenticate or block |

### Legacy direct-INSERT path on `appointments`

The consumer app currently inserts directly via RLS (`auth.uid() = user_id`) without the RPC. This path is **deprecated** (the `book_appointment` RPC is the intended path). With migration 144 applied, direct inserts still pass RLS but now hit:
- The `appointments_check_overlap` trigger (defense-in-depth — WILL raise `23P01` on concurrent conflict)
- The `appointments_guard_client_updates` trigger (UPDATE path)
- The autolink trigger

The direct-insert path does NOT compute price server-side, does NOT check working hours, and does NOT acquire the advisory lock before the overlap check (the trigger acquires it, but after the check point in `book_appointment`). Migrate all consumer booking writes to `book_appointment`.

### `is_salon_member` scope

`is_salon_member(salon_id uuid)` (defined in mig 081) checks ONLY `salons.owner_id = auth.uid()` — despite its name, it is effectively **owner-only**. This affects: `barber_breaks` RLS, `salon_clients` RLS, and the `create_appointment_with_client` / `update_appointment_with_services` / `salon_marketplace_spending` / `get_salon_reorder_suggestions` RPCs. The `appointments` RLS policies (mig 025/026) correctly use real `salon_members` joins. Non-owner staff barbers can view/update salon appointments but cannot call the barber-break RPCs or edit the CRM.

### Profile row creation

The `on_auth_user_created` trigger creates `profiles` rows. A second client MUST NOT insert its own row — it will be created by the trigger. Set `signup_source` in `raw_user_meta_data` at signUp to distinguish account origins.

### `onboarding_completed` flag

Routing gates on `profiles.onboarding_completed = true`. Any app sharing the same auth users must set this flag or users will be re-onboarded on every app open.

---

## 12. Known Caveats & Recommendations

1. **Device timezone assumption.** `lib/booking.ts` uses the device's JS clock (`new Date()`) to build `scheduled_at` and filter past slots. The codebase assumes the device is in `Europe/Bucharest`. If a user is in a different timezone, slots displayed as "future" on the device may be "past" on the server (raising `past_slot 22023`) or vice versa. The `book_appointment` RPC re-validates with `now()` which is always UTC-correct. Recommendation: display a timezone note in the booking UI or add a `Europe/Bucharest` offset correction on the client.

2. **Offline behavior.** There is no `NetInfo` wiring — no offline detection or queue. All queries fail silently with network errors; `react-query` handles retries. A web client sharing code should add network-aware error boundaries.

3. **Schedule precedence drift between discovery and booking.** The "Available now" computation in discover (`lib/discover.ts`) uses `barber_availability` rows without the new `is_available=false` semantics from mig 144. The booking flow (`lib/booking.ts`) and the `book_appointment` RPC both use the correct all-rows logic. A salon owner who marks a barber fully unavailable (all rows `is_available=false`) will still appear available on the discover screen until the query is updated.

4. **Legacy direct-INSERT path still RLS-permitted.** The consumer app now books exclusively through the `book_appointment` RPC, but the `auth.uid() = user_id` INSERT policy on `appointments` remains in place so older installed app versions keep working. Rows created through that legacy path carry client-supplied `total_cents` and bypass the working-hours check (the overlap + break collision triggers still apply). Once old versions are retired, drop the direct INSERT policy and make the RPC the only entry point.

5. **`useSalonContext.ts` bug.** `hooks/useSalonContext.ts:32` queries `salon_members` filtering by `user_id` instead of the correct column name `profile_id` — the query always returns 0 rows and the hook silently returns `salonId: null`. Do not replicate this bug. Use `profile_id` in any `salon_members` query.

6. **`barbers.role` unreliable.** Always read roles from `salon_members.role` keyed on `profile_id`. `barbers.role` defaults to `'owner'` and is not maintained.

7. **`lives` not in realtime publication by any migration.** Must be added manually to the hosted DB. A new environment silently receives no live updates without this step.

8. **`platform_xp_transactions` not in realtime publication by any migration.** Same situation — must be added manually. Without it, XP toasts and balance auto-refresh never fire.

9. **`comment_reactions` DELETE realtime.** No migration sets `REPLICA IDENTITY FULL` on `comment_reactions`. The `useCommentReactions` hook reads `old.comment_id/reaction/user_id` from DELETE payloads. If `REPLICA IDENTITY FULL` was not set manually, reaction-removal decrements silently no-op. Verify on the hosted DB; add `ALTER TABLE comment_reactions REPLICA IDENTITY FULL;` if needed.

10. **`content_hashtags.created_at` column.** Migration 043 defines `content_hashtags` with only `(content_id, hashtag_id)` as PK — no `created_at` column. `hooks/useHashtagPosts.ts` uses `lt('created_at', pageParam)` as a cursor. The column must exist on the hosted DB (added out-of-band or by a missing migration). Verify before reusing hashtag pagination in another client.

11. **`qualify_referral_on_appointment_complete` latent bug (mig 057).** References non-existent `appointments.salon_id` column. If applied on the hosted DB, every `→completed` transition aborts with `record "new" has no field "salon_id"`. Verify against the live DB; the function may need to be dropped or replaced.

12. **`appointment_services` was world-readable before mig 144.** Migration 144 tightened the SELECT policy to owner-or-salon-member. Any code relying on `USING (true)` will break on the updated DB. Consumer app uses embedded joins (always via the appointment row) — unaffected. A second client doing standalone SELECTs on `appointment_services` must filter through owned appointments.

13. **XP balance derivation inconsistency.** Consumer app derives balance from `platform_xp_transactions.balance_after` (latest row) and lifetime from client-side SUM. `user_platform_xp.current_points` / `lifetime_earned` should agree but are updated by RPCs, not triggers. A second client may read `user_platform_xp` directly (RLS select-own) for a single-row balance lookup.

14. **`place_marketplace_order` shipping hardcoded to 0.** The quote RPC correctly computes `shipping_cents` based on free-shipping thresholds, but the order RPC ignores it. The web/salon app must match this behavior for display parity.

15. **`update_appointment_with_services` overlap pre-check lacks an advisory lock — but the trigger closes the race.** The RPC's own `SELECT EXISTS` check is advisory only. The mig 144 `appointments_check_overlap` trigger acquires the per-barber `pg_advisory_xact_lock` *before* re-checking, so two concurrent edits (or an edit racing `book_appointment`) serialize at the trigger: the second writer blocks until the first commits, then re-checks against the committed row and raises `23P01`. Net effect: overlapping writes cannot land; callers just receive the error from the trigger instead of the RPC's friendlier check.

16. **Auth deep-link formats.** Both `token_hash` querystring and `access_token` fragment formats must be supported. The project's Supabase email templates have used both. `detectSessionInUrl: false` means manual URL parsing is required even on web.

17. **Reschedule deep-link params.** The appointments list passes `salonId`, `barberId`, and `serviceIds` (CSV from `appointment_services`, falling back to the legacy single `service_id`). The booking screen reads both `serviceId` (singular, legacy) and `serviceIds` and pre-selects every matching service. Any other client linking into the booking flow should use the same params.
