# Phase 4: Live Streaming - Research

**Researched:** 2026-03-17
**Domain:** LiveKit React Native SDK, Supabase Edge Functions (Deno), Supabase Realtime (Presence + Broadcast)
**Confidence:** HIGH

## Summary

Phase 4 integrates LiveKit video streaming into both the barber-store (client/viewer) and tapzi-barber (barber/broadcaster) apps. The core flow is: barber taps "Go Live" in tapzi-barber, a Supabase Edge Function generates a LiveKit access token, the barber's app connects to the LiveKit room and publishes video+audio, the lives table row is updated to status "live", clients see the active stream in their LiveSection, and tapping it opens a full-screen viewer that subscribes to the LiveKit room. Chat is ephemeral via Supabase Broadcast, viewer count is real-time via Supabase Presence.

All LiveKit packages are already installed in both apps with matching versions. Both app.json files already include the LiveKit Expo plugins. The lives table exists with room_name, status, and viewer count columns. The major gap is: no Edge Function exists yet, no LiveKit connection code exists, the go-live screen in barber-store is a form-only MVP, and tapzi-barber has no go-live screen at all. There is a schema discrepancy between the migration (author_id) and TypeScript types (host_id) that must be resolved before implementation.

**Primary recommendation:** Build the Edge Function first (plan 04-01), then the barber broadcast screen (04-02), then the client viewer (04-03), and finally wire the discovery (04-04). Each plan has clear inputs and outputs that chain together.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- LiveKit Cloud as streaming provider (project: skylarkbv)
- LiveKit packages already installed in both apps (v2.9.6 / v2.17.3)
- Live chat uses Supabase Broadcast (ephemeral, no DB writes)
- Viewer count uses Supabase Presence
- Token generation via Supabase Edge Function (Deno)
- User tests via Expo Go (friend confirmed LiveKit works)
- Both apps share the same Supabase project

### Claude's Discretion
- Room naming convention
- Edge Function error handling pattern
- Camera preview layout and controls placement
- Live viewer screen layout
- Hook architecture for live features

### Deferred Ideas (OUT OF SCOPE)
- Emoji reactions overlay in live stream (LIVE-V2-01)
- Live chat message history/persistence (LIVE-V2-02)
- Booking CTA in live viewer (LIVE-V2-03)
- Multi-camera support (LIVE-V2-04)
- Push notifications for live start
- Audio-only rooms
- Live replay/recording
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LIVE-01 | Barbers can start a live broadcast video+audio (LiveKit integration) | LiveKit Room.connect() + localParticipant.setCameraEnabled/setMicrophoneEnabled. Edge Function generates token with canPublish:true. |
| LIVE-02 | Clients can watch live streams in real time with video player | LiveKitRoom component with useTracks hook + VideoTrack rendering. Token with canPublish:false, canSubscribe:true. |
| LIVE-03 | Viewer count updates realtime via Supabase Presence | Presence channel per live room, track() on join, untrack() on leave, presenceState() on sync for count. |
| LIVE-04 | Text chat during live via Supabase Broadcast (ephemeral) | Broadcast channel per live room, send() for messages, on('broadcast') for receiving. No persistence. |
| LIVE-05 | Live section on home populated with real data (not placeholder) | useRealtimeLives hook subscribing to lives table changes (status='live'), feeding LiveSection component. |
| LIVE-06 | LiveKit token generation via Supabase Edge Function | Deno.serve Edge Function using npm:livekit-server-sdk AccessToken class. Verifies Supabase JWT, returns LiveKit JWT. |
| LIVE-07 | Expo dev build configured with LiveKit native modules | Already done -- both app.json include @livekit/react-native-expo-plugin and @config-plugins/react-native-webrtc. |
| BARBER-01 | Go-live screen with title, cover, visibility, start broadcast | Extends existing go-live.tsx pattern (barber-store has form, tapzi-barber needs new screen). Creates lives row, fetches token, connects to room. |
| BARBER-02 | Live broadcast screen with camera preview, controls, viewer count, end stream | LiveKitRoom + VideoTrack for local camera preview. Mute via localParticipant.setMicrophoneEnabled(false). Flip via videoTrack.restartTrack({facingMode}). |
| BARBER-03 | LiveKit publisher integration -- barber publishes video+audio tracks | LiveKitRoom audio={true} video={true} auto-publishes. Token with canPublish:true grant. |
| BARBER-04 | Expo dev build on tapzi-barber with LiveKit native modules | Already done -- tapzi-barber app.json includes LiveKit plugins, packages installed. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @livekit/react-native | ^2.9.6 | React Native LiveKit SDK with hooks and components | Official LiveKit RN SDK, provides LiveKitRoom, useTracks, VideoTrack |
| livekit-client | ^2.17.3 | Core LiveKit client (Track, Room, Participant types) | Required peer dependency, provides Track.Source enum and room management |
| @livekit/react-native-webrtc | ^137.0.2 | WebRTC implementation for React Native | Required native module for video/audio capture |
| @livekit/react-native-expo-plugin | ^1.0.2 | Expo config plugin for LiveKit native setup | Configures native permissions and modules for Expo builds |
| livekit-server-sdk | latest | Server-side token generation (Deno Edge Function) | Official LiveKit server SDK, runs in Deno, provides AccessToken class |
| @supabase/supabase-js | ^2.95.3 | Supabase client for Realtime, Auth, DB | Already installed, used for Presence, Broadcast, and DB queries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @config-plugins/react-native-webrtc | ^13.0.0 | Expo config plugin for WebRTC permissions | Already installed, configures camera/mic permissions in builds |
| expo-dev-client | installed | Development builds with native modules | Already installed, needed if Expo Go has LiveKit issues |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Broadcast for chat | LiveKit Data Channel | Broadcast is simpler, no extra LiveKit complexity, already using Supabase |
| Supabase Presence for viewers | LiveKit participant count | Presence gives more control (custom metadata), works even if LiveKit connection drops |

