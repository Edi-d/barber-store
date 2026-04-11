import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCartStore } from "@/stores/cartStore";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Colors, Bubble, Shadows, Typography, Spacing } from "@/constants/theme";

import ProductHero from "@/components/shop/ProductHero";
import ProductDetails from "@/components/shop/ProductDetails";
import ProductFeatures from "@/components/shop/ProductFeatures";
import ProductDescription from "@/components/shop/ProductDescription";
import ProductActions from "@/components/shop/ProductActions";

// ─── Constants ────────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get("window").width;
// Must match ProductHero's internal IMAGE_HEIGHT (SCREEN_WIDTH * 0.85) for
// accurate scroll-threshold calculations.
const IMAGE_HEIGHT = SCREEN_WIDTH * 0.85;
const NAV_BAR_HEIGHT = 56;

// ─── Main screen ──────────────────────────────────────────
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addItem, totalItems, items } = useCartStore();
  const cartCount = totalItems();

  const [qty, setQty] = useState(1);

  // ─── Data fetching ────────────────────────────────────
  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // ─── Scroll tracking ──────────────────────────────────
  const scrollY = useSharedValue(0);
  const headerHeight = insets.top + NAV_BAR_HEIGHT;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Blur fades in as the hero image scrolls away
  const headerBlurStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(scrollY.value, 0) / (IMAGE_HEIGHT * 0.7), 1),
  }));

  // Title slides + fades in after the image is mostly gone
  const headerTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [IMAGE_HEIGHT * 0.7, IMAGE_HEIGHT * 0.9],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [IMAGE_HEIGHT * 0.7, IMAGE_HEIGHT * 0.9],
          [6, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // ─── Callbacks ────────────────────────────────────────
  const changeQuantity = useCallback((delta: number) => {
    setQty((prev) => Math.max(1, prev + delta));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addItem(product, qty);
    router.back();
  }, [product, qty, addItem, router]);

  // ─── Derived ──────────────────────────────────────────
  const isInCart = product
    ? items.some((item) => item.product_id === product.id)
    : false;

  // ProductHero expects an images array; Supabase only has image_url
  const heroImages = product?.image_url ? [product.image_url] : [];

  // ProductActions uses its own local formatter that expects a plain RON value
  const priceInRon = product ? product.price_cents / 100 : 0;

  const inStock =
    product != null &&
    product.active &&
    (product.stock === null || product.stock > 0);

  // ─── Loading state ────────────────────────────────────
  if (isLoading) {
    return (
      <View style={s.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // ─── Not found ────────────────────────────────────────
  if (!product) {
    return (
      <View style={s.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="cube-outline" size={48} color={Colors.textTertiary} />
        <Text style={s.notFound}>Produsul nu a fost gasit</Text>
      </View>
    );
  }

  // ─── Render ───────────────────────────────────────────
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Scrollable content ──────────────────────────── */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Full-bleed image carousel */}
        <ProductHero
          images={heroImages}
          discountPercent={0}
          inStock={inStock}
          headerHeight={headerHeight}
        />

        {/* 2. Category pill, name, price, low-stock indicator */}
        <ProductDetails
          product={product}
        />

        {/* 3. Trust bar: stock status, delivery, quality */}
        <ProductFeatures inStock={inStock} />

        {/* 4. Expandable description */}
        {!!product.description && (
          <ProductDescription description={product.description} />
        )}
      </Animated.ScrollView>

      {/* ── Sticky bottom bar ───────────────────────────── */}
      {inStock && (
        <ProductActions
          price={priceInRon}
          quantity={qty}
          onQuantityChange={changeQuantity}
          onAddToCart={handleAddToCart}
          bottomInset={insets.bottom}
        />
      )}

      {/* ── Custom header overlay ───────────────────────── */}
      <View
        style={[s.headerContainer, { height: headerHeight }]}
        pointerEvents="box-none"
      >
        {/* Blur background — fades in as user scrolls past the hero */}
        <Animated.View style={[StyleSheet.absoluteFill, headerBlurStyle]}>
          <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(240, 244, 248, 0.45)" },
            ]}
          />
        </Animated.View>

        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          hitSlop={4}
          style={[s.navBtn, { top: insets.top + 8 }, Shadows.lg]}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
        </Pressable>

        {/* Cart button with item badge */}
        <Pressable
          onPress={() => router.push("/cart")}
          hitSlop={4}
          style={[s.navBtn, s.navBtnRight, { top: insets.top + 8 }, Shadows.lg]}
        >
          <Ionicons name="bag-handle-outline" size={20} color={Colors.text} />
          {cartCount > 0 && (
            <View style={s.navBadge}>
              <Text style={s.navBadgeTxt}>{cartCount}</Text>
            </View>
          )}
        </Pressable>

        {/* Title fades in after the image is scrolled away */}
        <Animated.Text
          style={[
            s.headerTitle,
            { top: insets.top + 17, color: Colors.text },
            headerTitleStyle,
          ]}
          numberOfLines={1}
        >
          {product.title}
        </Animated.Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    gap: Spacing.base,
  },
  notFound: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },

  // ── Header overlay ─────────────────────────────────────
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  navBtn: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    ...Bubble.radiiSm,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 11,
  },
  navBtnRight: {
    left: undefined,
    right: 16,
  },
  navBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.text,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  navBadgeTxt: {
    color: Colors.white,
    fontSize: 10,
    fontFamily: "EuclidCircularA-Bold",
  },
  headerTitle: {
    position: "absolute",
    left: 64,
    right: 64,
    textAlign: "center",
    ...Typography.bodySemiBold,
    zIndex: 11,
  },
});
