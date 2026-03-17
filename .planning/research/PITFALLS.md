# Domain Pitfalls

**Domain:** Barber salon social media — live streaming, stories, Supabase Realtime
**Researched:** 2026-03-17
**Project:** Tapzi — adding live streaming, stories, and realtime feed to existing Expo 54 / React Native 0.81 / Supabase app

---

## Critical Pitfalls

Mistakes that cause rewrites or major incidents.

---

### Pitfall 1: LiveKit Expo Dev Build Requirement (Expo Go Incompatibility)

**What goes wrong:** Developer sets up LiveKit, runs with Expo Go, gets a cryptic runtime crash or no video/audio at all. Days lost trying to "fix" it before realising the entire testing approach is wrong.

**Why it happens:** LiveKit depends on `@livekit/react-native-webrtc`, which is a native module requiring a custom development build. Expo Go bundles only Expo's standard native modules and cannot load third-party native code at runtime.

**Consequences:** Streaming feature looks completely broken during development. Cannot test camera/microphone capture in Expo Go at all.

**Prevention:**
- Commit to `expo-dev-client` from the start of the live streaming phase. Run `npx expo prebuild` and build dev client for both iOS and Android before writing a single line of LiveKit code.
- Document in onboarding: "This project requires a development build — `npx expo start` with Expo Go will not work for streaming screens."
- Add `expo-dev-client` as a hard dependency, not optional.

**Detection (warning signs):**
- Any import of `@livekit/react-native` or `@livekit/react-native-webrtc` causes Metro bundler to crash or fail silently in Expo Go.
- Camera permissions request never fires.

**Phase to address:** Live streaming phase — first task before any LiveKit code.

---

### Pitfall 2: LiveKit New Architecture Connection Freeze (RN 0.79+)

**What goes wrong:** The LiveKit room gets stuck perpetually in `"connecting"` state on physical devices. No error is thrown. Observers fire `connectionStateChanged` → "connecting" once and then nothing. Works in old architecture but not the new one.

**Why it happens:** React Native 0.81 runs the New Architecture (Fabric/JSI) by default. LiveKit's React Native WebRTC bridge had an incompatibility with the New Architecture renderer introduced around RN 0.79. The issue was resolved by LiveKit maintainers in late October 2025 (issue #305 closed as COMPLETED). However, it requires the latest SDK version — using an older pinned version will reproduce the bug.

**Consequences:** Live streaming silently never connects. Indistinguishable from a network error. Extremely hard to debug without knowing the root cause.

**Prevention:**
- Install the latest `@livekit/react-native` and `@livekit/react-native-webrtc` — do not pin to an older version.
- Verify at setup: `npx expo-doctor` will show "Unsupported on New Architecture" warnings for LiveKit — this is a metadata issue only, not a functional blocker. Ignore these warnings after confirming the latest SDK is installed.
- Add a connection state log on first integration: log every `connectionStateChanged` event to confirm you reach "connected".

**Detection (warning signs):**
- `connectionStateChanged` fires with "connecting" but never "connected".
- No error event fires.
- Works in simulator (where network conditions differ) but not physical device.

**Phase to address:** Live streaming phase — verify connection in an isolated test screen before building the full UI.

---

### Pitfall 3: expo-camera Video Files are Enormous (95 MB/min at 720p)

**What goes wrong:** Stories recorded with `expo-camera` are uploaded at full bitrate. A 15-second story video is ~24 MB. Storage fills up. Upload takes 10-30 seconds on mobile. Users experience hangs and timeouts. Supabase Storage egress costs spike.

**Why it happens:** `expo-camera` does not expose bitrate or FPS configuration parameters. It records at maximum quality with no compression. This is a documented limitation with an open GitHub issue.

**Consequences:**
- User-facing: upload spinner runs for 15-30 seconds for a 15-second clip
- Cost: Supabase Storage egress for video at scale becomes expensive fast
- UX: Stories load slowly for viewers with slow connections

