---
phase: 03-stories
plan: 04
subsystem: ui
tags: [react-query, supabase, stories, story_views, seen-state, StoriesRow, StoryViewer]

requires:
  - phase: 03-stories/03-01
    provides: stories and story_views DB schema, storage bucket
  - phase: 03-stories/03-03
    provides: StoryViewer component with StoryGroup/StoryItem types
provides:
  - fetchStoriesWithSeenState query helper (lib/stories.ts)
  - useStories React Query hook (hooks/useStories.ts)
  - useMarkStoryViewed mutation hook (hooks/useStories.ts)
  - StoriesRow updated for real StoryGroup data with blue/grey rings
  - feed.tsx wired end-to-end: real stories -> StoryViewer -> mark viewed
affects: [story-wiring, feed-screen]

tech-stack:
  added: []
  patterns: [React Query staleTime 30s for infrequently-changing data, upsert with onConflict for idempotent view tracking, queryKey invalidation for cache refresh after mutation]

key-files:
  created:
    - lib/stories.ts
    - hooks/useStories.ts
  modified:
    - components/feed/StoriesRow.tsx
    - app/(tabs)/feed.tsx

key-decisions:
  - "queryKey ['stories', userId] namespaced by user so seen state is per-user"
  - "StoriesRow returns null when groups is empty -- no empty state placeholder (plan spec: no placeholder data)"
  - "StoryViewer placed inside SafeAreaView return, after CommentsModal for correct z-order"

patterns-established:
  - "Seen state via LEFT JOIN on story_views, grouped client-side -- avoids N+1 queries"
  - "Unseen-first sort: a.hasUnseen ? -1 : 1 after GROUP ensures correct ordering"

requirements-completed: [STORY-01, STORY-06]

duration: 2min
completed: 2026-03-17
---

# Phase 03 Plan 04: Stories Data Wiring Summary

**Supabase stories query with LEFT JOIN on story_views drives blue/grey ring indicators in StoriesRow, with StoryViewer opened on tap and cache invalidated after viewing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-17T19:56:47Z
- **Completed:** 2026-03-17T19:58:59Z
- **Tasks:** 2 auto + 1 checkpoint (pending human verify)
- **Files modified:** 4

## Accomplishments
- fetchStoriesWithSeenState queries active stories grouped by author, marks isSeen per viewer
- useStories hook caches groups with 30s stale time; useMarkStoryViewed upserts story_views and invalidates cache
- StoriesRow rewritten to accept StoryGroup[]: blue ring for hasUnseen, grey ring for all-seen
- feed.tsx replaced placeholder profiles query with real stories hook and wired StoryViewer

## Task Commits

Each task was committed atomically:

1. **Task 1: Create stories data layer (lib + hook)** - `1247cb4` (feat)
2. **Task 2: Update StoriesRow and wire feed screen** - `f8acfde` (feat)

## Files Created/Modified
- `lib/stories.ts` - fetchStoriesWithSeenState: LEFT JOIN stories+story_views, group by author, sort unseen-first
- `hooks/useStories.ts` - useStories (React Query, staleTime 30s) and useMarkStoryViewed (upsert + invalidate)
- `components/feed/StoriesRow.tsx` - Accepts StoryGroup[], renders blue/grey ring per hasUnseen, no add-story button
- `app/(tabs)/feed.tsx` - Uses useStories + useMarkStoryViewed, adds StoryViewer with viewerVisible/viewerStartIndex state

## Decisions Made
- queryKey namespaced `['stories', userId]` so each user gets their own seen state cache
- StoriesRow returns null when groups empty -- no placeholder data (client-only app, real data or nothing)
- upsert with `onConflict: 'story_id,viewer_id'` makes mark-viewed idempotent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Stories appear automatically from Supabase once stories exist.

## Next Phase Readiness
- End-to-end stories flow ready for human verification (Task 3 checkpoint)
- All auto tasks committed; StoryViewer will open on tap with real story groups
- Ring state will update to grey after viewing, driven by cache invalidation

---
*Phase: 03-stories*
*Completed: 2026-03-17*
