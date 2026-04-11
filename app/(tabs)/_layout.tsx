import { useEffect, useCallback, useState, useRef, createContext, useContext } from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  Platform,
  LayoutChangeEvent,
} from "react-native";
import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useDerivedValue,
  interpolateColor,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { Colors } from "@/constants/theme";
import { useTutorialContext } from "@/components/tutorial/TutorialProvider";
import useCreateMenu from "@/hooks/useCreateMenu";
import PlusButton from "@/components/shared/PlusButton";
import CreateActionMenu from "@/components/shared/CreateActionMenu";

/* ─── Dimensions ─────────────────────────────────────────── */
const BAR_H = 70;
const BAR_MX = 16;
const BAR_R = 28;
const INDICATOR_W = 32;
const INDICATOR_H = 3;

/* ─── Animation config ──────────────────────────────────── */
const SPRING_SLIDE = { damping: 20, stiffness: 180, mass: 0.8 };
const SPRING_ICON = { damping: 14, stiffness: 200, mass: 0.6 };

/* ─── Tab config ─────────────────────────────────────────── */
const TAB_CFG: Record<
  string,
  {
    icon: keyof typeof Ionicons.glyphMap;
    iconFocused: keyof typeof Ionicons.glyphMap;
    label: string;
  }
> = {
  feed: { icon: "home-outline", iconFocused: "home", label: "Acasa" },
  discover: { icon: "calendar-outline", iconFocused: "calendar", label: "Programari" },
  shop: { icon: "bag-outline", iconFocused: "bag", label: "Magazin" },
  profile: { icon: "person-outline", iconFocused: "person", label: "Profil" },
};

/* ─── Create menu context ───────────────────────────────── */
const CreateMenuContext = createContext<ReturnType<typeof useCreateMenu> | null>(null);