**Prevention:**
- Use `react-native-compressor` (requires dev build) to compress video before upload. Target 2-4 MB for a 15-second clip (720p, ~2 Mbps → ~3.6 MB/15s is realistic).
- Enforce a hard upload size limit: reject videos > 10 MB before attempting upload with a user-facing error.
- Set max story duration to 15 seconds at capture time, not after — shorter source = smaller file even before compression.
- Implement upload progress UI (onUploadProgress from Supabase Storage client) to prevent perceived hangs.

**Detection (warning signs):**
- First test upload of a story video takes longer than 5 seconds on WiFi.
- Supabase Storage bucket shows files > 10 MB for short clips.

**Phase to address:** Stories phase — implement compression as part of the capture-to-upload pipeline, not as a post-MVP optimisation.

---

### Pitfall 4: Stories Never Get Deleted (No Expiry Enforcement)

**What goes wrong:** Stories have an `expires_at` column set to `NOW() + INTERVAL '24 hours'` on creation. But nothing actually deletes them. The database rows and Storage files accumulate indefinitely. Queries slow down. Storage costs grow. "Expired" stories appear in the viewer because the RLS policy or query filter has an off-by-one edge case.

**Why it happens:** Setting `expires_at` on insert is only half the solution. Automatic cleanup requires:
1. A scheduled job (pg_cron) to delete expired rows from the database
2. A second step (or trigger) to delete corresponding files from Supabase Storage
3. A RLS policy that excludes expired rows from reads

All three are easy to forget. The most common omission is step 2 — orphaned Storage files that are never billed back but quietly accumulate.

**Consequences:**
- After 30 days: thousands of orphaned video files in Storage
- Expired stories visible to viewers if RLS filter is wrong
- Database query performance degrades without index on `expires_at`

**Prevention:**
- Create a pg_cron job at the start of the stories phase that runs every hour: `DELETE FROM stories WHERE expires_at < NOW()`.
- Pair the cron job with a Postgres function or trigger that calls the Supabase Storage delete API (via Edge Function) for orphaned files, or use Storage object lifecycle policies when available.
- Add a `WHERE expires_at > NOW()` filter to every stories query — never rely solely on the cron job for freshness.
- Add a partial index: `CREATE INDEX stories_expires_at ON stories(expires_at) WHERE expires_at > NOW();`

**Detection (warning signs):**
- Stories bucket in Supabase Storage grows faster than expected.
- Querying `SELECT COUNT(*) FROM stories WHERE expires_at < NOW()` returns non-zero after 24+ hours.

**Phase to address:** Stories phase — set up cron cleanup on day one of the phase, before any stories are created in production.

---

### Pitfall 5: Supabase Realtime Subscriptions Surviving Logout

**What goes wrong:** User logs out. Realtime subscriptions remain active. On next login (different user), the previous user's channel events still fire. Event handlers reference stale Zustand store state. Wrong user's data populates the feed. In the worst case: a user sees another user's private data in the live chat.

**Why it happens:** The existing codebase already has this documented as a security concern: `signOut()` clears session/profile in the store but does not invalidate subscriptions. When Realtime is added, every `supabase.channel(...)` subscription that is not explicitly `.unsubscribe()`d on logout will persist in memory.

**Consequences:**
- Wrong data shown after re-login
- Live chat messages from another user's session appear
- Memory leak from accumulating WebSocket listeners
- Potential data exposure if channels are user-scoped

**Prevention:**
- Create a global subscription registry (a `Map<string, RealtimeChannel>`) in a dedicated module — `lib/realtime.ts`.
- Every subscription is registered in the map. On logout (`signOut()` in `authStore.ts`), iterate the map and call `.unsubscribe()` on every channel, then clear the map.
- Call `queryClient.clear()` on logout to also flush React Query cache (this is already recommended in CONCERNS.md).
- Never create subscriptions outside of a `useEffect` with a cleanup return.

**Detection (warning signs):**
- After logout and re-login, React Query cache shows data from the previous session.
- Live chat messages appear for a different user's stream.
- Console shows Realtime channel events firing after logout.

