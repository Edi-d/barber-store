# Project Research Summary

**Project:** Tapzi — Live Streaming, Stories, Realtime Feed
**Domain:** Barber/salon social media — brownfield milestone on existing Expo 54 / Supabase stack
**Researched:** 2026-03-17
**Confidence:** HIGH

## Executive Summary

Tapzi is adding three social media pillars — live streaming, stories, and realtime feed — on top of a working Expo 54 / React Native 0.81 / Supabase app. The existing codebase already contains UI shells for all three features (LiveSection, StoriesRow, go-live.tsx) but they show placeholder data and have no real video or realtime logic behind them. The milestone's job is to connect real infrastructure to existing shells, not build screens from scratch. This is almost entirely additive: the existing stack handles stories and realtime without any new packages. Live streaming is the only feature requiring new native modules.

The recommended approach is to build in dependency order: realtime infrastructure first (no new packages, validates Supabase Realtime is configured correctly), stories second (Supabase Storage + Reanimated, no new native modules, can be done before the mandatory dev build switch), and live streaming last (requires LiveKit Cloud account, a new Expo dev build, a Supabase Edge Function for token generation, and the most complex component composition). LiveKit is the clear choice over Agora: it ships an official Expo config plugin, its React Native SDK is actively maintained (v2.9.6, December 2024), it is open-source MIT, and its free tier covers MVP traffic at no cost.

The critical risk in this milestone is the Expo Go incompatibility introduced by LiveKit's native WebRTC dependency. Any developer who attempts to test live streaming in Expo Go will encounter silent failures and lose days. The second systemic risk is Supabase Realtime subscriptions that survive user logout — with multiple channels being opened across three features, failing to wire cleanup into the existing signOut() function will cause data leakage across sessions. Both risks are preventable with up-front setup steps before feature code is written.

---

## Key Findings

### Recommended Stack

