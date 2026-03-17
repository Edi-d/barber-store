# Feature Landscape

**Domain:** Barber/salon client app — live streaming, stories, realtime social feed
**Project:** Tapzi
**Researched:** 2026-03-17
**Confidence:** HIGH (live streaming patterns well-established; Supabase Realtime docs current)

---

## Context: What Already Exists

The app is brownfield. These features are functional and must not be regressed:

- Feed with infinite scroll, likes (double-tap + haptic), nested comments, follow system
- `lives` table with `provider`, `ingest_url`, `stream_key`, `playback_url`, `viewers_count` columns
- `go-live.tsx` MVP: create live record in DB, no actual video
- `LiveSection` component: renders live cards with viewer count, cover image, LIVE badge
- `StoriesRow` component: renders creator avatars with blue/red ring — no real stories data behind it
- Role system: `user | creator | admin | moderator` — clients are `user`, barbers are `creator/admin`

The milestone connects real data and real video to these existing UI shells.

---

## Table Stakes

Features clients expect. If missing, the live/stories experience feels broken or fake.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Live stream playback | Core promise of the milestone — clicking a LIVE card must show real video | High | Requires native video SDK (Agora or Livekit). Expo managed workflow is NOT compatible — needs dev build |
| Live viewer count (realtime) | Every streaming platform shows this. Static count feels broken | Low | Supabase Presence on `live:{id}` channel. Already has `viewers_count` column but it's static |
| Live text chat | Users expect to interact during a stream, not just watch silently | Medium | Supabase Broadcast or dedicated chat table with Realtime subscription |
| Stories viewer with progress bar | Instagram/Snapchat established this UX in 2013. Segmented top bar + auto-advance is the expected pattern | Medium | Reanimated-based progress bars. Tap right = next, tap left = back, hold = pause |
| Stories 24h expiry | Users trust stories disappear. Missing expiry = trust issue | Low | PostgreSQL row with `expires_at` timestamp + query filter. Cleanup via pg_cron or Edge Function |
| Stories ring on avatar (unseen vs seen) | Blue ring = unseen story, no ring = seen. Standard signal. Missing it = stories feel unnavigable | Low | `story_views` table or local state. Already have ring styling in `StoriesRow.tsx` |
| Live discovery (real data) | `LiveSection` already exists but shows placeholder data. Must show actual live sessions | Low | Query `lives` table where `status = 'live'`. Already built, just needs real data |
| Swipe between stories (same creator) | If a creator posts multiple stories, tap/swipe moves to next | Low | Index state in story viewer modal |
| Swipe between creators (all stories row) | After finishing one creator's stories, advance to next creator | Medium | Outer index managing which creator's story set is open |

---

## Differentiators

Features that go beyond standard UX expectations and create competitive advantage for a barber-focused app.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Realtime feed (likes/comments appear without refresh) | Users see live engagement happening — creates energy and FOMO. Supabase Postgres Changes make this straightforward | Medium | Subscribe to `content` table inserts/updates via Supabase Realtime. Invalidate React Query cache on event |
| Realtime new post banner | "2 new posts — tap to refresh" style banner when new content lands while user is on feed | Low | Count incoming Realtime events, show sticky banner, scroll to top on tap |
| Booking CTA inside live stream | Barber is cutting hair live → "Book this barber" button in the stream UI. Contextual conversion moment unique to this domain | Medium | Pass `host_id` to viewer screen, render booking deep link. No backend work needed |
| Stories highlight shelf (saved stories) | Creators can pin story collections to their profile permanently. Common in Instagram but rare in barber apps | High | New table `story_highlights`, UI on profile screen. Out of scope for v1 but worth noting as v2 |
| Salon-tagged content in stories | Stories tagged with salon name — "@ Salon X" visible in viewer | Low | `salon_id` field on stories table, resolve salon name in viewer |

---

## Anti-Features

Features to deliberately NOT build in this milestone. Explicitly excluded to prevent scope creep.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Emoji/reaction overlay in live | Every mainstream platform has this but it adds complexity (floating animations, server-side event fans) with marginal retention uplift for a barber niche | Text chat only. Simple, fast to build, lower bandwidth |
| Story text overlays / stickers / drawing | Canva-level editing UX. Weeks of work for a feature barbers rarely use in v1 | Photo and video upload only. If barbers want text, they edit before uploading |
| Audio-only rooms | Different use case (podcasts, Q&A). Barbershops are visual. Adds SDK complexity for no gain | N/A — skip entirely |
| Push notifications for live/stories | Valuable but requires FCM/APNs setup, notification permission flow, server-side triggers. Own milestone | In-app notification banner only. Push notifications in future milestone |
| Monetization / tips in live | Payment integration, payout logic, legal compliance. Months of work | Not in scope. Show booking CTA instead (existing checkout flow) |
| Creator-side posting UI for stories | This is the client app. Creators post from another interface or admin tooling | Consume only. If a story upload screen exists it should be behind creator role gate |
| Video calling / 1:1 between client and barber | Different product (like consultation feature). Live streaming is broadcast, not conversation | Not in scope |
| Story analytics for creators | View counts, reach stats. Belongs in creator dashboard, not client app | Not in scope |
| Comments on stories | WhatsApp and Telegram do story replies. High UX complexity (reply threading to ephemeral content) | Likes only, or no interaction. Stories are passive consumption |

