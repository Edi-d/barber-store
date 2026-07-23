// MUST be first: installs Euclid Circular A as the app-wide default font on
// <Text>/<TextInput> during the import phase, before react-native-reanimated
// evaluates (so its Animated.Text inherits the font too). See the module for
// why ordering matters.
import "@/lib/setupDefaultFont";
import "../global.css";
import { useEffect, useCallback, useState, useRef } from "react";
import { setAudioModeAsync } from 'expo-audio';
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppState, Platform, View, ActivityIndicator, StyleSheet, Linking } from "react-native";
import { Image } from '@/components/ui/Image';
import { useVideoPlayer, VideoView } from "expo-video";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";
import { AuthProvider } from '@/providers/auth-provider';
import { SalonProvider } from '@/providers/salon-provider';
import { TutorialProvider } from '@/components/tutorial/TutorialProvider';
import { useLoyaltyNotifications } from '@/hooks/useLoyaltyNotifications';
import { usePushRegistration } from '@/hooks/use-push-registration';
import { usePushDeepLinks } from '@/hooks/use-push-deep-links';
import { useAppointmentLiveActivity } from '@/hooks/useAppointmentLiveActivity';
import { PointsEarnedToast } from '@/components/loyalty/PointsEarnedToast';
import { PointsLevelUpModal } from '@/components/loyalty/PointsLevelUpModal';
import { useLoyaltyQueueStore } from '@/stores/loyaltyQueueStore';
import '@/lib/livekit-setup';
import '@/lib/mapbox';
import { featureFlags } from 'react-native-screens';

// Enable react-native-screens 4.21+ fix for the iOS Fabric crash where dismissed
// RNSScreens get reattached to the navigation controller, causing
// UIViewControllerHierarchyInconsistency → objc_exception_rethrow → SIGABRT.
// Default-on in 4.24+, but we're pinned to 4.21.x for expo-router compat.
featureFlags.experiment.iosPreventReattachmentOfDismissedScreens = true;

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

// StartupVideo must NEVER be able to block app startup. Three escape hatches:
//   1. playToEnd  — normal happy path.
//   2. statusChange error — AVPlayer can fail to build its render pipeline on
//      simulators with a broken CoreAudio device (error -66680), producing
//      AVFoundationErrorDomain -11800 / -12746 and never emitting playToEnd.
//   3. 6-second safety timeout — catches any other silent failure mode.
// Muting the player also lets AVPlayer skip the broken audio route entirely,
// reducing the likelihood of hitting the CoreAudio failure in the first place.
function StartupVideo({ onFinish }: { onFinish: () => void }) {
  const player = useVideoPlayer(
    require("@/assets/videos/tapzi-logo-animation.mp4"),
    (p) => {
      p.loop = false;
      p.muted = true;
      p.play();
    }
  );

  const videoOpacity = useSharedValue(1);
  const finished = useRef(false);

  // Hand off exactly once, whichever escape hatch fires first.
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish();
  }, [onFinish]);

  // Happy path: the video ends on its last frame (loop === false), so hold that
  // frame for a beat (freeze-frame) and then dissolve the video out. The View
  // behind it is #F0F4F8 — the same colour the app and LoadingScreen render on —
  // so once the fade completes and showIntro flips, the swap is seamless (no
  // flash, no visible cut). Only the normal end runs the transition; error and
  // timeout paths hand off immediately rather than fading a broken/frozen frame.
  const playToEndTransition = useCallback(() => {
    if (finished.current) return;
    videoOpacity.value = withDelay(
      350,
      withTiming(0, { duration: 450, easing: Easing.inOut(Easing.quad) }, (done) => {
        if (done) runOnJS(finish)();
      })
    );
  }, [finish, videoOpacity]);

  useEffect(() => {
    const playToEndSub = player.addListener("playToEnd", playToEndTransition);

    const statusSub = player.addListener("statusChange", ({ status }) => {
      if (status === "error") {
        finish();
      }
    });

    // Safety net: if neither playToEnd nor an error status fires within 6 s,
    // dismiss the intro anyway so the user is never permanently locked out.
    const timeout = setTimeout(finish, 6000);

    return () => {
      playToEndSub.remove();
      statusSub.remove();
      clearTimeout(timeout);
    };
  }, [player, playToEndTransition, finish]);

  const videoStyle = useAnimatedStyle(() => ({ opacity: videoOpacity.value }));

  return (
    <View style={styles.loadingContainer}>
      <Animated.View style={[StyleSheet.absoluteFill, videoStyle]}>
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          nativeControls={false}
        />
      </Animated.View>
    </View>
  );
}