The project already has everything needed for stories and realtime: `@supabase/supabase-js` 2.95.3 covers Realtime subscriptions, `expo-image-picker` 17 and `expo-camera` handle story media capture, `expo-av` 16 handles video playback, and Reanimated 4.1 drives progress bar animations. The only new package for stories is `tus-js-client` 4.x for resumable video uploads (story videos at 30s will exceed Supabase Storage's 6 MB threshold for standard uploads).

Live streaming requires a cluster of new packages: `@livekit/react-native` 2.9.6, `@livekit/react-native-webrtc`, `livekit-client`, `@livekit/react-native-expo-plugin`, and `@config-plugins/react-native-webrtc`. All five are added once and wired through `app.json` — no manual native code edits. Supabase Pro plan ($25/month) is required before production: the free tier pauses after 1 week of inactivity, has a 200 concurrent Realtime connection limit, and enforces a 50 MB Storage file limit that story videos will approach.

**Core technologies:**
- `@livekit/react-native` 2.9.6 — WebRTC-based live streaming SDK — only active, Expo-compatible option with official config plugin
- `tus-js-client` 4.x — resumable video upload to Supabase Storage — required for story videos exceeding 6 MB on mobile networks
- Supabase Realtime (existing) — feed, likes, comments, live status, viewer count, live chat — already integrated, zero new dependencies
- `expo-camera` (existing via Expo 54 SDK) — in-app story recording — no install needed, `recordAsync({ maxDuration: 30000 })` API
- LiveKit Cloud (hosted) — streaming infrastructure — free tier covers ~10,000 participant-minutes/month

### Expected Features

**Must have (table stakes):**
- Live stream playback with real video — clicking a LIVE card must show actual WebRTC video, not a placeholder
- Realtime viewer count on live streams — static count reads as broken to users
- Live text chat — viewers expect interaction during streams; Supabase Broadcast (ephemeral, no DB writes)
- Stories viewer with segmented progress bar — Instagram/Snapchat UX is the expected baseline
- Stories 24h expiry with ring state (seen/unseen) — missing either breaks trust in the stories feature
- Live discovery wired to real data — LiveSection already exists but shows hardcoded content

**Should have (competitive differentiators):**
- Realtime feed: new posts, likes, and comment counts update without manual refresh — creates perceived energy
- "2 new posts" banner on feed — low-effort, high-impact UX signal
- Booking CTA inside live stream — barber cutting hair live with a "Book this barber" button is unique to this domain and drives conversion

**Defer to v2+:**
- Story highlights shelf (pinned collections on profile) — new table, new profile UI, complex UX
- Push notifications for live/stories — own milestone, requires FCM/APNs setup
- Emoji reactions and floating animations in live chat — marginal uplift for significant complexity
- Story analytics for creators — belongs in creator dashboard

### Architecture Approach

The three features are independent pillars that bolt onto the existing Expo Router / Zustand / React Query shell without coupling to each other. The key architectural pattern across all three is that Realtime hooks never own local state — they call `queryClient.setQueryData()` to patch the existing React Query cache. This means all existing components continue reading from React Query as before, but the cache is now kept warm by WebSocket events instead of polling. LiveKit tokens are always generated server-side via a Supabase Edge Function — the API secret never enters the client bundle. Stories expiry uses a two-layer approach: client queries always filter `expires_at > NOW()` and a pg_cron job cleans up database rows and Storage objects hourly.

**Major components:**
1. `lib/realtime.ts` — channel factory with global subscription registry; cleanup wired to `authStore.ts` signOut()
2. `lib/stories.ts` + `app/story/[userId].tsx` — stories CRUD, TUS upload, custom Reanimated progress viewer
3. `lib/livekit.ts` + `app/live/[id].tsx` + Supabase Edge Function `token-livekit` — LiveKit room connection, token generation, chat overlay, presence viewer count
4. Supabase Edge Function `expire-stories` + pg_cron — hourly cleanup of expired story rows and Storage objects

### Critical Pitfalls

1. **Expo Go incompatibility with LiveKit** — LiveKit requires a native dev build. Switch to `expo-dev-client` before writing any LiveKit code. Running `expo start` with Expo Go after installing `@livekit/react-native-webrtc` will produce silent failures or crashes. This is a hard prerequisite, not an optimisation.

2. **Realtime subscriptions surviving logout** — The existing `signOut()` in `authStore.ts` clears Zustand state but does not close WebSocket channels. Adding three feature pillars of Realtime subscriptions without wiring cleanup to signOut() will cause data from one session to appear in the next. Create a global subscription registry in `lib/realtime.ts` and call `removeChannel()` on every channel at logout.

3. **expo-camera records at ~95 MB/minute** — Story videos at 30 seconds capture will be 24-48 MB with no compression option. This causes slow uploads, user-facing hangs, and Supabase Storage cost creep. Use `react-native-compressor` in the capture pipeline and enforce a hard 10 MB upload limit client-side. Do not defer this to post-MVP.

4. **Stories never actually get deleted** — Setting `expires_at` on insert is necessary but insufficient. Without a pg_cron job deleting expired DB rows and a paired Storage delete step, files accumulate indefinitely. Set up the cleanup cron on day one of the stories phase, before any stories are created in production.

5. **LiveKit room stuck in "connecting" on React Native New Architecture** — RN 0.81 uses the New Architecture by default. An older LiveKit SDK version has a known freeze on this architecture (issue #305, resolved October 2025). Always use the latest `@livekit/react-native` version. Log all `connectionStateChanged` events during first integration to verify "connected" is reached.

---

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Realtime Infrastructure
**Rationale:** No new packages, no new native modules. Validates that Supabase Realtime is configured correctly (Pro plan active, RLS policies allow replication) and that the global subscription registry and logout cleanup are in place before any feature-specific channels are opened. Fixes the existing auth race condition in `authStore.ts` which will otherwise silently break Realtime channel joins.
**Delivers:** `lib/realtime.ts` channel factory with registry; `useRealtimeFeed`, `useRealtimeLikes`, `useRealtimeComments`, `useRealtimeLives` hooks; feed screen wired to live updates; Supabase Pro plan enabled.
**Addresses:** Realtime feed (new posts, likes, comments without refresh), live discovery from real data
**Avoids:** Pitfall 5 (subscriptions surviving logout), Pitfall 7 (channel proliferation), Pitfall 13 (auth race with Realtime)

### Phase 2: Stories
**Rationale:** Requires only Supabase Storage + a new DB table + Reanimated animations. No new native modules — expo-image-picker and expo-camera already work before the dev build switch. Can be completed independently of live streaming. Highest visual impact per engineering effort for barber clients — stories of fresh cuts and transformations are core use cases.
**Delivers:** `stories` table + Storage bucket; `expire-stories` Edge Function + pg_cron; `lib/stories.ts`; `StoriesRow.tsx` wired to real data; `app/story/[userId].tsx` viewer with Reanimated progress bar; `app/story/create.tsx` upload flow (creator-gated).
**Uses:** `tus-js-client` for video uploads, `expo-camera`, `expo-image-picker`, Reanimated 4.1
**Implements:** Stories pillar architecture; two-layer expiry (client filter + server cron)
**Avoids:** Pitfall 3 (video file size — add `react-native-compressor`), Pitfall 4 (stories expiry cron), Pitfall 9 (expo-video isLooping — manual replay via `onPlaybackStatusUpdate`)

### Phase 3: Live Streaming
**Rationale:** Highest complexity phase; depends on Realtime being verified (live chat and viewer count both use Supabase Realtime channels validated in Phase 1). Requires the most external setup: LiveKit Cloud account, API credentials, Edge Function deployment, and a new EAS dev build. Should only start after Phases 1 and 2 are stable.
**Delivers:** Expo dev build with LiveKit native modules; `token-livekit` Edge Function; `lib/livekit.ts`; `app/live/[id].tsx` full-screen viewer with VideoView + chat + viewer count; `go-live.tsx` extended with real broadcast; `LiveChatOverlay.tsx`; `ViewerCountBadge.tsx`; booking CTA in viewer.
**Uses:** `@livekit/react-native` 2.9.6, LiveKit Cloud, Supabase Broadcast + Presence
**Implements:** Live streaming pillar; token generation pattern; ephemeral broadcast chat; Presence-based viewer count
**Avoids:** Pitfall 1 (dev build first, before any LiveKit code), Pitfall 2 (latest SDK for New Architecture), Pitfall 6 (remove placeholder data before wiring real streams), Pitfall 8 (AppState reconnect on foreground), Pitfall 10 (message batching and rate limiting), Pitfall 11 (registerGlobals() in _layout.tsx)

### Phase Ordering Rationale

- **Realtime first** because both stories (seen ring tracking) and live streaming (chat, viewer count) depend on Supabase Realtime being validated. Fixing the auth race condition and building the subscription registry here prevents regressions in later phases.
- **Stories before live streaming** because stories have zero native module dependencies, allowing development and testing in the existing Expo environment while the EAS dev build for LiveKit is being set up. Video compression adds `react-native-compressor` which does require a dev build — schedule that task last within the stories phase so early stories work can proceed.
- **Live streaming last** because it has the most external dependencies (LiveKit Cloud account setup, Edge Function deployment, new EAS build pipeline), the most complex component composition, and the highest risk of unforeseen issues that could block the other features if done first.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Live Streaming):** LiveKit React Native SDK integration has known edge cases with New Architecture and background reconnect that are only reproducible on physical devices. Plan for dedicated device testing time. The `@config-plugins/react-native-webrtc` configuration for latest Expo SDK versions may need validation against actual EAS build output.
- **Phase 2 (Stories — Video Compression):** `react-native-compressor` version compatibility with Expo 54 and Reanimated 4.1 is unverified. This needs an isolated test before being added to the capture pipeline.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Realtime Infrastructure):** Supabase Realtime `postgres_changes` and Broadcast are fully documented, stable APIs. The React Query cache patching pattern is well-established. No research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | LiveKit decision backed by official docs, active GitHub, confirmed Expo plugin. Supabase choices are official docs. Only moderate uncertainty on `react-native-compressor` compatibility. |
| Features | HIGH | Patterns directly derived from existing codebase audit + established social media UX conventions. Table stakes list matches what the existing UI shells already anticipate. |
| Architecture | HIGH | Component boundaries and data flow derived from official LiveKit and Supabase architecture docs. React Query cache patching pattern is proven in the existing codebase. |
| Pitfalls | HIGH | Majority of pitfalls are backed by official GitHub issues (expo/expo, livekit/client-sdk-react-native) with reproducible conditions and known workarounds. |