**Installation (Edge Function only):**
```bash
# No npm install needed for Edge Function -- uses Deno npm: specifier
# import { AccessToken } from "npm:livekit-server-sdk";
```

## Architecture Patterns

### Recommended Project Structure
```
barber-store/
├── lib/
│   └── livekit.ts              # Token fetching + room connection helper
├── hooks/
│   ├── useLiveKitRoom.ts       # LiveKit room connection wrapper (optional)
│   ├── useLiveChat.ts          # Supabase Broadcast for chat messages
│   ├── useLiveViewers.ts       # Supabase Presence for viewer count
│   └── useRealtimeLives.ts     # Realtime subscription on lives table
├── app/
│   ├── go-live.tsx             # Extend existing: add LiveKit connection after form submit
│   └── live/
│       └── [id].tsx            # New: full-screen viewer with video, chat, viewer count
├── components/
│   └── feed/
│       └── LiveSection.tsx     # Existing: wire to real data via useRealtimeLives
└── supabase/
    └── functions/
        └── token-livekit/
            └── index.ts        # Deno Edge Function for token generation

tapzi-barber/
├── app/
│   └── go-live.tsx             # New: setup form + broadcast screen
├── lib/
│   └── livekit.ts              # Token fetching helper (same pattern as barber-store)
└── hooks/
    └── useLiveChat.ts          # Same Broadcast pattern
    └── useLiveViewers.ts       # Same Presence pattern
```

### Pattern 1: LiveKit Room Connection (Client Viewer)
**What:** Wrap LiveKitRoom component around viewer UI, auto-subscribing to remote tracks
**When to use:** Client watching a live stream
**Example:**
```typescript
// Source: https://docs.livekit.io/home/quickstarts/react-native/
import { LiveKitRoom, useTracks, VideoTrack, AudioSession } from '@livekit/react-native';
import { Track, isTrackReference } from 'livekit-client';

function LiveViewer({ serverUrl, token }: { serverUrl: string; token: string }) {
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => { AudioSession.stopAudioSession(); };
  }, []);

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect={true}
      options={{ adaptiveStream: { pixelDensity: 'screen' } }}
      audio={false}   // viewer does not publish audio
      video={false}   // viewer does not publish video
    >
      <ViewerContent />
    </LiveKitRoom>
  );
}

function ViewerContent() {
  const tracks = useTracks([Track.Source.Camera]);
  const hostTrack = tracks.find(t => isTrackReference(t));

  if (!hostTrack) return <LoadingPlaceholder />;

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoTrack trackRef={hostTrack} style={StyleSheet.absoluteFill} />
      {/* Chat overlay and viewer count go here */}
    </View>
  );
}
```