function LoadingScreen() {
  const blob1Progress = useSharedValue(0);
  const blob2Progress = useSharedValue(0);
  const contentProgress = useSharedValue(0);

  useEffect(() => {
    const timingConfig = { duration: 800, easing: Easing.out(Easing.cubic) };
    blob1Progress.value = withTiming(1, timingConfig);
    blob2Progress.value = withDelay(50, withTiming(1, timingConfig));
    contentProgress.value = withDelay(200, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, []);

  const blob1Style = useAnimatedStyle(() => ({
    opacity: blob1Progress.value,
    transform: [{ scale: 0.8 + blob1Progress.value * 0.2 }],
  }));

  const blob2Style = useAnimatedStyle(() => ({
    opacity: blob2Progress.value,
    transform: [{ scale: 0.85 + blob2Progress.value * 0.15 }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentProgress.value,
    transform: [{ scale: 0.95 + contentProgress.value * 0.05 }],
  }));

  return (
    <View style={styles.loadingContainer}>
      <LinearGradient
        colors={["#EDF1F7", "#F0F4F8", "#EEF1F6", "#F0F4F8"]}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Blue blob - top right (animated) */}
      <Animated.View style={[styles.blobTopRight, blob1Style]}>
        <Svg width={500} height={500}>
          <Defs>
            <RadialGradient id="lb1" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#4481EB" stopOpacity={0.4} />
              <Stop offset="40%" stopColor="#4481EB" stopOpacity={0.2} />
              <Stop offset="70%" stopColor="#4481EB" stopOpacity={0.07} />
              <Stop offset="100%" stopColor="#4481EB" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={250} cy={250} r={250} fill="url(#lb1)" />
        </Svg>
      </Animated.View>

      {/* Soft blue wash - mid screen */}
      <View style={styles.midBlob}>
        <Svg width={600} height={600}>
          <Defs>
            <RadialGradient id="lbMid" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#4481EB" stopOpacity={0.12} />
              <Stop offset="50%" stopColor="#4481EB" stopOpacity={0.04} />
              <Stop offset="100%" stopColor="#4481EB" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={300} cy={300} r={300} fill="url(#lbMid)" />
        </Svg>
      </View>

      {/* Indigo blob - bottom left (animated) */}
      <Animated.View style={[styles.blobBottomLeft, blob2Style]}>
        <Svg width={500} height={500}>
          <Defs>
            <RadialGradient id="lb2" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#6366F1" stopOpacity={0.34} />
              <Stop offset="40%" stopColor="#6366F1" stopOpacity={0.14} />
              <Stop offset="70%" stopColor="#6366F1" stopOpacity={0.04} />
              <Stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={250} cy={250} r={250} fill="url(#lb2)" />
        </Svg>
      </Animated.View>

      {/* Logo + spinner with fade-in */}
      <Animated.View style={[styles.contentCenter, contentStyle]}>
        <Image
          source={require("@/assets/logo-icon.webp")}
          style={styles.loadingLogo}
          contentFit="contain"
        />
        <ActivityIndicator
          size="large"
          color="#4481EB"
          style={styles.loadingSpinner}
        />
      </Animated.View>
    </View>
  );
}

function LoyaltyGlobalOverlays() {
  useLoyaltyNotifications();

  const currentToast = useLoyaltyQueueStore((s) => s.currentToast());
  const currentLevelUp = useLoyaltyQueueStore((s) => s.currentLevelUp());
  const dequeueToast = useLoyaltyQueueStore((s) => s.dequeueToast);
  const dequeueLevelUp = useLoyaltyQueueStore((s) => s.dequeueLevelUp);

  return (
    <>
      {currentToast && (
        <PointsEarnedToast
          visible
          points={currentToast.points}
          source={currentToast.source}
          onDismiss={dequeueToast}
        />
      )}
      {currentLevelUp && (
        <PointsLevelUpModal
          visible
          from={currentLevelUp.from}
          to={currentLevelUp.to}
          onDismiss={dequeueLevelUp}
        />
      )}
    </>
  );
}

function RootLayoutNav() {
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const router = useRouter();

  // Push: register a token once signed in, and route notification taps to the
  // matching in-app screen (e.g. /salon/<id>) instead of the web URL.
  usePushRegistration(userId);
  usePushDeepLinks();
  useAppointmentLiveActivity();

  useEffect(() => {
    const handleAuthUrl = async (url: string | null) => {
      if (!url) return;
      try {
        // --- Query-string path: token_hash flow (Supabase "Confirm signup" template) ---
        const qIndex = url.indexOf("?");
        if (qIndex !== -1) {
          const hashIndex = url.indexOf("#", qIndex);
          const querystring = hashIndex !== -1
            ? url.substring(qIndex + 1, hashIndex)
            : url.substring(qIndex + 1);
          const qParams = new URLSearchParams(querystring);
          const token_hash = qParams.get("token_hash");
          const type = qParams.get("type");
          if (token_hash && type) {
            const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as any });
            console.log("[AUTH] verifyOtp from deep link:", error ?? "ok");
            if (!error) {
              if (type === "recovery") {
                router.replace("/(auth)/reset-password");
              }
              // For type === "signup", do nothing extra — the confirm-email screen
              // detects the new session via useAuthStore and forwards to onboarding.
            }
            return;
          }
        }

        // --- Fragment path: implicit flow fallback (#access_token=...&refresh_token=...) ---
        const hashIndex = url.indexOf("#");
        if (hashIndex !== -1) {
          const fragment = url.substring(hashIndex + 1);
          const fParams = new URLSearchParams(fragment);
          const access_token = fParams.get("access_token");
          const refresh_token = fParams.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            console.log("[AUTH] setSession from deep link:", error ?? "ok");
          }
        }
      } catch (err) {
        console.warn("[AUTH] handleAuthUrl error:", err);
      }
    };

    Linking.getInitialURL().then(handleAuthUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => handleAuthUrl(url));
    return () => subscription.remove();
  }, []);

  if (!isInitialized) {
    return <LoadingScreen />;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#F0F4F8" },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="course/[id]"
          options={{ animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="lesson/[id]" />
        <Stack.Screen name="salon/[id]" />
        <Stack.Screen name="product/[id]" />
        <Stack.Screen name="book-appointment" />
        <Stack.Screen name="academy-booking" />
        <Stack.Screen name="cart" options={{ presentation: "modal" }} />
        <Stack.Screen name="checkout" options={{ presentation: "modal" }} />
        <Stack.Screen name="marketplace" />
        <Stack.Screen name="orders" />
        <Stack.Screen
          name="live/[id]"
          options={{ animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="appointments" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="legal/[doc]" />
        <Stack.Screen name="courses" />
        <Stack.Screen name="tutorials" options={{ headerShown: false }} />
        <Stack.Screen name="tutorial/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="tutorial-lesson/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
      </Stack>
      <LoyaltyGlobalOverlays />
    </>
  );
}

export default function RootLayout() {
  const [showIntro, setShowIntro] = useState(true);

  // Kick off auth initialization the moment the app mounts — in parallel with
  // font loading and the intro video — instead of waiting for RootLayoutNav to
  // mount after the video ends. By the time the intro finishes, isInitialized is
  // almost always already true, so the LoadingScreen fallback stops appearing as
  // a separate step between the video and the first screen. The ref guard keeps
  // it to a single call (StrictMode double-mounts effects in dev), so we never
  // register two onAuthStateChange listeners.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void useAuthStore.getState().initialize();
  }, []);

  // Wire TanStack Query's focusManager to AppState so refetchOnWindowFocus
  // actually fires when the user returns to the app on React Native.
  // (refetchOnWindowFocus is a no-op in RN without this.)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
      shouldRouteThroughEarpiece: false,
    }).catch((err) => {
      if (__DEV__) console.warn('[audio] setAudioModeAsync failed:', err);
    });
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    "EuclidCircularA-Light": require("../assets/euclid-circular-a/Euclid-Circular-A-Light.ttf"),
    "EuclidCircularA-LightItalic": require("../assets/euclid-circular-a/Euclid-Circular-A-Light-Italic.ttf"),
    "EuclidCircularA-Regular": require("../assets/euclid-circular-a/Euclid-Circular-A-Regular.ttf"),
    "EuclidCircularA-Italic": require("../assets/euclid-circular-a/Euclid-Circular-A-Italic.ttf"),
    "EuclidCircularA-Medium": require("../assets/euclid-circular-a/Euclid-Circular-A-Medium.ttf"),
    "EuclidCircularA-MediumItalic": require("../assets/euclid-circular-a/Euclid-Circular-A-Medium-Italic.ttf"),
    "EuclidCircularA-SemiBold": require("../assets/euclid-circular-a/Euclid-Circular-A-SemiBold.ttf"),
    "EuclidCircularA-SemiBoldItalic": require("../assets/euclid-circular-a/Euclid-Circular-A-SemiBold-Italic.ttf"),
    "EuclidCircularA-Bold": require("../assets/euclid-circular-a/Euclid-Circular-A-Bold.ttf"),
    "EuclidCircularA-BoldItalic": require("../assets/euclid-circular-a/Euclid-Circular-A-Bold-Italic.ttf"),
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      if (fontError) {
        // App continues with system fonts — text may look different but remains functional.
        console.warn("[Fonts] Failed to load EuclidCircularA:", fontError.message);
      }
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  if (showIntro) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StartupVideo onFinish={() => setShowIntro(false)} />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SalonProvider>
            <TutorialProvider>
              <RootLayoutNav />
            </TutorialProvider>
          </SalonProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F4F8",
  },
  blobTopRight: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 500,
    height: 500,
  },
  midBlob: {
    position: "absolute",
    top: "25%",
    left: -100,
    width: 600,
    height: 600,
  },
  blobBottomLeft: {
    position: "absolute",
    bottom: -100,
    left: -140,
    width: 500,
    height: 500,
  },
  contentCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingLogo: {
    width: 160,
    height: 58,
    marginBottom: 32,
  },
  loadingSpinner: {
    marginTop: 8,
  },
});
