import { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Brand, Bubble, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { formatPrice, timeAgo } from '@/lib/utils';
import { OrderWithItems, OrderStatus } from '@/types/database';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

const slideIn = (delay: number) =>
  FadeInDown.duration(400)
    .delay(delay)
    .easing(SMOOTH)
    .withInitialValues({ transform: [{ translateY: 12 }] });

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${year} - ${hours}:${mins}`;
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; icon: React.ComponentProps<typeof Feather>['name'] }
> = {
  pending: { label: 'In asteptare', color: '#F59E0B', icon: 'clock' },
  paid: { label: 'Platit', color: '#10B981', icon: 'check-circle' },
  shipped: { label: 'Expediat', color: Brand.primary, icon: 'truck' },
  cancelled: { label: 'Anulat', color: '#EF4444', icon: 'x-circle' },
};

const colors = Colors;

/* ─── Order Card ─── */
function OrderCard({
  order,
  isExpanded,
  onToggle,
  delay,
}: {
  order: OrderWithItems;
  isExpanded: boolean;
  onToggle: () => void;
  delay: number;
}) {
  const statusConfig = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const itemsCount = order.items?.reduce((acc, i) => acc + i.qty, 0) ?? 0;

  return (
    <Animated.View entering={slideIn(delay)}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onToggle}
        style={[
          styles.card,
          Shadows.md,
          {
            backgroundColor: 'rgba(255,255,255,0.75)',
            borderColor: 'rgba(255,255,255,0.6)',
          },
        ]}
      >
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={[styles.orderNumber, { color: colors.text }]}>
              #{order.id.slice(0, 8).toUpperCase()}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}18` }]}>
              <Feather name={statusConfig.icon} size={12} color={statusConfig.color} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>
          <Feather
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textTertiary}
          />
        </View>

        {/* Meta row */}
        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Feather name="calendar" size={13} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {formatDate(order.created_at)}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="shopping-bag" size={13} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {itemsCount} {itemsCount === 1 ? 'produs' : 'produse'}
            </Text>
          </View>
          <Text style={[styles.cardTotal, { color: colors.text }]}>
            {formatPrice(order.total_cents, order.currency)}
          </Text>
        </View>

        {/* Expanded details */}
        {isExpanded && (
          <View style={[styles.expandedSection, { borderTopColor: colors.separator }]}>
            {/* Items */}
            {order.items?.map((item, idx) => (
              <View key={`${item.product_id}-${idx}`} style={styles.orderItem}>
                {item.product?.image_url ? (
                  <Image
                    source={{ uri: item.product.image_url }}
                    style={styles.itemImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                    <Feather name="package" size={16} color={colors.textTertiary} />
                  </View>
                )}
                <View style={styles.itemInfo}>
                  <Text
                    style={[styles.itemName, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {item.product?.title}
                  </Text>
                </View>
                <View style={styles.itemRight}>
                  <Text style={[styles.itemQty, { color: colors.textSecondary }]}>
                    x{item.qty}
                  </Text>
                  <Text style={[styles.itemPrice, { color: colors.text }]}>
                    {formatPrice(item.price_cents * item.qty, item.product?.currency ?? 'RON')}
                  </Text>
                </View>
              </View>
            ))}

            {/* Summary */}
            <View style={[styles.summaryBlock, { borderTopColor: colors.separator }]}>
              <View style={styles.summaryRow}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>
                  {formatPrice(order.total_cents, order.currency)}
                </Text>
              </View>
            </View>

            {/* Shipping address */}
            {order.shipping_address ? (
              <View style={styles.contactBlock}>
                <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                  Adresa
                </Text>
                <Text style={[styles.contactText, { color: colors.textSecondary }]}>
                  {order.shipping_address}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ─── Orders Screen ─── */
export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders', session?.user.id],
    queryFn: async () => {
      if (!session) return [];

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          items:order_items(
            *,
            product:products(*)
          )
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as OrderWithItems[];
    },
    enabled: !!session,
  });

  const toggleExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        250,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={Brand.primary} />
      </View>
    );
  }

  const isEmpty = !orders || orders.length === 0;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ─── Custom Header ─── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity
          style={[
            styles.backButton,
            {
              backgroundColor: 'rgba(255,255,255,0.65)',
              borderColor: 'rgba(255,255,255,0.9)',
            },
          ]}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Comenzile mele</Text>
        <View style={styles.backButton} />
      </View>

      {isEmpty ? (
        /* ─── Empty State ─── */
        <View style={styles.emptyContainer}>
          <Animated.View entering={slideIn(0)} style={styles.emptyContent}>
            <View style={[styles.emptyIconWrap, { backgroundColor: Brand.primaryMuted }]}>
              <Feather name="inbox" size={44} color={Brand.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Nicio comanda inca
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
              Comenzile tale vor aparea aici dupa ce plasezi prima comanda
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/shop')}
              style={Shadows.glow}
            >
              <LinearGradient
                colors={[Brand.gradientStart, Brand.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shopButton}
              >
                <Feather name="shopping-bag" size={18} color="#fff" />
                <Text style={styles.shopButtonText}>Mergi la magazin</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      ) : (
        /* ─── Order List ─── */
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Brand.primary}
            />
          }
        >
          {orders.map((order, index) => (
            <OrderCard
              key={order.id}
              order={order}
              isExpanded={expandedId === order.id}
              onToggle={() => toggleExpand(order.id)}
              delay={index * 60}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  /* ── Loading ── */
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Navigation Header ── */
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    ...Bubble.radiiSm,
  },
  navTitle: {
    ...Typography.h3,
  },

  /* ── List ── */
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },

  /* ── Card ── */
  card: {
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    padding: Spacing.base,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  orderNumber: {
    ...Typography.bodySemiBold,
    fontSize: 15,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: {
    ...Typography.smallSemiBold,
    fontSize: 11,
  },

  /* ── Meta ── */
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...Typography.small,
  },
  cardTotal: {
    ...Typography.captionSemiBold,
    marginLeft: 'auto',
  },

  /* ── Expanded ── */
  expandedSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  itemImage: {
    width: 44,
    height: 44,
    ...Bubble.radiiSm,
    backgroundColor: '#fff',
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 1,
  },
  itemName: {
    ...Typography.captionSemiBold,
    fontSize: 13,
    lineHeight: 17,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  itemQty: {
    ...Typography.small,
  },
  itemPrice: {
    ...Typography.captionSemiBold,
    fontSize: 13,
  },

  /* ── Summary ── */
  summaryBlock: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    ...Typography.bodySemiBold,
  },
  totalValue: {
    ...Typography.h3,
    fontSize: 17,
  },

  /* ── Contact / Notes ── */
  contactBlock: {
    gap: 2,
  },
  sectionLabel: {
    ...Typography.small,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contactText: {
    ...Typography.caption,
  },

  /* ── Empty State ── */
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyContent: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.h3,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.caption,
    textAlign: 'center',
    maxWidth: 260,
  },
  shopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    ...Bubble.radii,
  },
  shopButtonText: {
    ...Typography.button,
    color: '#fff',
  },
});
