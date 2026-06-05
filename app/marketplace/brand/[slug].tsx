/**
 * /marketplace/brand/[slug] — paginated manufacturer product list (nopCommerce).
 *
 * Resolves the brand slug → manufacturer id via UrlRecord/BySlug, then
 * infinite-scrolls GetFilteredProducts with the SINGULAR manufacturer_id (guide
 * §6b — brand filtering is single-select). Renders a 2-col MarketplaceProductCard
 * grid, mirroring the category screen.
 */

import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { GradientBackground } from '@/components/ui/GradientBackground';
import { MarketplaceProductCard } from '@/components/marketplace/MarketplaceProductCard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNopBrandProducts } from '@/hooks/use-nop-products';
import { bySlug } from '@/lib/nop-catalog';
import { Brand, Colors, FontFamily, Shadows, Spacing, Typography } from '@/constants/theme';

const CARD_W = (Dimensions.get('window').width - Spacing.lg * 2 - Spacing.sm) / 2;

/** Resolve a brand slug to its nop manufacturer id. */
async function resolveManufacturer(slug: string): Promise<number | null> {
  try {
    const rec = await bySlug(slug);
    if (rec.entity_name === 'Manufacturer' && rec.entity_id) return rec.entity_id;
  } catch {
    // ignore
  }
  return null;
}

export default function BrandScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { data: manufacturerId, isLoading: resolving } = useQuery({
    queryKey: ['nop', 'resolve-manufacturer', slug],
    queryFn: () => resolveManufacturer(slug as string),
    enabled: !!slug,
  });

  const {
    products,
    loading,
    loadingMore,
    hasNextPage,
    fetchNextPage,
  } = useNopBrandProducts(manufacturerId ?? null);

  const title = useMemo(
    () => (slug ? slug.replace(/-/g, ' ') : ''),
    [slug],
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
            textTransform: 'uppercase',
            paddingHorizontal: Spacing.sm,
          }}
        >
          {title}
        </Text>
        <View className="w-10" />
      </View>

      {busy && products.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={Brand.primary} />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.center}>
          <Feather name="package" size={44} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            Nu sunt produse pentru acest brand.
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
});
