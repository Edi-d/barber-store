# Phase 4: Live Streaming - Context

**Captured:** 2026-03-17
**Phase:** 04 - Live Streaming

## Decisions

### LiveKit as streaming provider
LiveKit Cloud (project: skylarkbv, URL: wss://skylarkbv-l5kh1dli.livekit.cloud) is the chosen provider. LIVEKIT_API_KEY and LIVEKIT_API_SECRET are stored in Supabase Edge Function secrets. EXPO_PUBLIC_LIVEKIT_URL is in barber-store .env.

### LiveKit packages already installed in both apps
Both barber-store and tapzi-barber have identical LiveKit dependencies:
- `@livekit/react-native` ^2.9.6
- `@livekit/react-native-expo-plugin` ^1.0.2
- `@livekit/react-native-webrtc` ^137.0.2
- `livekit-client` ^2.17.3
- `@config-plugins/react-native-webrtc` ^13.0.0

Both app.json files include the LiveKit Expo plugins.

### Live chat uses Supabase Broadcast (ephemeral, no DB writes)
Chat messages during live streams are sent via Supabase Realtime Broadcast channel. No persistence, no chat history. Messages disappear when the stream ends.

### Viewer count uses Supabase Presence
Real-time viewer count is tracked via Supabase Realtime Presence. Each viewer tracks their presence when joining, untracks when leaving. The count is derived from presenceState() on sync events.

### Token generation via Supabase Edge Function
A `token-livekit` Supabase Edge Function (Deno) generates LiveKit access tokens server-side. The client sends room_name and the function returns a JWT token. Auth is verified via the Supabase JWT in the Authorization header.

### User tests via Expo Go (friend confirmed LiveKit works in Expo Go)
Despite LiveKit docs saying Expo Go is not supported, the user's friend confirmed it works. However, dev builds are the fallback if issues arise. Both apps have expo-dev-client installed and LiveKit Expo plugins configured.

### DB schema discrepancy: migration uses `author_id`, TypeScript types use `host_id`
The lives table migration (033_lives_table.sql) uses `author_id` as the FK column, but types/database.ts defines the column as `host_id`. The tapzi-barber `useLiveStreams` hook queries with `profiles!host_id`. This discrepancy must be resolved -- the actual DB column name needs verification and alignment.

### Both apps share the same Supabase project
barber-store (client) and tapzi-barber (barber) both connect to the same Supabase instance (iaqztbhkukgghomwnict.supabase.co).

## Claude's Discretion

### Room naming convention
Claude decides how to name LiveKit rooms (e.g., `live-{liveId}` or `{userId}-{timestamp}`). Must be unique per lives table row.

### Edge Function error handling pattern
Claude decides the error response format and HTTP status codes for the token-livekit Edge Function.

### Camera preview layout and controls placement
Claude decides the UI layout for the broadcast screen (camera preview, mute/flip/end buttons placement), following the existing glassmorphism design language.

### Live viewer screen layout
Claude decides the full-screen viewer layout (video fill, chat overlay position, viewer count badge position), matching the existing LiveSection card design patterns.

### Hook architecture for live features
Claude decides the hook structure (useRealtimeLives, useLiveChat, useLiveViewers, useLiveKitRoom, etc.) following existing patterns in the codebase.

## Deferred Ideas (OUT OF SCOPE)

- Emoji reactions overlay in live stream (LIVE-V2-01)
- Live chat message history/persistence (LIVE-V2-02)
- Booking CTA in live viewer (LIVE-V2-03)
- Multi-camera support (LIVE-V2-04)
- Push notifications for live start
- Audio-only rooms
- Live replay/recording

## Cross-Team Coordination

### barber-store (client app) -- this repo
- Receives and displays live streams (viewer side)
- LiveSection on home wired to real data
- Client viewer screen with VideoView, chat, viewer count
- `lib/livekit.ts` connection helper shared logic

### tapzi-barber (barber app) -- /Users/edi/Desktop/tapzi-barber
- Broadcasts live streams (publisher side)
- Go-live screen exists as placeholder Alert in social.tsx `handleChipPress` for 'live' action
- No go-live.tsx file exists yet -- must be created
- Social tab already has LiveSection component showing live streams
- `useLiveStreams` hook already queries lives table with `profiles!host_id` join

### Supabase Edge Function -- shared infrastructure
- `token-livekit` function serves both apps
- Deployed to the shared Supabase project
- Uses LIVEKIT_API_KEY and LIVEKIT_API_SECRET from secrets

## Existing Code Context

### barber-store existing code
- `app/go-live.tsx` -- Full go-live setup form (title, cover, visibility, start/end mutations). Currently creates DB rows with status "starting" but no video. Has "MVP Mode" notice. Uses react-hook-form, ImagePicker.
- `components/feed/LiveSection.tsx` -- Horizontal scroll of LiveCard components showing cover image, LIVE badge, viewer count, host info. Takes `LiveWithHost[]` props. Navigation TODO on card press.
- `types/database.ts` -- `Live` type with id, host_id, title, cover_url, is_public, status, provider, ingest_url, stream_key, playback_url, viewers_count, started_at, ended_at. `LiveWithHost` extends with host Profile.
- `lib/supabase.ts` -- Standard Supabase client with SecureStore on native, localStorage on web.

### tapzi-barber existing code
- `app/(tabs)/social.tsx` -- Social tab with stories, action chips (including 'live' chip that shows Alert placeholder), LiveSection component, feed. Uses `useLiveStreams` hook.
- `components/social/LiveSection.tsx` -- UI shell for live stream cards with glassmorphism design.
- `hooks/use-social-feed.ts` -- Contains `useLiveStreams()` hook that queries lives table for status='live' with host profile join.

### Database (shared)
- `lives` table exists with columns: id, author_id (or host_id -- needs verification), title, cover_url, room_name (unique), status, playback_url, viewers_count, started_at, ended_at, created_at
- Migration has `author_id`, TypeScript types have `host_id` -- actual DB state unknown
- RLS: everyone can SELECT, owner can INSERT/UPDATE/DELETE
- Indexes on status='live' and author/host_id