/* ─── Animated tab item ─────────────────────────────────── */
function AnimatedTab({
  name,
  focused,
  onPress,
  onLayout,
  cartCount,
  tabRef,
}: {
  name: string;
  focused: boolean;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
  cartCount?: number;
  tabRef?: React.RefObject<View>;
}) {
  const cfg = TAB_CFG[name];
  if (!cfg) return null;

  const scale = useSharedValue(focused ? 1 : 0.85);
  const focusProgress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    scale.value = withSpring(focused ? 1 : 0.85, SPRING_ICON);
    focusProgress.value = withSpring(focused ? 1 : 0, {
      damping: 22,
      stiffness: 160,
    });
  }, [focused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value * 0.6 + 0.4,
    transform: [{ translateY: (1 - focusProgress.value) * 2 }],
  }));

  const colorAnimated = useDerivedValue(() =>
    interpolateColor(
      focusProgress.value,
      [0, 1],
      [Colors.textTertiary, Colors.gradientStart]
    )
  );

  const iconColorStyle = useAnimatedStyle(() => ({
    color: colorAnimated.value,
  }));

  return (
    <TouchableOpacity
      ref={tabRef as React.RefObject<any>}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onLayout={onLayout}
      style={styles.tabItem}
      activeOpacity={0.7}
    >
      <Animated.View style={iconStyle}>
        <View>
          <Animated.Text style={iconColorStyle}>
            <Ionicons name={focused ? cfg.iconFocused : cfg.icon} size={22} />
          </Animated.Text>
          {name === "shop" && (cartCount ?? 0) > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {(cartCount ?? 0) > 9 ? "9+" : cartCount}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
      <Animated.Text style={[styles.tabLabel, labelStyle, iconColorStyle]}>
        {cfg.label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

/* ─── Custom glass tab bar ───────────────────────────────── */
function GlassTabBar({
  state,
  navigation,
}: {
  state: any;
  descriptors: any;
  navigation: any;
  insets: any;
}) {
  const safeInsets = useSafeAreaInsets();
  const { totalItems } = useCartStore();
  const tabBarHidden = useUIStore((s) => s.tabBarHidden);
  const cartCount = totalItems();
  const bottom = Math.max(safeInsets.bottom - 12, 6);

  /* ── Tutorial ref registration ── */
  const { registerRef } = useTutorialContext();
  const feedRef = useRef<View>(null);
  const discoverRef = useRef<View>(null);
  const shopRef = useRef<View>(null);
  const profileRef = useRef<View>(null);

  const TAB_REFS: Record<string, React.RefObject<View>> = {
    feed: feedRef,
    discover: discoverRef,
    shop: shopRef,
    profile: profileRef,
  };

  useEffect(() => {
    registerRef('tab-feed', feedRef);
    registerRef('tab-discover', discoverRef);
    registerRef('tab-shop', shopRef);
    registerRef('tab-profile', profileRef);
  }, []);

  /* ── Indicator position tracking ── */
  const indicatorX = useSharedValue(0);
  const [tabLayouts] = useState<Record<string, { x: number; width: number }>>(
    {}
  );

  const updateIndicator = useCallback(
    (tabName: string) => {
      const layout = tabLayouts[tabName];
      if (layout) {
        indicatorX.value = withSpring(
          layout.x + layout.width / 2 - INDICATOR_W / 2,
          SPRING_SLIDE
        );
      }
    },
    [tabLayouts]
  );

  const activeRouteName = state.routes[state.index]?.name;

  useEffect(() => {
    if (activeRouteName) updateIndicator(activeRouteName);
  }, [activeRouteName, updateIndicator]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const handleTabLayout = useCallback(
    (name: string, e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      tabLayouts[name] = { x, width };
      if (name === activeRouteName) updateIndicator(name);
    },
    [activeRouteName, updateIndicator]
  );

  const barTranslateY = useSharedValue(0);
  useEffect(() => {
    barTranslateY.value = withSpring(tabBarHidden ? BAR_H + 40 : 0, {
      damping: 22,
      stiffness: 400,
      mass: 0.6,
    });
  }, [tabBarHidden]);

  const barAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: barTranslateY.value }],
  }));

  /* ── Create menu (shared via context from TabsLayout) ── */
  const createMenu = useContext(CreateMenuContext)!;
  const createMenuOpen = useUIStore((s) => s.createMenuOpen);

  return (
    <Animated.View style={[styles.barWrapper, { bottom }, barAnimStyle]} pointerEvents={tabBarHidden ? "none" : "box-none"}>
      <View style={styles.barGlass}>
        {Platform.OS === "ios" && (
          <BlurView
            intensity={60}
            tint="systemChromeMaterialLight"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={styles.glassOverlay} />

        {/* Sliding indicator */}
        <Animated.View style={[styles.indicator, indicatorStyle]}>
          <LinearGradient
            colors={[Colors.primaryLight, Colors.gradientStart]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.indicatorGradient}
          />
        </Animated.View>

        <View style={styles.barRow}>
          {state.routes.map((route: any, index: number) => {
            // Reserve space for the center FAB placeholder — PlusButton renders above
            if (route.name === "create") {
              return <View key={route.key} style={styles.fabPlaceholder} />;
            }

            const cfg = TAB_CFG[route.name];
            if (!cfg) return null;

            const focused = state.index === index;

            return (
              <AnimatedTab
                key={route.key}
                name={route.name}
                focused={focused}
                cartCount={route.name === "shop" ? cartCount : undefined}
                tabRef={TAB_REFS[route.name]}
                onLayout={(e) => handleTabLayout(route.name, e)}
                onPress={() => {
                  if (route.name === "create") return; // handled by PlusButton
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
              />
            );
          })}
        </View>
      </View>

      {/* Center FAB — outside barGlass to avoid overflow:hidden clipping */}
      <PlusButton
        onPress={() => {
          if (createMenuOpen) {
            createMenu.closeMenu();
          } else {
            createMenu.openMenu();
          }
        }}
        onPressIn={createMenu.onFabPressIn}
        onPressOut={createMenu.onFabPressOut}
        fabAnimatedStyle={createMenu.fabAnimatedStyle}
        isOpen={createMenuOpen}
      />
    </Animated.View>
  );
}

/* ─── Tab Layout ─────────────────────────────────────────── */
export default function TabsLayout() {
  const { fetchCart } = useCartStore();
  const { session, isInitialized } = useAuthStore();
  const createMenu = useCreateMenu();

  useEffect(() => {
    fetchCart();
  }, []);

  // Auth guard: once the store has resolved the initial session, redirect
  // unauthenticated users. This also fires reactively when a session expires
  // or the user signs out, because authStore updates `session` via its own
  // onAuthStateChange listener.
  useEffect(() => {
    if (!isInitialized) return;
    if (!session) {
      router.replace("/(auth)/welcome");
    }
  }, [session, isInitialized]);

  return (
    <CreateMenuContext.Provider value={createMenu}>
      <Tabs
        initialRouteName="discover"
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <GlassTabBar {...props} />}
      >
        <Tabs.Screen name="feed" />
        <Tabs.Screen name="discover" />
        <Tabs.Screen name="create" options={{ href: null }} />
        <Tabs.Screen name="shop" />
        <Tabs.Screen name="profile" />
      </Tabs>
      <CreateActionMenu
        menuProgress={createMenu.menuProgress}
        backdropAnimatedStyle={createMenu.backdropAnimatedStyle}
        closeMenu={createMenu.closeMenu}
        fabAnimatedStyle={createMenu.fabAnimatedStyle}
        onFabPressIn={createMenu.onFabPressIn}
        onFabPressOut={createMenu.onFabPressOut}
      />
    </CreateMenuContext.Provider>
  );
}

/* ─── Styles ─────────────────────────────────────────────── */
const styles = StyleSheet.create({
  barWrapper: {
    position: "absolute",
    left: BAR_MX,
    right: BAR_MX,
    height: BAR_H,
    alignItems: "center",
  },
  barGlass: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: BAR_H,
    borderRadius: BAR_R,
    overflow: "hidden",
    zIndex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.9)",
    ...Platform.select({
      ios: {
        shadowColor: "#1A1A2E",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
      },
      android: { elevation: 12 },
    }),
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  indicator: {
    position: "absolute",
    bottom: 6,
    left: 0,
    width: INDICATOR_W,
    height: INDICATOR_H,
    borderRadius: INDICATOR_H / 2,
    zIndex: 1,
  },
  indicatorGradient: {
    flex: 1,
    borderRadius: INDICATOR_H / 2,
  },
  barRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 8,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    minWidth: 52,
  },
  fabPlaceholder: {
    width: 68,  // matches FAB.pedestalSize — reserves correct space for the + button
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: "EuclidCircularA-Medium",
    marginTop: 3,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: Colors.gradientStart,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "EuclidCircularA-Bold",
    lineHeight: 12,
  },
});