**Phase to address:** Realtime phase — before connecting any live channel, wire up the subscription cleanup to the existing `signOut()` in `authStore.ts`.

---

## Moderate Pitfalls

---

### Pitfall 6: Placeholder Data Masking Real Data Load Failures (Existing Bug Amplified)

**What goes wrong:** The existing `feed.tsx` already shows placeholder stories and live cards when real data fails to load (CONCERNS.md: "Placeholder Data Blocks Real Data Fallback"). When Realtime is added, this gets worse: a Supabase Realtime disconnection silently falls back to the placeholder live section, making it look like no one is live when actually the subscription dropped.

**Why it happens:** The placeholder fallback was written as a "loading" state but is shown on error too. Realtime adds a new failure mode (WebSocket drop) that is not a loading state.

**Prevention:**
- Replace placeholder data in `LiveSection` and `StoriesRow` with empty state components before adding real data.
- Add distinct states: `loading` / `empty` / `error` / `data` — never show fake content on error.
- Add a Realtime connection health indicator (a subtle dot or banner) so users know when they are disconnected.

**Phase to address:** Realtime phase (first task) — clean up placeholder data before enabling live subscriptions.

---

### Pitfall 7: Supabase Realtime Channel Proliferation (Too Many Channels)

**What goes wrong:** Each screen creates its own channel. The feed creates a channel. The live stream viewer creates a channel. The profile screen creates a channel. On navigation back-and-forth, old channels are not cleaned up. The project hits Supabase's per-connection channel limit and gets errors: "Too many channels currently joined for a single connection."

**Why it happens:** React Native navigation does not always unmount components. If subscriptions are created in `useEffect` without cleanup, or if cleanup runs but the channel is not explicitly removed from the Supabase client's internal registry, channels accumulate.

**Consequences:**
- Hard to reproduce locally (single user, few screens)
- Hits in production with real users navigating normally
- Supabase client starts refusing new channel joins silently

**Prevention:**
- Every `supabase.channel(name).subscribe()` must have a corresponding `.unsubscribe()` in the useEffect cleanup.
- Use meaningful, unique channel names (e.g., `live:${streamId}:chat`) so duplicate subscriptions are easy to detect in Supabase Realtime dashboard.
- Create a custom `useRealtimeChannel` hook that handles subscribe/unsubscribe lifecycle automatically.
- Audit channel count in the Supabase Realtime dashboard during integration testing.

**Detection (warning signs):**
- Supabase logs show "Too many channels" errors.
- Realtime dashboard shows channel count growing with navigation events.

**Phase to address:** Realtime phase — write the reusable hook before building any subscription-dependent screens.

---

### Pitfall 8: WebRTC Background Disconnect (iOS/Android App Backgrounding)

**What goes wrong:** Viewer is watching a live stream. They get a notification, switch to another app for 10-15 seconds, then return. The stream is frozen or disconnected. No reconnect attempt. Video is stuck on the last frame.

**Why it happens:** iOS and Android aggressively suspend background processes. WebRTC ICE candidates fail after ~8-15 seconds in background. The WebSocket signaling connection is also killed. LiveKit SDK should handle reconnect, but only if the app properly handles `AppState` change events and resumes the room connection on foreground.

**Prevention:**
- Subscribe to `AppState` changes in the live stream viewer screen.
- On `background` → `active` transition, check `room.connectionState`. If not "connected", attempt `room.connect()` again.
- Show a "Reconnecting..." overlay when connection state is not "connected" — never let the user stare at a frozen frame silently.
- Test explicitly: background the app during playback for 15 seconds on a physical iOS device. This is the most common user complaint for live streaming apps.

**Detection (warning signs):**
- Live stream freezes after returning from background.
- `connectionStateChanged` fires with "disconnected" or "reconnecting" after app returns to foreground.

**Phase to address:** Live streaming phase — test background/foreground cycle before shipping viewer screen.

---

### Pitfall 9: expo-video HLS Buffering with isLooping (Applies to Story Looping)

