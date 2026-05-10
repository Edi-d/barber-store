/**
 * /marketplace/orders — salon B2B order history.
 *
 * Lists past orders (most recent first), with a one-tap "Comanda din nou"
 * that rebuilds the cart from the order's items and routes to /cart.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
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
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { useSalonOrders, type SalonOrderSummary } from '@/hooks/use-salon-orders';
import { useMarketplaceCart } from '@/hooks/use-marketplace-cart';
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  placed:    { label: 'Plasata',      color: '#F59E0B' },
  paid:      { label: 'Platita',      color: '#2E7D32' },
  preparing: { label: 'In pregatire', color: Brand.indigo },
  shipped:   { label: 'Expediata',    color: Brand.primary },
  delivered: { label: 'Livrata',      color: '#2E7D32' },
  cancelled: { label: 'Anulata',      color: '#E53935' },
  returned:  { label: 'Returnata',    color: '#94A3B8' },
  refunded:  { label: 'Restituita',   color: '#94A3B8' },
};

export default function SalonOrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  // Derive salonId from salon_members without requiring SalonProvider
  const session = useAuthStore((s) => s.session);
  const [salonId, setSalonId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user.id) return;
    supabase
      .from('salon_members')
      .select('salon_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setSalonId(data?.salon_id ?? null));
  }, [session?.user.id]);

  const { orders, loading, error, refetch, buildReorderItems } = useSalonOrders(salonId);
  const cart = useMarketplaceCart();

  const [refreshing, setRefreshing] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleReorder = useCallback(
    async (order: SalonOrderSummary) => {
      setReorderingId(order.id);
      const items = await buildReorderItems(order.id);
      setReorderingId(null);
      if (items.length === 0) {
        Alert.alert('Niciun produs', 'Nu am putut reconstrui aceasta comanda.');
        return;
      }
      const unavailable = items.filter((i) => !i.available);
      if (unavailable.length === items.length) {
        Alert.alert(
          'Produse indisponibile',
          'Toate produsele din aceasta comanda nu mai sunt pe stoc.',
        );
        return;
      }
      const available = items.filter((i) => i.available);

      const proceed = () => {
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        cart.replaceItems(
          available.map((i) => ({
            product_id: i.product_id,
            qty: i.qty,
            unit_price_cents: i.unit_price_cents,
            title_snapshot: i.title_snapshot,
            image_url: i.image_url,
            brand: i.brand,
          })),
        );
        router.push('/cart' as any);
      };

      if (unavailable.length > 0) {
        Alert.alert(
          'Cativa produse nu mai sunt disponibile',
          `${unavailable.length} produs(e) nu mai sunt pe stoc si vor fi sarite. Continuam?`,
          [
            { text: 'Renunta', style: 'cancel' },
            { text: 'Continua', onPress: proceed },
          ],
        );
        return;
      }
      proceed();
    },
    [buildReorderItems, cart, router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SalonOrderSummary; index: number }) => {
      const status = STATUS_LABELS[item.status] ?? {
        label: item.status,
        color: colors.textSecondary,
      };
      const isReordering = reorderingId === item.id;

      return (
        <Animated.View entering={slideIn(index * 30)} style={[styles.card, Shadows.sm]}>
          <BlurView intensity={40} tint="light" style={styles.cardInner}>
            <TouchableOpacity
              onPress={() => router.push(`/marketplace/order/${item.id}` as any)}
              activeOpacity={0.85}
              style={styles.cardHeader}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.orderNumber, { color: colors.text }]}>
                  {item.order_number}
                </Text>
                <Text style={[styles.orderDate, { color: colors.textTertiary }]}>
                  {formatDate(item.placed_at)} · {item.item_count}{' '}
                  {item.item_count === 1 ? 'bucata' : 'bucati'}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: status.color + '18' }]}>
                <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                <Text style={[styles.statusText, { color: status.color }]}>
                  {status.label}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.separator }]} />

            <View style={styles.cardFooter}>
              <View style={styles.totalCol}>
                <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>
                  Total
                </Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>
                  {formatPrice(item.total_cents)}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => handleReorder(item)}
                disabled={isReordering}
                activeOpacity={0.85}
                style={[styles.reorderBtn, Shadows.sm, isReordering && { opacity: 0.6 }]}
              >
                <LinearGradient
                  colors={[Brand.gradientStart, Brand.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.reorderGradient}
                >
                  {isReordering ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="refresh-cw" size={14} color="#fff" />
                      <Text style={styles.reorderText}>Comanda din nou</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Animated.View>
      );
    },
    [colors, handleReorder, reorderingId, router],
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
        Comenzile salonului
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  const memoOrders = useMemo(() => orders, [orders]);

  if (!salonId) {
    return (
      <GradientBackground>
        <Stack.Screen options={{ headerShown: false }} />
        {Header}
        <View style={styles.centerFill}>
          <Feather name="briefcase" size={44} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Niciun salon activ
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
            Contul tau nu este asociat cu niciun salon.
          </Text>
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {Header}

      <FlatList
        data={memoOrders}
        keyExtractor={(o) => o.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + Spacing['2xl'] },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Brand.primary}
          />
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
                Nu am putut incarca comenzile
              </Text>
            </View>
          ) : (
            <View style={styles.centerFill}>
              <View
                style={[styles.emptyIconWrap, { backgroundColor: colors.primaryMuted }]}
              >
                <Feather name="shopping-bag" size={36} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Inca nu ai comenzi
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                Comenzile salonului apar aici. Cu un singur tap, le poti repeta
                instant.
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
  card: {
    ...Bubble.radii,
    overflow: 'hidden',
  },
  cardInner: {
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.55)',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  orderNumber: {
    ...Typography.bodySemiBold,
    fontSize: 15,
  },
  orderDate: {
    ...Typography.small,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    ...Typography.smallSemiBold,
    fontSize: 11,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  totalCol: {
    gap: 2,
  },
  totalLabel: {
    ...Typography.small,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    ...Typography.h3,
    fontSize: 18,
  },
  reorderBtn: {
    ...Bubble.radiiSm,
    overflow: 'hidden',
  },
  reorderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    ...Bubble.radiiSm,
    minWidth: 140,
    justifyContent: 'center',
  },
  reorderText: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
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
  primaryOuter: {
    ...Bubble.radii,
    overflow: 'hidden',
    alignSelf: 'stretch',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
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
