# Architecture Patterns

**Domain:** Barber/salon social media — live streaming + stories + realtime feed
**Researched:** 2026-03-17
**Confidence:** HIGH (LiveKit/Supabase official docs), MEDIUM (stories patterns), HIGH (Supabase Realtime)

---

## Recommended Architecture

Three independent feature pillars bolt onto the existing Expo/Supabase architecture. Each pillar owns its data layer, component layer, and integration seam with the existing app. They do not depend on each other and can be built in parallel or sequenced.

```
┌──────────────────────────────────────────────────────────┐
│                     Existing App Shell                    │
│  Expo Router  │  Zustand Stores  │  React Query Cache    │
└──────┬────────┴────────┬─────────┴──────────┬────────────┘
       │                 │                     │
   ┌───▼────┐       ┌────▼─────┐         ┌────▼──────┐
   │  LIVE  │       │ STORIES  │         │ REALTIME  │
   │ Pillar │       │  Pillar  │         │  Pillar   │
   └───┬────┘       └────┬─────┘         └────┬──────┘
       │                 │                     │
  LiveKit SDK     Supabase Storage       Supabase Realtime
  + Supabase      + Supabase DB          channels (WS)
   (metadata       (stories table,
    + chat)          expiry cron)
```

---

## Component Boundaries

### Pillar 1: Live Streaming

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `lib/livekit.ts` | LiveKit client initialization, `registerGlobals()` call, token request helper | LiveKit Cloud, Supabase Edge Function |
| `lib/live.ts` (extend existing) | CRUD on `lives` table, token fetch from Edge Function, viewers_count update | Supabase DB, LiveKit token endpoint |
| `app/live/[id].tsx` (new) | Full-screen viewer screen — LiveKit `VideoView`, chat overlay, viewer count | LiveKit room connection, Supabase Realtime chat channel |
| `app/go-live.tsx` (extend) | Add real video broadcast using `useLocalParticipant`, replace MVP banner | LiveKit room, Supabase DB |
| `components/live/LiveChatOverlay.tsx` (new) | Text chat list + input, subscribes to Supabase Realtime broadcast | Supabase Realtime `live-chat:{liveId}` channel |
| `components/live/ViewerCountBadge.tsx` (new) | Animated viewer count, receives count via Presence | LiveKit room Presence or Supabase Realtime Presence |
| `components/feed/LiveSection.tsx` (extend) | Wire the existing `TODO: Navigate to live stream viewer` → `app/live/[id].tsx` | React Query `['lives']` cache |
| Supabase Edge Function: `token-livekit` | Generate LiveKit JWT token server-side (never expose API secret in client) | LiveKit Cloud API, Supabase Auth |

**LiveKit architecture note:** LiveKit uses JWT access tokens scoped per room. The client never holds the LiveKit API secret. Flow: client calls Edge Function with Supabase session → Edge Function validates session, generates LiveKit token → client connects to LiveKit room using that token.

**Lives DB schema additions needed:**
- `provider` column: set to `'livekit'`
- `room_name` column: LiveKit room identifier (e.g. `live_{id}`)
- `viewers_count` already exists — update via Presence hook or periodic DB write

### Pillar 2: Stories

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `lib/stories.ts` (new) | Query active stories (not expired), upload media to Storage, insert story record | Supabase DB `stories` table, Supabase Storage `stories` bucket |
| `app/story/[userId].tsx` (new) | Full-screen story viewer — progress bar, auto-advance, swipe between users | `lib/stories.ts`, Reanimated for animation |
| `components/feed/StoriesRow.tsx` (extend) | Replace placeholder `Story` type with real DB type, wire `onStoryPress` → `app/story/[userId]` | React Query `['stories']` cache |
| `app/story/create.tsx` (new) or modal | Camera/gallery picker, 15-30s video trim, upload flow | `expo-image-picker`, `expo-av`, Supabase Storage |
| Supabase `stories` table (new) | `id, creator_id, media_url, media_type, created_at, expires_at` | — |
| Supabase Storage `stories` bucket (new) | Holds photo/video files, short-lived (files deleted by cron) | — |
| Supabase Edge Function: `expire-stories` | Delete stories where `expires_at < now()` and remove Storage objects | Supabase DB + Storage |
| Supabase Cron job | Trigger `expire-stories` every hour via `pg_cron` | Supabase Edge Function |

