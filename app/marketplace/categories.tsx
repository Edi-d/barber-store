/**
 * /marketplace/categories — Full hierarchical category list.
 *
 * Reached from "VEZI TOATE CATEGORIILE" on the marketplace home.
 * Lists every top-level category with subcategories, staggered FadeInDown.
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

// ─── CategoryCircle ───────────────────────────────────────────────────────────

function CategoryCircle({ category }: { category: MarketplaceCategory }) {
  const tint = CATEGORY_TINTS[category.slug] ?? '#E5E7EB';
  // Dark backgrounds (Tapzi barba/mustata pattern) get white icons
  const isDark = tint.startsWith('#3') || tint.startsWith('#2') || tint.startsWith('#1');
  const iconColor = isDark ? '#FFFFFF' : Brand.primary;
  const iconName = CATEGORY_ICONS[category.slug] ?? 'package';

  return (
    <View style={[styles.circle, { backgroundColor: tint }]}>
      {category.image_url ? (
        <Image
          source={{ uri: category.image_url }}
          style={styles.circleImage}
          resizeMode="contain"
        />
      ) : (
        <Feather name={iconName} size={22} color={iconColor} />
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { categories, loading } = useMarketplaceCatalog('professional');

  // Build parent → children tree
  const tree = useMemo(() => {
    const top = categories.filter((c) => c.parent_id === null);
    const byParent = new Map<string, MarketplaceCategory[]>();
    for (const c of categories) {
      if (!c.parent_id) continue;
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    }
    return top.map((parent) => ({
      parent,
      children: byParent.get(parent.id) ?? [],
    }));
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
        {loading && tree.length === 0 ? (
          <View className="flex-1 items-center justify-center" style={{ paddingTop: Spacing['3xl'] }}>
            <ActivityIndicator size="small" color={Brand.primary} />
          </View>
        ) : tree.length === 0 ? (
          <View className="flex-1 items-center justify-center" style={{ paddingTop: Spacing['3xl'] }}>
            <Feather name="layers" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              Nu sunt categorii disponibile
            </Text>
          </View>
        ) : (
          tree.map((node, idx) => (
            <Animated.View
              key={node.parent.id}
              entering={slideIn(idx * 60)}
              style={styles.group}
            >
              {/* Parent row */}
              <Pressable
                onPress={() => handlePress(node.parent.slug)}
                style={({ pressed }) => [
                  styles.parentHeader,
                  Shadows.sm,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <CategoryCircle category={node.parent} />
                <View className="flex-1 gap-0.5">
                  <Text style={[styles.parentTitle, { color: colors.text }]}>
                    {node.parent.title_ro.toUpperCase()}
                  </Text>
                  <Text style={[styles.parentMeta, { color: colors.textSecondary }]}>
                    {node.children.length === 0
                      ? 'Vezi toate produsele'
                      : `${node.children.length} ${node.children.length === 1 ? 'subcategorie' : 'subcategorii'}`}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textTertiary} />
              </Pressable>

              {/* Children list */}
              {node.children.length > 0 && (
                <View
                  style={[
                    styles.childrenList,
                    { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                  ]}
                >
                  {node.children.map((child, cIdx) => (
                    <Pressable
                      key={child.id}
                      onPress={() => handlePress(child.slug)}
                      style={({ pressed }) => [
                        styles.childRow,
                        cIdx > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.separator,
                        },
                        pressed && { backgroundColor: 'rgba(10,102,194,0.04)' },
                      ]}
                    >
                      <Text
                        className="text-sm flex-1"
                        style={[styles.childTitle, { color: colors.text }]}
                      >
                        {child.title_ro}
                      </Text>
                      <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                    </Pressable>
                  ))}
                </View>
              )}
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

  group: {
    marginBottom: Spacing.lg,
  },

  // Parent card
  parentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: 14,
  },
  parentTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 14,
    letterSpacing: 0.6,
  },
  parentMeta: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
  },

  // Children list
  childrenList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    overflow: 'hidden',
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  childTitle: {
    fontFamily: FontFamily.regular,
    paddingRight: Spacing.sm,
  },

  // 56×56 circle tile
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circleImage: {
    width: '90%',
    height: '90%',
  },
});
