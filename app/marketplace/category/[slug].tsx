/**
 * /marketplace/category/[slug] — paginated category product list (nopCommerce).
 *
 * Resolves the slug → nop category id (from the home category tree, falling back
 * to UrlRecord/BySlug), then infinite-scrolls GetCategoryProducts via
 * useNopCategoryProducts. Renders a 2-col MarketplaceProductCard grid.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';

import { GradientBackground } from '@/components/ui/GradientBackground';
import { MarketplaceProductCard } from '@/components/marketplace/MarketplaceProductCard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNopCategoryProducts } from '@/hooks/use-nop-products';
import { bySlug, fetchCategoryBrands, flattenCategories } from '@/lib/nop-catalog';
import { getHomePageCategories } from '@/lib/nop-client';
import { Brand, Bubble, Colors, FontFamily, Shadows, Spacing, Typography } from '@/constants/theme';

const CARD_W = (Dimensions.get('window').width - Spacing.lg * 2 - Spacing.sm) / 2;

type ResolvedCategory = { id: number; title: string };

/** Resolve a slug to its nop category id + display title. */
async function resolveCategory(slug: string): Promise<ResolvedCategory | null> {
  // Prefer the home tree — it carries the Romanian title and covers subcategories.
  try {
    const tree = flattenCategories(await getHomePageCategories());
    const match = tree.find((c) => c.slug === slug);
    if (match) return { id: Number(match.id), title: match.title_ro };
  } catch {
    // fall through to slug resolution
  }
  // Fallback: ask nop to resolve the slug directly.
  try {
    const rec = await bySlug(slug);
    if (rec.entity_name === 'Category' && rec.entity_id) {
      return { id: rec.entity_id, title: slug.replace(/-/g, ' ') };
    }
  } catch {
    // ignore
  }
  return null;
}

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { data: resolved, isLoading: resolving } = useQuery({
    queryKey: ['nop', 'resolve-category', slug],
    queryFn: () => resolveCategory(slug as string),
    enabled: !!slug,
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['nop', 'category-brands', resolved?.id ?? 'none'],
    queryFn: () => fetchCategoryBrands(resolved!.id),
    enabled: resolved?.id != null,
  });

  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);

  const {
    products,
    loading,
    loadingMore,
    hasNextPage,
    fetchNextPage,
  } = useNopCategoryProducts(resolved?.id ?? null, selectedBrandId);

  const handleBrandPress = useCallback((id: number | null) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedBrandId((prev) => (id != null && prev === id ? null : id));
  }, []);

  const title = useMemo(
    () => resolved?.title ?? (slug ? slug.replace(/-/g, ' ') : ''),
    [resolved, slug],
  );

  const handleProductPress = useCallback(
    (productId: string) => router.push(`/marketplace/product/${productId}` as never),
    [router],
  );

  const busy = resolving || loading;

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        className="flex-row items-center px-5 pb-3"
        style={{ paddingTop: insets.top + Spacing.sm }}
      >
        <Pressable
          className="w-10 h-10 rounded-full border items-center justify-center"
          style={{
            backgroundColor: 'rgba(255,255,255,0.65)',
            borderColor: 'rgba(255,255,255,0.9)',
            ...Shadows.sm,
          }}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text
          className="flex-1 text-center"
          numberOfLines={1}
          style={{
            color: colors.text,
            fontFamily: FontFamily.semiBold,
            fontSize: 17,
            textTransform: 'capitalize',
            paddingHorizontal: Spacing.sm,
          }}
        >
          {title}
        </Text>
        <View className="w-10" />
      </View>

      {/* Brand (manufacturer) filter chips */}
      {brands.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsRow}
        >
          {[null, ...brands.map((b) => b.id)].map((id) => {
            const active =
              id === null ? selectedBrandId === null : selectedBrandId === id;
            const label =
              id === null
                ? 'Toate'
                : brands.find((b) => b.id === id)?.name ?? '';
            return (
              <Pressable
                key={id ?? 'all'}
                onPress={() => handleBrandPress(id)}
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
                    {label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {busy && products.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={Brand.primary} />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.center}>
          <Feather name="package" size={44} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            Nu sunt produse in aceasta categorie.
          </Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.grid,
            { paddingBottom: insets.bottom + Spacing['3xl'] },
          ]}
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <MarketplaceProductCard
                product={item}
                onPress={() => handleProductPress(item.id)}
              />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          onEndReached={() => {
            if (hasNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                size="small"
                color={Brand.primary}
                style={{ marginVertical: Spacing.lg }}
              />
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    ...Typography.caption,
    textAlign: 'center',
  },
  grid: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  row: {
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  cell: {
    width: CARD_W,
  },
  filterChipsRow: {
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.lg,
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: Spacing.base,
    paddingVertical: 10,
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
});
