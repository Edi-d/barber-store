import { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";

import { supabase } from "@/lib/supabase";
import { fetchLiveKitToken, LIVEKIT_URL } from "@/lib/livekit";
import { useAuthStore } from "@/stores/authStore";
import { useLiveViewers } from "@/hooks/useLiveViewers";
import { useLiveChat, type ChatMessage } from "@/hooks/useLiveChat";

// ─── LiveKit conditional imports ─────────────────────────────
// @livekit/react-native requires native modules that are not linked
// in Expo Go. We guard the require() call so the module is only
// loaded when running in a proper dev/production build.

const isExpoGo = Constants.appOwnership === "expo";

const LK = isExpoGo ? null : require("@livekit/react-native");
const LiveKitRoom = LK?.LiveKitRoom as
  | React.ComponentType<any>
  | null
  | undefined;
const VideoTrack = LK?.VideoTrack as
  | React.ComponentType<any>
  | null
  | undefined;
const AudioSession = (LK?.AudioSession ?? {
  startAudioSession: () => {},
  stopAudioSession: () => {},
}) as { startAudioSession: () => void; stopAudioSession: () => void };

const Track = isExpoGo ? null : (require("livekit-client").Track as any);

// useTracks must be called unconditionally inside components (Rules of Hooks).
// isExpoGo is a module-level constant so the selected hook never changes
// between renders — both branches satisfy the rules-of-hooks constraint.
function useTracksNoop(): any[] {
  return [];
}
const useTracksHook: (sources: any[]) => any[] = isExpoGo
  ? useTracksNoop
  : (LK!.useTracks as (sources: any[]) => any[]);

// ─── Types ───────────────────────────────────────────────────

type LiveData = {
  id: string;
  title: string;
  cover_url: string | null;
  room_name: string;
  status: string;
  viewers_count: number;
  host: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

// ─── Viewer Content (inside LiveKitRoom) ─────────────────────

function ViewerContent({
  live,
  viewerCount,
}: {
  live: LiveData;
  viewerCount: number;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile } = useAuthStore();
  const userId = session?.user?.id ?? "";

  const sources = Track ? [Track.Source.Camera] : [];
  const tracks = useTracksHook(sources);
  const { messages, sendMessage } = useLiveChat(live.id);
  const [chatText, setChatText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  // Find the remote (host) camera track
  const hostTrack = tracks.find((t: any) => !t.participant?.isLocal);

  const handleSend = useCallback(() => {
    const text = chatText.trim();
    if (!text || !userId) return;

    const msg: ChatMessage = {
      id: `${Date.now()}-${userId.slice(0, 8)}`,
      user_id: userId,
      display_name: profile?.display_name ?? profile?.username ?? "Anonim",
      avatar_url: profile?.avatar_url ?? null,
      text,
      sent_at: new Date().toISOString(),
    };

    sendMessage(msg);
    setChatText("");
  }, [chatText, userId, profile, sendMessage]);

  // Auto-scroll chat
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const hostName =
    live.host?.display_name ?? live.host?.username ?? "Streamer";

  return (
    <KeyboardAvoidingView
      style={styles.viewerContainer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Video */}
      {hostTrack && VideoTrack ? (
        <VideoTrack trackRef={hostTrack} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noVideoPlaceholder]}>
          {live.cover_url ? (
            <Image
              source={{ uri: live.cover_url }}
              style={StyleSheet.absoluteFill}
              blurRadius={20}
            />
          ) : null}
          <View style={styles.noVideoOverlay}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.noVideoText}>Se conecteaza la stream...</Text>
          </View>
        </View>
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topLeft}>
          {/* Close */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => router.back()}
          >
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Host info */}
          <View style={styles.hostInfo}>
            {live.host?.avatar_url ? (
              <Image
                source={{ uri: live.host.avatar_url }}
                style={styles.hostAvatar}
              />
            ) : (
              <View style={[styles.hostAvatar, styles.hostAvatarPlaceholder]}>
                <Feather name="user" size={14} color="#fff" />
              </View>
            )}
            <Text style={styles.hostName} numberOfLines={1}>
              {hostName}
            </Text>
            <View style={styles.liveBadgeSmall}>
              <Text style={styles.liveBadgeSmallText}>LIVE</Text>
            </View>
          </View>
        </View>

        {/* Viewer count */}
        <View style={styles.viewerBadge}>
          <Feather name="eye" size={14} color="#fff" />
          <Text style={styles.viewerCount}>{viewerCount}</Text>
        </View>
      </View>

      {/* Chat overlay */}
      <View style={styles.chatOverlay}>
        <FlatList
          ref={flatListRef}
          data={messages.slice(-30)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.chatMsg}>
              <Text style={styles.chatMsgName}>{item.display_name}</Text>
              <Text style={styles.chatMsgText}>{item.text}</Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.chatList}
        />
      </View>

      {/* Chat input */}
      <View style={[styles.chatInputRow, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.chatInput}
          placeholder="Scrie un mesaj..."
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={chatText}
          onChangeText={setChatText}
          maxLength={200}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !chatText.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!chatText.trim()}
        >
          <Feather name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function LiveViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();
  const userId = session?.user?.id ?? "";

  const [live, setLive] = useState<LiveData | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewerCount = useLiveViewers(id ?? "", userId);

  // Fetch live data and token
  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    (async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from("lives")
          .select(
            "id, title, cover_url, room_name, status, viewers_count, host:profiles!author_id(id, display_name, username, avatar_url)"
          )
          .eq("id", id)
          .single();

        if (cancelled) return;

        if (fetchErr || !data) {
          setError("Stream not found");
          setLoading(false);
          return;
        }

        const liveData = data as any as LiveData;

        if (liveData.status !== "live" && liveData.status !== "starting") {
          if (cancelled) return;
          setError("Streamul s-a incheiat");
          setLive(liveData);
          setLoading(false);
          return;
        }

        if (cancelled) return;
        setLive(liveData);

        // Fetch viewer token
        const tokenResult = await fetchLiveKitToken(liveData.room_name, false);
        if (cancelled) return;
        setToken(tokenResult.token);
        setServerUrl(tokenResult.serverUrl);
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || "Eroare la conectare");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // AudioSession for iOS — stub is used in Expo Go so calls are always safe
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  // ── All hooks are above this line ──────────────────────────

  // Expo Go guard: native modules not available, show placeholder
  if (isExpoGo) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#111",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Feather name="video-off" size={48} color="rgba(255,255,255,0.4)" />
        <Text
          style={{
            color: "#fff",
            fontSize: 16,
            textAlign: "center",
            paddingHorizontal: 32,
          }}
        >
          Live streaming necesita un dev build.{"\n"}Nu functioneaza in Expo Go.
        </Text>
      </View>
    );
  }

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar hidden />
        <ActivityIndicator color="#fff" size="large" />
        <Text style={styles.centerText}>Se conecteaza...</Text>
      </View>
    );
  }

  // Error / ended state
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar hidden />
        <Feather name="video-off" size={48} color="rgba(255,255,255,0.5)" />
        <Text style={styles.centerText}>{error}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Inapoi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Live view
  if (live && token && serverUrl && LiveKitRoom) {
    return (
      <>
        <StatusBar hidden />
        <LiveKitRoom
          serverUrl={serverUrl}
          token={token}
          connect={true}
          options={{ adaptiveStream: { pixelDensity: "screen" } }}
          audio={false}
          video={false}
        >
          <ViewerContent live={live} viewerCount={viewerCount} />
        </LiveKitRoom>
      </>
    );
  }

  return null;
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  viewerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  noVideoPlaceholder: {
    backgroundColor: "#111",
  },
  noVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  noVideoText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontFamily: "EuclidCircularA-Regular",
  },

  // Top bar
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    zIndex: 10,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  hostInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20,
    paddingRight: 10,
    paddingLeft: 3,
    paddingVertical: 3,
    flex: 1,
    maxWidth: 220,
  },
  hostAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  hostAvatarPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  hostName: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "EuclidCircularA-Medium",
    flex: 1,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  liveBadgeSmall: {
    backgroundColor: "#E53935",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveBadgeSmallText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "EuclidCircularA-Bold",
    letterSpacing: 0.5,
  },
  viewerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  viewerCount: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "EuclidCircularA-Medium",
  },

  // Chat overlay
  chatOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 60,
    maxHeight: 200,
    paddingHorizontal: 12,
    zIndex: 5,
  },
  chatList: {
    paddingVertical: 4,
  },
  chatMsg: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  chatMsgName: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "EuclidCircularA-SemiBold",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  chatMsgText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontFamily: "EuclidCircularA-Regular",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    flexShrink: 1,
  },

  // Chat input
  chatInputRow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 10,
  },
  chatInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "EuclidCircularA-Regular",
    color: "#fff",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4481EB",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },

  // Center states
  centerContainer: {
    flex: 1,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  centerText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
    fontFamily: "EuclidCircularA-Regular",
  },
  backButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "EuclidCircularA-Medium",
  },
});
