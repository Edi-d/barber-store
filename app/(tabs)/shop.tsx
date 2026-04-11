import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTutorialContext } from '@/components/tutorial/TutorialProvider';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Platform,
  TextInput,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp, Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Brand, Bubble, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import type { Product as DBProduct } from '@/types/database';
import type { Product, ProductCatalog } from '@/data/types';
import { CATEGORY_LABELS } from '@/data/types';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { CartBar } from '@/components/shop/CartBar';
import { GridProductCard, CARD_WIDTH as GRID_CARD_WIDTH, formatRON as formatRONUtil } from '@/components/shop/GridProductCard';
import { MiniProductCard, MINI_CARD_WIDTH } from '@/components/shop/MiniProductCard';
import { InlineSearchBar } from '@/components/shop/InlineSearchBar';

const catalog: ProductCatalog = require('@/data/products.json');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PAD = Spacing.sm;
const GAP = Spacing.sm;
const HORIZONTAL_CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - GAP) / 2;

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

const slideIn = (delay: number) =>
  FadeInDown.duration(400)
    .delay(delay)
    .easing(SMOOTH)
    .withInitialValues({ transform: [{ translateY: 12 }] });

/** Product counts per brand */
const brandCounts: Record<string, number> = {};
catalog.products.forEach((p) => {
  brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
});

/** Sort brands by product count (descending) for chip relevance */
const brandsByCount = [...catalog.brands].sort(
  (a, b) => (brandCounts[b] || 0) - (brandCounts[a] || 0),
);

/** Product counts per category */
const categoryCounts: Record<string, number> = {};
catalog.products.forEach((p) => {
  categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
});

/** Sort categories by product count */
const categoriesByCount = [...catalog.categories].sort(
  (a, b) => (categoryCounts[b] || 0) - (categoryCounts[a] || 0),
);

/** Popular categories for the featured section */
const POPULAR_CATS = new Set(['clippers', 'wax', 'gel', 'trimmers', 'scissors']);

/** Pre-compute popular products (in-stock, from popular categories, limit 8) */
const popularProducts = catalog.products
  .filter((p) => p.inStock && POPULAR_CATS.has(p.category))
  .slice(0, 8);

/** Pre-compute top discounted products (in-stock, sorted by discount %, limit 6) */
const bigDiscountProducts = catalog.products
  .filter((p) => p.inStock && p.retailPrice > p.partnerPrice)
  .sort((a, b) => {
    const discA = (a.retailPrice - a.partnerPrice) / a.retailPrice;
    const discB = (b.retailPrice - b.partnerPrice) / b.retailPrice;
    return discB - discA;
  })
  .slice(0, 6);

type SortBy = 'relevance' | 'price_asc' | 'price_desc' | 'discount' | 'name';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'relevance', label: 'Relevanta' },
  { value: 'price_asc', label: 'Pret crescator' },
  { value: 'price_desc', label: 'Pret descrescator' },
  { value: 'discount', label: 'Reducere' },
  { value: 'name', label: 'Alfabetic' },
];

const SORT_ICONS: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  relevance: 'clock',
  price_asc: 'arrow-up',
  price_desc: 'arrow-down',
  discount: 'percent',
  name: 'type',
};

const SORT_LABEL_MAP: Record<string, string> = {};
SORT_OPTIONS.forEach((o) => { SORT_LABEL_MAP[o.value] = o.label; });

/** Feather icon name for each category slug */
const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  clippers: 'tool',
  trimmers: 'crop',
  wax: 'droplet',
  combs: 'align-left',
  aftershave: 'wind',
  scissors: 'scissors',
  dye: 'feather',
  chairs: 'grid',
  shampoo: 'droplet',
  dryers: 'wind',
  gel: 'circle',
  powder: 'cloud',
  brushes: 'edit-3',
  blades: 'minus',
  razors: 'slash',
  furniture: 'box',
  cream: 'sun',
  spray: 'cloud-rain',
  fragrance: 'heart',
  accessories: 'tag',
  hygiene: 'shield',
  shaving: 'slash',
  grooming: 'user',
  'styling-tools': 'star',
  care: 'heart',
  promo: 'percent',
  altele: 'more-horizontal',
};

const INITIAL_BRAND_COUNT = 12;

function formatRON(price: number) {
  return price % 1 === 0 ? `${price}` : `${price.toFixed(2)}`;
}

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined as any);

  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer.current);
  }, [value, delay]);

  return debounced;
}

