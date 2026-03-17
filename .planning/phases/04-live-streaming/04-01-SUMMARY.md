---
phase: 04-live-streaming
plan: 01
subsystem: infra
tags: [livekit, edge-function, webrtc, deno, supabase]

# Dependency graph
requires:
  - phase: 01-infrastructure-setup
    provides: "LiveKit SDK packages and Supabase Edge Function runtime"
provides:
  - "LiveKit token generation Edge Function (token-livekit)"
  - "Client-side fetchLiveKitToken helper"
  - "registerGlobals() WebRTC polyfill initialization"
  - "Aligned Live types matching DB schema (author_id, room_name)"
affects: [04-02, 04-03, 04-04]

# Tech tracking
tech-stack:
  added: [livekit-server-sdk (Deno/npm)]
  patterns: [Edge Function token generation, CORS preflight handling, Supabase JWT forwarding]

key-files:
  created:
    - supabase/functions/token-livekit/index.ts
    - lib/livekit.ts
  modified:
    - app/_layout.tsx
    - types/database.ts
    - app/go-live.tsx
    - app/(tabs)/feed.tsx

key-decisions:
  - "Token TTL set to 2h for reasonable session length"
  - "canPublish defaults to false (viewer mode) for safety"
  - "room_name generated client-side with timestamp + user ID prefix for uniqueness"

patterns-established:
  - "Edge Function pattern: CORS preflight + JWT auth + business logic + error handling"
  - "LiveKit token flow: client calls supabase.functions.invoke -> Edge Function verifies JWT -> returns LiveKit token"

requirements-completed: [LIVE-06, LIVE-07]

# Metrics
duration: 4min
completed: 2026-03-17
---

# Phase 4 Plan 1: LiveKit Token Infrastructure Summary

**LiveKit token Edge Function with Deno AccessToken generation, client fetchLiveKitToken helper, registerGlobals() at app startup, and Live types aligned to DB schema (author_id + room_name)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-17T19:15:15Z
- **Completed:** 2026-03-17T19:19:15Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created token-livekit Edge Function with CORS, auth verification, and AccessToken generation for both broadcaster and viewer roles
- Created lib/livekit.ts with fetchLiveKitToken and LIVEKIT_URL exports for client-side token fetching
- Added registerGlobals() call at module level in app/_layout.tsx for WebRTC polyfills
- Aligned all Live-related types with actual DB schema: author_id replaces host_id, room_name added, phantom columns removed

## Task Commits

Each task was committed atomically:

1. **Task 1: Create token-livekit Edge Function + lib/livekit.ts helper** - `898ae25` (feat)
2. **Task 2: Add registerGlobals() and align Live types with DB schema** - `77cdf8d` (feat)

## Files Created/Modified
- `supabase/functions/token-livekit/index.ts` - Deno Edge Function generating LiveKit access tokens with CORS and JWT auth
- `lib/livekit.ts` - Client helper exporting fetchLiveKitToken and LIVEKIT_URL
- `app/_layout.tsx` - Added registerGlobals() import and call at module level
- `types/database.ts` - Updated lives table types to match DB schema (author_id, room_name, removed phantom columns)
- `app/go-live.tsx` - Updated insert to use author_id, generate room_name, removed is_public
- `app/(tabs)/feed.tsx` - Updated placeholder lives and Supabase join query to use author_id

## Decisions Made
- Token TTL set to 2h for reasonable session length without frequent re-auth
- canPublish defaults to false (viewer mode) so viewers cannot accidentally publish
- room_name generated client-side with timestamp + user ID prefix for uniqueness

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed feed.tsx placeholder lives and Supabase join using host_id**
- **Found during:** Task 2 (type alignment)
- **Issue:** feed.tsx had placeholder lives with host_id, is_public, provider, ingest_url, stream_key (all removed from types) and Supabase join using profiles!host_id
- **Fix:** Updated all 4 placeholder live objects to use author_id/room_name and removed phantom fields; updated join to profiles!author_id
- **Files modified:** app/(tabs)/feed.tsx
- **Verification:** No host_id references remain in any .ts/.tsx file
- **Committed in:** 77cdf8d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix to prevent runtime type errors. No scope creep.

## Issues Encountered
None

## User Setup Required
None - Edge Function uses secrets already configured in Supabase (LIVEKIT_API_KEY, LIVEKIT_API_SECRET set during Phase 1).

## Next Phase Readiness
- Token infrastructure ready for broadcaster (canPublish:true) and viewer (canPublish:false) flows
- registerGlobals() ensures WebRTC polyfills available before any LiveKit component renders
- Types aligned for all subsequent live streaming plans (04-02 through 04-04)

---
*Phase: 04-live-streaming*
*Completed: 2026-03-17*
