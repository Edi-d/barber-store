# Technology Stack

**Project:** Tapzi — Live Streaming, Stories, Realtime Feed
**Researched:** 2026-03-17
**Scope:** Additive milestone on top of existing Expo 54 / Supabase stack

---

## Context: What Already Exists

This is a brownfield addition. Do NOT re-introduce or replace:
- Expo 54 / React Native 0.81 — locked
- Supabase (PostgreSQL + Auth + Storage) — locked
- Zustand, React Query, NativeWind, Reanimated 4.1 — locked
- expo-av 16 — already installed, usable for HLS playback
- expo-image-picker 17 — already installed, usable for story media

The table below covers only **new additions** required for live streaming, stories, and realtime.

---

## Recommended Stack — New Additions

### Live Streaming

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@livekit/react-native` | 2.9.6 | LiveKit React Native SDK | Open-source, WebRTC-based, Expo plugin exists, v2 is stable |
| `@livekit/react-native-webrtc` | latest (peer) | WebRTC native layer | Required peer dep of @livekit/react-native |
| `livekit-client` | latest (peer) | Core LiveKit JS client | Required peer dep; handles room state and tracks |
| `@livekit/react-native-expo-plugin` | latest | Expo config plugin | Handles native iOS/Android setup via app.json, no manual native code edits |
| `@config-plugins/react-native-webrtc` | latest | Config plugin for WebRTC | Required to configure WebRTC native permissions/entitlements in Expo |
| LiveKit Cloud | hosted | Streaming infrastructure | Free tier: ~10,000 participant-minutes/month; $0.0005/min beyond that |

### Stories

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `expo-camera` | 16.x (already via Expo 54 SDK) | In-app video recording for story creation | Managed workflow, maxDuration support, no extra native config |
| `expo-image-picker` | 17.0.10 (already installed) | Pick existing photo/video from gallery | Already installed, works in managed workflow |
| `tus-js-client` | 4.x | Resumable video uploads to Supabase Storage | Required for videos >6MB; Supabase Storage v3 implements TUS protocol |
| Supabase Storage | existing | Store story photos and videos | Already integrated; set 50MB bucket limit per story file |

### Realtime Feed

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@supabase/supabase-js` | 2.95.3 (already installed) | Supabase Realtime subscriptions | Already installed; Realtime is built in — subscribe to postgres_changes |
| Supabase Pro plan | — | Unlock production Realtime | Free tier: 200 concurrent connections (enough for MVP); Pro removes pausing and increases limits |

---

## Live Streaming: LiveKit vs Agora — Decision

**Recommendation: LiveKit Cloud**

### Comparison Matrix

| Criterion | LiveKit | Agora |
|-----------|---------|-------|
| Open-source | Yes (MIT) | No |
| Self-hostable | Yes | No |
| Expo support | Official plugin (`@livekit/react-native-expo-plugin`) | Expo dev client required, no official plugin |
| React Native SDK version | 2.9.6 (active, Dec 2024) | 4.5.3 (last published ~8 months ago) |
| SDK maintenance | Active, v2 released with breaking changes managed | Appears to be in maintenance mode |
| Free tier | ~10,000 participant-minutes/month (no credit card) | 10,000 minutes/month |
| Pricing beyond free | $0.0005/minute | Higher (~2.5x more expensive at scale per cost analysis) |
| Latency | WebRTC sub-second | WebRTC sub-second |
| Expo plugin setup | Add to `plugins` in app.json, done | Manual native setup, no config plugin |
| Viewer-only mode | Yes (subscribe to tracks without publishing) | Yes (audience role) |
| Live chat integration | Supabase Realtime (separate, simple) | Has built-in chat but ties you to Agora platform |

### Why LiveKit, not Agora

1. **Official Expo config plugin.** LiveKit ships `@livekit/react-native-expo-plugin` which handles all iOS/Android native wiring via `app.json`. Agora has no equivalent — you must manually edit `AppDelegate.m` and `MainApplication.java`, which breaks EAS managed builds.

2. **SDK activity.** LiveKit v2.9.6 released December 2024. Agora react-native-agora 4.5.3 was last published ~8 months ago with no v5 in sight for React Native. LiveKit is clearly the better-maintained option.

3. **Cost at this scale.** For a barber salon social app, monthly streaming is minimal. LiveKit's free tier (10k minutes) covers typical usage. Even paid usage is cheaper per-minute than Agora.