**What goes wrong:** Stories are set to loop (re-play when finished). Using `expo-video` with looping enabled inside a FlatList causes perpetual buffering — the video loads once but then gets stuck in a buffering state on subsequent loops. This is a documented bug in expo-av (affects expo-video in managed workflow FlatList contexts).

**Why it happens:** The `isLooping` prop in expo-av triggers a re-buffering cycle that does not complete. In a FlatList with windowed rendering, unmounting and remounting video components also leaves connections in a bad state.

**Prevention:**
- Do not use `isLooping`. Instead, listen to the `onPlaybackStatusUpdate` event and call `replayAsync()` manually when `didJustFinish === true`.
- In the stories viewer, unmount (remove from DOM) the video component when the story is not visible — do not keep all story videos mounted simultaneously.
- Limit the stories viewer to rendering at most 3 stories in memory (current + prev + next).

**Detection (warning signs):**
- Story video plays once then shows buffering spinner indefinitely.
- Memory usage climbs as user swipes through stories.

**Phase to address:** Stories phase — test loop behaviour on physical device before finalising the stories viewer component.

---

### Pitfall 10: Live Chat Message Flood Without Rate Limiting

**What goes wrong:** Live chat allows viewers to send messages. During a popular stream, 50+ viewers send messages simultaneously. The Supabase Realtime channel broadcasts all of them. The client receives 50 messages per second, triggers 50 state updates per second, and the UI stutters badly or crashes on low-end Android devices.

**Why it happens:** The existing codebase already has a `lib/rateLimit.ts` that is not being used (CONCERNS.md). The live chat is a new high-velocity write path — messages arrive much faster than likes or comments in a normal feed.

**Consequences:**
- UI jank/freezes during active streams
- React state thrashing from rapid successive updates
- Supabase Realtime message rate limit exceeded at project level (connection dropped)

**Prevention:**
- Batch incoming chat messages: collect messages for 500ms and apply them in one state update using `flushSync` or a debounced dispatch.
- Apply client-side rate limiting: use the existing `checkRateLimit()` from `lib/rateLimit.ts` before allowing the user to send each message. Max 1 message per 2 seconds per user.
- Paginate chat display: only show the last 50-100 messages. Do not render the full history in a live-updating list.

**Detection (warning signs):**
- More than 10 React re-renders per second in the chat component (React DevTools Profiler).
- Frame rate drops below 30fps during message burst.

**Phase to address:** Live streaming phase — design the chat state management for batching before building the UI.

---

## Minor Pitfalls

---

### Pitfall 11: Missing registerGlobals() Call for LiveKit WebRTC

**What goes wrong:** LiveKit connects but audio/video tracks never appear. Room connects successfully but `room.localParticipant.videoTracks` is empty. No error is thrown.

**Why it happens:** LiveKit requires `registerGlobals()` to be called at app entry point (`index.js` or `app/_layout.tsx`) before any WebRTC functionality works. This sets up the WebRTC polyfills needed in the JS environment.

**Prevention:** Add `import { registerGlobals } from '@livekit/react-native'; registerGlobals();` to `app/_layout.tsx` before the root navigator renders.

**Phase to address:** Live streaming phase — first integration step.

---

### Pitfall 12: Supabase Storage Public Bucket Without Upload Restrictions

**What goes wrong:** Stories are stored in a public Supabase Storage bucket so they can be served without auth tokens. Without upload restrictions, any authenticated user can upload any file type or file of any size. A user uploads a 500 MB file disguised as a story video. Storage quota is consumed.

**Prevention:**
- Set upload size limit in Storage bucket settings (Supabase dashboard) — 50 MB max.
- Add MIME type check on the client before upload: reject anything not `video/mp4` or `image/jpeg|png|webp`.
- Storage RLS policy: only the authenticated user can insert into their own stories path (`auth.uid()::text = (storage.foldername(name))[1]`).

**Phase to address:** Stories phase — set bucket policies before exposing story upload to users.

---