**24h expiry design:** `expires_at = created_at + interval '24 hours'` stored at insert time. Client-side filter: `WHERE expires_at > now()`. Server-side cleanup: hourly `pg_cron` job calls the Edge Function which deletes expired rows + Storage objects. Two-layer approach (client filter + server delete) means no stale stories are ever shown even if cleanup runs late.

**Stories viewer component:** Build from scratch using `react-native-reanimated` (already installed) rather than pulling in `@birdwingo/react-native-instagram-stories`. The app already uses Reanimated heavily; a custom component integrates more cleanly with the glassmorphism design system and avoids adding a dependency with low weekly downloads (1,428/week). The pattern is: `SharedValue` for progress, `useAnimatedStyle` for progress bar width, `GestureDetector` for left/right tap zones and swipe-down-to-close.

### Pillar 3: Realtime Feed

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `lib/realtime.ts` (new) | Channel factory, typed subscription helpers, cleanup on unmount | Supabase Realtime WebSocket |
| Hook: `useRealtimeFeed()` (new) | Subscribe to `postgres_changes` on `content`, prepend new posts to React Query cache | Supabase Realtime, React Query `queryClient` |
| Hook: `useRealtimeLikes()` (new) | Subscribe to `postgres_changes` on `content` (UPDATE, `likes_count` changes), update cached post | Supabase Realtime, React Query cache |
| Hook: `useRealtimeComments()` (new) | Subscribe to `postgres_changes` on `comments` (INSERT), increment cached `comments_count` | Supabase Realtime, React Query cache |
| Hook: `useRealtimeLives()` (new) | Subscribe to `postgres_changes` on `lives` (INSERT status=live, UPDATE status=ended), update `['lives']` cache | Supabase Realtime, React Query cache |
| Hook: `useRealtimeViewerCount(liveId)` (new) | Presence-based viewer count in `app/live/[id].tsx`, or subscribe to `lives` UPDATE `viewers_count` | Supabase Realtime Presence or postgres_changes |
| `app/(tabs)/index.tsx` (home/feed) | Mount all realtime hooks at feed screen level, unmount on navigate away | All realtime hooks |

**Supabase Realtime modes used:**
- `postgres_changes` — for feed (new posts), likes counts, comment counts, live status changes
- `broadcast` — for live chat messages (ephemeral, not stored in DB, low latency)
- `presence` — for viewer count in a live room (who is currently connected)

**React Query cache integration pattern:** Realtime hooks do not own state. They call `queryClient.setQueryData()` or `queryClient.invalidateQueries()` on existing React Query keys. This keeps a single source of truth — components read from React Query cache as before, but cache is now kept warm by Realtime subscriptions rather than only polling.

---

## Data Flow

### Live Streaming — Broadcast Flow (Creator)

```
Creator taps "Start Live" (go-live.tsx)
  → Supabase INSERT lives (status='starting', provider='livekit')
  → Call Edge Function /token-livekit?roomName=live_{id}&role=host
  → Edge Function validates Supabase JWT → creates LiveKit JWT
  → LiveKit SDK connects with token → camera/mic captured
  → Supabase UPDATE lives status='live', playback_url=<livekit-playback>
  → Realtime broadcast notifies all feed subscribers → LiveSection refreshes
```

### Live Streaming — Viewer Flow

```
Viewer sees LiveSection card → taps → navigates to app/live/[id].tsx
  → Fetch lives row from Supabase (playback_url, room_name)
  → Call Edge Function /token-livekit?roomName=live_{id}&role=viewer
  → LiveKit SDK connects as subscriber-only
  → LiveChatOverlay subscribes to Supabase Realtime broadcast channel live-chat:{liveId}
  → ViewerCountBadge tracks Realtime Presence joins/leaves
  → On broadcaster disconnect → lives UPDATE status='ended' → viewer sees ended screen
```

### Live Chat Message Flow

```
Viewer types message → hits send
  → Supabase Realtime broadcast to channel live-chat:{liveId}
  → All connected viewers receive message instantly (ephemeral, never stored in DB)
  → Optional: Supabase INSERT live_chat_messages for moderation/history (separate table)
```

