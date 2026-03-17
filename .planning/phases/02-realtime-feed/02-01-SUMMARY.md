---
phase: 02-realtime-feed
plan: 01
subsystem: infra
tags: [supabase, realtime, channels, registry, cleanup]

# Dependency graph
requires:
  - phase: 01-infrastructure
    provides: Supabase client (lib/supabase.ts) and auth store (stores/authStore.ts)
provides:
  - Channel registry module (lib/realtime.ts) with getOrCreateChannel, removeChannel, cleanupAllChannels
  - Realtime publication migration for content and likes tables
affects: [02-realtime-feed, 03-live-streaming]

# Tech tracking
tech-stack:
  added: []
  patterns: [channel-registry-singleton, idempotent-channel-creation, logout-cleanup]

key-files:
  created:
    - lib/realtime.ts
    - migrations/035_realtime_publication.sql
  modified:
    - stores/authStore.ts

key-decisions:
  - "Module-level Map singleton for channel registry — simplest idempotent pattern for React StrictMode"
  - "cleanupAllChannels calls removeAllChannels as safety net after clearing registry Map"

patterns-established:
  - "Channel registry pattern: all realtime hooks must use getOrCreateChannel/removeChannel, never supabase.channel() directly"
  - "Logout cleanup: signOut always cleans up realtime channels before calling supabase.auth.signOut"

requirements-completed: [RT-03, RT-04]

# Metrics
duration: 4min
completed: 2026-03-17
---

# Phase 02 Plan 01: Channel Registry Summary

**Supabase Realtime channel registry with Map-based singleton, idempotent getOrCreateChannel, logout cleanup in authStore, and publication migration for content/likes tables**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-17T19:15:14Z
- **Completed:** 2026-03-17T19:19:09Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Channel registry module with getOrCreateChannel (idempotent), removeChannel, cleanupAllChannels, getChannelCount
- authStore.signOut wired to clean up all realtime channels before auth signout
- Idempotent migration to add content and likes tables to supabase_realtime publication

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lib/realtime.ts channel registry** - `0a7f03d` (feat)
2. **Task 2: Wire cleanup into signOut and create publication migration** - `b14a1a2` (feat)

## Files Created/Modified
- `lib/realtime.ts` - Channel registry with Map singleton, factory, remove, cleanup exports
- `stores/authStore.ts` - Added cleanupAllChannels import and call in signOut
- `migrations/035_realtime_publication.sql` - Idempotent ALTER PUBLICATION for content and likes

## Decisions Made
- Module-level Map singleton for channel registry — simplest approach for React StrictMode double-mount handling
- cleanupAllChannels calls supabase.removeAllChannels() as safety net after clearing the Map, catching any channels created outside the registry

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Channel registry ready for Plan 02 (realtime hooks) to build on
- Hooks will use getOrCreateChannel/removeChannel for feed and likes subscriptions
- Migration 035 must be applied to Supabase before realtime subscriptions work

---
*Phase: 02-realtime-feed*
*Completed: 2026-03-17*