4. **No vendor lock-in.** LiveKit is open-source (MIT). If cloud costs grow, you can self-host the LiveKit server. Agora is fully closed.

5. **Simpler architecture.** The app only needs viewer-side streaming (clients watch barbers go live). LiveKit's room model — subscribe to tracks, render with `VideoView` — is 30 lines of code. Viewer joins room, renders broadcaster's video track.

**Do NOT use Agora** because: no Expo config plugin, SDK staleness, higher cost, vendor lock-in.

**Do NOT use Mux** for this use case — Mux is a great managed video CDN for VOD and is excellent for HLS delivery, but it adds a separate paid service and its live streaming is not real-time WebRTC. Use Mux only if HLS (8-30s latency) is acceptable. For interactive live streaming with sub-second latency, LiveKit wins.

---

## Stories: Implementation Stack

### Media Capture

**Use expo-camera (already available in Expo 54 SDK) for in-app recording.**

- `recordAsync({ maxDuration: 30000 })` — note: maxDuration is in milliseconds, not seconds (there's a documented API confusion in the changelog; use `30000` for 30 seconds)
- Video recorded to app cache as MP4
- For picking from gallery: `expo-image-picker` (already installed) with `mediaTypes: ImagePicker.MediaTypeOptions.All`

**Do NOT use react-native-vision-camera** — more powerful but requires bare workflow / manual native setup. expo-camera covers this use case.

**Do NOT use react-native-image-picker** — there's already expo-image-picker installed. Don't add a second picker.

### Post-capture duration validation

`videoMaxDuration` option in expo-image-picker is unreliable on iOS for gallery selection (documented GitHub issue #16146). Always validate duration server-side or after selection using the `duration` field returned in the picker result.

### Video Upload

**Use `tus-js-client` for video uploads.**

Supabase Storage v3 supports TUS resumable uploads. For story videos (potentially 30s at reasonable quality = 15-40MB), standard upload will fail or be flaky on mobile networks. TUS chunked upload handles interruptions correctly.

```
Free tier limit: 50MB per file
Pro tier limit: configurable up to 500GB
```

For story photos, standard Supabase storage upload is fine (< 6MB).

### 24h Expiry

Implement expiry in PostgreSQL, not in Supabase Storage lifecycle rules (Storage doesn't have native expiry). Add a `expires_at` column (timestamptz, default `NOW() + INTERVAL '24 hours'`). Filter in queries. Run a daily cleanup Edge Function or pg_cron to delete expired stories and their storage objects.

---

## Realtime Feed: Implementation Stack

### What to Use

Supabase Realtime is already integrated via `@supabase/supabase-js`. No new library is needed.

Supabase Realtime has three modes:
- **Postgres Changes** — listen to INSERT/UPDATE/DELETE on any table with row-level filters
- **Broadcast** — ephemeral pub/sub (e.g., live chat messages, viewer counts)
- **Presence** — track who is connected (e.g., active viewers list)

### Usage Pattern Per Feature

| Feature | Realtime Mode | Channel |
|---------|---------------|---------|
| New feed posts appearing | Postgres Changes (INSERT on `posts`) | `realtime:posts` |
| Like count updates | Postgres Changes (UPDATE on `posts` for like_count) | `realtime:posts` |
| Live comment count | Postgres Changes (INSERT on `comments`) | `realtime:comments:post_id=eq.{id}` |
| Live chat in streams | Broadcast | `live-chat:{stream_id}` |
| Live viewer count | Broadcast + Presence | `live-stream:{stream_id}` |
| Active live streams list | Postgres Changes (INSERT/UPDATE on `live_streams`) | `realtime:live_streams` |

### Supabase Plan Requirements

The free tier allows **200 concurrent realtime connections**. For an MVP with a small user base, this is sufficient. Upgrade to Supabase Pro ($25/month) before production launch because:
1. Free projects **pause after 1 week of inactivity** — breaks realtime subscriptions
2. Pro increases connection limits (1,000+ concurrent)
3. Pro removes the storage file limit of 50MB (required for story videos)

### Subscription Cleanup

Always call `supabase.removeChannel(channel)` on component unmount. Not doing this causes resource leaks and contributes to hitting connection limits.

```typescript
// Pattern: cleanup in useEffect return
useEffect(() => {
  const channel = supabase
    .channel('posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, handler)
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [])
```

---

## Alternatives Considered

| Category | Recommended | Alternatives Rejected | Why Rejected |
|----------|-------------|----------------------|--------------|
| Live streaming | LiveKit Cloud | Agora | No Expo plugin, SDK staleness, higher cost |
| Live streaming | LiveKit Cloud | Mux Live | HLS-only (8-30s latency), not real-time WebRTC, separate paid service |
| Live streaming | LiveKit Cloud | Daily.co | Less React Native ecosystem support, higher price |
| Live streaming | LiveKit Cloud | Self-hosted LiveKit | Additional infra to manage, not needed at MVP scale |
| Video recording | expo-camera | react-native-vision-camera | Requires bare workflow, overkill for 30s stories |
| Video picker | expo-image-picker (existing) | react-native-image-picker | Already have expo-image-picker installed |
| Video upload | tus-js-client | Standard supabase upload | Standard upload unreliable for >6MB video on mobile |
| Realtime | Supabase Realtime (existing) | Pusher, Ably, Firebase Realtime | All add a new service/cost; Supabase Realtime is already integrated |
| Video playback (HLS) | expo-video (existing via expo-av) | react-native-video | react-native-video requires dev client; expo-video covers HLS in managed workflow |

---

## Installation

```bash
# LiveKit live streaming
npm install @livekit/react-native @livekit/react-native-webrtc livekit-client @livekit/react-native-expo-plugin @config-plugins/react-native-webrtc

# Story video uploads (resumable)
npm install tus-js-client
```

After installing LiveKit packages, add to `app.json` plugins array:

```json
{
  "plugins": [
    "@livekit/react-native-expo-plugin",
    "@config-plugins/react-native-webrtc"
  ]
}
```

Then rebuild dev client:

```bash
npx expo run:ios
# or
npx expo run:android
```

**This requires a new EAS build — you cannot use Expo Go after adding LiveKit.**

---

## Environment Variables Required

```bash
# Add to .env
EXPO_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key         # server-side only (Edge Function)
LIVEKIT_API_SECRET=your_api_secret   # server-side only (Edge Function)
```

Token generation must happen server-side (Supabase Edge Function) — never expose API secret in client.

---

## Supabase Edge Function: Token Endpoint

LiveKit tokens are JWTs signed with your API secret. Add a Supabase Edge Function `generate-livekit-token` that:
1. Validates the user is authenticated
2. Validates the room/stream exists and is live
3. Returns a signed viewer token (no publish permissions)

```typescript
// Edge Function pattern (Deno)
import { AccessToken } from 'npm:livekit-server-sdk'

const token = new AccessToken(apiKey, apiSecret, { identity: userId })
token.addGrant({ roomJoin: true, room: roomName, canPublish: false, canSubscribe: true })
return new Response(JSON.stringify({ token: token.toJwt() }))
```

This keeps API secrets off-device.

---

## Sources

- [LiveKit React Native SDK — GitHub](https://github.com/livekit/client-sdk-react-native) — MEDIUM confidence (GitHub README, current)
- [LiveKit Expo Plugin — GitHub](https://github.com/livekit/client-sdk-react-native-expo-plugin) — MEDIUM confidence
- [LiveKit Expo quickstart docs](https://docs.livekit.io/transport/sdk-platforms/expo/) — MEDIUM confidence (official docs, access denied to fetch but search confirmed)
- [react-native-agora npm](https://www.npmjs.com/package/react-native-agora) — MEDIUM confidence (v4.5.3, last published ~8mo ago)
- [Agora Expo building guide](https://www.agora.io/en/blog/building-a-video-calling-app-using-the-agora-sdk-on-expo-react-native/) — MEDIUM confidence
- [Supabase Realtime docs](https://supabase.com/docs/guides/realtime) — HIGH confidence (official docs)
- [Supabase Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits) — HIGH confidence (official docs, 50MB free tier limit verified)
- [Supabase Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) — HIGH confidence (official docs)
- [expo-image-picker videoMaxDuration bug](https://github.com/expo/expo/issues/16146) — HIGH confidence (GitHub issue)
- [expo-camera maxDuration milliseconds confusion](https://github.com/expo/expo/issues/26865) — HIGH confidence (GitHub issue)
- [Agora vs LiveKit comparison — VideoSDK](https://www.videosdk.live/agora-vs-livekit) — LOW confidence (third-party analysis)
- [LiveKit pricing blog post](https://blog.livekit.io/the-end-of-participant-minute/) — MEDIUM confidence
- [Supabase free tier 200 concurrent connections](https://supabase.com/docs/guides/realtime/limits) — HIGH confidence (official docs)
