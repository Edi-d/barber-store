import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
  Share,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
  Animated as RNAnimated,
} from "react-native";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useLiveViewers } from "@/hooks/useLiveViewers";
import { useLiveChat, type ChatMessage } from "@/hooks/useLiveChat";
import { useLiveConnection } from "@/hooks/useLiveConnection";
import { useTutorialContext } from "@/components/tutorial/TutorialProvider";

// ─── LiveKit conditional imports ──────────────────────────────

const isExpoGo = Constants.appOwnership === "expo";

const LK = isExpoGo
  ? null
  : (() => { try { return require("@livekit/react-native"); } catch { return null; } })();

// FIX: VideoTrack is the current @livekit/react-native component.
// It takes `trackRef: TrackReference` where TrackReference is { participant, publication }.
// The deprecated VideoView takes `videoTrack: VideoTrack` (a bare track object) and
// has NO `trackRef` prop — passing trackRef to VideoView is silently ignored,
// so the RTCView renders an empty streamURL which produces a black screen.
const VideoTrackComponent = LK?.VideoTrack as React.ComponentType<any> | null | undefined;

// ─── Types ────────────────────────────────────────────────────

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
    verified: boolean;
  } | null;
};

// ─── Chrome auto-hide duration ────────────────────────────────

const CHROME_HIDE_DELAY_MS = 5000;

// ─── FloatingHeart ────────────────────────────────────────────

