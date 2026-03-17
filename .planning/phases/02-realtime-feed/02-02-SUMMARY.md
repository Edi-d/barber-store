---
phase: 02-realtime-feed
plan: 02
subsystem: realtime
tags: [supabase, realtime, react-query, hooks, postgres_changes, feed]

# Dependency graph
requires:
  - phase: 02-realtime-feed
    plan: 01
    provides: Channel registry (lib/realtime.ts) with getOrCreateChannel, removeChannel
provides:
  - useRealtimeFeed hook for content UPDATE/INSERT/DELETE subscriptions
  - useRealtimeLikes hook for is_liked state via likes table INSERT/DELETE
  - useRealtimeComments hook for comments_count increment via comments INSERT
  - Feed screen wired with all three realtime hooks
affects: [02-realtime-feed]

# Tech tracking
tech-stack:
  added: []
  patterns: [realtime-hook-pattern, debounced-cache-update, surgical-setQueryData]

key-files:
  created:
    - hooks/useRealtimeFeed.ts
    - hooks/useRealtimeLikes.ts
    - hooks/useRealtimeComments.ts
  modified:
    - app/(tabs)/feed.tsx

key-decisions:
  - "100ms debounce for UPDATE events to batch rapid-fire likes on viral posts"
  - "showNewPosts uses invalidateQueries instead of manual prepend because INSERT payload lacks joined author data"
  - "useRealtimeComments subscribes to INSERT only -- content row UPDATE handler provides authoritative count correction"

patterns-established:
  - "Realtime hook pattern: useEffect with getOrCreateChannel, chain .on() handlers, .subscribe(), cleanup via removeChannel"
  - "Surgical cache update: all realtime handlers use queryClient.setQueryData with InfiniteData page mapping, no refetch"
  - "Debounce pattern: pendingUpdates Map + setTimeout for batching rapid realtime events"

requirements-completed: [RT-01]

# Metrics
duration: 6min
completed: 2026-03-17
---

# Phase 02 Plan 02: Realtime Feed Hooks Summary

**Three realtime hooks (feed, likes, comments) subscribing to Supabase postgres_changes with debounced surgical React Query cache updates**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-17T19:23:55Z
- **Completed:** 2026-03-17T19:30:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- useRealtimeFeed subscribes to content UPDATE (debounced likes_count/comments_count), INSERT (new post accumulation), DELETE (removal from cache)
- useRealtimeLikes subscribes to current user's likes INSERT/DELETE to update is_liked state
- useRealtimeComments subscribes to comments INSERT to increment comments_count and invalidate comments modal query
- All three hooks wired into FeedScreen with proper cleanup on unmount

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useRealtimeFeed, useRealtimeLikes, and useRealtimeComments hooks** - `3cf432c` (feat)
2. **Task 2: Wire realtime hooks into feed.tsx** - `a778141` (feat)

## Files Created/Modified
- `hooks/useRealtimeFeed.ts` - Content table subscription with 100ms debounce, new post accumulation, DELETE removal
- `hooks/useRealtimeLikes.ts` - Likes table subscription filtered to current user for is_liked state
- `hooks/useRealtimeComments.ts` - Comments table INSERT subscription for comments_count increment
- `app/(tabs)/feed.tsx` - Added imports and calls for useRealtimeLikes and useRealtimeComments

## Decisions Made
- 100ms debounce for UPDATE events prevents excessive re-renders on viral posts with rapid-fire likes
- showNewPosts invalidates the feed query rather than manually prepending, because INSERT payloads lack joined author data
- useRealtimeComments only handles INSERT (not UPDATE/DELETE) since the content row UPDATE handler provides authoritative correction

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Migration 035 (from Plan 01) must be applied for realtime events to fire.

## Next Phase Readiness
- All realtime subscriptions active -- feed updates instantly for likes, comments, deletions, and new posts
- newPostCount and showNewPosts exposed for Plan 03's NewPostsBanner component
- NewPostsBanner already imported in feed.tsx (pre-existing from parallel work)

---
*Phase: 02-realtime-feed*
*Completed: 2026-03-17*
