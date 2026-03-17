import "../global.css";
import { useEffect, useCallback } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Image, ActivityIndicator, StyleSheet } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useAuthStore } from "@/stores/authStore";
import Constants from "expo-constants";

// LiveKit requires native modules — skip entirely in Expo Go
if (Constants.appOwnership !== "expo") {
  require("@livekit/react-native").registerGlobals();
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

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
          source={require("@/assets/image-removebg-preview.png")}
          style={styles.loadingLogo}
          resizeMode="contain"
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

function RootLayoutNav() {
  const { isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
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
        <Stack.Screen name="cart" />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="go-live" />
        <Stack.Screen
          name="live/[id]"
          options={{ animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="settings" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "EuclidCircularA-Light": require("../assets/euclid-circular-a/Euclid Circular A Light.ttf"),
    "EuclidCircularA-LightItalic": require("../assets/euclid-circular-a/Euclid Circular A Light Italic.ttf"),
    "EuclidCircularA-Regular": require("../assets/euclid-circular-a/Euclid Circular A Regular.ttf"),
    "EuclidCircularA-Italic": require("../assets/euclid-circular-a/Euclid Circular A Italic.ttf"),
    "EuclidCircularA-Medium": require("../assets/euclid-circular-a/Euclid Circular A Medium.ttf"),
    "EuclidCircularA-MediumItalic": require("../assets/euclid-circular-a/Euclid Circular A Medium Italic.ttf"),
    "EuclidCircularA-SemiBold": require("../assets/euclid-circular-a/Euclid Circular A SemiBold.ttf"),
    "EuclidCircularA-SemiBoldItalic": require("../assets/euclid-circular-a/Euclid Circular A SemiBold Italic.ttf"),
    "EuclidCircularA-Bold": require("../assets/euclid-circular-a/Euclid Circular A Bold.ttf"),
    "EuclidCircularA-BoldItalic": require("../assets/euclid-circular-a/Euclid Circular A Bold Italic.ttf"),
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <RootLayoutNav />
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