// NOTE (F-1): shop.tsx uses the local JSON catalog from data/products.json.
// The cartStore and product/[id].tsx use a Supabase-backed Product type (price_cents,
// title, id, stock, image_url). These are two separate product systems.
// The shop tab is browse-only with local JSON; cart/checkout operate on Supabase products.
// If a unified flow is needed, products.json must be migrated to Supabase products table.

/** Maps a local JSON catalog product to the DB Product shape expected by cartStore. */
function toCartProduct(p: Product): DBProduct {
  return {
    id: p.sku,
    title: p.name,
    description: p.description ?? null,
    price_cents: Math.round(p.partnerPrice * 100),
    currency: 'RON',
    image_url: p.images?.[0] ?? null,
    stock: p.inStock ? 99 : 0,
    active: p.inStock,
    created_at: new Date().toISOString(),
  };
}

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { totalItems, totalPrice } = useCartStore();

  // ── Filter state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [brandsExpanded, setBrandsExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('relevance');

  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  const hasActiveFilters =
    selectedCategory !== null || selectedBrand !== null || debouncedQuery.length >= 2;

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory(null);
    setSelectedBrand(null);
    setSortBy('relevance');
  }, []);

  // ── Product detail sheet ──
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const filterSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['100%'], []);

  // ── Tutorial refs ──
  const { registerRef, unregisterRef } = useTutorialContext();
  const searchRef = useRef<View>(null);
  const categoryFilterRef = useRef<View>(null);
  const brandFilterRef = useRef<View>(null);
  const sortBtnRef = useRef<View>(null);
  const productCardRef = useRef<View>(null);
  const productPriceRef = useRef<View>(null);
  const productAddRef = useRef<View>(null);

  useEffect(() => {
    registerRef('shop-search', searchRef);
    registerRef('shop-category-filter', categoryFilterRef);
    registerRef('shop-brand-filter', brandFilterRef);
    registerRef('shop-sort-btn', sortBtnRef);
    registerRef('shop-product-card', productCardRef);
    registerRef('shop-product-price', productPriceRef);
    registerRef('shop-product-add', productAddRef);
    return () => {
      unregisterRef('shop-search');
      unregisterRef('shop-category-filter');
      unregisterRef('shop-brand-filter');
      unregisterRef('shop-sort-btn');
      unregisterRef('shop-product-card');
      unregisterRef('shop-product-price');
      unregisterRef('shop-product-add');
    };
  }, [registerRef, unregisterRef]);
  const filterSnapPoints = useMemo(() => ['60%'], []);

  const { addItem } = useCartStore();

  // ── Filtered & sorted products ──
  const filteredProducts = useMemo(() => {
    let result = catalog.products;
    if (selectedCategory) result = result.filter((p) => p.category === selectedCategory);
    if (selectedBrand) result = result.filter((p) => p.brand === selectedBrand);
    if (debouncedQuery.length >= 2) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q),
      );
    }
    return [...result].sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      switch (sortBy) {
        case 'price_asc': return a.partnerPrice - b.partnerPrice;
        case 'price_desc': return b.partnerPrice - a.partnerPrice;
        case 'discount': {
          const discA = a.retailPrice > 0 ? (a.retailPrice - a.partnerPrice) / a.retailPrice : 0;
          const discB = b.retailPrice > 0 ? (b.retailPrice - b.partnerPrice) / b.retailPrice : 0;
          return discB - discA;
        }
        case 'name': return a.name.localeCompare(b.name);
        default: return a.name.localeCompare(b.name);
      }
    });
  }, [selectedCategory, selectedBrand, debouncedQuery, sortBy]);

  const resultCount = filteredProducts.length;

  /** Cycle through sort options on tap */
  const cycleSortMode = useCallback(() => {
    const idx = SORT_OPTIONS.findIndex((o) => o.value === sortBy);
    const next = SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length];
    setSortBy(next.value);
  }, [sortBy]);

  /** Build contextual result text */
  const resultText = useMemo(() => {
    const parts: string[] = [`${resultCount} produse`];
    if (selectedCategory) {
      const label = CATEGORY_LABELS[selectedCategory] ?? selectedCategory;
      parts.push(`in ${label}`);
    }
    if (selectedBrand) parts.push(selectedBrand);
    return parts.join(' ');
  }, [resultCount, selectedCategory, selectedBrand]);

  /** Whether to show the featured sections (only when no filters are active) */
  const showFeaturedSections = !hasActiveFilters;

  // ── Product detail handlers ──
  const openProduct = useCallback((product: Product) => {
    setSelectedProduct(product);
    setQty(1);
    setAddedToCart(false);
    useUIStore.getState().setTabBarHidden(true);
    bottomSheetRef.current?.expand();
  }, []);

  const handleAddToCart = useCallback(async () => {
    if (!selectedProduct) return;
    await addItem(toCartProduct(selectedProduct), qty);
    setAddedToCart(true);
    setTimeout(() => {
      bottomSheetRef.current?.close();
      setTimeout(() => setAddedToCart(false), 300);
    }, 800);
  }, [selectedProduct, qty, addItem]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.35}
        pressBehavior="close"
      />
    ),
    [],
  );

  const visibleBrands = brandsExpanded ? brandsByCount : brandsByCount.slice(0, INITIAL_BRAND_COUNT);
  const hasMoreBrands = brandsByCount.length > INITIAL_BRAND_COUNT;
  const totalCategoryCount = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  const totalBrandCount = Object.values(brandCounts).reduce((a, b) => a + b, 0);

  const keyExtractor = useCallback((item: Product) => item.sku, []);

  const renderHorizontalCard = useCallback(
    (product: Product) => (
      <Pressable
        key={product.sku}
        style={[styles.horizontalCardWrap, Shadows.sm]}
        onPress={() => openProduct(product)}
      >
        <MiniProductCard product={product} />
      </Pressable>
    ),
    [openProduct],
  );

  const ListHeader = useMemo(
    () => (
      <View>
        {/* ── Search ── */}
        <Animated.View entering={slideIn(0)} style={{ zIndex: 100 }}>
          <View ref={searchRef}>
            <InlineSearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocusChange={setSearchFocused}
            />
          </View>
        </Animated.View>

        {/* ── Filter Chips ── */}
        <Animated.View entering={slideIn(80)}>
          <View style={styles.filterChipsWrapper}>
            {/* Categorii */}
            <Text style={styles.filterSectionLabel}>Categorii</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}
            >
              <TouchableOpacity
                ref={categoryFilterRef}
                style={[
                  styles.chip,
                  !selectedCategory ? styles.chipActive : styles.chipInactive,
                ]}
                onPress={() => setSelectedCategory(null)}
                activeOpacity={0.7}
              >
                <Feather
                  name="layers"
                  size={12}
                  color={!selectedCategory ? Brand.white : Colors.text}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.chipText, { color: !selectedCategory ? Brand.white : Colors.text }]}>
                  Toate ({totalCategoryCount})
                </Text>
              </TouchableOpacity>
              {categoriesByCount.map((cat) => {
                const active = selectedCategory === cat;
                const iconName = CATEGORY_ICONS[cat] ?? 'tag';
                const count = categoryCounts[cat];
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                    onPress={() => setSelectedCategory(active ? null : cat)}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={iconName}
                      size={12}
                      color={active ? Brand.white : Colors.text}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.chipText, { color: active ? Brand.white : Colors.text }]}>
                      {CATEGORY_LABELS[cat] ?? cat}
                      {count != null ? ` (${count})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Branduri */}
            <Text style={styles.filterSectionLabel}>Branduri</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}
            >
              <TouchableOpacity
                ref={brandFilterRef}
                style={[
                  styles.chip,
                  !selectedBrand ? styles.chipActive : styles.chipInactive,
                ]}
                onPress={() => setSelectedBrand(null)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: !selectedBrand ? Brand.white : Colors.text }]}>
                  Toate ({totalBrandCount})
                </Text>
              </TouchableOpacity>
              {visibleBrands.map((brand) => {
                const active = selectedBrand === brand;
                const count = brandCounts[brand];
                return (
                  <TouchableOpacity
                    key={brand}
                    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                    onPress={() => setSelectedBrand(active ? null : brand)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, { color: active ? Brand.white : Colors.text }]}>
                      {brand}
                      {count != null ? ` (${count})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {hasMoreBrands && (
                <TouchableOpacity
                  style={[styles.chip, styles.chipToggle]}
                  onPress={() => setBrandsExpanded((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={brandsExpanded ? 'chevron-left' : 'chevron-right'}
                    size={12}
                    color={Brand.primary}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.chipText, { color: Brand.primary }]}>
                    {brandsExpanded ? 'Mai putine' : 'Mai multe'}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </Animated.View>

        {/* ── Popular Products Section ── */}
        {showFeaturedSections && popularProducts.length > 0 && (
          <Animated.View entering={slideIn(120)}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Feather name="trending-up" size={16} color="#F59E0B" />
                <Text style={styles.sectionTitle}>Produse populare</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              decelerationRate="fast"
              snapToInterval={HORIZONTAL_CARD_WIDTH - 8 + GAP}
              snapToAlignment="start"
            >
              {popularProducts.map(renderHorizontalCard)}
            </ScrollView>
          </Animated.View>
        )}

        {/* ── Big Discounts Section ── */}
        {showFeaturedSections && bigDiscountProducts.length > 0 && (
          <Animated.View entering={slideIn(200)}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Feather name="percent" size={16} color={Brand.gradientStart} />
                <Text style={styles.sectionTitle}>Reduceri mari</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              decelerationRate="fast"
              snapToInterval={HORIZONTAL_CARD_WIDTH - 8 + GAP}
              snapToAlignment="start"
            >
              {bigDiscountProducts.map(renderHorizontalCard)}
            </ScrollView>
          </Animated.View>
        )}

        {/* ── Result Count + Sort ── */}
        <Animated.View
          entering={slideIn(showFeaturedSections ? 280 : 160)}
          style={styles.resultRow}
        >
          <Text style={styles.resultCount}>{resultText}</Text>
          <View ref={sortBtnRef}>
          <Pressable
            onPress={cycleSortMode}
            style={styles.sortButton}
            hitSlop={8}
          >
            <Feather name={SORT_ICONS[sortBy]} size={14} color={Colors.primary} />
            <Text style={styles.sortLabel}>{SORT_LABEL_MAP[sortBy]}</Text>
          </Pressable>
          </View>
        </Animated.View>
      </View>
    ),
    [
      searchQuery,
      selectedCategory,
      selectedBrand,
      brandsExpanded,
      resultText,
      sortBy,
      showFeaturedSections,
      renderHorizontalCard,
      visibleBrands,
      totalCategoryCount,
      totalBrandCount,
      hasMoreBrands,
    ],
  );

  const ListEmpty = useMemo(
    () => (
      <View style={styles.empty}>
        <View style={styles.emptyIconWrap}>
          <Feather name="package" size={40} color={Colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>Niciun produs gasit</Text>
        <Text style={styles.emptySubtitle}>Incearca sa modifici filtrele</Text>
        {hasActiveFilters && (
          <Pressable onPress={resetFilters} style={styles.clearButton}>
            <Feather name="x" size={16} color={Brand.white} />
            <Text style={styles.clearButtonText}>Sterge filtrele</Text>
          </Pressable>
        )}
      </View>
    ),
    [hasActiveFilters, resetFilters],
  );

  return (
    <View style={styles.root}>
      {/* ── Gradient background blobs ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['rgba(68,129,235,0.12)', 'transparent']}
          style={[styles.blob, { top: -160, right: -100 }]}
        />
        <LinearGradient
          colors={['rgba(4,14,253,0.08)', 'transparent']}
          style={[styles.blob, { bottom: -140, left: -120 }]}
        />
      </View>

      {/* ─── Header ─── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Image
          source={require('@/assets/logo-text.png')}
          style={{ width: 100, height: 32 }}
          resizeMode="contain"
        />
        <Text style={styles.navTitle}>Magazin</Text>
      </View>

      <FlatList
        data={filteredProducts}
        keyExtractor={keyExtractor}
        renderItem={({ item, index }) => (
          <View ref={index === 0 ? productCardRef : undefined}>
            <GridProductCard product={item} onPress={() => openProduct(item)} />
          </View>
        )}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={[
          styles.list,
          { paddingTop: Spacing.xs, paddingBottom: totalItems() > 0 ? 140 : 40 },
        ]}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />

      {!sheetOpen && totalItems() > 0 && (
        <CartBar
          totalItems={totalItems()}
          totalPrice={totalPrice()}
          onPress={() => router.push('/cart')}
          bottomInset={insets.bottom + 70}
        />
      )}

      {/* ── Filter Bottom Sheet ── */}
      <BottomSheet
        ref={filterSheetRef}
        index={-1}
        snapPoints={filterSnapPoints}
        enablePanDownToClose
        enableDynamicSizing={false}
        topInset={insets.top}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{
          backgroundColor: Colors.handleBar,
          width: 36,
          height: 4,
        }}
        backgroundStyle={{
          borderTopLeftRadius: Bubble.sheetRadii.borderTopLeftRadius,
          borderTopRightRadius: Bubble.sheetRadii.borderTopRightRadius,
        }}
      >
        <View style={styles.filterSheetHeader}>
          <Text style={styles.filterSheetTitle}>Filtre</Text>
          {(selectedCategory || selectedBrand) && (
            <Pressable onPress={() => { setSelectedCategory(null); setSelectedBrand(null); }}>
              <Text style={styles.filterSheetClear}>Reseteaza</Text>
            </Pressable>
          )}
        </View>
        <BottomSheetScrollView
          contentContainerStyle={styles.filterSheetContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.filterSheetSectionTitle}>Categorie</Text>
          <View style={styles.filterChipsWrap}>
            <Pressable
              onPress={() => setSelectedCategory(null)}
              style={[styles.filterChip, !selectedCategory && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipTxt, !selectedCategory && styles.filterChipTxtActive]}>
                Toate
              </Text>
            </Pressable>
            {categoriesByCount.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipTxt, selectedCategory === cat && styles.filterChipTxtActive]}>
                  {CATEGORY_LABELS[cat] || cat}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.filterSheetSectionTitle, { marginTop: 24 }]}>Marca</Text>
          <View style={styles.filterChipsWrap}>
            <Pressable
              onPress={() => setSelectedBrand(null)}
              style={[styles.filterChip, !selectedBrand && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipTxt, !selectedBrand && styles.filterChipTxtActive]}>
                Toate
              </Text>
            </Pressable>
            {brandsByCount.map((brand) => (
              <Pressable
                key={brand}
                onPress={() => setSelectedBrand(selectedBrand === brand ? null : brand)}
                style={[styles.filterChip, selectedBrand === brand && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipTxt, selectedBrand === brand && styles.filterChipTxtActive]}>
                  {brand}
                </Text>
              </Pressable>
            ))}
          </View>
        </BottomSheetScrollView>

        <View style={styles.filterApplyBar}>
          <Pressable
            onPress={() => filterSheetRef.current?.close()}
            style={({ pressed }) => [styles.filterApplyBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.filterApplyTxt}>
              Vezi {filteredProducts.length} produse
            </Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* ── Product Detail Bottom Sheet ── */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        topInset={insets.top}
        onChange={(index) => {
          const open = index >= 0;
          setSheetOpen(open);
          if (!open) useUIStore.getState().setTabBarHidden(false);
        }}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{
          backgroundColor: Colors.handleBar,
          width: 36,
          height: 4,
        }}
        backgroundStyle={{
          borderTopLeftRadius: Bubble.sheetRadii.borderTopLeftRadius,
          borderTopRightRadius: Bubble.sheetRadii.borderTopRightRadius,
        }}
      >
        {selectedProduct && (
          <SheetContent
            product={selectedProduct}
            qty={qty}
            setQty={setQty}
            addedToCart={addedToCart}
            onAddToCart={handleAddToCart}
            priceRef={productPriceRef}
            addRef={productAddRef}
          />
        )}
      </BottomSheet>
    </View>
  );
}