### Pattern 2: LiveKit Room Connection (Barber Broadcaster)
**What:** Connect to LiveKit room and publish local video+audio tracks
**When to use:** Barber going live
**Example:**
```typescript
// Source: https://docs.livekit.io/home/quickstarts/react-native/
function BroadcastScreen({ serverUrl, token }: { serverUrl: string; token: string }) {
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => { AudioSession.stopAudioSession(); };
  }, []);

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect={true}
      options={{ adaptiveStream: { pixelDensity: 'screen' } }}
      audio={true}    // publisher publishes audio
      video={true}    // publisher publishes video
    >
      <BroadcastContent />
    </LiveKitRoom>
  );
}

function BroadcastContent() {
  const tracks = useTracks([Track.Source.Camera]);
  const localTrack = tracks.find(t =>
    isTrackReference(t) && t.participant.isLocal
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      {localTrack && (
        <VideoTrack trackRef={localTrack} style={StyleSheet.absoluteFill} />
      )}
      <BroadcastControls />
    </View>
  );
}
```

### Pattern 3: Supabase Edge Function Token Generation
**What:** Server-side LiveKit token creation with JWT auth verification
**When to use:** Before connecting to any LiveKit room
**Example:**
```typescript
// supabase/functions/token-livekit/index.ts
// Source: https://docs.livekit.io/reference/server-sdk-js/
import { AccessToken } from "npm:livekit-server-sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify Supabase JWT
    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { room_name, can_publish } = await req.json();

    const at = new AccessToken(
      Deno.env.get("LIVEKIT_API_KEY")!,
      Deno.env.get("LIVEKIT_API_SECRET")!,
      {
        identity: user.id,
        name: user.user_metadata?.display_name || user.email || "user",
        ttl: "2h",
      }
    );

    at.addGrant({
      roomJoin: true,
      room: room_name,
      canPublish: can_publish ?? false,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    return new Response(
      JSON.stringify({ token }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### Pattern 4: Supabase Presence for Viewer Count
**What:** Track viewers joining/leaving a live stream room
**When to use:** Both viewer and broadcaster screens
**Example:**
```typescript
// Source: https://supabase.com/docs/guides/realtime/presence
function useLiveViewers(liveId: string, userId: string) {
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    const channel = supabase.channel(`live-viewers:${liveId}`);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        setViewerCount(count);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            joined_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [liveId, userId]);

  return viewerCount;
}
```

### Pattern 5: Supabase Broadcast for Live Chat
**What:** Ephemeral text messages during a live stream
**When to use:** Chat overlay on viewer and broadcaster screens
**Example:**
```typescript
// Source: https://supabase.com/docs/guides/realtime/broadcast
interface ChatMessage {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  text: string;
  sent_at: string;
}