### Stories — Upload Flow

```
Creator taps "Add Story" (StoriesRow)
  → app/story/create.tsx opens
  → expo-image-picker / expo-av captures media
  → Upload to Supabase Storage bucket 'stories'
  → INSERT into stories table: {creator_id, media_url, media_type, expires_at=now()+24h}
  → React Query invalidate ['stories'] → StoriesRow refreshes
```

### Stories — Viewer Flow

```
Viewer taps creator avatar in StoriesRow
  → Navigate to app/story/[userId].tsx with userId param
  → Fetch stories WHERE creator_id=userId AND expires_at > now()
  → Reanimated progress bar animates across each story duration
  → On tap-right → advance to next story; on tap-left → go back; swipe-down → dismiss
  → (Optionally) INSERT into story_views for seen tracking
```

### Stories — Expiry Flow

```
pg_cron runs every hour → calls Edge Function expire-stories
  → Edge Function: SELECT * FROM stories WHERE expires_at < now()
  → For each expired story: delete Storage object → DELETE stories row
  → Client-side: queries always filter expires_at > now() as safety net
```

### Realtime Feed — New Post Flow

```
Another user publishes content → Supabase INSERT content (status='published')
  → Supabase Realtime WAL replication detects INSERT on content table
  → postgres_changes event delivered to all subscribers of channel 'public:content'
  → useRealtimeFeed() receives event → calls queryClient.setQueryData
    to prepend new post to ['feed'] infinite query first page
  → Feed screen re-renders with new post at top (no manual refresh needed)
```

### Realtime Feed — Like/Comment Count Flow

```
User A likes a post → UPDATE content SET likes_count=likes_count+1
  → Supabase Realtime UPDATE event on content row
  → useRealtimeLikes() receives event → patches that post in React Query cache
  → All users viewing same post see updated count instantly
```

---

## Patterns to Follow

### Pattern 1: Edge Function for LiveKit Token Generation
**What:** A Supabase Edge Function acts as the token server. Client sends authenticated request with `roomName` and desired `role`. Edge Function checks Supabase session, checks `lives` table for authorization, then generates a LiveKit JWT using the LiveKit server SDK.
**When:** Always. Never put the LiveKit API secret in the client bundle.
**Why:** LiveKit API secret + key must stay server-side. Edge Function has access to env vars. Client sends its Supabase JWT (already have auth), Edge Function validates it — no separate auth system needed.

### Pattern 2: Realtime Hooks Patch React Query Cache
**What:** Realtime subscription handlers call `queryClient.setQueryData()` or `queryClient.invalidateQueries()`. They never maintain their own local state.
**When:** All realtime-driven UI updates (new posts, count changes, live status).
**Why:** Keeps React Query as single source of truth. Components don't change. Optimistic updates already in place continue to work. Reduces state divergence bugs.

```typescript
// lib/realtime.ts pattern
export function useRealtimeLikes() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel('public:content:likes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'content',
      }, (payload) => {
        const updated = payload.new as ContentRow;
        queryClient.setQueryData<InfiniteData<ContentPage>>(
          ['feed'],
          (old) => patchPostInPages(old, updated)
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);
}
```

### Pattern 3: Supabase Broadcast for Ephemeral Chat
**What:** Live chat messages sent via Supabase Realtime `broadcast` (not `postgres_changes`). Messages never hit the DB by default — they are fire-and-forget. If message history is needed for moderation, a separate insert to `live_chat_messages` can be done in parallel.
**When:** Live chat in the viewer screen.
**Why:** Broadcast has lower latency than writing to DB and waiting for WAL replication. Chat messages in a live stream are ephemeral by nature. Postgres storage of every chat message at scale is expensive.

### Pattern 4: Presence for Viewer Count
**What:** Each viewer who connects to `app/live/[id].tsx` joins a Supabase Realtime Presence channel `live-viewer:{liveId}`. Viewer count = `presenceState` key count. On leave (screen unmount), presence is automatically removed.
**When:** Displaying live viewer count.
**Why:** More accurate than `viewers_count` DB column (which requires debounced writes). Zero DB load. Self-healing — crashes/network drops automatically decrement count when the socket closes.

