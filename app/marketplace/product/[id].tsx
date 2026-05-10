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
import { supabase } from '@/lib/supabase';
import { useTierPricing } from '@/hooks/use-tier-pricing';
import { useStockNotifications } from '@/hooks/use-stock-notifications';
import { useMarketplaceCartStore } from '@/hooks/use-marketplace-cart-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CATEGORY_LABELS } from '@/data/types';
import productsFeed from '@/data/products.json';

import ProductHero from '@/components/shop/ProductHero';
import ProductDetails from '@/components/shop/ProductDetails';
import ProductFeatures from '@/components/shop/ProductFeatures';
import ProductDescription from '@/components/shop/ProductDescription';
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
import type { MarketplaceProduct, MarketplaceSection } from '@/hooks/use-marketplace-catalog';

// ─── Constants ───────────────────────────────────────────────────────────────

const USE_LOCAL_FEED = false; // mirrors use-marketplace-catalog.ts
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const HEADER_SCROLL_THRESHOLD = 80;

// ─── Feed helpers ────────────────────────────────────────────────────────────

type FeedProduct = {
  sku: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  images: string[];
  inStock: boolean;
  retailPrice: number;
  partnerPrice: number;
};

function findProductInFeed(sku: string): MarketplaceProduct | null {
  const all = ((productsFeed as unknown as { products: FeedProduct[] }).products ?? []) as FeedProduct[];
  const p = all.find((x) => x.sku === sku);
  if (!p) return null;
  return {
    id: p.sku,
    sku: p.sku,
    name: p.name,
    description: p.description ?? null,
    brand: p.brand ?? null,
    price_cents: Math.round(p.partnerPrice * 100),
    prp_cents: null,
    compare_at_price_cents: null,
    stock_qty: p.inStock ? 50 : 0,
    images: Array.isArray(p.images) ? p.images.filter((u) => typeof u === 'string') : [],
    section: 'professional' as MarketplaceSection,
    is_active: true,
    category_id: p.category ?? null,
    created_at: null,
  };
}

function normalizeImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MarketplaceProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  // ── State ─────────────────────────────────────────────────
  const [product, setProduct] = useState<MarketplaceProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  // ── Hooks ─────────────────────────────────────────────────
  const tierPricing = useTierPricing(id ?? null);
  const stockNotif = useStockNotifications(id ?? null);

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

  // ── Fetch product ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!id) return;

    (async () => {
      setLoading(true);
      setError(null);

      if (USE_LOCAL_FEED) {
        const local = findProductInFeed(id as string);
        if (cancelled) return;
        if (!local) {
          setError('Produsul nu a fost gasit');
          setLoading(false);
          return;
        }
        setProduct(local);
        setLoading(false);
        return;
      }

      const { data, error: err } = await supabase
        .from('marketplace_products')
        .select('id, sku, name, description, brand, price_cents, prp_cents, compare_at_price_cents, stock_qty, images, section, is_active, category_id, created_at')
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      if (!data) {
        setError('Produsul nu a fost gasit');
        setLoading(false);
        return;
      }
      setProduct({
        id: data.id,
        sku: data.sku,
        name: data.name,
        description: data.description ?? null,
        brand: data.brand ?? null,
        price_cents: Number(data.price_cents) || 0,
        prp_cents: data.prp_cents != null ? Number(data.prp_cents) : null,
        compare_at_price_cents: data.compare_at_price_cents != null ? Number(data.compare_at_price_cents) : null,
        stock_qty: Number(data.stock_qty) || 0,
        images: normalizeImages(data.images),
        section: data.section as MarketplaceSection,
        is_active: Boolean(data.is_active),
        category_id: data.category_id ?? null,
        created_at: data.created_at ?? null,
      });
      setLoading(false);
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
            Produsul nu a fost gasit
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
            {error ?? 'Incearca un alt produs din catalog.'}
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
              <Text style={styles.errorBackText}>Inapoi</Text>
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
                  ? 'Te vom anunta - apasa pentru a renunta'
                  : 'Anunta-ma cand e disponibil'}
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
