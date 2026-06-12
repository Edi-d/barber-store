/**
 * MarketplaceDrawer — left-slide drawer.
 *
 * Two tabs at the top:
 *   - CATEGORII (default) — accordion category tree, tap-to-expand, navigates
 *     on leaf. Data supplied by useMarketplaceCatalog (Wave B1).
 *   - MENIU — 5 fixed items (Comenzi, Lista mea, Comanda rapida, Cheltuieli,
 *     Returnari). Comanda rapida + Cheltuieli are hidden when the logged-in
 *     user is not a salon owner (useBuyerType() !== 'salon').
 *
 * Animation: SlideInLeft 280ms / SlideOutLeft 220ms. Backdrop fades in 200ms /
 * out 180ms. Close-then-navigate pattern: we let the slide-out finish (220ms
 * setTimeout) before calling router.push so the two animations don't collide.
 *
 * Ported verbatim from Tapzi-barber/components/marketplace/MarketplaceDrawer.tsx
 * with the following adaptations for barber-store:
 *   1. Colors shim: `Colors[colorScheme]` — Colors already has nested light/dark
 *      in the target's constants/theme.ts so no extra wrapper is needed.
 *   2. useMarketplaceCatalog import: type-only guard with TODO comment since
 *      the hook lives in Wave B1 (being built in parallel).
 *   3. useBuyerType import: guarded as optional — falls back to 'client'.
 *   4. Simple layout View styles converted to NativeWind className.
 *      Asymmetric radii, shadows and gradients stay in style={}.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInLeft,
  SlideOutLeft,
} from 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Brand,
  Bubble,
  Colors,
  FontFamily,
  Shadows,
  Spacing,
} from '@/constants/theme';

import {
  useMarketplaceCatalog,
  type MarketplaceCategory,
} from '@/hooks/use-marketplace-catalog';
import { useBuyerType } from '@/hooks/use-buyer-type';

// ─── Constants ──────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Use the *screen* height (full physical display) rather than the window
// height. The drawer renders inside a statusBarTranslucent full-screen Modal,
// so it must cover the area behind both the status bar and the navigation bar.
// window.height excludes the nav bar on Android and would leave a gap at the
// bottom of the panel.
const SCREEN_HEIGHT = Dimensions.get('screen').height;
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.86, 360);

// Resolve a representative Feather icon for a category by matching keywords in
// its slug + Romanian title. Keyword-based (not slug-keyed) so it survives the
// nopCommerce se_name slugs, which don't match fixed keys. Order matters where
// substrings overlap (e.g. "aparatura" before "par"); first hit wins.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function categoryIcon(slug: string, title: string): keyof typeof Feather.glyphMap {
  const hay = normalizeForMatch(`${slug} ${title}`);
  const has = (...keys: string[]) => keys.some((k) => hay.includes(k));

  if (has('aparat', 'masini', 'trimmer', 'clipper')) return 'zap';
  if (has('foarfec', 'scissor')) return 'scissors';
  if (has('piepten', 'perii', 'comb', 'brush')) return 'wind';
  if (has('barbierit', 'barbier', 'shav', 'ras')) return 'edit-3';
  if (has('barba', 'mustat', 'beard')) return 'user';
  if (has('parul', 'parului', 'hair')) return 'droplet';
  if (has('facial', 'tratament', 'face')) return 'smile';
  if (has('corp', 'body')) return 'heart';
  if (has('cosmetic', 'makeup', 'machiaj')) return 'star';
  if (has('accesor', 'frizerie')) return 'grid';
  if (has('consumabil')) return 'layers';
  if (has('dezinfect', 'igien', 'hygien', 'steril')) return 'shield';
  if (has('curaten', 'clean')) return 'trash-2';
  if (has('mobilier', 'scaun', 'furniture')) return 'home';
  if (has('cadou', 'gift')) return 'gift';
  if (has('pachet', 'promo', 'oferta')) return 'tag';
  return 'package';
}

type TabKey = 'categorii' | 'meniu';

// ─── Props ──────────────────────────────────────────────────────────────────

export type MarketplaceDrawerProps = {
  visible: boolean;
  onClose: () => void;
};

// ─── Component ──────────────────────────────────────────────────────────────

export function MarketplaceDrawer({
  visible,
  onClose,
}: MarketplaceDrawerProps): React.JSX.Element | null {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const [tab, setTab] = useState<TabKey>('categorii');
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const buyerType = useBuyerType();
  const { categories } = useMarketplaceCatalog('consumer');

  const topCategories = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories],
  );

  // Build parent → children index once per categories change for O(1) expand.
  const childrenByParent = useMemo(() => {
    const m = new Map<string, MarketplaceCategory[]>();
    for (const c of categories) {
      if (!c.parent_id) continue;
      const arr = m.get(c.parent_id) ?? [];
      arr.push(c);
      m.set(c.parent_id, arr);
    }
    return m;
  }, [categories]);

  // Close-then-navigate: wait 220ms (SlideOutLeft duration) before push so
  // exit animation finishes before the incoming route mounts.
  const navigate = useCallback(
    (path: string) => {
      Haptics.selectionAsync().catch(() => {});
      onClose();
      setTimeout(() => router.push(path as never), 220);
    },
    [onClose, router],
  );

  const handleCategoryRowPress = useCallback(
    (cat: MarketplaceCategory) => {
      const kids = childrenByParent.get(cat.id) ?? [];
      if (kids.length === 0) {
        navigate(`/marketplace/category/${cat.slug}`);
      } else {
        Haptics.selectionAsync().catch(() => {});
        setExpandedSlug((prev) => (prev === cat.slug ? null : cat.slug));
      }
    },
    [childrenByParent, navigate],
  );

  if (!visible) return null;

  // MENIU items. Comanda rapida and Cheltuieli are owner-only (B2B salon).
  type MenuItem = {
    icon: keyof typeof Feather.glyphMap;
    label: string;
    /** null = coming soon (shows Alert instead of navigating) */
    path: string | null;
    ownerOnly?: boolean;
  };
  const allMeniuItems: MenuItem[] = [
    { icon: 'shopping-bag', label: 'Comenzi',          path: '/marketplace/orders' },
    { icon: 'award',        label: 'Branduri',          path: '/marketplace/brands' },
    { icon: 'heart',        label: 'Favorite',          path: '/marketplace/favorites' },
    { icon: 'repeat',       label: 'Lista mea',         path: '/marketplace/recurring-list' },
    { icon: 'zap',          label: 'Comanda rapida',    path: '/marketplace/quick-order',    ownerOnly: true },
    { icon: 'bar-chart-2',  label: 'Cheltuieli',        path: '/marketplace/spending',       ownerOnly: true },
    { icon: 'rotate-ccw',   label: 'Returnari',         path: null },
  ];
  const meniuItems = allMeniuItems.filter(
    (item) => !item.ownerOnly || buyerType === 'salon',
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* root fills the screen so the backdrop covers everything */}
      <View className="flex-1">
        {/* Backdrop — full-screen, dismisses on tap */}
        <Animated.View
          entering={FadeIn.duration(200).easing(SMOOTH)}
          exiting={FadeOut.duration(180).easing(SMOOTH)}
          style={[
            StyleSheet.absoluteFill,
            { zIndex: 9, backgroundColor: 'rgba(10,16,28,0.45)' },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Panel — slides from the left edge */}
        <Animated.View
          entering={SlideInLeft.duration(280).easing(SMOOTH)}
          exiting={SlideOutLeft.duration(220).easing(SMOOTH)}
          style={[
            {
              // Explicit full-screen height (not top+bottom:0) so the panel stays
              // full-height: a reanimated SlideInLeft entering animation on a
              // top/bottom-anchored box measures full height mid-animation, then
              // collapses to content height once it settles. A fixed height has
              // nothing to recompute.
              position: 'absolute',
              top: 0,
              left: 0,
              height: SCREEN_HEIGHT,
              zIndex: 10,
              backgroundColor: '#FFFFFF',
              width: DRAWER_WIDTH,
              borderTopRightRadius: 12,
              borderBottomRightRadius: 12,
              overflow: 'hidden',
              paddingTop: insets.top + Spacing.sm,
            },
            Shadows.lg,
          ]}
        >
          {/* Header — close X anchored right */}
          <View style={styles.header}>
            <Pressable
              hitSlop={10}
              onPress={onClose}
              style={[
                styles.closeBtn,
                { backgroundColor: colors.backgroundSecondary },
              ]}
            >
              <Feather name="x" size={18} color={colors.text} />
            </Pressable>
          </View>

          {/* Tab row */}
          <View style={styles.tabRow}>
            <Tab
              label="CATEGORII"
              active={tab === 'categorii'}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTab('categorii');
              }}
            />
            <Tab
              label="MENIU"
              active={tab === 'meniu'}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTab('meniu');
              }}
            />
          </View>

          {/* Tab content */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + Spacing.xl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {tab === 'categorii' ? (
              topCategories.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textTertiary }]}>
                  Categoriile vor aparea dupa import.
                </Text>
              ) : (
                topCategories.map((cat) => {
                  const kids = childrenByParent.get(cat.id) ?? [];
                  const isExpanded = expandedSlug === cat.slug;
                  const iconName = categoryIcon(cat.slug, cat.title_ro);
                  return (
                    <View key={cat.id}>
                      <Pressable
                        onPress={() => handleCategoryRowPress(cat)}
                        className="flex-row items-center gap-3 py-3"
                        style={({ pressed }) => [
                          {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.separator,
                          },
                          pressed && {
                            backgroundColor: 'rgba(10,102,194,0.04)',
                          },
                        ]}
                      >
                        <View style={styles.categoryIconWrap}>
                          <Feather
                            name={iconName}
                            size={16}
                            color={colors.text}
                          />
                        </View>
                        <Text
                          style={[
                            styles.categoryLabel,
                            { color: colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {cat.title_ro.toUpperCase()}
                        </Text>
                        {kids.length > 0 && (
                          <Feather
                            name={
                              isExpanded ? 'chevron-up' : 'chevron-down'
                            }
                            size={16}
                            color={colors.textSecondary}
                          />
                        )}
                      </Pressable>

                      {isExpanded && (
                        <View style={styles.subList}>
                          {kids.map((kid) => (
                            <Pressable
                              key={kid.id}
                              onPress={() =>
                                navigate(
                                  `/marketplace/category/${kid.slug}`,
                                )
                              }
                              style={({ pressed }) => [
                                styles.subRow,
                                pressed && {
                                  backgroundColor: 'rgba(10,102,194,0.04)',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.subLabel,
                                  { color: colors.textSecondary },
                                ]}
                                numberOfLines={1}
                              >
                                {kid.title_ro}
                              </Text>
                              <Feather
                                name="chevron-right"
                                size={14}
                                color={colors.textTertiary}
                              />
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )
            ) : (
              meniuItems.map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => {
                    if (item.path === null) {
                      Haptics.selectionAsync().catch(() => {});
                      Alert.alert('In curand', 'Aceasta functie va fi disponibila in curand.');
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className="flex-row items-center gap-3 py-3"
                  style={({ pressed }) => [
                    {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.separator,
                    },
                    pressed && { backgroundColor: 'rgba(10,102,194,0.04)' },
                  ]}
                >
                  <View style={styles.meniuIconWrap}>
                    <Feather name={item.icon} size={16} color={item.path === null ? colors.textTertiary : colors.text} />
                  </View>
                  <Text
                    className="flex-1"
                    style={[styles.meniuLabel, { color: item.path === null ? colors.textTertiary : colors.text }]}
                  >
                    {item.label}
                  </Text>
                  <Feather
                    name={item.path === null ? 'clock' : 'chevron-right'}
                    size={16}
                    color={colors.textTertiary}
                  />
                </Pressable>
              ))
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Tab pill ────────────────────────────────────────────────────────────────
// Active: brand gradient pill (same as home-screen FAB). Inactive: gray pill.

function Tab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  if (active) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[styles.tab, Shadows.sm]}
      >
        <LinearGradient
          colors={[Brand.gradientStart, Brand.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tabGradient}
        >
          <Text style={[styles.tabText, { color: '#FFFFFF' }]}>{label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.tab, styles.tabInactive]}
    >
      <Text style={[styles.tabText, { color: '#1B1F27' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header — close X only, anchored right
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    ...Bubble.radiiSm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    height: 36,
    overflow: 'hidden',
    ...Bubble.radiiSm,
  },
  tabInactive: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...Bubble.radiiSm,
  },
  tabText: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.4,
  },

  // Body
  content: {
    paddingHorizontal: Spacing.lg,
  },
  empty: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing['2xl'],
  },

  // Category rows (CATEGORII tab)
  categoryIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    flex: 1,
    fontFamily: FontFamily.bold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  subList: {
    paddingLeft: 28 + Spacing.md,
    paddingBottom: Spacing.sm,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  subLabel: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: 13,
  },

  // Meniu rows (MENIU tab)
  meniuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  meniuIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meniuLabel: {
    flex: 1,
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
  },
});