### Pitfall 13: Auth Race Condition Amplified by Realtime (Existing Bug Made Worse)

**What goes wrong:** The existing `authStore.ts` has a documented race condition where `isInitialized = true` is set before `onAuthStateChange` listener completes (CONCERNS.md). With Realtime subscriptions that depend on auth state, the app may attempt to subscribe to user-scoped channels before the user's JWT is available, receiving permission denied errors that are swallowed silently.

**Prevention:**
- Fix the existing race condition first: only set `isInitialized = true` after `onAuthStateChange` fires at least once.
- Gate all Realtime channel subscriptions behind `isInitialized && user !== null` checks.
- Treat Realtime "permission denied" channel join errors as non-silent — log and surface them.

**Phase to address:** Realtime phase — fix the auth initialization order before any subscriptions are created.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Live streaming setup | Expo Go incompatibility wastes setup time | Switch to dev build before writing any LiveKit code |
| LiveKit first connection | New Architecture freeze (silent, no error) | Pin to latest LiveKit SDK, log all connectionStateChanged events |
| Live stream viewer | Background/foreground WebRTC disconnect | AppState listener + reconnect overlay, test on physical device |
| Live chat | Message flood causing UI freeze | Batch state updates, client-side rate limit before send |
| Stories capture | 95 MB/min video from expo-camera | react-native-compressor in capture pipeline, hard 10 MB limit |
| Stories viewer | expo-video isLooping buffering bug | Manual replay via onPlaybackStatusUpdate, not isLooping |
| Stories expiry | Orphaned files in Storage, expired rows in DB | pg_cron hourly cleanup + Storage delete, partial index on expires_at |
| Realtime subscriptions | Subscriptions survive logout, wrong user data | Global subscription registry, clear all channels on signOut() |
| Realtime channels | Too many channels from navigation | useRealtimeChannel hook with cleanup, audit channel count |
| Realtime + auth | Subscription attempt before JWT ready | Gate subscriptions behind isInitialized check, fix auth race first |

---

## Sources

- [LiveKit "Unsupported on New Architecture" Expo React Native — Issue #255](https://github.com/livekit/client-sdk-react-native/issues/255) — MEDIUM confidence
- [Unable to connect to Livekit Room in New Architecture 0.79 — Issue #305](https://github.com/livekit/client-sdk-react-native/issues/305) — MEDIUM confidence (issue closed as resolved Oct 2025)
- [LiveKit Expo Quickstart](https://docs.livekit.io/home/quickstarts/expo/) — HIGH confidence (official docs)
- [expo-camera video files are huge — Issue #33042](https://github.com/expo/expo/issues/33042) — HIGH confidence (official repo, documented)
- [Mastering Media Uploads in React Native — DEV Community 2026](https://dev.to/fasthedeveloper/mastering-media-uploads-in-react-native-images-videos-smart-compression-2026-guide-5g2i) — MEDIUM confidence
- [Supabase Realtime client-side memory leak — DrDroid](https://drdroid.io/stack-diagnosis/supabase-realtime-client-side-memory-leak) — MEDIUM confidence
- [Supabase Realtime strict mode subscription issue — Issue #169](https://github.com/supabase/realtime-js/issues/169) — HIGH confidence (official repo)
- [Supabase pg_cron docs](https://supabase.com/docs/guides/database/extensions/pg_cron) — HIGH confidence (official docs)
- [Supabase Realtime Limits docs](https://supabase.com/docs/guides/realtime/limits) — HIGH confidence (official docs)
- [react-native-webrtc background disconnect issues](https://github.com/react-native-webrtc/react-native-webrtc/issues/633) — MEDIUM confidence
- [expo-av isLooping perpetual buffering — Issue #24821](https://github.com/expo/expo/issues/24821) — HIGH confidence (official repo, documented)
- [Supabase signOut does not fire SIGNED_OUT in other instances — Issue #902](https://github.com/supabase/auth-js/issues/902) — HIGH confidence (official repo)
- Existing project CONCERNS.md — HIGH confidence (first-hand codebase audit)
