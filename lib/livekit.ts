import { supabase } from "./supabase";

// ─── Server URL ───────────────────────────────────────────────

export const LIVEKIT_URL =
  process.env.EXPO_PUBLIC_LIVEKIT_URL ||
  "wss://livekit.example.com"; // fallback — replace with your actual URL

// ─── Token fetch ──────────────────────────────────────────────

/**
 * Fetch a LiveKit token from the edge function.
 *
 * @param roomName  - The LiveKit room name
 * @param canPublish - `true` for hosts/broadcasters, `false` for viewers
 */
export async function fetchLiveKitToken(
  roomName: string,
  canPublish: boolean = false
): Promise<{ token: string; serverUrl: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("token-livekit", {
    body: {
      room: roomName,
      identity: session.user.id,
      canPublish,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to fetch LiveKit token");
  }

  return { token: data.token, serverUrl: LIVEKIT_URL };
}
