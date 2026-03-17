---
phase: 04-live-streaming
plan: 02
subsystem: broadcast
tags: [livekit, broadcast, camera, tapzi-barber, webrtc]

# Dependency graph
requires:
  - phase: 04-live-streaming
    plan: 01
    provides: "LiveKit token infrastructure and registerGlobals pattern"
provides:
  - "Barber broadcast screen with LiveKit camera/audio publishing"
  - "useLiveBroadcast hook for broadcast lifecycle management"
  - "tapzi-barber lib/livekit.ts token helper"
  - "registerGlobals() at tapzi-barber app entry"
affects: [04-03, 04-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [LiveKitRoom broadcast, restartTrack camera flip, AudioSession lifecycle]

key-files:
  created:
    - /Users/edi/Desktop/tapzi-barber/app/go-live.tsx
    - /Users/edi/Desktop/tapzi-barber/hooks/use-live-broadcast.ts
    - /Users/edi/Desktop/tapzi-barber/lib/livekit.ts
  modified:
    - /Users/edi/Desktop/tapzi-barber/app/_layout.tsx
    - /Users/edi/Desktop/tapzi-barber/app/(tabs)/social.tsx
    - /Users/edi/Desktop/tapzi-barber/hooks/use-social-feed.ts

key-decisions:
  - "Camera flip uses restartTrack({facingMode}) not switchActiveDevice (iOS crash bug #218)"
  - "AudioSession started/stopped on phase transition, not component mount"
  - "End stream has confirmation dialog before stopping broadcast"

patterns-established:
  - "Broadcast lifecycle: setup -> connecting -> live -> ending"
  - "LiveKitRoom with audio+video=true for broadcaster, useLocalParticipant for controls"

requirements-completed: [LIVE-01, BARBER-01, BARBER-02, BARBER-03, BARBER-04]

# Metrics
duration: 5min
completed: 2026-03-17
---

# Phase 4 Plan 2: Barber Broadcast Screen Summary

**Full-screen barber broadcast with LiveKitRoom publishing, camera preview, mute/flip/end controls, and lives DB lifecycle management in tapzi-barber**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-17T19:24:36Z
- **Completed:** 2026-03-17T19:30:07Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added registerGlobals() to tapzi-barber app entry for WebRTC polyfills
- Created lib/livekit.ts in tapzi-barber mirroring barber-store's token helper
- Built useLiveBroadcast hook managing setup/connecting/live/ending broadcast lifecycle
- Created go-live.tsx with setup form (title input) and full-screen broadcast view
- Broadcast controls: mute toggle, camera flip (restartTrack), end stream with confirmation
- AudioSession properly managed for iOS audio during broadcast
- Fixed useLiveStreams join to use author_id instead of host_id
- Social tab live chip now navigates to /go-live

## Task Commits

Each task was committed atomically:

1. **Task 1: Add registerGlobals + lib/livekit.ts to tapzi-barber** - `35175dd` (feat)
2. **Task 2: Build go-live.tsx broadcast screen with camera + controls** - `eb157c8` (feat)

## Files Created/Modified
- `/Users/edi/Desktop/tapzi-barber/lib/livekit.ts` - Token fetch helper for tapzi-barber
- `/Users/edi/Desktop/tapzi-barber/hooks/use-live-broadcast.ts` - Broadcast lifecycle hook
- `/Users/edi/Desktop/tapzi-barber/app/go-live.tsx` - Setup form + full-screen broadcast screen with LiveKitRoom
- `/Users/edi/Desktop/tapzi-barber/app/_layout.tsx` - registerGlobals() call + go-live route
- `/Users/edi/Desktop/tapzi-barber/app/(tabs)/social.tsx` - Live chip navigates to /go-live
- `/Users/edi/Desktop/tapzi-barber/hooks/use-social-feed.ts` - Fixed join to profiles!author_id

## Decisions Made
- Camera flip uses restartTrack with facingMode rather than switchActiveDevice to avoid iOS crash bug per GitHub issue #218
- AudioSession lifecycle tied to broadcast phase transitions
- End stream prompts with confirmation dialog before stopping

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

---
*Phase: 04-live-streaming*
*Completed: 2026-03-17*
