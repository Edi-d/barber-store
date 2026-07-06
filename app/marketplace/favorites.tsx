/**
 * /marketplace/favorites — "Favorite" (wishlist) screen.
 *
 * Lists the products the user has hearted on the PDP. Favourite ids live in the
 * AsyncStorage-backed useMarketplaceFavorites store; each id is resolved to a
 * product via the nop PDP endpoint and rendered as a MarketplaceProductCard grid.
 */

import { useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { GradientBackground } from '@/components/ui/GradientBackground';
import { MarketplaceProductCard } from '@/components/marketplace/MarketplaceProductCard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMarketplaceFavorites } from '@/hooks/use-marketplace-favorites';
import { fetchProductDetail } from '@/lib/nop-catalog';
import type { MarketplaceProduct } from '@/hooks/use-marketplace-catalog';
import { Brand, Colors, FontFamily, Shadows, Spacing, Typography } from '@/constants/theme';

const CARD_W = (Dimensions.get('window').width - Spacing.lg * 2 - Spacing.sm) / 2;

/** Resolve favourite ids → products (nop PDP per id), preserving heart order. */
async function fetchFavorites(ids: string[]): Promise<MarketplaceProduct[]> {
  const results = await Promise.all(
    ids.map((id) => fetchProductDetail(Number(id)).catch(() => null)),
  );
  return results
    .map((r) => r?.product ?? null)
    .filter((p): p is MarketplaceProduct => p != null);
}

export default function FavoritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  // Reactive — re-renders (and the query re-keys) when favourites change.
  const ids = useMarketplaceFavorites((s) => s.ids);
  const idsKey = useMemo(() => [...ids].sort().join(','), [ids]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['nop', 'favorites', idsKey],
    queryFn: () => fetchFavorites(ids),
    enabled: ids.length > 0,
  });

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
          style={{ color: colors.text, fontFamily: FontFamily.semiBold, fontSize: 17 }}
        >
          Favorite
        </Text>
        <View className="w-10" />
      </View>

      {ids.length === 0 ? (
        <View style={styles.center}>
          <Feather name="heart" size={44} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Nicio favorita inca
          </Text>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            Apasă inima de pe un produs pentru a-l salva aici.
          </Text>
        </View>
      ) : isLoading && products.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={Brand.primary} />
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
                onPress={() => router.push(`/marketplace/product/${item.id}` as never)}
              />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
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
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.h3,
    textAlign: 'center',
    marginTop: Spacing.xs,
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