function useLiveChat(liveId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase.channel(`live-chat:${liveId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        setMessages(prev => [...prev.slice(-99), payload as ChatMessage]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

  const sendMessage = useCallback((msg: ChatMessage) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'message',
      payload: msg,
    });
  }, []);

  return { messages, sendMessage };
}
```

### Pattern 6: Mute/Flip Controls (Barber Broadcast)
**What:** Toggle microphone, flip camera during broadcast
**When to use:** Broadcast screen controls
**Example:**
```typescript
// Source: https://docs.livekit.io/transport/media/publish/
// Source: https://github.com/livekit/client-sdk-react-native/issues/218
import { useLocalParticipant } from '@livekit/react-native';

function BroadcastControls() {
  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  const toggleMute = () => {
    localParticipant.setMicrophoneEnabled(isMuted);
    setIsMuted(!isMuted);
  };

  const flipCamera = async () => {
    const camTrack = localParticipant.getTrackPublication(Track.Source.Camera);
    if (camTrack?.track) {
      await camTrack.track.restartTrack({
        facingMode: isFrontCamera ? 'environment' : 'user',
      });
      setIsFrontCamera(!isFrontCamera);
    }
  };

  const endStream = () => {
    localParticipant.setCameraEnabled(false);
    localParticipant.setMicrophoneEnabled(false);
    // Then update lives table status to 'ended'
  };

  return (/* UI buttons calling toggleMute, flipCamera, endStream */);
}
```

### Anti-Patterns to Avoid
- **Creating LiveKit rooms from the client:** Always create tokens server-side via the Edge Function. Never expose API key/secret to the client.
- **Storing chat messages in DB:** The decision is ephemeral Broadcast. Do not add a messages table for live chat.
- **Polling for viewer count:** Use Presence sync events, not periodic DB queries or API calls.
- **Forgetting AudioSession:** On iOS, you must call AudioSession.startAudioSession() before connecting and stopAudioSession() on cleanup. Missing this causes silent audio.
- **Forgetting registerGlobals():** Must be called once at app startup (in _layout.tsx or index.js) before any LiveKit usage. Without it, WebRTC will not work.
- **Using switchActiveDevice for camera flip on mobile:** Use `track.restartTrack({ facingMode })` instead -- switchActiveDevice can crash on iOS (known issue #218).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Video streaming | Custom WebRTC signaling | LiveKit SDK (LiveKitRoom, useTracks) | Hundreds of edge cases in NAT traversal, codec negotiation, adaptive bitrate |
| Token generation | Custom JWT signing | livekit-server-sdk AccessToken | Must match LiveKit's exact JWT format, grant structure, and signing algorithm |
| Presence tracking | Custom heartbeat system | Supabase Presence | Handles disconnects, timeouts, state merging automatically |
| Ephemeral messaging | Custom WebSocket server | Supabase Broadcast | Already have Supabase, no extra infrastructure needed |
| Camera/mic permissions | Manual native permission requests | LiveKit SDK + Expo plugins | Plugins auto-configure Info.plist and AndroidManifest |

**Key insight:** LiveKit handles all the hard WebRTC problems (STUN/TURN, SFU routing, adaptive bitrate, codec selection). The app code only needs to: get a token, connect, and render tracks.

## Common Pitfalls

### Pitfall 1: Missing registerGlobals() Call
**What goes wrong:** LiveKit components render but no video/audio appears, cryptic WebRTC errors in console.
**Why it happens:** LiveKit React Native requires WebRTC polyfills to be registered before any SDK usage.
**How to avoid:** Call `registerGlobals()` in the root _layout.tsx or app entry point, before any component renders.
**Warning signs:** "RTCPeerConnection is not defined" or similar errors.

### Pitfall 2: Missing AudioSession on iOS
**What goes wrong:** Video works but audio is silent on iOS. Audio may work on Android but not iOS.
**Why it happens:** iOS requires explicit audio session management for WebRTC audio routing.
**How to avoid:** Call `AudioSession.startAudioSession()` in a useEffect when entering a live screen, and `stopAudioSession()` on cleanup.
**Warning signs:** Video playing with no sound, only on iOS.

### Pitfall 3: DB Schema Mismatch (author_id vs host_id)
**What goes wrong:** Queries fail or return empty results because column name doesn't match.
**Why it happens:** The migration (033_lives_table.sql) uses `author_id` but TypeScript types use `host_id`. The tapzi-barber useLiveStreams hook uses `profiles!host_id` join syntax.
**How to avoid:** Check the actual DB column name before writing any queries. Align migration, types, and queries to use the same column name. If the DB has `author_id`, either rename it or update all TypeScript types/queries.
**Warning signs:** "column host_id does not exist" errors from Supabase.

### Pitfall 4: Not Handling Token Expiry
**What goes wrong:** Long-running streams disconnect after token TTL expires (default 6 hours).
**Why it happens:** LiveKit tokens have a TTL. When it expires, the connection drops.
**How to avoid:** Set a reasonable TTL (2 hours) and handle the Disconnected event to show UI feedback. For v1, a 2-hour TTL with "stream ended" handling is sufficient.
**Warning signs:** Streams suddenly cutting off after a fixed duration.

### Pitfall 5: Forgetting CORS Headers in Edge Function
**What goes wrong:** supabase.functions.invoke() works but direct fetch fails with CORS error.
**Why it happens:** Browser/React Native fetch requires CORS headers. Supabase client invoke adds them automatically, but the function must still return them.
**How to avoid:** Always handle OPTIONS preflight and add corsHeaders to every response in the Edge Function.
**Warning signs:** "CORS policy" errors in console, but only from certain clients.

### Pitfall 6: Camera Flip Crash on iOS
**What goes wrong:** App crashes when switching camera.
**Why it happens:** Known issue (#218) with switchActiveDevice on iOS in LiveKit React Native SDK.
**How to avoid:** Use `track.restartTrack({ facingMode: 'environment' | 'user' })` instead of switchActiveDevice.
**Warning signs:** App crash on camera switch, only on iOS.

### Pitfall 7: Not Cleaning Up Channels on Screen Exit
**What goes wrong:** Memory leaks, stale presence counts, duplicate chat messages.
**Why it happens:** Supabase channels and LiveKit room connections persist if not explicitly cleaned up.
**How to avoid:** Always call `channel.untrack()`, `supabase.removeChannel(channel)`, and disconnect from LiveKit room in useEffect cleanup.
**Warning signs:** Viewer count keeps increasing even after leaving, duplicate messages.

## Code Examples

All patterns are provided in the Architecture Patterns section above with source attributions.

### registerGlobals Setup (App Entry Point)
```typescript
// In app/_layout.tsx (both apps)
import { registerGlobals } from '@livekit/react-native';

// Call once at module level, before any component
registerGlobals();
```

### Token Fetch Helper (lib/livekit.ts)
```typescript
import { supabase } from './supabase';

const LIVEKIT_URL = process.env.EXPO_PUBLIC_LIVEKIT_URL!;

export async function fetchLiveKitToken(
  roomName: string,
  canPublish: boolean
): Promise<{ token: string; serverUrl: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('token-livekit', {
    body: { room_name: roomName, can_publish: canPublish },
  });

  if (error) throw error;
  return { token: data.token, serverUrl: LIVEKIT_URL };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RTMP/HLS streaming | WebRTC via LiveKit SFU | 2023+ | Sub-second latency vs 5-30s with HLS |
| Custom WebRTC signaling | LiveKit SDK with SFU | 2022+ | No need to manage TURN servers, codec negotiation |
| livekit-server-sdk v1 (toJWT sync) | v2 (toJwt async, Deno support) | 2024 | Works in Deno/Edge Functions |
| expo-av for streaming | @livekit/react-native | 2023+ | expo-av is for playback, not WebRTC streaming |

**Deprecated/outdated:**
- `toJWT()` (sync, v1): Use `toJwt()` (async, v2) instead
- `livekit-react-native` package name: Now `@livekit/react-native` (scoped)
- Manual WebRTC setup: Use `@livekit/react-native-expo-plugin` for Expo apps

## Open Questions

1. **DB column name: author_id or host_id?**
   - What we know: Migration SQL has `author_id`, TypeScript types have `host_id`, tapzi-barber queries use `host_id`
   - What's unclear: What the actual deployed DB schema says
   - Recommendation: Check the actual DB with a quick Supabase query. If it's `author_id`, update TypeScript types OR run an ALTER TABLE rename. Align everything to one name.

2. **Expo Go compatibility with LiveKit**
   - What we know: User's friend said it works. Official docs say it doesn't.
   - What's unclear: Which specific features work/don't work in Expo Go
   - Recommendation: Try it in Expo Go first. If camera/mic don't work, fall back to dev builds (already configured). Have a dev build ready as backup.

3. **lives table: is_public and room_name columns**
   - What we know: Migration has `room_name` (NOT NULL UNIQUE), TypeScript types have `is_public`, `provider`, `ingest_url`, `stream_key`, `playback_url` but no `room_name`
   - What's unclear: Whether the deployed DB matches migration or types
   - Recommendation: Verify actual schema. The `room_name` column is essential for LiveKit room management. The `provider`, `ingest_url`, `stream_key` columns from types may be from an older design.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing (mobile app) |
| Config file | none |
| Quick run command | `npx expo start` + test on device |
| Full suite command | Manual test checklist on physical device |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIVE-01 | Barber starts live broadcast | manual | Test on physical device with camera | N/A |
| LIVE-02 | Client watches live stream | manual | Test on second device | N/A |
| LIVE-03 | Viewer count updates realtime | manual | Open/close viewer on second device, verify count changes | N/A |
| LIVE-04 | Chat messages appear for all viewers | manual | Send message from viewer, verify on broadcaster and other viewers | N/A |
| LIVE-05 | LiveSection shows real data | manual | Start a live, verify it appears in LiveSection on home | N/A |
| LIVE-06 | Edge Function generates valid token | smoke | `curl -X POST <function-url> -H "Authorization: Bearer <token>" -d '{"room_name":"test","can_publish":false}'` | Wave 0 |
| LIVE-07 | Expo build has LiveKit modules | manual | Build and run dev build, verify camera preview works | N/A |
| BARBER-01 | Go-live screen creates live and connects | manual | Fill form, tap start, verify camera preview appears | N/A |
| BARBER-02 | Broadcast controls work (mute, flip, end) | manual | Test each button during broadcast | N/A |
| BARBER-03 | Video+audio tracks published | manual | Verify on viewer device that video and audio are received | N/A |
| BARBER-04 | tapzi-barber dev build with LiveKit | manual | Build and verify LiveKit works | N/A |

### Sampling Rate
- **Per task commit:** Visual verification on device
- **Per wave merge:** Full manual test on two physical devices (one broadcasting, one viewing)
- **Phase gate:** All success criteria verified on physical devices

### Wave 0 Gaps
- [ ] Edge Function `supabase/functions/token-livekit/index.ts` -- covers LIVE-06
- [ ] `registerGlobals()` call in both apps' _layout.tsx -- prerequisite for all LiveKit features
- [ ] Verify actual DB schema (author_id vs host_id, room_name column existence)
- [ ] `lib/livekit.ts` token fetch helper -- shared by all LiveKit screens

## Sources

### Primary (HIGH confidence)
- [LiveKit React Native quickstart](https://docs.livekit.io/home/quickstarts/react-native/) - LiveKitRoom, useTracks, VideoTrack, registerGlobals, AudioSession patterns
- [LiveKit Expo quickstart](https://docs.livekit.io/transport/sdk-platforms/expo/) - Expo plugin config, dev build requirements, AudioSession pattern
- [LiveKit JS Server SDK reference](https://docs.livekit.io/reference/server-sdk-js/) - AccessToken class, addGrant, toJwt, VideoGrant properties
- [LiveKit Camera & microphone docs](https://docs.livekit.io/transport/media/publish/) - setCameraEnabled, setMicrophoneEnabled, mute/unmute, track management
- [LiveKit token endpoint docs](https://docs.livekit.io/frontends/authentication/tokens/endpoint/) - Complete token generation endpoint pattern
- [Supabase Realtime Presence docs](https://supabase.com/docs/guides/realtime/presence) - track(), untrack(), sync/join/leave events, presenceState()
- [Supabase Realtime Broadcast docs](https://supabase.com/docs/guides/realtime/broadcast) - Channel creation, send(), on('broadcast') pattern
- [Supabase Edge Functions auth docs](https://supabase.com/docs/guides/functions/auth) - Deno.serve, JWT verification, createClient pattern
- [LiveKit RN GitHub](https://github.com/livekit/client-sdk-react-native) - Exported hooks, VideoTrack props, AudioSession API

### Secondary (MEDIUM confidence)
- [LiveKit camera switch issue #218](https://github.com/livekit/client-sdk-react-native/issues/218) - iOS crash with switchActiveDevice, restartTrack workaround
- [livekit-server-sdk npm](https://www.npmjs.com/package/livekit-server-sdk) - Deno compatibility confirmed, npm: specifier support

### Tertiary (LOW confidence)
- User report that LiveKit works in Expo Go -- contradicts official docs, needs verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages already installed, versions confirmed in package.json, official docs verified
- Architecture: HIGH - Patterns verified from official LiveKit and Supabase docs with code examples
- Pitfalls: HIGH - Camera flip crash confirmed via GitHub issue, AudioSession and registerGlobals from official docs
- DB schema alignment: MEDIUM - Migration and types disagree, actual DB state unverified

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (LiveKit SDK is actively maintained, patterns stable)
