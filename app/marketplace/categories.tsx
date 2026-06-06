/**
 * /marketplace/categories — Full category grid.
 *
 * Reached from "VEDERE TOATE" on the marketplace home. Lists every top-level
 * category as a tile in a 3-column grid (circular image + label), mirroring the
 * "Cautare produse" search grid. Rows cascade in with FadeInDown stagger.
 *
 * Spec: 02-listing-and-search.md §2 "Category Screen Plan"
 */

import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { GradientBackground } from '@/components/ui/GradientBackground';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useMarketplaceCatalog,
  type MarketplaceCategory,
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

// ─── Animation helper ─────────────────────────────────────────────────────────

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const slideIn = (delay = 0) =>
  FadeInDown.duration(400)
    .delay(delay)
    .easing(SMOOTH)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] });

// ─── Icon / tint maps (English slugs matching barber-store products feed) ─────
// Mirrors the home-screen category_icons map from app/(tabs)/shop.tsx
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
  // Romanian slugs (Supabase mode)
  aparatura: 'zap',
  foarfeci: 'scissors',
  'piepteni-si-perii': 'wind',
  'ingrijirea-parului': 'droplet',
  'ingrijirea-corpului': 'heart',
  'barba-si-mustata': 'user',
  'produse-igiena': 'shield',
};

const CATEGORY_TINTS: Record<string, string> = {
  clippers: '#E5E7EB',
  trimmers: '#E5E7EB',
  wax: '#E8DDC8',
  combs: '#E0E2E8',
  aftershave: '#DDE8DD',
  scissors: '#F3D5D8',
  dye: '#F3E8F8',
  chairs: '#E5E7EB',
  shampoo: '#E8F0F8',
  dryers: '#E0E2E8',
  gel: '#DDE8DD',
  powder: '#F8F0E8',
  brushes: '#E0E2E8',
  blades: '#E5E7EB',
  razors: '#E5E7EB',
  furniture: '#E8E4DC',
  cream: '#FFF0E8',
  spray: '#E0EEF8',
  fragrance: '#F8E8F0',
  accessories: '#E8E8E8',
  hygiene: '#D7E3EE',
  shaving: '#E5E7EB',
  grooming: '#DDE8DD',
  'styling-tools': '#F8F0DC',
  care: '#DDE8DD',
  promo: '#FDE8E8',
  // Romanian slugs
  aparatura: '#E5E7EB',
  foarfeci: '#F3D5D8',
  'piepteni-si-perii': '#E0E2E8',
  'ingrijirea-parului': '#E8DDC8',
  'ingrijirea-corpului': '#DDE8DD',
  'barba-si-mustata': '#3D2820',
  'produse-igiena': '#D7E3EE',
};

// ─── CategoryGridTile ─────────────────────────────────────────────────────────

function CategoryGridTile({
  category,
  onPress,
  colors,
}: {
  category: MarketplaceCategory;
  onPress: () => void;
  colors: typeof Colors.light;
}) {
  const tint = CATEGORY_TINTS[category.slug] ?? '#E5E7EB';
  // Dark backgrounds (Tapzi barba/mustata pattern) get white icons
  const isDark = tint.startsWith('#3') || tint.startsWith('#2') || tint.startsWith('#1');
  const iconColor = isDark ? '#FFFFFF' : Brand.primary;
  const iconName = CATEGORY_ICONS[category.slug] ?? 'package';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tileShadow,
        Bubble.radii,
        Shadows.sm,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {/* Clip layer carries overflow:'hidden' + Bubble.radii so the image is
          shaped to the organic card corners; shadow lives on the parent. */}
      <View style={[styles.tileClip, Bubble.radii, { overflow: 'hidden' }]}>
        {/* Image (or icon fallback) fills the card top, edge-to-edge */}
        {category.image_url ? (
          <Image
            source={{ uri: category.image_url }}
            style={styles.tileImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.tileImage, styles.tileIconFallback, { backgroundColor: tint }]}>
            <Feather name={iconName} size={32} color={iconColor} />
          </View>
        )}
        <View style={styles.tileLabelWrap}>
          <Text
            style={[styles.tileLabel, { color: colors.text }]}
            numberOfLines={2}
          >
            {category.title_ro.toUpperCase()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { categories, loading } = useMarketplaceCatalog('professional');

  // Top-level categories only, chunked into rows of 3 for the grid.
  const rows = useMemo(() => {
    const top = categories.filter((c) => c.parent_id === null);
    const chunked: MarketplaceCategory[][] = [];
    for (let i = 0; i < top.length; i += 3) {
      chunked.push(top.slice(i, i + 3));
    }
    return chunked;
  }, [categories]);

  const handlePress = useCallback(
    (slug: string) => router.push(`/marketplace/category/${slug}` as never),
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
          Toate categoriile
        </Text>

        {/* Spacer to balance the back button */}
        <View className="w-10" />
      </View>

      {/* ── Content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing['3xl'] },
        ]}
      >
        {loading && rows.length === 0 ? (
          <View className="flex-1 items-center justify-center" style={{ paddingTop: Spacing['3xl'] }}>
            <ActivityIndicator size="small" color={Brand.primary} />
          </View>
        ) : rows.length === 0 ? (
          <View className="flex-1 items-center justify-center" style={{ paddingTop: Spacing['3xl'] }}>
            <Feather name="layers" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              Nu sunt categorii disponibile
            </Text>
          </View>
        ) : (
          rows.map((row, rIdx) => (
            <Animated.View
              key={rIdx}
              entering={slideIn(rIdx * 60)}
              style={styles.gridRow}
            >
              {row.map((cat) => (
                <View key={cat.id} style={styles.gridCell}>
                  <CategoryGridTile
                    category={cat}
                    onPress={() => handlePress(cat.slug)}
                    colors={colors}
                  />
                </View>
              ))}
              {/* Spacers keep a short final row left-aligned in the 3-col grid */}
              {row.length < 3 &&
                Array.from({ length: 3 - row.length }).map((_, si) => (
                  <View key={`spacer-${si}`} style={styles.gridCell} />
                ))}
            </Animated.View>
          ))
        )}
      </ScrollView>
    </GradientBackground>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  emptyText: {
    ...Typography.caption,
    marginTop: Spacing.md,
    textAlign: 'center',
  },

  // ── Grid ──
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  gridCell: {
    flex: 1,
  },

  // ── Tile ──
  // Shadow layer — Bubble.radii + Shadows.sm applied inline, NO overflow so the
  // iOS shadow renders freely (it's dropped under overflow:'hidden').
  tileShadow: {
    width: '100%',
  },
  // Clip layer — overflow:'hidden' + Bubble.radii applied inline; white card bg.
  tileClip: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  // Image fills the card top edge-to-edge; the tint circle + podium are baked
  // into the asset itself, so we don't render a separate backdrop.
  tileImage: {
    width: '100%',
    aspectRatio: 1,
  },
  tileIconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabelWrap: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  tileLabel: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'center',
    letterSpacing: 0.3,
    minHeight: 34,
  },
});
