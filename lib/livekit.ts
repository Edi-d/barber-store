import { supabase } from "./supabase";

export const LIVEKIT_URL = process.env.EXPO_PUBLIC_LIVEKIT_URL!;

export async function fetchLiveKitToken(
  roomName: string,
  canPublish: boolean
): Promise<{ token: string; serverUrl: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("token-livekit", {
    body: { room_name: roomName, can_publish: canPublish },
  });

  if (error) {
    throw new Error(error.message || "Failed to fetch LiveKit token");
  }

  return { token: data.token, serverUrl: LIVEKIT_URL };
}
