/**
 * /marketplace/product/[id] — Marketplace PDP
 *
 * Animated.ScrollView with scroll-linked header blur + title fade-in.
 * Reuses: ProductHero, ProductDetails, ProductFeatures, ProductDescription,
 *         ProductActions, TierTable from components/shop/.
 * Data: useMarketplaceCatalog (local feed or Supabase) or direct maybeSingle query.
 * Hooks: useTierPricing, useStockNotifications.
 * Cart: useMarketplaceCartStore.
 *
 * Spec: 03-product-detail.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  Easing,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { GradientBackground } from '@/components/ui/GradientBackground';
import {
  fetchProductDetail,
  type ProductSpecGroup,
  type ProductReviewSummary,
} from '@/lib/nop-catalog';
import { useTierPricing } from '@/hooks/use-tier-pricing';
import { useStockNotifications } from '@/hooks/use-stock-notifications';
import { useMarketplaceCartStore } from '@/hooks/use-marketplace-cart-store';
import { useMarketplaceFavorites } from '@/hooks/use-marketplace-favorites';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CATEGORY_LABELS } from '@/data/types';

import ProductHero from '@/components/shop/ProductHero';
import ProductDetails from '@/components/shop/ProductDetails';
import ProductFeatures from '@/components/shop/ProductFeatures';
import ProductDescription from '@/components/shop/ProductDescription';
import ProductSpecs from '@/components/shop/ProductSpecs';
import ProductReviews from '@/components/shop/ProductReviews';
import ProductActions from '@/components/shop/ProductActions';
import { TierTable } from '@/components/shop/TierTable';

import {
  Brand,
  Bubble,
  Colors,
  FontFamily,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/theme';
import type { MarketplaceProduct } from '@/hooks/use-marketplace-catalog';

// ─── Constants ───────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const HEADER_SCROLL_THRESHOLD = 80;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MarketplaceProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  // ── State ─────────────────────────────────────────────────
  const [product, setProduct] = useState<MarketplaceProduct | null>(null);
  const [specs, setSpecs] = useState<ProductSpecGroup[]>([]);
  const [review, setReview] = useState<ProductReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  // ── Hooks ─────────────────────────────────────────────────
  const tierPricing = useTierPricing(id ?? null);
  const stockNotif = useStockNotifications(id ?? null);

  // Reactive favourite state — re-renders when this product is toggled.
  const isFavorite = useMarketplaceFavorites((s) =>
    product ? s.ids.includes(product.id) : false,
  );

  // ── Scroll-driven header animations ──────────────────────
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerBlurStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, HEADER_SCROLL_THRESHOLD], [0, 1], 'clamp'),
  }));

  const titleFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [HEADER_SCROLL_THRESHOLD - 20, HEADER_SCROLL_THRESHOLD + 40], [0, 1], 'clamp'),
    transform: [
      {
        translateY: interpolate(scrollY.value, [HEADER_SCROLL_THRESHOLD - 20, HEADER_SCROLL_THRESHOLD + 40], [8, 0], 'clamp'),
      },
    ],
  }));

  // ── Fetch product (nopCommerce PDP) ───────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!id) return;

    const productId = Number(id);
    if (!Number.isFinite(productId)) {
      setError('Produsul nu a fost găsit');
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchProductDetail(productId);
        if (cancelled) return;
        if (!result) {
          setError('Produsul nu a fost găsit');
          return;
        }
        setProduct(result.product);
        setSpecs(result.specs);
        setReview(result.review);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Nu am putut încărca produsul');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  // ── Handlers ──────────────────────────────────────────────
  const handleBack = useCallback(() => router.back(), [router]);

  const maxQty = product?.stock_qty ?? 99;

  const changeQuantity = useCallback(
    (delta: number) => {
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setQuantity((prev) => Math.min(Math.max(1, maxQty), Math.max(1, prev + delta)));
    },
    [maxQty],
  );

  const effectiveUnitPrice = useMemo(() => {
    if (!product) return 0;
    return tierPricing.unitPriceFor(quantity, product.price_cents);
  }, [product, quantity, tierPricing]);

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useMarketplaceCartStore.getState().addItem({
      product_id: product.id,
      qty: quantity,
      unit_price_cents: effectiveUnitPrice,
      title_snapshot: product.name,
      image_url: product.images?.[0] ?? null,
      brand: product.brand ?? null,
    });
    router.back();
  }, [product, quantity, router, effectiveUnitPrice]);

  const handleNotifyToggle = useCallback(async () => {
    if (!product) return;
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    if (stockNotif.subscribed) {
      await stockNotif.unsubscribe();
    } else {
      const r = await stockNotif.subscribe(null);
      if (r.ok) {
        Alert.alert('Te vom anunta', `Vei primi o notificare cand ${product.name} este disponibil din nou.`);
      } else {
        Alert.alert('Eroare', r.error ?? 'Nu am putut activa notificarea.');
      }
    }
  }, [product, stockNotif]);

  const handleShare = useCallback(async () => {
    if (!product) return;
    try {
      await Share.share({ message: `${product.name} — Barber Store`, title: product.name });
    } catch {}
  }, [product]);

  const handleToggleFavorite = useCallback(() => {
    if (!product) return;
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    useMarketplaceFavorites.getState().toggle(product.id);
  }, [product]);

  // ── Derived ───────────────────────────────────────────────
  const inStock = (product?.stock_qty ?? 0) > 0;
  const categoryLabel = product?.category_id ? (CATEGORY_LABELS[product.category_id] ?? product.category_id) : undefined;
  const discountPercent = useMemo(() => {
    if (!product?.prp_cents || product.prp_cents <= product.price_cents) return 0;
    return Math.round(((product.prp_cents - product.price_cents) / product.prp_cents) * 100);
  }, [product]);

  // ── Header height for hero ────────────────────────────────
  const headerHeight = insets.top + 56;

  // ── Floating header ───────────────────────────────────────
  const FloatingHeader = (
    <View style={[styles.floatingHeader, { paddingTop: insets.top }]}>
      {/* Blur layer — fades in as user scrolls */}
      <Animated.View style={[StyleSheet.absoluteFill, headerBlurStyle]}>
        <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(240,244,248,0.75)' }]} />
      </Animated.View>

      <View style={styles.floatingHeaderRow}>
        {/* Back */}
        <Pressable
          className="w-10 h-10 rounded-full items-center justify-center border"
          style={{ backgroundColor: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.9)', ...Shadows.sm }}
          onPress={handleBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>

        {/* Fading title */}
        <Animated.Text
          numberOfLines={1}
          style={[styles.headerTitle, { color: colors.text }, titleFadeStyle]}
        >
          {product?.name ?? ''}
        </Animated.Text>

        {/* Favourite */}
        <Pressable
          className="w-10 h-10 rounded-full items-center justify-center border"
          style={{
            backgroundColor: isFavorite ? 'rgba(10,102,194,0.12)' : 'rgba(255,255,255,0.85)',
            borderColor: isFavorite ? Brand.primary : 'rgba(255,255,255,0.9)',
            ...Shadows.sm,
          }}
          onPress={handleToggleFavorite}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="heart" size={18} color={isFavorite ? Brand.primary : colors.text} />
        </Pressable>

        {/* Share */}
        <Pressable
          className="w-10 h-10 rounded-full items-center justify-center border"
          style={{ backgroundColor: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.9)', ...Shadows.sm }}
          onPress={handleShare}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="share-2" size={18} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );

  // ── Loading state ─────────────────────────────────────────
  if (loading) {
    return (
      <GradientBackground>
        <Stack.Screen options={{ headerShown: false }} />
        {FloatingHeader}
        {/* Shimmer placeholder */}
        <View style={{ paddingTop: headerHeight }}>
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonContent}>
            <View style={[styles.skeletonLine, { width: '40%', height: 14 }]} />
            <View style={[styles.skeletonLine, { width: '80%', height: 22, marginTop: 12 }]} />
            <View style={[styles.skeletonLine, { width: '60%', height: 22, marginTop: 6 }]} />
            <View style={[styles.skeletonLine, { width: '35%', height: 32, marginTop: 16 }]} />
          </View>
        </View>
      </GradientBackground>
    );
  }

  // ── Error state ───────────────────────────────────────────
  if (error || !product) {
    return (
      <GradientBackground>
        <Stack.Screen options={{ headerShown: false }} />
        {FloatingHeader}
        <View style={styles.centerFill}>
          <Feather name="alert-circle" size={44} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Produsul nu a fost găsit
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
            {error ?? 'Încearcă un alt produs din catalog.'}
          </Text>
          <Pressable
            onPress={handleBack}
            style={[styles.errorBackOuter, Shadows.glow]}
          >
            <LinearGradient
              colors={[Brand.gradientStart, Brand.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.errorBackGradient}
            >
              <Text style={styles.errorBackText}>Înapoi</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </GradientBackground>
    );
  }

  // ── Main render ───────────────────────────────────────────
  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {FloatingHeader}

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* Hero carousel */}
        <ProductHero
          images={product.images ?? []}
          discountPercent={discountPercent}
          inStock={inStock}
          headerHeight={headerHeight}
        />

        {/* Product details: name, price, stock badge */}
        <ProductDetails
          title={product.name}
          priceCents={effectiveUnitPrice}
          currency="RON"
          stock={product.stock_qty}
          active={product.is_active}
          categoryLabel={categoryLabel}
          isPro={product.section === 'professional'}
          brand={product.brand ?? undefined}
        />

        {/* Rating summary */}
        <ProductReviews review={review} />

        {/* Trust bar */}
        <ProductFeatures
          inStock={inStock}
          brand={product.brand ?? undefined}
        />

        {/* Volume tier table — shown only when tiers exist */}
        {tierPricing.hasTiers && (
          <View className="px-5 mt-3">
            <TierTable
              tiers={tierPricing.tiers}
              currentQty={quantity}
              basePriceCents={product.price_cents}
            />
          </View>
        )}

        {/* Description with expand/collapse */}
        {!!product.description && (
          <ProductDescription
            description={product.description}
            categoryLabel={categoryLabel}
          />
        )}

        {/* Spec sheet */}
        <ProductSpecs groups={specs} />

        {/* Notify-when-in-stock CTA — shown only when out of stock */}
        {!inStock && (
          <View className="px-5 mt-4">
            <Pressable
              className="flex-row items-center justify-center gap-2 py-3 rounded-xl mt-1"
              style={{
                borderWidth: 1.5,
                borderColor: Brand.primary,
                backgroundColor: stockNotif.subscribed ? Brand.primary : 'transparent',
              }}
              onPress={handleNotifyToggle}
            >
              <Feather
                name={stockNotif.subscribed ? 'bell-off' : 'bell'}
                size={16}
                color={stockNotif.subscribed ? '#fff' : Brand.primary}
              />
              <Text
                style={{
                  fontFamily: FontFamily.semiBold,
                  fontSize: 14,
                  color: stockNotif.subscribed ? '#fff' : Brand.primary,
                }}
              >
                {stockNotif.subscribed
                  ? 'Te vom anunța - apasă pentru a renunța'
                  : 'Anunță-mă când e disponibil'}
              </Text>
            </Pressable>
          </View>
        )}
      </Animated.ScrollView>

      {/* Sticky add-to-cart footer — only when in stock */}
      {inStock && (
        <ProductActions
          price={effectiveUnitPrice / 100}
          quantity={quantity}
          onQuantityChange={changeQuantity}
          onAddToCart={handleAddToCart}
          bottomInset={insets.bottom}
          allowRemove={false}
        />
      )}
    </GradientBackground>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Floating header overlay
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  floatingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    height: 56,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    lineHeight: 20,
  },

  // Loading skeleton
  skeletonHero: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.85,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  skeletonContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: 4,
  },
  skeletonLine: {
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.07)',
  },

  // Error / empty states
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h3,
    textAlign: 'center',
  },
  emptyDesc: {
    ...Typography.body,
    textAlign: 'center',
  },
  errorBackOuter: {
    marginTop: Spacing.md,
    ...Bubble.radiiSm,
    overflow: 'hidden',
  },
  errorBackGradient: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...Bubble.radiiSm,
  },
  errorBackText: {
    ...Typography.button,
    color: '#fff',
  },
});
