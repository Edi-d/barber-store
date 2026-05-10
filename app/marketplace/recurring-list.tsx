/**
 * /marketplace/recurring-list — "Lista mea" recurring shopping list.
 *
 * Salons curate the products + qty they reorder regularly. One-tap
 * "Adauga toate in cos" rebuilds the cart from the entire list.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { GradientBackground } from '@/components/ui/GradientBackground';
import { useSalonContext } from '@/hooks/useSalonContext';
import { useRecurringList, type RecurringListItem } from '@/hooks/use-recurring-list';
import { useMarketplaceCart } from '@/hooks/use-marketplace-cart';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Brand,
  Bubble,
  Colors,
  FontFamily,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/theme';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const slideIn = (delay = 0) =>
  FadeInDown.duration(400).delay(delay).easing(SMOOTH).withInitialValues({
    opacity: 0,
    transform: [{ translateY: 12 }],
  });

function formatPrice(cents: number): string {
  const ron = cents / 100;
  return ron % 1 === 0 ? `${ron} RON` : `${ron.toFixed(2)} RON`;
}

export default function RecurringListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { salonId, isOwner } = useSalonContext();
  const { items, loading, error, setItemQty, remove } = useRecurringList(salonId);
  const cart = useMarketplaceCart();
  const [addingAll, setAddingAll] = useState(false);

  const totalCents = items.reduce(
    (sum, i) => (i.is_active ? sum + i.price_cents * i.qty : sum),
    0,
  );
  const availableItems = items.filter((i) => i.is_active && i.stock_qty > 0);

  const handleAddAll = useCallback(() => {
    if (availableItems.length === 0) {
      Alert.alert(
        'Niciun produs disponibil',
        'Niciun produs din lista nu este disponibil pe stoc.',
      );
      return;
    }
    setAddingAll(true);
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    cart.addItems(
      availableItems.map((i) => ({
        product_id: i.product_id,
        qty: Math.min(i.qty, i.stock_qty),
        unit_price_cents: i.price_cents,
        title_snapshot: i.product_name,
        image_url: i.image_url,
        brand: i.brand,
      })),
    );
    setAddingAll(false);
    router.push('/marketplace/cart' as any);
  }, [availableItems, cart, router]);

  const handleProductPress = useCallback(
    (productId: string) => {
      router.push(`/marketplace/product/${productId}` as any);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: RecurringListItem; index: number }) => {
      const outOfStock = item.is_active ? item.stock_qty <= 0 : true;
      const stockLow = item.stock_qty > 0 && item.stock_qty < item.qty;

      return (
        <Animated.View entering={slideIn(index * 30)} style={[styles.itemCard, Shadows.sm]}>
          <BlurView intensity={40} tint="light" style={styles.itemInner}>
            <Pressable
              onPress={() => handleProductPress(item.product_id)}
              className="flex-1 flex-row gap-2 items-center"
              style={styles.itemContent}
            >
              {item.image_url ? (
                <Image
                  source={{ uri: item.image_url }}
                  style={styles.itemImage as any}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                  <Feather name="package" size={22} color={colors.textTertiary} />
                </View>
              )}

              <View style={styles.itemInfo}>
                {item.brand && (
                  <Text
                    style={[styles.itemBrand, { color: colors.textTertiary }]}
                    numberOfLines={1}
                  >
                    {item.brand}
                  </Text>
                )}
                <Text
                  style={[styles.itemName, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {item.product_name}
                </Text>
                <Text style={[styles.itemPrice, { color: colors.textSecondary }]}>
                  {formatPrice(item.price_cents)} / buc
                </Text>
                {outOfStock && (
                  <View style={styles.warnRow}>
                    <Feather name="alert-circle" size={11} color="#E53935" />
                    <Text style={styles.warnText}>Indisponibil</Text>
                  </View>
                )}
                {!outOfStock && stockLow && (
                  <View style={styles.warnRow}>
                    <Feather name="alert-triangle" size={11} color="#F59E0B" />
                    <Text style={styles.warnTextAmber}>Stoc: {item.stock_qty} buc</Text>
                  </View>
                )}
              </View>
            </Pressable>

            {/* Qty stepper + delete */}
            <View style={styles.actions}>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setItemQty(item.id, item.qty - 1)}
                  className="items-center justify-center"
                  style={styles.stepBtn}
                  hitSlop={4}
                >
                  <Feather name="minus" size={13} color="#fff" />
                </Pressable>
                <Text style={[styles.stepCount, { color: colors.text }]}>
                  {item.qty}
                </Text>
                <Pressable
                  onPress={() => setItemQty(item.id, item.qty + 1)}
                  className="items-center justify-center"
                  style={styles.stepBtn}
                  hitSlop={4}
                >
                  <Feather name="plus" size={13} color="#fff" />
                </Pressable>
              </View>

              {isOwner && (
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'ios') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    remove(item.id);
                  }}
                  hitSlop={6}
                  style={styles.deleteIcon}
                >
                  <Feather name="trash-2" size={16} color="#E53935" />
                </TouchableOpacity>
              )}
            </View>
          </BlurView>
        </Animated.View>
      );
    },
    [colors, handleProductPress, isOwner, remove, setItemQty],
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
      <Text style={[styles.headerTitle, { color: colors.text }]}>Lista mea</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {Header}

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 140 },
        ]}
        ListHeaderComponent={
          items.length > 0 ? (
            <Animated.View entering={slideIn(0)} style={styles.intro}>
              <Feather name="bookmark" size={14} color={Brand.primary} />
              <Text style={[styles.introText, { color: colors.text }]}>
                {items.length} {items.length === 1 ? 'produs' : 'produse'} salvate ·
                Estimat: {formatPrice(totalCents)}
              </Text>
            </Animated.View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerFill}>
              <ActivityIndicator size="large" color={Brand.primary} />
            </View>
          ) : error ? (
            <View style={styles.centerFill}>
              <Feather name="alert-triangle" size={32} color={colors.error} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Nu am putut incarca lista
              </Text>
            </View>
          ) : (
            <View style={styles.centerFill}>
              <View
                style={[styles.emptyIconWrap, { backgroundColor: colors.primaryMuted }]}
              >
                <Feather name="bookmark" size={36} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Lista ta este goala
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                Adauga produse din magazin folosind butonul "Adauga in lista" de pe
                pagina produsului. Apoi poti reumple cosul cu o singura apasare.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/shop' as any)}
                activeOpacity={0.85}
                style={[styles.primaryOuter, Shadows.glow]}
              >
                <LinearGradient
                  colors={[Brand.gradientStart, Brand.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryText}>Catre magazin</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />

      {items.length > 0 && (
        <View
          style={[
            styles.footerWrap,
            { paddingBottom: insets.bottom + Spacing.md },
          ]}
        >
          <TouchableOpacity
            onPress={handleAddAll}
            disabled={addingAll || availableItems.length === 0}
            activeOpacity={0.85}
            style={[
              styles.primaryOuter,
              Shadows.glow,
              (addingAll || availableItems.length === 0) && { opacity: 0.6 },
            ]}
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
              <Text style={styles.primaryText}>
                Adauga tot in cos ({availableItems.length})
              </Text>
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
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  introText: {
    ...Typography.captionSemiBold,
    flex: 1,
  },
  itemCard: {
    ...Bubble.radiiSm,
    overflow: 'hidden',
  },
  itemInner: {
    ...Bubble.radiiSm,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.55)',
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  itemImage: {
    width: 56,
    height: 56,
    ...Bubble.radiiSm,
    backgroundColor: '#fff',
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemBrand: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemName: {
    ...Typography.captionSemiBold,
    fontSize: 13,
    lineHeight: 17,
  },
  itemPrice: {
    ...Typography.small,
    fontSize: 12,
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  warnText: {
    color: '#E53935',
    fontSize: 11,
    fontFamily: FontFamily.semiBold,
  },
  warnTextAmber: {
    color: '#F59E0B',
    fontSize: 11,
    fontFamily: FontFamily.semiBold,
  },
  actions: {
    alignItems: 'flex-end',
    gap: 6,
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
  stepCount: {
    ...Typography.captionSemiBold,
    minWidth: 18,
    textAlign: 'center',
  },
  deleteIcon: {
    padding: 4,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    ...Typography.h3,
    textAlign: 'center',
  },
  emptyDesc: {
    ...Typography.caption,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
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