**Overall confidence:** HIGH

### Gaps to Address

- **`react-native-compressor` Expo 54 compatibility:** The compression step for story videos is essential (prevents the 95 MB/min file size problem) but package compatibility with this exact SDK version is unconfirmed. Validate with a quick isolated test at the start of Phase 2 before building the capture pipeline around it. If incompatible, `ffmpeg-kit-react-native` is the fallback (heavier, but supported).
- **Supabase Pro plan upgrade timing:** The free tier pauses after 1 week of inactivity and has a 200 concurrent Realtime connection limit. This needs to be done before Phase 1 development begins — not at production launch. Confirm the project org has billing set up.
- **EAS build profile configuration:** The dev build required for LiveKit needs an EAS build profile (`eas.json`) with `developmentClient: true`. If the project does not already have a configured `eas.json`, this is a setup task that blocks Phase 3 and should be addressed during Phase 2 to avoid blocking the team.

---

## Sources

### Primary (HIGH confidence)
- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime) — Postgres Changes, Broadcast, Presence, limits
- [Supabase Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) — TUS protocol, file limits
- [Supabase pg_cron docs](https://supabase.com/docs/guides/database/extensions/pg_cron) — scheduled cleanup
- [LiveKit React Native SDK — GitHub](https://github.com/livekit/client-sdk-react-native) — SDK API, version, New Architecture status
- [LiveKit Expo Plugin — GitHub](https://github.com/livekit/client-sdk-react-native-expo-plugin) — config plugin usage
- [expo-camera maxDuration milliseconds confusion — GitHub Issue #26865](https://github.com/expo/expo/issues/26865) — API gotcha
- [expo-image-picker videoMaxDuration bug — GitHub Issue #16146](https://github.com/expo/expo/issues/16146) — iOS limitation
- [expo-camera video files are huge — GitHub Issue #33042](https://github.com/expo/expo/issues/33042) — compression required
- [expo-av isLooping perpetual buffering — GitHub Issue #24821](https://github.com/expo/expo/issues/24821) — loop workaround
- [Supabase signOut issue — auth-js Issue #902](https://github.com/supabase/auth-js/issues/902) — logout subscription leak
- Existing project CONCERNS.md — auth race condition, placeholder data bugs

### Secondary (MEDIUM confidence)
- [LiveKit New Architecture freeze — Issue #305](https://github.com/livekit/client-sdk-react-native/issues/305) — resolved Oct 2025, use latest SDK
- [LiveKit pricing blog post](https://blog.livekit.io/the-end-of-participant-minute/) — free tier limits
- [LiveKit Expo Quickstart docs](https://docs.livekit.io/transport/sdk-platforms/expo/) — setup flow
- [Supabase Realtime client-side memory leak — DrDroid](https://drdroid.io/stack-diagnosis/supabase-realtime-client-side-memory-leak) — channel cleanup
- [Mastering Media Uploads in React Native — DEV Community 2026](https://dev.to/fasthedeveloper/mastering-media-uploads-in-react-native-images-videos-smart-compression-2026-guide-5g2i) — compression patterns

### Tertiary (LOW confidence)
- [Agora vs LiveKit comparison — VideoSDK](https://www.videosdk.live/agora-vs-livekit) — third-party cost analysis (directionally confirmed by official pricing pages)

---

*Research completed: 2026-03-17*
*Ready for roadmap: yes*
