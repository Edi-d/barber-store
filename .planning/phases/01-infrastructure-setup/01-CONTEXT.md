# Phase 1: Infrastructure Setup - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Activate Supabase Pro, create LiveKit Cloud account, and configure EAS dev build pipeline for both barber-store and tapzi-barber. No feature code — purely accounts, credentials, and build tooling.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User skipped discussion — all infrastructure decisions are at Claude's discretion:

- LiveKit Cloud region selection (closest to target users)
- LiveKit project naming convention
- EAS build profile configuration (development, preview, production)
- Supabase Pro validation approach (test subscription on any table)
- LiveKit validation approach (test room creation via API)
- Dev build testing strategy (simulator vs device)
- Environment variable naming and storage (.env files)
- Order of operations (Supabase first vs LiveKit first)

### Locked Decisions (from project init)
- Provider: LiveKit Cloud (not Agora)
- Both apps need dev builds (barber-store + tapzi-barber)
- Supabase Pro is required for Realtime
- API keys stored server-side only (Edge Functions for secrets)
- EXPO_PUBLIC_ prefix for client-safe env vars

### Execution Pattern: Volt Subagents
ALL implementation work MUST use volt specialized subagents (voltagent-core-dev). GSD orchestrates, volt agents implement:
- `voltagent-core-dev:mobile-developer` — Expo/EAS config, native module setup, dev build configuration
- `voltagent-core-dev:backend-developer` — Edge Functions, DB migrations, Supabase server-side
- `voltagent-core-dev:fullstack-developer` — Features spanning both DB and app config
- Use parallel volt agents when tasks are independent

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### LiveKit Setup
- `.planning/research/STACK.md` — LiveKit packages, Expo plugin config, installation commands, env vars
- `.planning/research/PITFALLS.md` — Dev build requirement, LiveKit New Architecture edge cases

### Supabase
- `.planning/research/STACK.md` §Realtime Feed — Supabase Pro requirements, connection limits
- `.planning/research/ARCHITECTURE.md` — Supabase Realtime modes (postgres_changes, broadcast, presence)

### Project Context
- `.planning/PROJECT.md` — Dual-app constraint, LiveKit decision rationale
- `.planning/REQUIREMENTS.md` — INFRA-01, INFRA-02, INFRA-03 requirements

### Barber App
- `~/Desktop/tapzi-barber/.planning/ROADMAP-SOCIAL.md` §Phase 1 — Barber-side infrastructure tasks
- `~/Desktop/tapzi-barber/app.json` — Existing plugins and permissions (camera, audio already configured)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/supabase.ts` (barber-store): Supabase client with platform-aware storage adapter — already configured, just needs Pro upgrade
- `lib/supabase.ts` (tapzi-barber): Same pattern, same Supabase instance
- `app.json` (both apps): Existing Expo config with plugins array ready for LiveKit additions
- `eas.json` (tapzi-barber): Already has EAS config — may need dev profile added

### Established Patterns
- Environment variables use `EXPO_PUBLIC_` prefix for client-safe values
- Both apps use same Supabase project (shared DB)
- Expo managed workflow with config plugins

### Integration Points
- `.env` files in both apps need LiveKit URL
- `app.json` plugins array needs LiveKit + WebRTC plugins
- Supabase Edge Functions need LiveKit API key + secret (server-side only)

</code_context>

<cross_team>
## Cross-Team Coordination: tapzi-barber

### Shared Roadmap
Tapzi-barber team has their own roadmap at `~/Desktop/tapzi-barber/.planning/ROADMAP-SOCIAL.md`. Both apps work in parallel on the same 4-phase milestone with sync points:

| Phase | barber-store (client) | tapzi-barber (barber) | Sync point |
|-------|----------------------|----------------------|------------|
| 1 | EAS dev build + Supabase Pro + LiveKit account | EAS dev build + LiveKit packages | Both have working dev builds |
| 2 | Realtime subscriptions on feed | Nothing (no barber-side work) | — |
| 3 | Story viewer + stories row | Story creation + TUS upload + compression | Stories appear cross-app |
| 4 | Live viewer + chat + presence | Go-live broadcast + LiveKit publisher | Barber broadcasts, client watches |

### Shared Database (Supabase)
Both apps use the same Supabase instance (`iaqztbhkukgghomwnict`). Migrations are shared.

### Migrations Synced from tapzi-barber
On 2026-03-17, migrations 025-031 were copied from tapzi-barber into barber-store and renumbered to maintain sequence. The existing 032/033 (received separately for live features) were renumbered to 033/034:

| # barber-store | Original tapzi # | Name | What it does |
|----------------|-----------------|------|-------------|
| 025 | (barber-store own) | review_photos | Adds photo_url to salon_reviews + storage bucket |
| 026 | tapzi 025 | appointment_booking_fix | Fixes RLS for salon member appointment access |
| 027 | tapzi 026 | social_completion | Creates stories, notifications, bookmarks, story_views, blocks, reports tables + follow count triggers |
| 028 | tapzi 027 | social_seed_data | Seeds 8 users, likes, comments, follows, stories |
| 029 | tapzi 028 | dive_software_salon_seed | Seeds "Dive Software Barbershop" with barbers, services, appointments, reviews |
| 030 | tapzi 029 | dive_extra_appointments | 50 extra appointments for testing |
| 031 | tapzi 030 | fix_salon_members_rls_recursion | Fixes infinite recursion in salon_members RLS |
| 032 | tapzi 031 | fix_seed_display_names | Updates display names for seed users |
| 033 | (received separately) | lives_table | Creates lives table with room_name, viewers_count (NOTE: conflicts with lives table in 001 — uses author_id vs host_id) |
| 034 | (received separately) | stories_video_support | Adds duration_ms, thumbnail_url to stories + storage bucket with video MIME types |

**Important:** Migration 033 uses `CREATE TABLE IF NOT EXISTS` — since `lives` table already exists from 001 with different schema (`host_id` vs `author_id`), it won't overwrite. The schema difference needs resolution in a future migration if tapzi-barber code expects `author_id`.

### tapzi-barber Phase 1 Tasks (their side)
Per their roadmap, tapzi-barber team handles:
- 1.1: Install LiveKit packages (`@livekit/react-native`, `@livekit/react-native-webrtc`, `livekit-client`, plugins)
- 1.2: Add LiveKit + WebRTC plugins to their `app.json`
- 1.3: Configure EAS dev build profile
- 1.4: Build and test dev client
- 1.5: Add `EXPO_PUBLIC_LIVEKIT_URL` to their `.env`

**Our responsibility (barber-store):**
- Supabase Pro upgrade (they depend on us)
- LiveKit Cloud account creation (we share credentials with them)
- Our own EAS dev build + LiveKit packages

</cross_team>

<specifics>
## Specific Ideas

- Standard infrastructure setup — simplest, most robust approach
- Tapzi-barber team is working in parallel; they need Supabase Pro and LiveKit credentials from us before they can complete their Phase 1
- Shared Edge Function `token-livekit` will be deployed by us (barber-store team) in Phase 4 — both apps use it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-infrastructure-setup*
*Context gathered: 2026-03-17*
