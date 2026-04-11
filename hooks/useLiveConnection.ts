import { useState, useEffect, useRef, useCallback } from 'react';
import Constants from 'expo-constants';
import { fetchLiveKitToken } from '@/lib/livekit';

// ─── Types ────────────────────────────────────────────────────

export type ConnectionState =
  | 'idle'
  | 'fetching_token'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'ended';

export interface LiveConnectionResult {
  state: ConnectionState;
  room: any | null;
  hostTrack: any | null;
  connect: (liveId: string, roomName: string) => Promise<void>;
  disconnect: () => void;
  forceEnd: () => void;
  error: string | null;
}

// ─── LiveKit conditional import ───────────────────────────────

const isExpoGo = Constants.appOwnership === 'expo';

const LK = isExpoGo ? null : (() => {
  try { return require('@livekit/react-native'); } catch { return null; }
})();

const LKClient = isExpoGo ? null : (() => {
  try { return require('livekit-client'); } catch { return null; }
})();

const RoomEvent = LKClient?.RoomEvent ?? null;

// Track.Source.Camera is numeric 1 in every livekit-client release.
// We derive it from the module first; if the module loaded but the path is
// unexpectedly missing (version mismatch, minifier rename, etc.) we fall back
// to the hard-coded value so resolveHostTrack / TrackSubscribed still match.
const _moduleTrackSource = LKClient?.Track?.Source ?? null;
if (!isExpoGo && LKClient && !_moduleTrackSource) {
  console.warn(
    '[useLiveConnection] livekit-client loaded but Track.Source is undefined. ' +
    'Check that your installed livekit-client version exports Track on the ' +
    'module root (e.g. `import { Track } from "livekit-client"`).'
  );
}
// FIX: if Track.Source is missing from the build (version mismatch), fall back
// to the raw numeric value 1 (Camera) so track matching never silently fails.
const TrackSource: { Camera: number } | null =
  _moduleTrackSource ?? (LKClient ? { Camera: 1 } : null);

// ─── Token refresh interval ───────────────────────────────────

const TOKEN_REFRESH_MS = 50 * 60 * 1000; // 50 minutes

// ─── Hook ─────────────────────────────────────────────────────