### Pattern 5: Stories Progress Bar via Reanimated SharedValue
**What:** A single `SharedValue<number>` drives a `useAnimatedStyle` for progress bar width. `withTiming` runs the animation for the story duration. On tap or end of timing, index advances.
**When:** Building the story viewer from scratch.
**Why:** Smooth 60fps animation without `setState`. Consistent with existing app animation patterns using Reanimated.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Putting LiveKit API Secret in the App Bundle
**What:** Storing `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env` and bundling them into the Expo app.
**Why bad:** Anyone who downloads the app can extract the secret, create arbitrary rooms, impersonate hosts. Complete security breach.
**Instead:** Edge Function generates tokens. Only the server holds the secret.

### Anti-Pattern 2: Storing All Live Chat in Postgres
**What:** Every chat message triggers a `supabase.from('live_chat').insert()`.
**Why bad:** A popular live with 500 viewers sending messages could produce 1000s of writes/minute. Hits Supabase free tier limits immediately, creates latency, expensive on Pro tier.
**Instead:** Use Supabase Realtime broadcast for delivery. Only persist messages if moderation history is needed, and batch-write with debouncing.

### Anti-Pattern 3: Polling for Realtime Updates
**What:** Using `refetchInterval` on React Query to simulate realtime (e.g. re-fetch feed every 5 seconds).
**Why bad:** Wastes bandwidth, increases DB read load, creates janky UX with sudden jumps.
**Instead:** Supabase Realtime channels with `postgres_changes` — push-based, efficient, instant.

### Anti-Pattern 4: Not Cleaning Up Realtime Channels on Unmount
**What:** Starting a channel subscription without returning a cleanup function in `useEffect`.
**Why bad:** Memory leaks. Multiple subscriptions stack up as user navigates. Eventually crashes or gets out-of-sync events.
**Instead:** Always `return () => supabase.removeChannel(channel)` in `useEffect` cleanup.

### Anti-Pattern 5: Loading All Stories Across All Creators at Once
**What:** Fetching the complete stories table and grouping client-side.
**Why bad:** If there are 100 creators with 3 stories each, that's 300 media files to render in a horizontal scroll row.
**Instead:** StoriesRow only shows creators who have active stories (query `stories` table, GROUP BY `creator_id`). Only load actual story media on demand when user taps into a specific creator's stories.

### Anti-Pattern 6: Using Expo Go with LiveKit
**What:** Trying to run LiveKit in Expo Go.
**Why bad:** LiveKit requires `@livekit/react-native-webrtc` which is a native module. Expo Go does not support native modules. App will crash immediately.
**Instead:** Use a development build (`expo-dev-client` + `eas build --profile development`). This is a hard requirement — document it explicitly in build instructions.

---

## Suggested Build Order (Phase Dependencies)

The three pillars have **no mutual dependencies** — but within each pillar, order matters.

### Why this order:

1. **Realtime Feed first** — Lowest risk, no new native modules, no new infrastructure. Integrates with existing tables. Proves Supabase Realtime is configured correctly (Pro plan enabled, RLS policies allow replication). This is the foundation for the viewer count feature in live.

2. **Stories second** — Requires only Supabase Storage + a new table + Reanimated animations. No new native modules (expo-image-picker and expo-av already work in Expo Go and dev builds). Can be completed before the dev build requirement is resolved.

3. **Live Streaming last** — Requires the most setup: LiveKit account, Edge Function deployment, dev build compilation, and the most complex component (video room + chat + presence). Should only start after Supabase Realtime is verified working (validated in step 1) since live chat and viewer count depend on it.

```
Phase A: Realtime Infrastructure
  ├── Supabase Pro upgrade + enable Realtime
  ├── lib/realtime.ts channel factory
  ├── useRealtimeFeed() → patches ['feed'] cache
  ├── useRealtimeLikes() → patches likes_count
  ├── useRealtimeComments() → patches comments_count
  └── useRealtimeLives() → updates LiveSection

Phase B: Stories
  ├── Supabase: create stories table + storage bucket
  ├── Supabase: Edge Function expire-stories + pg_cron job
  ├── lib/stories.ts (fetch, upload, seen tracking)
  ├── StoriesRow.tsx — wire to real data
  ├── app/story/[userId].tsx — viewer with progress bar
  └── app/story/create.tsx — upload flow (creators)

Phase C: Live Streaming
  ├── LiveKit Cloud account + API credentials in env
  ├── Supabase Edge Function: token-livekit
  ├── Supabase migration: add room_name to lives table
  ├── Dev build setup (expo-dev-client + livekit plugin in app.json)
  ├── lib/livekit.ts — registerGlobals, room helpers
  ├── app/go-live.tsx — replace MVP banner with real broadcast
  ├── app/live/[id].tsx — viewer screen (VideoView + chat)
  ├── components/live/LiveChatOverlay.tsx — Realtime broadcast
  └── components/live/ViewerCountBadge.tsx — Realtime presence
```