function FloatingHeart({ x }: { x: number }) {
  const opacity = useRef(new RNAnimated.Value(1)).current;
  const translateY = useRef(new RNAnimated.Value(0)).current;
  const scale = useRef(new RNAnimated.Value(0.5)).current;

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(translateY, {
        toValue: -200,
        duration: 2000,
        useNativeDriver: true,
      }),
      RNAnimated.sequence([
        RNAnimated.timing(scale, {
          toValue: 1.2,
          duration: 300,
          useNativeDriver: true,
        }),
        RNAnimated.timing(scale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      RNAnimated.timing(opacity, {
        toValue: 0,
        duration: 2000,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <RNAnimated.View
      style={{
        position: "absolute",
        bottom: 80,
        right: 20,
        transform: [{ translateY }, { translateX: x }, { scale }],
        opacity,
      }}
      pointerEvents="none"
    >
      <Text style={{ fontSize: 28 }}>❤️</Text>
    </RNAnimated.View>
  );
}

// ─── HostInfoChip ─────────────────────────────────────────────

function HostInfoChip({ host }: { host: LiveData["host"] }) {
  const name = host?.display_name ?? host?.username ?? "Streamer";
  return (
    <View style={s.hostChip}>
      {host?.avatar_url ? (
        <Image source={{ uri: host.avatar_url }} style={s.hostAvatar} />
      ) : (
        <View style={[s.hostAvatar, s.hostAvatarFallback]}>
          <Feather name="user" size={13} color="#fff" />
        </View>
      )}
      <Text style={s.hostName} numberOfLines={1}>
        {name}
      </Text>
      {host?.verified ? (
        <View style={s.verifiedBadge}>
          <Feather name="check" size={9} color="#fff" />
        </View>
      ) : null}
      <View style={s.liveBadge}>
        <Text style={s.liveBadgeText}>LIVE</Text>
      </View>
    </View>
  );
}

// ─── ViewerCountBadge ─────────────────────────────────────────

function ViewerCountBadge({ count }: { count: number }) {
  const display = count >= 1000
    ? `${(count / 1000).toFixed(1)}K`
    : String(count);
  return (
    <View style={s.viewerBadge}>
      <Feather name="eye" size={13} color="#fff" />
      <Text style={s.viewerCount}>{display}</Text>
    </View>
  );
}

// ─── ConnectionOverlay ────────────────────────────────────────

function ConnectionOverlay({
  connectionState,
  coverUrl,
  onRetry,
  onClose,
  isWaitingForHost,
}: {
  connectionState: string;
  coverUrl: string | null;
  onRetry: () => void;
  onClose: () => void;
  isWaitingForHost: boolean;
}) {
  if (connectionState === "connected" && !isWaitingForHost) return null;

  const isReconnecting = connectionState === "reconnecting";
  const isFailed = connectionState === "failed";
  const isEnded = connectionState === "ended";
  const isLoading =
    connectionState === "fetching_token" || connectionState === "connecting";

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Blurred cover art backdrop */}
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={StyleSheet.absoluteFill}
          blurRadius={isWaitingForHost ? 6 : isReconnecting ? 12 : 0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
      )}

      {/* Dark scrim */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isWaitingForHost
              ? "rgba(0,0,0,0.40)"
              : isReconnecting
              ? "rgba(0,0,0,0.55)"
              : "rgba(0,0,0,0.75)",
          },
        ]}
      />

      {/* Content */}
      <View style={s.overlayContent}>
        {isWaitingForHost && (
          <>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={s.overlayTitle}>Gazda se pregătește...</Text>
            <Text style={s.overlaySubtitle}>
              Streamul va începe în curând
            </Text>
          </>
        )}

        {!isWaitingForHost && (isLoading || isReconnecting) && (
          <>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={s.overlayTitle}>
              {isReconnecting ? "Reconectare..." : "Se conecteaza..."}
            </Text>
            {isReconnecting && (
              <Text style={s.overlaySubtitle}>
                Conexiunea a fost intrerupta
              </Text>
            )}
          </>
        )}

        {isFailed && (
          <>
            <Feather name="wifi-off" size={44} color="rgba(255,255,255,0.5)" />
            <Text style={s.overlayTitle}>Conexiunea a esuat</Text>
            <Text style={s.overlaySubtitle}>
              Verifica conexiunea la internet
            </Text>
            <Pressable className="mt-4 px-6 py-3 rounded-xl bg-white/20 active:bg-white/30" onPress={onRetry}>
              <Text style={s.overlayBtn}>Reincearca</Text>
            </Pressable>
            <Pressable className="mt-2 px-6 py-3 rounded-xl active:bg-white/10" onPress={onClose}>
              <Text style={s.overlayBtnSecondary}>Inapoi</Text>
            </Pressable>
          </>
        )}

        {isEnded && (
          <>
            <Feather name="video-off" size={44} color="rgba(255,255,255,0.5)" />
            <Text style={s.overlayTitle}>Streamul s-a incheiat</Text>
            <Pressable className="mt-4 px-6 py-3 rounded-xl bg-white/20 active:bg-white/30" onPress={onClose}>
              <Text style={s.overlayBtn}>Inapoi</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// ─── ChatRow ──────────────────────────────────────────────────

const ChatRow = ({ item }: { item: ChatMessage }) => (
  <View style={s.chatMsg}>
    <Text style={s.chatMsgName} numberOfLines={1}>
      {item.display_name}
    </Text>
    <Text style={s.chatMsgText}>{item.text}</Text>
  </View>
);

// ─── Main Screen ─────────────────────────────────────────────

export default function LiveViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuthStore();
  const userId = session?.user?.id ?? "";

  const { registerRef, unregisterRef } = useTutorialContext();
  const chatInputRef = useRef<View>(null);
  const viewerCountRef = useRef<View>(null);

  useEffect(() => {
    registerRef("live-chat-input", chatInputRef);
    registerRef("live-viewer-count", viewerCountRef);
    return () => {
      unregisterRef("live-chat-input");
      unregisterRef("live-viewer-count");
    };
  }, [registerRef, unregisterRef]);

  const [live, setLive] = useState<LiveData | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Chrome visibility
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeOpacity = useSharedValue(1);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: withTiming(chromeOpacity.value, {
      duration: 280,
      easing: Easing.out(Easing.ease),
    }),
    pointerEvents: chromeOpacity.value === 0 ? "none" : "auto",
  }));

  // Chat
  const { messages, sendMessage } = useLiveChat(id ?? "");
  const [chatText, setChatText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  // Viewers
  const viewerCount = useLiveViewers(
    id ?? "",
    userId,
    profile?.display_name ?? profile?.username,
    profile?.avatar_url
  );

  // LiveKit connection state machine
  const { state: connState, hostTrack, connect, disconnect, error: connError } =
    useLiveConnection();

  // Floating hearts
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);

  // ── Fetch live metadata ───────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      const { data, error: fetchErr } = await supabase
        .from("lives")
        .select(
          "id, title, cover_url, room_name, status, viewers_count, host:profiles!host_id(id, display_name, username, avatar_url, verified)"
        )
        .eq("id", id)
        .single();

      if (cancelled) return;

      if (fetchErr || !data) {
        setMetaError("Streamul nu a fost gasit");
        setLoadingMeta(false);
        return;
      }

      const liveData = data as any as LiveData;

      if (liveData.status !== "live" && liveData.status !== "starting") {
        setMetaError("Streamul s-a incheiat");
        setLive(liveData);
        setLoadingMeta(false);
        return;
      }

      setLive(liveData);
      setLoadingMeta(false);
    })();

    return () => { cancelled = true; };
  }, [id]);

  // ── Connect once meta is ready ────────────────────────────────────────

  useEffect(() => {
    if (!live || !live.room_name || connState !== "idle") return;
    connect(live.id, live.room_name);
  }, [live, connState, connect]);

  // ── Auto-scroll chat ──────────────────────────────────────────────────

  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(t);
  }, [messages.length]);

  // ── Chrome auto-hide ──────────────────────────────────────────────────

  const showChrome = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    chromeOpacity.value = 1;
    setChromeVisible(true);

    hideTimerRef.current = setTimeout(() => {
      chromeOpacity.value = 0;
      setChromeVisible(false);
    }, CHROME_HIDE_DELAY_MS);
  }, [chromeOpacity]);

  useEffect(() => {
    showChrome(); // start the initial hide timer
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showChrome]);

  // ── Send message ──────────────────────────────────────────────────────

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

  // ── Share ─────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    if (!live) return;
    try {
      await Share.share({
        message: `Urmareste live-ul "${live.title ?? "Live Stream"}" pe Tapzi!`,
        url: `tapzi://live/${live.id}`,
      });
    } catch {
      // User cancelled or share not available
    }
  }, [live]);

  // ── Heart ─────────────────────────────────────────────────────────────

  const handleHeart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const heartId = Date.now();
    const x = Math.random() * 30 - 15; // random horizontal offset -15..+15
    setHearts((prev) => [...prev.slice(-15), { id: heartId, x }]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== heartId));
    }, 2000);
  }, []);

  // ── Retry ─────────────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    if (!live) return;
    disconnect();
    // Small delay to let disconnect settle before reconnecting
    setTimeout(() => connect(live.id, live.room_name), 300);
  }, [live, disconnect, connect]);

  // ─────────────────────────────────────────────────────────────────────
  // RENDER: Expo Go guard
  // ─────────────────────────────────────────────────────────────────────

  if (isExpoGo) {
    return (
      <View style={s.centerContainer}>
        <StatusBar style="light" />
        <Feather name="video-off" size={48} color="rgba(255,255,255,0.4)" />
        <Text style={s.centerText}>
          {"Live streaming necesita un dev build.\nNu functioneaza in Expo Go."}
        </Text>
        <Pressable className="mt-4 px-6 py-3 rounded-xl bg-white/15 active:bg-white/25" onPress={() => router.back()}>
          <Text style={s.overlayBtn}>Inapoi</Text>
        </Pressable>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER: loading metadata
  // ─────────────────────────────────────────────────────────────────────

  if (loadingMeta) {
    return (
      <View style={s.centerContainer}>
        <StatusBar style="light" />
        <ActivityIndicator color="#fff" size="large" />
        <Text style={s.centerText}>Se incarca...</Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER: hard meta error (stream not found)
  // ─────────────────────────────────────────────────────────────────────

  if (metaError) {
    return (
      <View style={s.centerContainer}>
        <StatusBar style="light" />
        <Feather name="video-off" size={48} color="rgba(255,255,255,0.5)" />
        <Text style={s.centerText}>{metaError}</Text>
        <Pressable className="mt-4 px-6 py-3 rounded-xl bg-white/15 active:bg-white/25" onPress={() => router.back()}>
          <Text style={s.overlayBtn}>Inapoi</Text>
        </Pressable>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER: full viewer screen
  // ─────────────────────────────────────────────────────────────────────

  const isWaitingForHost =
    connState === "connected" && !hostTrack && live?.status === "starting";

  const showVideo =
    connState === "connected" && hostTrack && VideoTrackComponent;

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* ── Video layer ─────────────────────────────────────── */}
      <Pressable style={StyleSheet.absoluteFill} onPress={showChrome}>
        {showVideo ? (
          // FIX: use VideoTrack (current API), NOT deprecated VideoView.
          // trackRef must be { participant, publication } — the exact
          // TrackReference shape. VideoTrack reads publication.track
          // internally to derive the mediaStream for RTCView.
          <VideoTrackComponent
            trackRef={hostTrack}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
        ) : (
          // Placeholder while connecting / no track yet
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]}>
            {live?.cover_url ? (
              <Image
                source={{ uri: live.cover_url }}
                style={StyleSheet.absoluteFill}
                blurRadius={18}
              />
            ) : null}
          </View>
        )}
      </Pressable>

      {/* ── Connection state overlays ────────────────────────── */}
      <ConnectionOverlay
        connectionState={connState === "idle" ? "connecting" : connState}
        coverUrl={live?.cover_url ?? null}
        onRetry={handleRetry}
        onClose={() => router.back()}
        isWaitingForHost={isWaitingForHost}
      />

      {/* ── Floating hearts (pointer-transparent layer) ───────── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {hearts.map((h) => (
          <FloatingHeart key={h.id} x={h.x} />
        ))}
      </View>

      {/* ── Chrome (top bar + chat + input) ─────────────────── */}
      <KeyboardAvoidingView
        style={StyleSheet.absoluteFill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <Animated.View style={[StyleSheet.absoluteFill, chromeStyle]} pointerEvents="box-none">

          {/* ── Top bar ─────────────────────────────────────── */}
          <View
            style={[s.topBar, { paddingTop: insets.top + 6 }]}
            pointerEvents="box-none"
          >
            {/* Left: close + host chip */}
            <View style={s.topLeft} pointerEvents="box-none">
              <Pressable
                className="w-9 h-9 rounded-full items-center justify-center bg-black/40 active:bg-black/60"
                onPress={() => router.back()}
              >
                <Feather name="x" size={20} color="#fff" />
              </Pressable>

              {live ? <HostInfoChip host={live.host} /> : null}
            </View>

            {/* Right: viewer count + share */}
            <View style={s.topRight} pointerEvents="box-none">
              <View ref={viewerCountRef}>
                <ViewerCountBadge count={viewerCount} />
              </View>
              <Pressable
                className="w-9 h-9 rounded-full items-center justify-center bg-black/40 active:bg-black/60"
                onPress={handleShare}
              >
                <Feather name="share-2" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* ── Chat overlay: bottom-left, 60% wide ─────────── */}
          <View style={[s.chatOverlay, { bottom: 64 + insets.bottom }]} pointerEvents="none">
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <ChatRow item={item} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.chatList}
              removeClippedSubviews
              maxToRenderPerBatch={20}
              windowSize={10}
            />
          </View>

          {/* ── Chat input bar ───────────────────────────────── */}
          <View ref={chatInputRef} style={[s.chatInputRow, { paddingBottom: insets.bottom + 6 }]}>
            <TextInput
              style={s.chatInput}
              placeholder="Scrie un mesaj..."
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={chatText}
              onChangeText={setChatText}
              maxLength={200}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              onFocus={showChrome}
            />
            <Pressable style={s.heartBtn} onPress={handleHeart}>
              <Feather name="heart" size={22} color="#fff" />
            </Pressable>
            <Pressable
              className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
              style={[s.sendBtn, !chatText.trim() && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!chatText.trim()}
            >
              <Feather name="send" size={17} color="#fff" />
            </Pressable>
          </View>

        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },

  // ── Center states ─────────────────────────────────────────
  centerContainer: {
    flex: 1,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
  },
  centerText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontFamily: "EuclidCircularA-Regular",
    textAlign: "center",
  },

  // ── Connection overlays ───────────────────────────────────
  overlayContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  overlayTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "EuclidCircularA-SemiBold",
    textAlign: "center",
  },
  overlaySubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontFamily: "EuclidCircularA-Regular",
    textAlign: "center",
  },
  overlayBtn: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "EuclidCircularA-Medium",
    textAlign: "center",
  },
  overlayBtnSecondary: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontFamily: "EuclidCircularA-Regular",
    textAlign: "center",
  },

  // ── Top bar ───────────────────────────────────────────────
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    zIndex: 20,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },

  // ── Host chip ─────────────────────────────────────────────
  hostChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    paddingLeft: 3,
    paddingRight: 10,
    paddingVertical: 3,
    flex: 1,
    minWidth: 0,
    maxWidth: 200,
  },
  hostAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  hostAvatarFallback: {
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  hostName: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "EuclidCircularA-Medium",
    flex: 1,
    minWidth: 0,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#4481EB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  liveBadge: {
    backgroundColor: "#E53935",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  liveBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "EuclidCircularA-Bold",
    letterSpacing: 0.5,
  },

  // ── Viewer badge ──────────────────────────────────────────
  viewerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewerCount: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "EuclidCircularA-Medium",
  },

  // ── Chat overlay ──────────────────────────────────────────
  // bottom is overridden inline as `64 + insets.bottom` so messages
  // always clear the input bar on both notch and non-notch devices.
  chatOverlay: {
    position: "absolute",
    left: 0,
    bottom: 64,       // fallback; overridden inline with safe-area offset
    width: "60%",
    maxHeight: 220,
    paddingLeft: 12,
    zIndex: 10,
  },
  chatList: {
    paddingVertical: 4,
  },
  chatMsg: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 5,
    paddingRight: 8,
  },
  chatMsgName: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "EuclidCircularA-SemiBold",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    maxWidth: 100,
  },
  chatMsgText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    fontFamily: "EuclidCircularA-Regular",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    flexShrink: 1,
  },

  // ── Chat input bar ────────────────────────────────────────
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
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 20,
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
    minHeight: 42,
  },
  heartBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
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
    opacity: 0.38,
  },
});
