/**
 * /marketplace/quick-order — bulk-add screen for B2B power users.
 *
 * Lists every active marketplace product with an inline qty stepper.
 * "Adauga in cos" sends all selected lines to the cart in one shot.
 * Search is local (server already filters by section/active).
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from '@/components/ui/Image';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import { GradientBackground } from '@/components/ui/GradientBackground';
import {
  useMarketplaceCatalog,
  type MarketplaceSection,
  type MarketplaceProduct,
} from '@/hooks/use-marketplace-catalog';
import { useMarketplaceCart } from '@/hooks/use-marketplace-cart';
import { useSalonContext } from '@/hooks/useSalonContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Brand,
  Bubble,
  Colors,
  FontFamily,
  Radius,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/theme';

function formatPrice(cents: number): string {
  const ron = cents / 100;
  return ron % 1 === 0 ? `${ron} RON` : `${ron.toFixed(2)} RON`;
}

function pickImage(p: MarketplaceProduct): string | null {
  return p.images && p.images.length > 0 ? p.images[0] : null;
}

export default function QuickOrderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { isOwner } = useSalonContext();
  // Salon owners default to 'professional'; others see 'consumer'.
  const initialSection: MarketplaceSection =
    isOwner ? 'professional' : 'consumer';

  const [section, setSection] = useState<MarketplaceSection>(initialSection);
  const [search, setSearch] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

  const catalog = useMarketplaceCatalog(section);
  const cart = useMarketplaceCart();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog.products;
    return catalog.products.filter((p) => {
      const haystack = `${p.name} ${p.brand ?? ''} ${p.sku}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [catalog.products, search]);

  const selectedCount = useMemo(
    () => Object.values(qtyMap).filter((q) => q > 0).length,
    [qtyMap],
  );

  const totalCents = useMemo(() => {
    return filtered.reduce((sum, p) => {
      const q = qtyMap[p.id] ?? 0;
      return sum + p.price_cents * q;
    }, 0);
  }, [filtered, qtyMap]);

  const setQty = useCallback(
    (productId: string, delta: number, max: number) => {
      if (Platform.OS === 'ios') Haptics.selectionAsync();
      setQtyMap((prev) => {
        const cur = prev[productId] ?? 0;
        const next = Math.max(0, Math.min(max, cur + delta));
        const copy = { ...prev };
        if (next === 0) {
          delete copy[productId];
        } else {
          copy[productId] = next;
        }
        return copy;
      });
    },
    [],
  );

  const handleAddToCart = useCallback(() => {
    const items = filtered
      .filter((p) => (qtyMap[p.id] ?? 0) > 0)
      .map((p) => ({
        product_id: p.id,
        qty: qtyMap[p.id]!,
        unit_price_cents: p.price_cents,
        title_snapshot: p.name,
        image_url: pickImage(p),
        brand: p.brand,
      }));
    if (items.length === 0) return;
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    cart.addItems(items);
    router.push('/marketplace/cart' as any);
  }, [filtered, qtyMap, cart, router]);

  const renderItem = useCallback(
    ({ item }: { item: MarketplaceProduct }) => {
      const q = qtyMap[item.id] ?? 0;
      const outOfStock = item.stock_qty <= 0;
      const image = pickImage(item);

      return (
        <View style={[styles.row, Shadows.sm]}>
          <BlurView intensity={40} tint="light" style={styles.rowInner}>
            {image ? (
              <Image
                source={{ uri: image }}
                style={styles.rowImage as any}
                contentFit="contain"
              />
            ) : (
              <View style={[styles.rowImage, styles.rowImagePlaceholder]}>
                <Feather name="package" size={20} color={colors.textTertiary} />
              </View>
            )}

            <View style={styles.rowInfo}>
              {item.brand && (
                <Text
                  style={[styles.rowBrand, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {item.brand}
                </Text>
              )}
              <Text
                style={[styles.rowName, { color: colors.text }]}
                numberOfLines={2}
              >
                {item.name}
              </Text>
              <View style={styles.rowMeta}>
                <Text style={[styles.rowPrice, { color: Brand.primary }]}>
                  {formatPrice(item.price_cents)}
                </Text>
                <Text style={[styles.rowSku, { color: colors.textTertiary }]}>
                  SKU: {item.sku}
                </Text>
              </View>
              {outOfStock ? (
                <Text style={styles.rowStockBad}>Epuizat</Text>
              ) : (
                <Text style={[styles.rowStockOk, { color: colors.textSecondary }]}>
                  {item.stock_qty} disp.
                </Text>
              )}
            </View>

            <View style={styles.rowControls}>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setQty(item.id, -1, item.stock_qty)}
                  disabled={q <= 0}
                  hitSlop={4}
                  className="items-center justify-center"
                  style={[styles.stepBtn, q <= 0 && styles.stepBtnDisabled]}
                >
                  <Feather name="minus" size={13} color="#fff" />
                </Pressable>
                <Text style={[styles.stepCount, { color: colors.text }]}>{q}</Text>
                <Pressable
                  onPress={() => setQty(item.id, +1, item.stock_qty)}
                  disabled={outOfStock || q >= item.stock_qty}
                  hitSlop={4}
                  className="items-center justify-center"
                  style={[
                    styles.stepBtn,
                    (outOfStock || q >= item.stock_qty) && styles.stepBtnDisabled,
                  ]}
                >
                  <Feather name="plus" size={13} color="#fff" />
                </Pressable>
              </View>
            </View>
          </BlurView>
        </View>
      );
    },
    [qtyMap, colors, setQty],
  );

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={[
          styles.backButton,
          {
            backgroundColor: 'rgba(255,255,255,0.65)',
            borderColor: 'rgba(255,255,255,0.9)',
          },
        ]}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="arrow-left" size={20} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]}>
        Comandă rapidă
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {Header}

      {/* Section toggle — owners only */}
      {isOwner && (
        <View style={styles.toggleWrap}>
          <View style={styles.toggle}>
            <Pressable
              onPress={() => setSection('professional')}
              className="flex-1 py-2 items-center rounded-full"
              style={[
                section === 'professional' && { backgroundColor: Brand.primary },
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  { color: section === 'professional' ? '#fff' : colors.textSecondary },
                ]}
              >
                Profesional
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSection('consumer')}
              className="flex-1 py-2 items-center rounded-full"
              style={[
                section === 'consumer' && { backgroundColor: Brand.primary },
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  { color: section === 'consumer' ? '#fff' : colors.textSecondary },
                ]}
              >
                Consumator
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
            },
          ]}
        >
          <Feather name="search" size={16} color={colors.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Caută după nume, brand sau SKU"
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.text }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={6}
              className="items-center justify-center"
            >
              <Feather name="x" size={16} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          {
            paddingBottom:
              insets.bottom + (selectedCount > 0 ? 140 : Spacing['2xl']),
          },
        ]}
        ListEmptyComponent={
          catalog.loading ? (
            <View style={styles.centerFill}>
              <ActivityIndicator size="large" color={Brand.primary} />
            </View>
          ) : (
            <View style={styles.centerFill}>
              <Feather name="search" size={28} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Niciun produs găsit
              </Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Sticky footer CTA */}
      {selectedCount > 0 && (
        <View
          style={[
            styles.footerWrap,
            { paddingBottom: insets.bottom + Spacing.md },
          ]}
        >
          <View style={styles.footerSummary}>
            <Text style={[styles.footerCount, { color: colors.textSecondary }]}>
              {selectedCount} {selectedCount === 1 ? 'produs' : 'produse'} selectate
            </Text>
            <Text style={[styles.footerTotal, { color: colors.text }]}>
              {formatPrice(totalCents)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleAddToCart}
            activeOpacity={0.85}
            style={[styles.primaryOuter, Shadows.glow]}
          >
            <LinearGradient
              colors={[Brand.gradientStart, Brand.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryGradient}
            >
              <Feather
                name="shopping-bag"
                size={18}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.primaryText}>Adaugă în coș</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['2xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...Bubble.radiiSm,
  },
  headerTitle: {
    ...Typography.h3,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: { width: 40, height: 40 },
  toggleWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  toggle: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  toggleText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
  },
  searchWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: 14,
    padding: 0,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    gap: Spacing.sm,
  },
  row: {
    ...Bubble.radiiSm,
    overflow: 'hidden',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    ...Bubble.radiiSm,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.55)',
    padding: Spacing.sm,
  },
  rowImage: {
    width: 52,
    height: 52,
    ...Bubble.radiiSm,
    backgroundColor: '#fff',
  },
  rowImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowBrand: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowName: {
    ...Typography.captionSemiBold,
    fontSize: 13,
    lineHeight: 16,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  rowPrice: {
    ...Typography.captionSemiBold,
    fontSize: 13,
  },
  rowSku: {
    ...Typography.small,
    fontSize: 10,
  },
  rowStockOk: {
    ...Typography.small,
    fontSize: 11,
  },
  rowStockBad: {
    color: '#E53935',
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
  },
  rowControls: {
    alignItems: 'flex-end',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 20,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: {
    backgroundColor: '#B0B0B0',
  },
  stepCount: {
    ...Typography.captionSemiBold,
    minWidth: 20,
    textAlign: 'center',
  },
  emptyTitle: {
    ...Typography.h3,
    textAlign: 'center',
  },
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  footerSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  footerCount: {
    ...Typography.caption,
  },
  footerTotal: {
    ...Typography.h3,
  },
  primaryOuter: {
    ...Bubble.radii,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  primaryGradient: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    ...Bubble.radii,
  },
  primaryText: {
    color: '#fff',
    ...Typography.button,
  },
});