/* InlineSearchBar extracted to @/components/shop/InlineSearchBar */

/* GridProductCard extracted to @/components/shop/GridProductCard */
/* MiniProductCard extracted to @/components/shop/MiniProductCard */

/* ── Bottom Sheet Content ── */
function SheetContent({
  product,
  qty,
  setQty,
  addedToCart,
  onAddToCart,
  priceRef,
  addRef,
}: {
  product: Product;
  qty: number;
  setQty: (n: number) => void;
  addedToCart: boolean;
  onAddToCart: () => void;
  priceRef?: React.RefObject<View>;
  addRef?: React.RefObject<View>;
}) {
  const insets = useSafeAreaInsets();
  const hasDiscount = product.partnerPrice < product.retailPrice;
  const savings = product.retailPrice - product.partnerPrice;
  const total = product.partnerPrice * qty;

  // Quantity pop animation
  const quantityScale = useSharedValue(1);
  const quantityAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: quantityScale.value }],
  }));

  // Add to cart button press animation
  const buttonScale = useSharedValue(1);
  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleQtyChange = (delta: number) => {
    const next = qty + delta;
    if (next < 1 || next > 99) return;
    setQty(next);
    quantityScale.value = withSequence(
      withTiming(1.3, { duration: 110 }),
      withTiming(1, { duration: 110 }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleAddToCart = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAddToCart();
  };

  return (
    <View style={{ flex: 1 }}>
      <BottomSheetScrollView
        contentContainerStyle={{ paddingBottom: 260 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Image area */}
        <LinearGradient
          colors={['#F2F5FA', '#ECEEF6', '#F3EFF8']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.sheetImgArea}
        >
          {product.images.length > 0 ? (
            <Image
              source={{ uri: product.images[0] }}
              style={styles.sheetImg}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.sheetImgPH}>
              <Feather name="package" size={56} color={Colors.textTertiary} />
            </View>
          )}
          {!product.inStock && (
            <View style={styles.sheetOosOverlay}>
              <View style={styles.sheetOosPill}>
                <Text style={styles.sheetOosTxt}>Stoc epuizat</Text>
              </View>
            </View>
          )}
        </LinearGradient>

        <View style={styles.sheetBody}>
          {/* Brand row with award icon */}
          <View style={styles.sheetBrandRow}>
            <Feather name="award" size={13} color={Brand.primary} />
            <Text style={styles.sheetBrand}>{product.brand}</Text>
          </View>

          <Text style={styles.sheetName}>{product.name}</Text>

          {product.description && (
            <Text style={styles.sheetDesc}>{product.description}</Text>
          )}

          {/* Pricing block */}
          <View ref={priceRef} style={styles.sheetPriceWrap}>
            <Text style={styles.sheetPartnerLabel}>PRET PARTENER</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={styles.sheetPrice}>{formatRON(product.partnerPrice)}</Text>
              <Text style={styles.sheetPriceSuffix}>RON</Text>
            </View>
            {hasDiscount && (
              <View style={styles.sheetPriceMeta}>
                <Text style={styles.sheetRetailPrice}>
                  {formatRON(product.retailPrice)} RON
                </Text>
                <View style={styles.savingsPill}>
                  <Text style={styles.savingsTxt}>
                    -{formatRON(savings)} RON
                  </Text>
                </View>
              </View>
            )}
          </View>

          <Text style={styles.skuTxt}>SKU: {product.sku}</Text>
        </View>
      </BottomSheetScrollView>

      {/* Bottom bar — Tapzi-barber style */}
      <Animated.View
        entering={FadeInUp.delay(120).duration(360).easing(Easing.bezier(0.25, 0.1, 0.25, 1))}
        style={[styles.bar, { paddingBottom: insets.bottom + 16 }]}
      >
        <BlurView intensity={65} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.barBgOverlay]} />

        <View style={styles.barContent}>
          {/* Price row */}
          <View style={styles.barPriceRow}>
            <Text style={styles.barPrice}>
              {formatRON(total)} RON
            </Text>
            {qty > 1 && (
              <Text style={styles.barPriceUnit}>
                {formatRON(product.partnerPrice)} RON × {qty}
              </Text>
            )}
          </View>

          {/* Actions row */}
          <View style={styles.barActionsRow}>
            {/* Quantity pill */}
            <View style={styles.barQtyPill}>
              <Pressable
                onPress={() => handleQtyChange(-1)}
                style={styles.barQtyBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                disabled={!product.inStock}
              >
                {qty <= 1 ? (
                  <Feather name="trash-2" size={16} color={Colors.error} />
                ) : (
                  <Feather name="minus" size={16} color={Brand.primary} />
                )}
              </Pressable>

              <Animated.Text style={[styles.barQtyNum, quantityAnimStyle]}>
                {qty}
              </Animated.Text>

              <Pressable
                onPress={() => handleQtyChange(1)}
                style={styles.barQtyBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                disabled={!product.inStock || qty >= 99}
              >
                <Feather name="plus" size={16} color={Brand.primary} />
              </Pressable>
            </View>

            {/* Add to cart */}
            <Animated.View ref={addRef} style={[styles.barBtn, buttonAnimStyle, Shadows.glow]}>
              <Pressable
                onPress={handleAddToCart}
                onPressIn={() => {
                  buttonScale.value = withTiming(0.97, { duration: 120 });
                }}
                onPressOut={() => {
                  buttonScale.value = withTiming(1, { duration: 120 });
                }}
                disabled={!product.inStock || addedToCart}
                style={styles.barBtnPressable}
              >
                <LinearGradient
                  colors={
                    addedToCart
                      ? ['#43A047', '#2E7D32']
                      : [Brand.gradientStart, Brand.gradientEnd]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.barBtnGradient, Bubble.radiiSm, !product.inStock && { opacity: 0.4 }]}
                >
                  <Feather
                    name={addedToCart ? 'check' : 'shopping-bag'}
                    size={18}
                    color="#fff"
                  />
                  <Text style={styles.barBtnTxt}>
                    {addedToCart ? 'Adaugat!' : 'Adauga in cos'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

/* ── Styles ── */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  blob: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  navTitle: {
    ...Typography.h3,
    color: Colors.text,
  },

  /* ── Search Bar ── */
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    height: 44,
    overflow: 'hidden',
    ...Bubble.radiiSm,
    borderBottomWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.text,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 0,
    margin: 0,
    ...Platform.select({ web: { outlineStyle: 'none' } as any, default: {} }),
  },

  /* ── Filter Chips ── */
  filterChipsWrapper: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  filterSectionLabel: {
    ...Typography.smallSemiBold,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: 2,
  },
  filterChipsRow: {
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    ...Bubble.radiiSm,
  },
  chipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  chipInactive: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderColor: 'rgba(255,255,255,0.6)',
  },
  chipToggle: {
    backgroundColor: Brand.primaryMuted,
    borderColor: Brand.primaryMuted,
  },
  chipText: {
    ...Typography.small,
    fontWeight: '600',
  },

  /* ── Featured Sections ── */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.captionSemiBold,
    fontSize: 15,
    color: Colors.text,
  },
  horizontalList: {
    gap: GAP,
    paddingBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  horizontalCardWrap: {
    width: HORIZONTAL_CARD_WIDTH - 8,
    ...Bubble.radii,
  },

  /* ── Result Row ── */
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  resultCount: {
    ...Typography.small,
    color: Colors.textTertiary,
    flex: 1,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.5)',
    ...Bubble.radiiSm,
  },
  sortLabel: {
    ...Typography.small,
    color: Colors.primary,
  },

  /* ── Grid ── */
  list: {
    paddingHorizontal: Spacing.sm,
  },
  columnWrapper: {
    gap: GAP,
    paddingHorizontal: 0,
    marginBottom: Spacing.xs,
  },

  /* ── Grid Product Card ── */
  gridCardOuter: {
    width: HORIZONTAL_CARD_WIDTH,
    ...Bubble.radii,
  },
  gridCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  gridImgWrap: {
    width: '100%',
    aspectRatio: 1.05,
    backgroundColor: '#F8F9FB',
    position: 'relative',
  },
  gridImg: {
    width: '100%',
    height: '100%',
  },
  gridImgPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,244,248,0.9)',
  },
  oosOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oosOverlayTxt: {
    ...Typography.smallSemiBold,
    color: '#E53935',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  discountBadgeWrap: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
  },
  discountBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
  },
  discountBadgeTxt: {
    ...Typography.smallSemiBold,
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },
  popularBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  popularBadgeTxt: {
    ...Typography.smallSemiBold,
    fontSize: 8,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  gridInfo: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  brandAccent: {
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: Brand.gradientStart,
    opacity: 0.6,
  },
  gridBrand: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.textTertiary,
    flex: 1,
  },
  gridName: {
    ...Typography.captionSemiBold,
    fontSize: 13,
    lineHeight: 17,
    color: Colors.text,
    minHeight: 32,
  },
  gridPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  gridPrice: {
    ...Typography.bodySemiBold,
    fontSize: 15,
    color: Brand.primary,
  },
  gridPriceSuffix: {
    ...Typography.small,
    fontSize: 9,
    fontWeight: '600',
    color: Brand.primary,
  },
  partnerLabel: {
    ...Typography.small,
    fontSize: 7,
    color: Brand.primary,
    opacity: 0.7,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: -1,
  },
  savingsRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
    backgroundColor: 'rgba(46,125,50,0.08)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  savingsTextCard: {
    ...Typography.small,
    fontSize: 9,
    color: '#2E7D32',
    fontWeight: '700',
  },
  addBtnSimple: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Mini Product Card ── */
  miniCard: {
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
  },
  miniImgWrap: {
    width: '100%',
    height: HORIZONTAL_CARD_WIDTH * 0.7,
    backgroundColor: '#F8F9FB',
    position: 'relative',
  },
  miniImg: {
    width: '100%',
    height: '100%',
  },
  miniImgPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,244,248,0.9)',
  },
  miniDiscountBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: Brand.gradientStart,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  miniDiscountTxt: {
    ...Typography.small,
    fontSize: 9,
    color: '#fff',
    fontWeight: '700',
  },
  miniInfo: {
    padding: Spacing.md,
    gap: 3,
  },
  miniBrand: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.textTertiary,
  },
  miniName: {
    ...Typography.small,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.text,
    minHeight: 32,
  },
  miniPrice: {
    ...Typography.smallSemiBold,
    fontSize: 13,
    color: Brand.primary,
  },

  /* ── Empty state ── */
  empty: {
    paddingTop: 80,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primaryMuted,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    ...Bubble.radii,
  },
  clearButtonText: {
    ...Typography.button,
    fontSize: 14,
    color: Brand.white,
  },

  /* ── Filter Bottom Sheet ── */
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F3',
  },
  filterSheetTitle: {
    fontSize: 20,
    fontFamily: 'EuclidCircularA-Bold',
    color: Colors.text,
  },
  filterSheetClear: {
    fontSize: 14,
    fontFamily: 'EuclidCircularA-Medium',
    color: '#EF4444',
  },
  filterSheetContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 100,
  },
  filterSheetSectionTitle: {
    fontSize: 14,
    fontFamily: 'EuclidCircularA-SemiBold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  filterChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#F0F1F4',
  },
  filterChipActive: {
    backgroundColor: Colors.text,
  },
  filterChipTxt: {
    fontSize: 14,
    fontFamily: 'EuclidCircularA-Medium',
    color: Colors.textSecondary,
  },
  filterChipTxtActive: {
    color: Colors.white,
  },
  filterApplyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 34,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: '#F0F1F3',
  },
  filterApplyBtn: {
    height: 52,
    ...Bubble.radiiSm,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterApplyTxt: {
    fontSize: 16,
    fontFamily: 'EuclidCircularA-SemiBold',
    color: Colors.white,
  },

  /* ── Product Detail Sheet ── */
  sheetImgArea: {
    width: '100%',
    aspectRatio: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetImg: { width: '100%', height: '100%' },
  sheetImgPH: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOosOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  sheetOosPill: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  sheetOosTxt: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'EuclidCircularA-SemiBold',
  },
  sheetBody: { paddingHorizontal: 24, paddingTop: 20 },
  sheetBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 6,
  },
  sheetBrand: {
    fontSize: 12,
    fontFamily: 'EuclidCircularA-Bold',
    color: Brand.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sheetName: {
    fontSize: 20,
    fontFamily: 'EuclidCircularA-Bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  sheetDesc: {
    fontSize: 14,
    fontFamily: 'EuclidCircularA-Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  sheetPriceWrap: { alignItems: 'center', marginBottom: 4 },
  sheetPartnerLabel: {
    fontSize: 10,
    fontFamily: 'EuclidCircularA-Bold',
    color: Brand.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  sheetPrice: {
    fontSize: 26,
    fontFamily: 'EuclidCircularA-Bold',
    color: Brand.primary,
  },
  sheetPriceSuffix: {
    fontSize: 15,
    fontFamily: 'EuclidCircularA-SemiBold',
    color: Brand.primary,
    opacity: 0.8,
  },
  sheetPriceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  sheetRetailPrice: {
    fontSize: 14,
    fontFamily: 'EuclidCircularA-Regular',
    color: Colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  savingsPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  savingsTxt: {
    fontSize: 12,
    fontFamily: 'EuclidCircularA-SemiBold',
    color: '#16a34a',
  },
  skuTxt: {
    fontSize: 12,
    fontFamily: 'EuclidCircularA-Regular',
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: 18,
    marginTop: 6,
  },
  qtyWrap: { alignItems: 'center', marginTop: 4 },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 46,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyMid: {
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  qtyNum: {
    fontSize: 16,
    fontFamily: 'EuclidCircularA-Bold',
    color: Colors.text,
  },

  /* ── Bottom Bar (Tapzi-barber style) ── */
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(10,102,194,0.18)',
    overflow: 'hidden',
  },
  barBgOverlay: {
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  barContent: {
    gap: 10,
  },
  barPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  barPrice: {
    fontSize: 22,
    fontFamily: 'EuclidCircularA-Bold',
    color: Brand.primary,
    lineHeight: 26,
  },
  barPriceUnit: {
    fontSize: 13,
    fontFamily: 'EuclidCircularA-Regular',
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  barActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  barQtyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.primaryMuted,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(10,102,194,0.12)',
    padding: 3,
    gap: 2,
  },
  barQtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barQtyNum: {
    fontSize: 16,
    fontFamily: 'EuclidCircularA-Bold',
    color: Colors.text,
    minWidth: 26,
    textAlign: 'center',
  },
  barBtn: {
    flex: 1,
    height: 48,
    overflow: 'hidden',
    ...Bubble.radiiSm,
  },
  barBtnPressable: {
    flex: 1,
    height: 48,
  },
  barBtnGradient: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  barBtnTxt: {
    ...Typography.button,
    color: '#fff',
  },
});
