/**
 * /marketplace — barber-store.ro marketplace home screen.
 *
 * Layout (top to bottom), mirroring the web shop section order so
 * customers familiar with barber-store.ro recognize it instantly:
 *
 *   1. Custom header  — MENIU (left) + CAUTA + COS (right)
 *   2. Hero carousel  — 4:3 aspect, dot indicator, hardcoded slides
 *   3. 2-up promo cards
 *   4. Categorii grid — 3 cols, first 6 top-level, + VEDERE TOATE CTA
 *   5. Filter pivots + dynamic product carousel
 *   6. Featured brands scroll (is_featured = true)
 *   7. Produse noi scroll (created_at DESC, deduped)
 *   8. Trust badges (2x2 grid)
 *
 * All sections cascade in with FadeInDown at 60ms stagger.
 * Colors: `Colors[colorScheme]` (nested dual-mode object in theme.ts).
 * NativeWind className for layout; style={} only for shadows/rgba/asymmetric radii.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { GradientBackground } from '@/components/ui/GradientBackground';
import { MarketplaceProductCard } from '@/components/marketplace/MarketplaceProductCard';
import { MarketplaceDrawer } from '@/components/marketplace/MarketplaceDrawer';
import { MarketplaceCartModal } from '@/components/marketplace/MarketplaceCartModal';
import { MarketplaceSearchModal } from '@/components/marketplace/MarketplaceSearchModal';
import { TrustBadgesGrid } from '@/components/marketplace/TrustBadgesGrid';
import {
  useMarketplaceCatalog,
  type MarketplaceBrand,
  type MarketplaceCategory,
} from '@/hooks/use-marketplace-catalog';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMarketplaceCartStore } from '@/hooks/use-marketplace-cart-store';
import { useUIStore } from '@/stores/uiStore';
import { SLIDE_IN_DOWN } from '@/lib/animations';
import {
  Brand,
  Bubble,
  Colors,
  FontFamily,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Feather icon hint per top-level category slug
const CATEGORY_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  aparatura: 'zap',
  foarfeci: 'scissors',
  'piepteni-si-perii': 'wind',
  'ingrijirea-parului': 'droplet',
  'ingrijirea-corpului': 'heart',
  'barba-si-mustata': 'user',
  'produse-igiena': 'shield',
  // local feed category slugs
  clippers: 'zap',
  trimmers: 'zap',
  wax: 'droplet',
  combs: 'align-justify',
  aftershave: 'heart',
  fragrance: 'wind',
  shampoo: 'droplet',
  care: 'droplet',
  grooming: 'user',
  shaving: 'user',
  hygiene: 'shield',
  brushes: 'wind',
  accessories: 'package',
  gel: 'droplet',
  spray: 'wind',
  cream: 'droplet',
  powder: 'package',
};

// Tinted circle background per top-level category
const CATEGORY_TINT: Record<string, string> = {
  aparatura: '#E5E7EB',
  foarfeci: '#F3D5D8',
  'piepteni-si-perii': '#E0E2E8',
  'ingrijirea-parului': '#E8DDC8',
  'ingrijirea-corpului': '#DDE8DD',
  'barba-si-mustata': '#3D2820',
  'produse-igiena': '#D7E3EE',
  // local feed
  clippers: '#E5E7EB',
  trimmers: '#E5E7EB',
  wax: '#E8DDC8',
  combs: '#EBE0F0',
  aftershave: '#DDE8DD',
  fragrance: '#F3D5D8',
  shampoo: '#D7E3EE',
  care: '#E8DDC8',
  grooming: '#F3D5D8',
  shaving: '#E5E7EB',
  hygiene: '#D7E3EE',
  brushes: '#E0E2E8',
  accessories: '#F3D5D8',
  gel: '#E8DDC8',
  spray: '#E0E2E8',
  cream: '#FCE6D6',
  powder: '#E5E7EB',
};

// ─── Filter pivots ──────────────────────────────────────
type FilterPivot = {
  key: string;
  label: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  categorySlug?: string;
  sort?: 'popular';
};

const FILTER_PIVOTS: FilterPivot[] = [
  { key: 'transport-gratuit', label: 'TRANSPORT GRATUIT', minPriceCents: 30000 },
  { key: 'sub-50',            label: 'SUB 50 DE LEI',     maxPriceCents: 5000 },
  // 'promo' slug exists in local feed; production feed uses 'seturi-combo'
  { key: 'seturi-combo',      label: 'SETURI COMBO',      categorySlug: 'promo' },
  { key: 'best-sellers',      label: 'BEST SELLERS',      sort: 'popular' },
  // 'hygiene' slug in local feed; production feed uses 'produse-igiena'
  { key: 'consumabile',       label: 'CONSUMABILE',       categorySlug: 'hygiene' },
  // 'chairs' slug in local feed; production feed uses 'scaune-frizerie'
  { key: 'scaune-frizerie',   label: 'SCAUNE FRIZERIE',   categorySlug: 'chairs' },
];

// ─── Hero slides ────────────────────────────────────────
type HeroSlide = {
  key: string;
  image: ImageSourcePropType;
  route?: string;
};

const HERO_SLIDES: HeroSlide[] = [
  { key: 'hero-1', image: require('@/assets/hero.webp') },
  { key: 'hero-2', image: require('@/assets/hero2.webp') },
];

// ─── Screen ─────────────────────────────────────────────
export default function MarketplaceHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  // Catalog data
  const { products, categories, brands, loading, refetch } =
    useMarketplaceCatalog('consumer');

  // Cart badge — read total from Zustand store (property not function)
  const cartTotalItems = useMarketplaceCartStore((s) => s.totalItems());

  // Sync marketplace cart count to uiStore for tab badge
  const setMarketplaceCartCount = useUIStore((s) => s.setMarketplaceCartCount);
  const marketplaceCartOpen = useUIStore((s) => s.marketplaceCartOpen);
  const setMarketplaceCartOpen = useUIStore((s) => s.setMarketplaceCartOpen);

  useEffect(() => {
    setMarketplaceCartCount(cartTotalItems);
  }, [cartTotalItems, setMarketplaceCartCount]);

  // Derived catalog slices
  const topCategories = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories],
  );

  const featuredProducts = useMemo(
    () => products.filter((p) => p.stock_qty > 0).slice(0, 8),
    [products],
  );

  const newProducts = useMemo(() => {
    const featuredIds = new Set(featuredProducts.map((p) => p.id));
    return [...products]
      .filter((p) => p.stock_qty > 0 && !featuredIds.has(p.id))
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .slice(0, 10);
  }, [products, featuredProducts]);

  const featuredBrands = useMemo(
    () => brands.filter((b) => b.is_featured),
    [brands],
  );

  // ── Filter pivots state ────────────────────────────────
  const [activeFilterKey, setActiveFilterKey] = useState<string>('best-sellers');
  const activeFilter = FILTER_PIVOTS.find((f) => f.key === activeFilterKey) ?? FILTER_PIVOTS[0];

  const filteredProducts = useMemo(() => {
    if (!activeFilter) return [];
    let list = products.filter((p) => p.stock_qty > 0);

    if (activeFilter.minPriceCents != null) {
      list = list.filter((p) => p.price_cents >= activeFilter.minPriceCents!);
    }
    if (activeFilter.maxPriceCents != null) {
      list = list.filter((p) => p.price_cents <= activeFilter.maxPriceCents!);
    }
    if (activeFilter.categorySlug) {
      const cat = categories.find((c) => c.slug === activeFilter.categorySlug);
      if (cat) {
        const descendants = new Set<string>([cat.id]);
        for (const c of categories) {
          if (c.parent_id === cat.id) descendants.add(c.id);
        }
        list = list.filter((p) => p.category_id && descendants.has(p.category_id));
      } else {
        // Category slug not found in this feed — return empty so Slice 2 can
        // hide this pivot if it chooses, but we don't force an error state.
        list = [];
      }
    }
    if (activeFilter.sort === 'popular') {
      // Local feed has no popularity/sales signal; fall back to a stable
      // alphabetical sort so "BEST SELLERS" always shows ≥ 20 products.
      list = [...list].sort((a, b) => a.sku.localeCompare(b.sku));
      // Guarantee at least 20 items even if some other filter narrowed the list.
      if (list.length === 0) {
        list = products
          .filter((p) => p.stock_qty > 0)
          .slice()
          .sort((a, b) => a.sku.localeCompare(b.sku));
      }
    }
    return list.slice(0, 20);
  }, [activeFilter, products, categories]);

  // ── Drawer visibility (local — not cross-screen) ───────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleOpenDrawer = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setDrawerOpen(true);
  }, []);

  const handleSearchPress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setSearchOpen(true);
  }, []);

  const handleCartPress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setMarketplaceCartOpen(true);
  }, [setMarketplaceCartOpen]);

  // ── Navigation handlers ────────────────────────────────
  const handleCategoryPress = useCallback(
    (slug: string) => {
      Haptics.selectionAsync().catch(() => {});
      router.push(`/marketplace/category/${slug}` as never);
    },
    [router],
  );

  const handleProductPress = useCallback(
    (productId: string) => {
      router.push(`/marketplace/product/${productId}` as never);
    },
    [router],
  );

  const handleBrandPress = useCallback(
    (slug: string) => {
      Haptics.selectionAsync().catch(() => {});
      router.push(`/marketplace/brand/${slug}` as never);
    },
    [router],
  );

  // ── Hero carousel scroll tracking ─────────────────────
  const [heroIndex, setHeroIndex] = useState(0);
  const onHeroScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const w = e.nativeEvent.layoutMeasurement.width;
      if (w === 0) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / w);
      setHeroIndex(idx);
    },
    [],
  );

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Custom header — MENIU left, CAUTA+COS right ── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        {/* MENIU — opens left-slide drawer */}
        <TouchableOpacity
          onPress={handleOpenDrawer}
          activeOpacity={0.65}
          style={styles.headerSlot}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Feather name="menu" size={22} color={colors.text} />
          <Text style={[styles.headerLabel, { color: colors.textSecondary }]}>
            MENIU
          </Text>
        </TouchableOpacity>

        {/* CAUTA + COS — right group */}
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={handleSearchPress}
            activeOpacity={0.65}
            style={styles.headerSlot}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="search" size={22} color={colors.text} />
            <Text style={[styles.headerLabel, { color: colors.textSecondary }]}>
              CAUTA
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleCartPress}
            activeOpacity={0.65}
            style={styles.headerSlot}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <View>
              <Feather name="shopping-bag" size={22} color={colors.text} />
              {cartTotalItems > 0 ? (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>
                    {cartTotalItems > 99 ? '99+' : cartTotalItems}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.headerLabel, { color: colors.textSecondary }]}>
              COS
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 80 + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            tintColor={Brand.primary}
          />
        }
      >
        {/* ── 1. Hero carousel ── */}
        <Animated.View entering={SLIDE_IN_DOWN(0)} style={styles.heroSection}>
          {/*
            style={{ width: SCREEN_WIDTH }} is required on the horizontal ScrollView
            so that pagingEnabled snaps at exactly SCREEN_WIDTH intervals.
            Without it the ScrollView auto-sizes to content and loses snap alignment.
          */}
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onHeroScrollEnd}
            decelerationRate="fast"
            style={{ width: SCREEN_WIDTH }}
          >
            {HERO_SLIDES.map((slide) => (
              <View key={slide.key} style={styles.heroSlide}>
                {/*
                  Bubble.radii gives the organic asymmetric corners (25/12/25/25).
                  overflow:'hidden' is applied inline to guarantee it comes after
                  the radius values in the style array so the image is correctly
                  clipped to the bubble shape.
                */}
                <View
                  style={[
                    styles.hero,
                    Bubble.radii,
                    { overflow: 'hidden' },
                  ]}
                >
                  <Image
                    source={slide.image}
                    style={styles.heroImage}
                    resizeMode="cover"
                  />
                </View>
              </View>
            ))}
          </ScrollView>
          {/* Dot indicator — always visible and centered below carousel */}
          <View style={styles.heroDots} pointerEvents="none">
            {HERO_SLIDES.map((s, idx) => (
              <View
                key={s.key}
                style={[
                  styles.heroDot,
                  idx === heroIndex && styles.heroDotActive,
                ]}
              />
            ))}
          </View>
        </Animated.View>

        {/* ── 2. 2-up promo cards ── */}
        {/*
          NativeWind className="flex-row" handles the row axis.
          gap + paddingHorizontal + marginBottom stay in style={} because they
          reference Spacing tokens (Spacing.sm = 8, Spacing.lg = 20) which have
          no exact px-* NativeWind equivalent in this tailwind config.
        */}
        <Animated.View
          entering={SLIDE_IN_DOWN(60)}
          className="flex-row"
          style={{
            gap: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            marginBottom: Spacing.lg,
          }}
        >
          <PromoCard image={require('@/assets/patrat-stanga.webp')} />
          <PromoCard image={require('@/assets/patrat-dreapta.webp')} />
        </Animated.View>

        {/* ── 3. Categorii ── */}
        <Animated.View entering={SLIDE_IN_DOWN(120)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Categorii
            </Text>
          </View>
          {topCategories.length === 0 ? (
            loading ? (
              <ActivityIndicator size="small" color={Brand.primary} />
            ) : (
              <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
                Categoriile vor aparea aici dupa import.
              </Text>
            )
          ) : (
            <>
              <View>
                {(() => {
                  const rows: typeof topCategories[] = [];
                  const capped = topCategories.slice(0, 6);
                  for (let i = 0; i < capped.length; i += 3) {
                    rows.push(capped.slice(i, i + 3));
                  }
                  return rows.map((row, rIdx) => (
                    <View
                      key={rIdx}
                      style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}
                    >
                      {row.map((cat) => (
                        <View key={cat.id} style={{ flex: 1 }}>
                          <CategoryTile
                            category={cat}
                            onPress={() => handleCategoryPress(cat.slug)}
                            colors={colors}
                          />
                        </View>
                      ))}
                      {row.length < 3 &&
                        Array.from({ length: 3 - row.length }).map((_, si) => (
                          <View key={`spacer-${si}`} style={{ flex: 1 }} />
                        ))}
                    </View>
                  ));
                })()}
              </View>
              {topCategories.length > 0 && (
                <TouchableOpacity
                  onPress={() => router.push('/marketplace/categories' as never)}
                  activeOpacity={0.85}
                  style={[
                    styles.viewAllCta,
                    Bubble.radiiSm,
                    { backgroundColor: colors.background, borderColor: colors.inputBorder },
                  ]}
                >
                  <Text style={[styles.viewAllText, { color: Brand.primary }]}>
                    VEDERE TOATE
                  </Text>
                  <Feather name="chevron-right" size={16} color={Brand.primary} />
                </TouchableOpacity>
              )}
            </>
          )}
        </Animated.View>

        {/* ── 4. Filter pivots + dynamic product carousel ── */}
        <Animated.View entering={SLIDE_IN_DOWN(180)} style={styles.filterSection}>
          {/* Filter chips row — 6 chips, horizontal scroll, Bubble.radiiSm */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipsRow}
          >
            {FILTER_PIVOTS.map((f) => {
              const active = f.key === activeFilterKey;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setActiveFilterKey(f.key);
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
                >
                  <View
                    style={[
                      styles.filterChip,
                      Bubble.radiiSm,
                      active
                        ? {
                            backgroundColor: Brand.primary,
                            borderColor: Brand.primary,
                            borderBottomColor: Brand.primary,
                          }
                        : {
                            backgroundColor: '#FFFFFF',
                            borderColor: 'rgba(10,102,194,0.30)',
                            borderBottomColor: Brand.primary,
                          },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: active ? Brand.white : colors.text },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Section title — fixed size so it doesn't balloon */}
          <View style={styles.filterTitleWrap}>
            <Text style={[styles.filterTitle, { color: colors.text }]}>
              {activeFilter?.label ?? ''}
            </Text>
          </View>

          {/* Product carousel */}
          {filteredProducts.length === 0 ? (
            <Text style={[styles.filterEmptyHint, { color: colors.textTertiary }]}>
              Nicio potrivire pentru filtrul curent.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterProductsRow}
            >
              {filteredProducts.map((p) => (
                <View key={p.id} style={styles.filterProductWrap}>
                  <MarketplaceProductCard
                    product={p}
                    onPress={() => handleProductPress(p.id)}
                    width={FILTER_CARD_W}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </Animated.View>

        {/* ── 5. Branduri ── */}
        {featuredBrands.length > 0 && (
          <Animated.View entering={SLIDE_IN_DOWN(240)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Branduri
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.brandsRow}
            >
              {featuredBrands.map((b) => (
                <BrandChip
                  key={b.id}
                  brand={b}
                  onPress={() => handleBrandPress(b.slug)}
                  colors={colors}
                />
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* ── 6. Produse noi ── */}
        {newProducts.length > 0 && (
          <Animated.View entering={SLIDE_IN_DOWN(300)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Produse noi
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.newProductsRow}
            >
              {newProducts.map((p) => (
                <View key={p.id} style={styles.newProductWrap}>
                  <MarketplaceProductCard
                    product={p}
                    onPress={() => handleProductPress(p.id)}
                  />
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* ── 7. Trust badges ── */}
        <Animated.View
          entering={SLIDE_IN_DOWN(360)}
          style={{ marginBottom: Spacing.xl }}
        >
          <TrustBadgesGrid />
        </Animated.View>
      </ScrollView>

      {/* ── Overlays — rendered outside ScrollView so they layer above all content ── */}

      {/* Left-slide drawer */}
      <MarketplaceDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Cart modal — driven by uiStore so tab badge can also trigger it */}
      <MarketplaceCartModal
        visible={marketplaceCartOpen}
        onClose={() => setMarketplaceCartOpen(false)}
      />

      {/* Search overlay */}
      <MarketplaceSearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </GradientBackground>
  );
}

// ─── CategoryTile ────────────────────────────────────────
function CategoryTile({
  category,
  onPress,
  colors,
}: {
  category: MarketplaceCategory;
  onPress: () => void;
  colors: typeof Colors.light;
}) {
  const iconName: keyof typeof Feather.glyphMap =
    CATEGORY_ICON[category.slug] ?? 'package';
  const tint = CATEGORY_TINT[category.slug] ?? '#E5E7EB';
  // Luminance check on red channel: R < 96 means dark tint -> use white icon
  const rChannel = parseInt(tint.slice(1, 3), 16);
  const isDarkTint = rChannel < 96;
  const iconColor = isDarkTint ? '#FFFFFF' : Brand.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryTileShadow,
        Shadows.sm,
        { borderRadius: 26, opacity: pressed ? 0.88 : 1, overflow: 'hidden' },
      ]}
    >
      <View
        style={[
          styles.categoryTile,
          { backgroundColor: colors.background, borderRadius: 26 },
        ]}
      >
        <View style={[styles.categoryCircle, { backgroundColor: tint }]}>
          {category.image_url ? (
            <Image
              source={{ uri: category.image_url }}
              style={styles.categoryImage}
              resizeMode="contain"
            />
          ) : (
            <Feather name={iconName} size={28} color={iconColor} />
          )}
        </View>
        <Text
          style={[styles.categoryLabel, { color: colors.text }]}
          numberOfLines={2}
        >
          {category.title_ro.toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── BrandChip ────────────────────────────────────────────
function BrandChip({
  brand,
  onPress,
  colors,
}: {
  brand: MarketplaceBrand;
  onPress: () => void;
  colors: typeof Colors.light;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.brandChipShadow,
        Bubble.radiiSm,
        Shadows.sm,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.brandChip, Bubble.radiiSm, { backgroundColor: '#FFFFFF' }]}>
        {brand.logo_url ? (
          <Image
            source={{ uri: brand.logo_url }}
            style={styles.brandLogo}
            resizeMode="contain"
          />
        ) : (
          <Text style={[styles.brandName, { color: colors.text }]} numberOfLines={2}>
            {brand.name}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── PromoCard ────────────────────────────────────────────
/**
 * Two-layer structure to avoid the iOS shadow+clip conflict:
 *   Outer View — carries Shadows.glow + Bubble.radii, NO overflow:hidden
 *                (iOS shadow renders freely from this layer)
 *   Inner View — carries overflow:'hidden' + Bubble.radii to clip the image
 *                to the exact organic shape (no shadow props here)
 */
function PromoCard({ image }: { image: ImageSourcePropType }) {
  return (
    <View style={[styles.promoCardShadow, Bubble.radii, Shadows.glow]}>
      <View style={[styles.promoCardClip, Bubble.radii, { overflow: 'hidden' }]}>
        <Image source={image} resizeMode="cover" style={styles.promoCardImage} />
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────
const NEW_PRODUCT_CARD_W = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2;
// Filter-pivot carousel: fixed 155px so ~2.5 cards peek at the right edge,
// creating a clear horizontal scroll affordance regardless of screen width.
const FILTER_CARD_W = 155;
const HERO_SLIDE_W = SCREEN_WIDTH;
// Each promo card: half of (screen - 2x horizontal padding - 1 gap between cards)
const PROMO_CARD_W = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2;

const styles = StyleSheet.create({
  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerSlot: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
  },
  headerLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },

  // Cart badge
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#B51F29',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // Scroll container
  scrollContent: {
    paddingTop: Spacing.sm,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
    fontSize: 17,
  },
  emptyHint: {
    ...Typography.caption,
    paddingVertical: Spacing.lg,
    textAlign: 'center',
  },

  // ── Hero carousel ──
  heroSection: {
    marginBottom: Spacing.lg,
  },
  heroSlide: {
    // Each page = full screen width; horizontal padding insets the visible image
    width: HERO_SLIDE_W,
    paddingHorizontal: Spacing.lg,
  },
  hero: {
    width: '100%',
    aspectRatio: 4 / 3,
    // overflow:'hidden' intentionally NOT set here — applied inline alongside
    // Bubble.radii in JSX so the clip layer is guaranteed to have both properties.
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroDots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(10,102,194,0.25)',
  },
  heroDotActive: {
    width: 18,
    backgroundColor: Brand.primary,
  },

  // ── Promo cards ──
  // Shadow wrapper — NO overflow:hidden so the iOS shadow renders freely
  promoCardShadow: {
    width: PROMO_CARD_W,
    aspectRatio: 1,
    // Bubble.radii + Shadows.glow applied inline in JSX
  },
  // Clip layer — overflow:'hidden' + Bubble.radii shapes the image
  promoCardClip: {
    width: '100%',
    height: '100%',
    // Bubble.radii + overflow:'hidden' applied inline in JSX
  },
  promoCardImage: {
    width: '100%',
    height: '100%',
  },

  // ── Categories grid ──
  // categoriesGrid no longer used — rows rendered via chunked Option B pattern
  categoryTileShadow: {
    flex: 1,
    // Bubble.radii + overflow:'hidden' applied inline — no uniform borderRadius here
  },
  categoryTile: {
    width: '100%',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    // borderRadius intentionally omitted — parent Pressable clips with Bubble.radii
  },
  categoryCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  categoryImage: {
    width: '90%',
    height: '90%',
  },
  categoryLabel: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    minHeight: 28,
    letterSpacing: 0.4,
  },

  // VEDERE TOATE CTA — Bubble.radiiSm applied inline via JSX style merge
  viewAllCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    // borderRadius comes from Bubble.radiiSm applied in JSX style array
  },
  viewAllText: {
    fontFamily: FontFamily.bold,
    fontSize: 12,
    letterSpacing: 0.5,
  },

  // ── Brands ──
  brandsRow: {
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.lg,
    gap: Spacing.sm,
  },
  brandChipShadow: {
    // Bubble.radiiSm applied inline
  },
  brandChip: {
    width: 120,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    // Bubble.radiiSm applied inline
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: Spacing.sm,
  },
  brandLogo: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // ── New products ──
  newProductsRow: {
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.lg,
    gap: Spacing.sm,
  },
  newProductWrap: {
    width: NEW_PRODUCT_CARD_W,
  },

  // ── Filter section ──
  filterSection: {
    marginBottom: Spacing.lg,
  },
  filterChipsRow: {
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.lg,
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: Spacing.base,
    paddingVertical: 10,
    // Bubble.radiiSm applied inline. Shadow intentionally omitted — iOS drops
    // shadows under asymmetric borderRadius, so the lifted feel is built from
    // a visible blue ring + heavier Brand.primary bottom-accent border.
    borderWidth: 1.5,
    borderBottomWidth: 2.5,
    minHeight: 38,
    justifyContent: 'center',
  },
  filterChipText: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  filterTitleWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  filterTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: 0.4,
  },
  filterProductsRow: {
    paddingLeft: Spacing.lg,
    // Extra right padding so the last peeking card doesn't clip hard against
    // the screen edge — mirrors the left inset for visual balance.
    paddingRight: Spacing.lg,
    gap: Spacing.sm,
  },
  filterProductWrap: {
    // Fixed narrow width: ~2.5 cards visible at once → clear scroll affordance.
    // Do NOT use flex:1 here — it stretches cards inside a horizontal ScrollView.
    width: FILTER_CARD_W,
  },
  // Compact empty state for the filter pivot section only.
  // Uses tighter vertical padding than `emptyHint` so the section doesn't
  // balloon when a pivot returns zero results.
  filterEmptyHint: {
    ...Typography.caption,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    textAlign: 'center',
  },
});