---

## Scalability Considerations

| Concern | At 50 concurrent viewers | At 500 concurrent viewers | Notes |
|---------|--------------------------|---------------------------|-------|
| LiveKit video | Handled by LiveKit Cloud (per-minute billing) | Same | Scale is LiveKit's problem |
| Live chat broadcast | ~50 WS connections on 1 Supabase Realtime channel | Supabase Pro handles hundreds | Monitor channel limits |
| Presence (viewer count) | ~50 presence entries, trivial | ~500 entries, still fine | Supabase Presence is in-memory CRDT |
| Stories Storage | ~few GB for 24h window | ~10s of GB | Set Supabase Storage lifecycle or rely on hourly cron |
| Realtime feed subscriptions | ~100s of connected clients × 3 channels each | Monitor Supabase connection limits | Pro plan: 500 concurrent connections |
| DB writes (viewer count) | Debounce to 1 write/5s per live | Same | Use Presence instead of DB writes |

---

## New Files Map

```
lib/
  livekit.ts          — LiveKit client setup, room helpers, token fetch
  stories.ts          — stories CRUD, upload, expiry filter
  realtime.ts         — channel factory, typed subscription helpers

stores/
  liveStore.ts        — current room connection state, chat messages (ephemeral)
  storiesStore.ts     — seen story IDs (persisted via AsyncStorage)

app/
  live/[id].tsx       — full-screen live viewer
  story/[userId].tsx  — story viewer with progress bar
  story/create.tsx    — story creation (creators)

components/
  live/
    LiveChatOverlay.tsx     — chat list + input
    ViewerCountBadge.tsx    — animated viewer count
  stories/
    StoryProgressBar.tsx    — Reanimated progress bar
    StoryViewerModal.tsx    — full-screen story container

supabase/functions/
  token-livekit/index.ts   — JWT token generation for LiveKit
  expire-stories/index.ts  — cleanup expired stories + storage objects
```

---

## External Dependencies to Add

| Package | Purpose | Native Module? | Requires Dev Build? |
|---------|---------|---------------|---------------------|
| `@livekit/react-native` | LiveKit SDK core | Yes (via WebRTC) | Yes |
| `@livekit/react-native-expo-plugin` | Expo config plugin for LiveKit | Config only | Yes (adds native code) |
| `@livekit/react-native-webrtc` | WebRTC native bridge | Yes | Yes |
| `@config-plugins/react-native-webrtc` | Expo config plugin for WebRTC | Config only | Yes |
| `livekit-client` | LiveKit JS client utilities | No | No |

Stories and Realtime require **no new npm packages** beyond what is already installed.

---

## Sources

- [LiveKit Expo Quickstart](https://docs.livekit.io/home/quickstarts/expo/) — HIGH confidence (official docs)
- [LiveKit React Native Expo Plugin](https://github.com/livekit/client-sdk-react-native-expo-plugin) — HIGH confidence (official SDK)
- [LiveKit React Native SDK](https://github.com/livekit/client-sdk-react-native) — HIGH confidence (official SDK)
- [Supabase Realtime Architecture](https://supabase.com/docs/guides/realtime/architecture) — HIGH confidence (official docs)
- [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast) — HIGH confidence (official docs)
- [Supabase Cron](https://supabase.com/modules/cron) — HIGH confidence (official docs)
- [Supabase Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) — HIGH confidence (official docs)
- [react-native-instagram-stories](https://github.com/birdwingo/react-native-instagram-stories) — MEDIUM confidence (third-party, evaluated and rejected in favour of custom)

---

*Architecture analysis: 2026-03-17*
