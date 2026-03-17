# Phase 2: Realtime Feed - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire Supabase Realtime into the existing feed so likes/comments counts update live, new posts trigger a banner, and all subscriptions are cleaned up on logout. No new screens — only realtime plumbing and one banner component on the existing feed.

</domain>

<decisions>
## Implementation Decisions

### Realtime scope
- Like counts and comment counts update live on all visible FeedCards (via `postgres_changes` on `content` table for UPDATE events on `likes_count`/`comments_count`)
- New posts by followed users trigger a "N new posts — tap to see" banner (via `postgres_changes` on `content` table for INSERT events)
- Post deletions remove the card from feed in realtime
- Author info changes (avatar, name) do NOT update realtime — stale until next fetch is acceptable

### Subscription strategy
- One single channel for the `content` table filtered to `status=eq.published` — not one channel per post
- Separate channel for `likes` table (INSERT/DELETE) to update `is_liked` state for the current user
- All channels managed through a global registry in `lib/realtime.ts`
- Channel factory pattern: `createChannel(name, config)` returns a managed channel with auto-cleanup

### New posts banner
- Fixed position at top of feed, below stories row
- Shows "N new posts — tap to see" with count badge
- Tap scrolls to top and prepends new posts to the infinite query cache
- Auto-dismiss after tap (not time-based)
- Animated slide-in from top (Reanimated spring)

### Subscription lifecycle
- Global registry in `lib/realtime.ts` tracks all open channels by name
- `cleanupAllChannels()` exported and called in `signOut()` flow in `authStore.ts`
- Channels subscribe on feed mount, unsubscribe on feed unmount (via useEffect cleanup)
- Registry prevents duplicate subscriptions (idempotent subscribe)

### React Query integration
- Realtime events call `queryClient.setQueryData()` directly to update cached feed data
- No refetch triggered — surgical cache updates only
- New post INSERTs are accumulated in a local ref, banner shows count, tap triggers prepend to cache
- Like/unlike from current user: optimistic update already works, realtime confirms from server

### Feed freshness
- Pull-to-refresh remains (existing behavior)
- Returning to feed tab: no auto-refresh, rely on realtime for live updates
- Stale time stays at 5 minutes (existing React Query config)

### Execution Pattern: Volt Subagents
ALL implementation work MUST use volt specialized subagents (voltagent-core-dev):
- `voltagent-core-dev:backend-developer` — `lib/realtime.ts` channel factory, subscription registry
- `voltagent-core-dev:frontend-developer` — New posts banner component, feed integration
- `voltagent-core-dev:fullstack-developer` — React Query cache integration with realtime events, signOut cleanup

### Claude's Discretion
- Exact channel naming convention (e.g., `feed:content`, `feed:likes`)
- Debounce/throttle strategy for rapid-fire realtime events
- Error handling for subscription failures (retry logic)
- TypeScript generics for the channel factory

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Realtime Architecture
- `.planning/research/ARCHITECTURE.md` — Supabase Realtime modes (postgres_changes, broadcast, presence), channel patterns
- `.planning/research/STACK.md` §Realtime Feed — Supabase Pro requirements, connection limits
- `.planning/research/PITFALLS.md` — Realtime subscription cleanup, connection leak risks

### Existing Feed Implementation
- `app/(tabs)/feed.tsx` — Current feed screen with React Query infinite scroll, pull-to-refresh
- `components/feed/FeedCard.tsx` — Post card component, accepts `likes_count`/`comments_count` props
- `components/feed/CommentsModal.tsx` — Comments modal with optimistic updates
- `lib/supabase.ts` — Supabase client configuration

### Auth & Cleanup
- `stores/authStore.ts` — Zustand auth store, signOut flow (must hook cleanup here)
- `app/settings.tsx` — Logout entry point

### Database Schema
- `types/database.ts` — Content, Like, Comment type definitions
- `migrations/027_social_completion.sql` — Social tables (notifications triggers may fire realtime events)

### Project Context
- `.planning/PROJECT.md` — Dual-app constraint, shared Supabase instance
- `.planning/REQUIREMENTS.md` — RT-01, RT-02, RT-03, RT-04 requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/supabase.ts`: Supabase client already configured — realtime is enabled by default in supabase-js v2.95.3
- `app/(tabs)/feed.tsx`: React Query `useInfiniteQuery` with cache keys `["feed"]` — realtime events target this cache
- `components/feed/FeedCard.tsx`: Accepts all needed props (`likes_count`, `comments_count`, `is_liked`) — no changes needed
- React Query `queryClient` available globally via provider in `app/_layout.tsx`
- Reanimated v4.1.1 available for banner animations

### Established Patterns
- React Query for all server state (staleTime: 5min, 2 retries)
- Optimistic updates on mutations via `queryClient.setQueryData()` — same pattern for realtime
- Zustand for client state (auth only)
- Cache keys: `["feed"]`, `["likes"]`, `["comments", contentId]`, `["following", userId]`
- Tailwind/nativewind for styling

### Integration Points
- `lib/realtime.ts` (new) — imported by feed hooks and authStore
- `stores/authStore.ts` signOut — must call `cleanupAllChannels()` before `supabase.auth.signOut()`
- `app/(tabs)/feed.tsx` — subscribe on mount, cleanup on unmount
- New posts banner component — rendered inside feed.tsx between StoriesRow and FeedCard list

</code_context>

<specifics>
## Specific Ideas

- Colegii de la tapzi-barber au pregatit migratiile 026-034 (social tables, lives, stories) dar nu au implementat inca Supabase Realtime — deci Phase 2 e greenfield
- Baza de date e comuna intre barber-store si tapzi-barber — realtime events de la un app sunt vizibile in celalalt
- Success criteria cer < 2 secunde latenta pe like count update

</specifics>

<deferred>
## Deferred Ideas

- Realtime for stories views count — Phase 3
- Realtime for live viewer count (Supabase Presence) — Phase 4
- Live chat via Supabase Broadcast — Phase 4
- Push notifications for new posts — v2 milestone

</deferred>

---

*Phase: 02-realtime-feed*
*Context gathered: 2026-03-17*