export function useLiveConnection(): LiveConnectionResult {
  const [state, setState] = useState<ConnectionState>('idle');
  const [room, setRoom] = useState<any | null>(null);
  const [hostTrack, setHostTrack] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roomRef = useRef<any | null>(null);
  const tokenRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveIdRef = useRef<string>('');
  const roomNameRef = useRef<string>('');

  // ── Track resolution: scan all participants for a publishing camera ──

  const resolveHostTrack = useCallback((rm: any) => {
    // FIX: removed `!TrackSource` guard — it caused a silent early return
    // when Track.Source failed to load, leaving hostTrack permanently null.
    if (!rm) return;

    // FIX: fall back to kind === 'video' check when TrackSource is unavailable.
    const cameraSource = TrackSource?.Camera;

    console.log('[LIVE] resolveHostTrack: remoteParticipants count:', rm.remoteParticipants.size);
    for (const [id, participant] of rm.remoteParticipants) {
      console.log('[LIVE] Participant:', id, 'tracks:', participant.trackPublications.size);
      for (const [, pub] of participant.trackPublications) {
        console.log('[LIVE] Track source:', pub.source, 'kind:', pub.kind, 'subscribed:', pub.isSubscribed, 'hasTrack:', !!pub.track);
      }
    }

    for (const [, participant] of rm.remoteParticipants) {
      for (const [, publication] of participant.trackPublications) {
        const isCamera = cameraSource !== undefined
          ? publication.source === cameraSource
          : publication.kind === 'video';

        if (isCamera && publication.isSubscribed && publication.track) {
          console.log('[LIVE] resolveHostTrack: FOUND camera track sid:', publication.trackSid);
          // FIX: shape is { participant, publication } — NOT { participant, publication, track }.
          // VideoTrack (current @livekit/react-native component) takes a TrackReference:
          //   { participant, publication, source? }
          // It reads publication.track internally for the mediaStream.
          // The old `track` key at the top level was silently ignored.
          setHostTrack({ participant, publication });
          return;
        }
      }
    }

    console.log('[LIVE] resolveHostTrack: no subscribed camera track found yet');
    setHostTrack(null);
  }, []);

  // ── Schedule silent token refresh ─────────────────────────────────────

  const scheduleTokenRefresh = useCallback((rm: any, rName: string) => {
    if (tokenRefreshRef.current) clearTimeout(tokenRefreshRef.current);

    tokenRefreshRef.current = setTimeout(async () => {
      try {
        const { token } = await fetchLiveKitToken(rName, false);
        if (rm && roomRef.current === rm) {
          await rm.refreshToken?.(token);
        }
      } catch {
        // Non-fatal: room will handle expiry natively
      }
    }, TOKEN_REFRESH_MS);
  }, []);

  // ── Attach room event listeners ───────────────────────────────────────

  const attachEvents = useCallback(
    (rm: any, rName: string) => {
      if (!RoomEvent) return;

      rm.on(RoomEvent.Reconnecting, () => {
        setState('reconnecting');
      });

      rm.on(RoomEvent.Reconnected, () => {
        setState('connected');
        resolveHostTrack(rm);
        scheduleTokenRefresh(rm, rName);
      });

      rm.on(RoomEvent.Disconnected, () => {
        // If we were 'reconnecting' and finally give up, mark failed
        setState((prev) =>
          prev === 'reconnecting' ? 'failed' : 'ended'
        );
        setHostTrack(null);
      });

      rm.on(RoomEvent.ParticipantLeft, (participant: any) => {
        // If the host leaves, clear the track
        setHostTrack((prev: any) => {
          if (prev && prev.participant?.identity === participant.identity) {
            return null;
          }
          return prev;
        });
      });

      rm.on(RoomEvent.TrackSubscribed, (track: any, publication: any, participant: any) => {
        const cameraSource = TrackSource?.Camera;
        const isCamera = cameraSource !== undefined
          ? publication.source === cameraSource
          : track.kind === 'video';

        console.log('[LIVE] TrackSubscribed source:', publication.source, 'kind:', track.kind, 'isCamera:', isCamera);

        if (isCamera) {
          // FIX: store { participant, publication } — correct TrackReference shape
          setHostTrack({ participant, publication });
          setState('connected');
        }
      });

      rm.on(RoomEvent.TrackUnsubscribed, (_track: any, publication: any, participant: any) => {
        setHostTrack((prev: any) => {
          if (
            prev &&
            prev.participant?.identity === participant.identity &&
            prev.publication?.trackSid === publication.trackSid
          ) {
            return null;
          }
          return prev;
        });
      });
    },
    [resolveHostTrack, scheduleTokenRefresh]
  );

  // ── connect ───────────────────────────────────────────────────────────

  const connect = useCallback(
    async (liveId: string, rName: string) => {
      if (isExpoGo || !LK) {
        setState('failed');
        setError('LiveKit necesita un dev build');
        return;
      }

      liveIdRef.current = liveId;
      roomNameRef.current = rName;

      try {
        setState('fetching_token');
        setError(null);

        const { token, serverUrl } = await fetchLiveKitToken(rName, false);
        console.log('[LIVE] Token received, connecting to:', serverUrl);

        setState('connecting');

        const rm = new LKClient.Room({
          adaptiveStream: true,
          dynacast: true,
        });

        roomRef.current = rm;
        setRoom(rm);

        // FIX (race condition): attach event listeners BEFORE connecting.
        // The SDK can fire TrackSubscribed during the connect() call itself
        // (when the broadcaster is already live). Previously attachEvents was
        // called after await rm.connect(), so those early events were lost.
        attachEvents(rm, rName);

        // Configure audio session for viewer (receive-only)
        try {
          if (LK?.AudioSession) {
            await LK.AudioSession.configureAudio({
              ios: { defaultOutput: 'speaker' },
              android: {
                preferredOutputList: ['speaker'],
              },
            });
            // Set iOS AVAudioSession category for receive-only audio
            if (LK.AudioSession.setAppleAudioConfiguration) {
              await LK.AudioSession.setAppleAudioConfiguration({
                audioCategory: 'playback',
                audioCategoryOptions: ['mixWithOthers'],
                audioMode: 'spokenAudio',
              });
            }
            await LK.AudioSession.startAudioSession();
          }
        } catch (e) {
          console.warn('[LIVE] AudioSession setup failed:', e);
        }

        await rm.connect(serverUrl, token);
        console.log('[LIVE] Room connected, participants:', rm.remoteParticipants.size);

        setState('connected');
        resolveHostTrack(rm);
        scheduleTokenRefresh(rm, rName);
      } catch (err: any) {
        setState('failed');
        setError(err?.message ?? 'Eroare la conectare');
        roomRef.current = null;
        setRoom(null);
      }
    },
    [attachEvents, resolveHostTrack, scheduleTokenRefresh]
  );

  // ── disconnect ────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    if (tokenRefreshRef.current) {
      clearTimeout(tokenRefreshRef.current);
      tokenRefreshRef.current = null;
    }

    const rm = roomRef.current;
    if (rm) {
      try { rm.disconnect(); } catch { /* ignore */ }
      roomRef.current = null;
    }

    try { LK?.AudioSession?.stopAudioSession(); } catch {}

    setRoom(null);
    setHostTrack(null);
    setState('idle');
    setError(null);
  }, []);

  // ── forceEnd — used when the host ends the stream via Realtime ────────
  // Same teardown as disconnect but transitions to 'ended' so the viewer
  // sees the "Streamul s-a incheiat" overlay rather than reconnecting.

  const forceEnd = useCallback(() => {
    if (tokenRefreshRef.current) {
      clearTimeout(tokenRefreshRef.current);
      tokenRefreshRef.current = null;
    }

    const rm = roomRef.current;
    if (rm) {
      try { rm.disconnect(); } catch { /* ignore */ }
      roomRef.current = null;
    }

    try { LK?.AudioSession?.stopAudioSession(); } catch {}

    setRoom(null);
    setHostTrack(null);
    setState('ended');
    setError(null);
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (tokenRefreshRef.current) clearTimeout(tokenRefreshRef.current);
      const rm = roomRef.current;
      if (rm) {
        try { rm.disconnect(); } catch { /* ignore */ }
      }
      try { LK?.AudioSession?.stopAudioSession(); } catch {}
    };
  }, []);

  return { state, room, hostTrack, connect, disconnect, forceEnd, error };
}