---

## Feature Dependencies

```
Live stream playback
  └── Requires: video SDK integration (Agora or Livekit) — external dependency
  └── Requires: `playback_url` populated in `lives` table
  └── Requires: Expo dev build (managed workflow cannot include native video modules)

Live viewer count (realtime)
  └── Requires: Supabase Realtime (Pro tier) — already flagged as upgrade needed
  └── Requires: Supabase Presence on per-live channel

Live text chat
  └── Requires: Supabase Realtime (Pro tier)
  └── Requires: either Broadcast (ephemeral, no history) OR `live_messages` table (persisted)
  └── Decision: Broadcast = simpler, no DB writes, no message history. Recommended for v1.

Stories viewer with progress bar
  └── Requires: `stories` table with media_url, author_id, expires_at
  └── Requires: Supabase Storage bucket for story media
  └── Requires: Reanimated timing animation (already used in app for other features)

Stories ring (unseen/seen state)
  └── Requires: stories to exist
  └── Requires: `story_views` table OR client-side AsyncStorage tracking
  └── Recommendation: `story_views` table for cross-device correctness

Stories 24h expiry
  └── Requires: `expires_at` column on stories table
  └── Requires: query filter `WHERE expires_at > NOW()`
  └── Cleanup: pg_cron job (Supabase Pro) or scheduled Edge Function

Realtime feed updates
  └── Requires: Supabase Realtime (Pro tier)
  └── Requires: Postgres Changes subscription on `content` and `likes` tables

Live discovery (real data)
  └── Requires: Live stream playback (otherwise clicking a live card goes nowhere)
  └── No new backend needed — query already exists, just needs real live sessions
```

---

## MVP Recommendation

Prioritize in this order:

1. **Stories table + viewer** — Entirely within Supabase + React Native, no external SDK. Highest visual impact, lowest risk. Unblocks the `StoriesRow` shell that already exists.
2. **Live stream playback (viewer)** — Wire the Agora/Livekit SDK into the existing live viewer route. `LiveSection` and `LiveCard` already exist. This is the highest-complexity item due to native modules.
3. **Realtime viewer count** — Supabase Presence on live channel. Small surface area, high perceived quality improvement.
4. **Live text chat** — Supabase Broadcast. No persistence needed for v1. Wires directly into live viewer screen.
5. **Realtime feed (likes + new posts)** — Supabase Postgres Changes on `content` and `likes`. Low complexity, high perceived quality.

Defer to future milestone:
- **Story highlights** — requires new table, new profile UI section, complex UX
- **Push notifications** — own milestone, FCM/APNs setup required
- **Story likes / reactions** — nice to have, not blocking

---

## Expo / React Native Specific Constraints

These are not general social app concerns — they are specific to this stack:

| Concern | Impact | Mitigation |
|---------|--------|------------|
| Native video SDK requires dev build | Cannot use Expo Go for testing. Agora and Livekit both require native modules | Switch to Expo dev build (`expo run:ios`, `expo run:android`) before video work starts |
| Livekit Expo plugin exists | `@livekit/react-native` has an Expo plugin for managed workflow config | Still requires dev build — Expo Go does not run native modules |
| Agora React Native SDK | `react-native-agora` is well-maintained, large install base, simpler API for broadcast/viewer pattern | Viewer-only (client app) is lower complexity than full host SDK |
| Reanimated for progress bars | Already in project. Stories progress bar is a Reanimated `useSharedValue` timing animation | No new dependencies needed |
| expo-av for video fallback | Supabase Storage video (story videos) can use expo-av/expo-video. Only live streaming needs the external SDK | Stories video and feed video use expo-video. Live streaming uses Agora/Livekit |

---

## Sources

- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime) — Presence, Broadcast, Postgres Changes
- [Supabase Realtime Presence Authorization](https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization)
- [LiveKit React Native SDK](https://github.com/livekit/client-sdk-react-native)
- [LiveKit React Native Quickstart](https://docs.livekit.io/home/quickstarts/react-native/)
- [Agora vs LiveKit comparison — VideoSDK](https://www.videosdk.live/agora-vs-livekit)
- [7 UX Best Practices for Livestream Chat — GetStream](https://getstream.io/blog/7-ux-best-practices-for-livestream-chat/)
- [How Instagram Stories Work — Inro.social](https://www.inro.social/blog/how-instagram-stories-work-in-2025-features-faqs-tips)
- [Instagram Stories UX Challenges — Medium/Startup](https://medium.com/swlh/instagram-stories-ux-challenges-649433eebe55)
- [WebRTC vs HLS Latency — nanocosmos](https://www.nanocosmos.net/blog/webrtc-latency/)
- [Best Live Streaming SDK Providers — Mux](https://www.mux.com/articles/best-live-streaming-sdk-and-api-providers-for-developers)
