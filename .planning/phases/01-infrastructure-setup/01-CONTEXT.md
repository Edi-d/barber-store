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

<specifics>
## Specific Ideas

No specific requirements — standard infrastructure setup. User wants simplest, most robust approach.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-infrastructure-setup*
*Context gathered: 2026-03-17*
