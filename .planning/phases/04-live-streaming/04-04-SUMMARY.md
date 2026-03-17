---
plan: 04-04
phase: 04-live-streaming
status: complete
completed: 2026-03-17
duration: 5min
requirements: [LIVE-05]
---

# Plan 04-04 Summary: Live Discovery Wiring

## What Was Built

- `hooks/useRealtimeLives.ts` — Realtime subscription on lives table. Initial fetch of active streams (status=live/starting) ordered by viewers_count. Handles INSERT (fetches full row with host join), UPDATE (status=ended removes from state, viewers_count updates in-place), DELETE. Uses channel registry from lib/realtime.ts.
- `components/feed/LiveSection.tsx` — LiveCard onPress now navigates to `/live/${live.id}` via expo-router.
- `app/(tabs)/feed.tsx` — Replaced placeholder lives array + useQuery block with `useRealtimeLives()`. LiveSection now shows real DB data; returns null when no active streams.

## Key Decisions

- Used `getOrCreateChannel('realtime-lives')` from lib/realtime.ts registry (consistent with other hooks)
- UPDATE events with status=live/starting and item not in state triggers a full row re-fetch (handles starting→live transition)
- LiveSection already returned null for empty array — no extra guard needed

## Deviations

None.

## Key Files

- `hooks/useRealtimeLives.ts` (new)
- `components/feed/LiveSection.tsx` (navigation added)
- `app/(tabs)/feed.tsx` (placeholders removed, useRealtimeLives wired)
