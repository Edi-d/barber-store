/**
 * /marketplace/brands — Full brand (manufacturer) directory.
 *
 * Reached from the marketplace drawer MENIU tab ("Branduri"). Lists every brand
 * the app knows about — the same set surfaced on the home "Branduri" row, but
 * complete instead of the featured-only slice. Tapping a brand opens its
 * paginated product list at /marketplace/brand/[slug].
 *
 * NOTE: nopCommerce exposes no global manufacturer-list endpoint, so the brand
 * universe is aggregated from the manufacturer facets of the top categories
 * (see lib/nop-catalog.ts → fetchHomeCatalog / BRAND_SOURCE_CATEGORIES). This
 * screen shows exactly that aggregated set.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { GradientBackground } from '@/components/ui/GradientBackground';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useMarketplaceCatalog,
  type MarketplaceBrand,
} from '@/hooks/use-marketplace-catalog';
import {
  Brand,
  Bubble,
  Colors,
  FontFamily,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ─── BrandCard ────────────────────────────────────────────────────────────────

function BrandCard({
  brand,
  onPress,
  colors,
}: {
  brand: MarketplaceBrand;
  onPress: () => void;
  colors: typeof Colors.light;
}) {
  const initial = brand.name.trim().charAt(0).toUpperCase() || '?';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardShadow,
        Bubble.radiiSm,
        Shadows.sm,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.card, Bubble.radiiSm, { backgroundColor: '#FFFFFF' }]}>
        {brand.logo_url ? (
          <Image
            source={{ uri: brand.logo_url }}
            style={styles.logo}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.initialCircle}>
            <Text style={styles.initialText}>{initial}</Text>
          </View>
        )}
        <Text
          style={[styles.cardName, { color: colors.text }]}
          numberOfLines={2}
        >
          {brand.name}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BrandsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { brands, loading } = useMarketplaceCatalog();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return brands;
    return brands.filter((b) => normalize(b.name).includes(q));
  }, [brands, query]);

  const handlePress = useCallback(
    (slug: string) => {
      Haptics.selectionAsync().catch(() => {});
      router.push(`/marketplace/brand/${slug}` as never);
    },
    [router],
  );

  return (
    <GradientBackground static>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ── */}
      <View
        className="flex-row items-center px-5 pb-3"
        style={{ paddingTop: insets.top + Spacing.sm }}
      >
        <Pressable
          className="w-10 h-10 border items-center justify-center"
          style={{
            ...Bubble.radiiSm,
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
          className="flex-1 text-center font-semibold text-lg"
          style={{ color: colors.text, fontFamily: FontFamily.semiBold }}
        >
          Toate brandurile
        </Text>

        {/* Spacer to balance the back button */}
        <View className="w-10" />
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, Bubble.radiiSm, Shadows.sm]}>
          <Feather name="search" size={18} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Caută brand..."
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.text }]}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Feather name="x" size={16} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Content ── */}
      {loading && brands.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={Brand.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="award" size={36} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            {query
              ? 'Niciun brand găsit'
              : 'Nu sunt branduri disponibile'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => b.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing['3xl'] },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <BrandCard
                brand={item}
                onPress={() => handlePress(item.slug)}
                colors={colors}
              />
            </View>
          )}
        />
      )}
    </GradientBackground>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Search
  searchWrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    paddingVertical: 0,
  },

  // List
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  row: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cell: {
    flex: 1,
  },
  emptyText: {
    ...Typography.caption,
    marginTop: Spacing.md,
    textAlign: 'center',
  },

  // Card
  cardShadow: {
    width: '100%',
  },
  card: {
    width: '100%',
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
  },
  logo: {
    width: '80%',
    height: 40,
  },
  initialCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10,102,194,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    color: Brand.primary,
  },
  cardName: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
