/**
 * /marketplace/order/[id] — marketplace order detail.
 *
 * Success card + delivery timeline (4 steps) + billing/shipping snapshot
 * + line items + payment summary + sticky footer CTAs.
 * Staggered FadeInDown entry animations.
 *
 * <OrderSuccessModal> is shown when status === 'paid' AND the route param
 * `fresh=1` is present (set by checkout.tsx on the router.replace call).
 * This ensures the modal only fires on the first view after a fresh checkout,
 * not when navigating back to a paid order later.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { GradientBackground } from '@/components/ui/GradientBackground';
import { OrderSuccessModal } from '@/components/shop/OrderSuccessModal';
import { supabase } from '@/lib/supabase';
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

// ─── Types ─────────────────────────────────────────────────

type OrderRow = {
  id: string;
  order_number: string;
  status: string | null;
  subtotal_cents: number | null;
  shipping_cents: number | null;
  total_cents: number | null;
  voucher_code: string | null;
  voucher_discount_cents: number | null;
  placed_at: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  buyer_type: string | null;
  payment_method: string | null;
  shipping_name: string | null;
  shipping_address_line1: string | null;
  shipping_city: string | null;
  shipping_county: string | null;
  shipping_postal_code: string | null;
  billing_entity_type: 'legal_person' | 'natural_person' | null;
  billing_company_name: string | null;
  billing_fiscal_code: string | null;
  billing_cnp: string | null;
  billing_registration_no: string | null;
  billing_address_line1: string | null;
  billing_city: string | null;
  billing_county: string | null;
  invoice_number: string | null;
  invoice_issued_at: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  title_snapshot: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
};

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

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

const STATUS_FLOW: { key: string; label: string; icon: FeatherIconName }[] = [
  { key: 'placed',    label: 'Plasata',   icon: 'check-circle' },
  { key: 'paid',      label: 'Platita',   icon: 'credit-card' },
  { key: 'shipped',   label: 'Expediata', icon: 'package' },
  { key: 'delivered', label: 'Livrata',   icon: 'home' },
];

export default function MarketplaceOrderScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const cart = useMarketplaceCart();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  // showSuccessModal: true only on fresh checkout land (fresh=1 param) with paid status.
  // State is used so the user can dismiss without the modal re-appearing on re-render.
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;

    (async () => {
      setLoading(true);
      setError(null);

      const [{ data: orderData, error: orderErr }, { data: itemsData, error: itemsErr }] =
        await Promise.all([
          supabase
            .from('marketplace_orders')
            .select(
              'id, order_number, status, subtotal_cents, shipping_cents, total_cents, voucher_code, voucher_discount_cents, placed_at, paid_at, shipped_at, delivered_at, buyer_type, payment_method, shipping_name, shipping_address_line1, shipping_city, shipping_county, shipping_postal_code, billing_entity_type, billing_company_name, billing_fiscal_code, billing_cnp, billing_registration_no, billing_address_line1, billing_city, billing_county, invoice_number, invoice_issued_at',
            )
            .eq('id', id)
            .maybeSingle(),
          supabase
            .from('marketplace_order_items')
            .select('id, order_id, product_id, title_snapshot, qty, unit_price_cents, line_total_cents')
            .eq('order_id', id),
        ]);

      if (cancelled) return;

      if (orderErr) {
        setError(orderErr.message);
        setLoading(false);
        return;
      }
      if (!orderData) {
        setError('Comanda nu a fost gasita');
        setLoading(false);
        return;
      }
      if (itemsErr) {
        console.warn('[order] items lookup', itemsErr.message);
      }

      setOrder(orderData as OrderRow);
      setItems((itemsData ?? []) as OrderItemRow[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Show success modal once when order data loads and fresh=1 param is present.
  // Runs once per mount — state gate prevents re-trigger on re-renders.
  useEffect(() => {
    if (fresh === '1' && (order?.status === 'paid' || order?.status === 'placed') && !showSuccessModal) {
      setShowSuccessModal(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status, fresh]);

  const handleBackToShop = useCallback(() => {
    router.replace('/(tabs)/shop' as any);
  }, [router]);

  const handleReorder = useCallback(async () => {
    if (items.length === 0) return;
    setReordering(true);
    const productIds = items.map((i) => i.product_id);
    const { data: products } = await supabase
      .from('marketplace_products')
      .select('id, name, brand, price_cents, stock_qty, images, is_active')
      .in('id', productIds);
    const byId = new Map<string, any>(
      (products ?? []).map((p: any) => [p.id, p]),
    );

    const cartItems = items
      .map((it) => {
        const p = byId.get(it.product_id);
        const stock = Number(p?.stock_qty ?? 0);
        if (!p?.is_active || stock <= 0) return null;
        const images = Array.isArray(p.images) ? p.images : [];
        return {
          product_id: it.product_id,
          qty: Math.max(1, Math.min(it.qty, stock)),
          unit_price_cents: Number(p.price_cents) || it.unit_price_cents,
          title_snapshot: p.name ?? it.title_snapshot,
          image_url: typeof images[0] === 'string' ? images[0] : null,
          brand: p.brand ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    setReordering(false);

    if (cartItems.length === 0) {
      Alert.alert(
        'Produse indisponibile',
        'Niciun produs din aceasta comanda nu mai este pe stoc.',
      );
      return;
    }
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    cart.replaceItems(cartItems);
    router.push('/cart' as any);
  }, [items, cart, router]);

  const statusInfo = useMemo(() => {
    if (!order?.status) return { label: 'Procesare', color: colors.textTertiary };
    return (
      STATUS_LABELS[order.status] ?? {
        label: order.status,
        color: colors.textSecondary,
      }
    );
  }, [order, colors]);

  const timelineState = useMemo(() => {
    if (!order) return { currentIdx: -1, cancelled: false };
    if (
      order.status === 'cancelled' ||
      order.status === 'refunded' ||
      order.status === 'returned'
    ) {
      return { currentIdx: -1, cancelled: true };
    }
    const order_status = order.status ?? 'placed';
    const idx = STATUS_FLOW.findIndex((s) => s.key === order_status);
    return { currentIdx: idx >= 0 ? idx : 0, cancelled: false };
  }, [order]);

  const hasBilling = !!order?.billing_company_name;
  const hasShipping = !!order?.shipping_address_line1;

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
      <Text style={[styles.headerTitle, { color: colors.text }]}>Comanda</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (loading) {
    return (
      <GradientBackground>
        <Stack.Screen options={{ headerShown: false }} />
        {Header}
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={Brand.primary} />
        </View>
      </GradientBackground>
    );
  }

  if (error || !order) {
    return (
      <GradientBackground>
        <Stack.Screen options={{ headerShown: false }} />
        {Header}
        <View style={styles.centerFill}>
          <Feather name="alert-circle" size={44} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Comanda nu a fost gasita
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
            {error ?? 'Este posibil sa fi fost stearsa sau sa nu ai acces.'}
          </Text>
        </View>
      </GradientBackground>
    );
  }

  const subtotalCents = Number(order.subtotal_cents) || 0;
  const shippingCents = Number(order.shipping_cents) || 0;
  const totalCents = Number(order.total_cents) || 0;
  const discountCents = Number(order.voucher_discount_cents) || 0;

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {Header}

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── [A] Success card ── */}
        <Animated.View entering={slideIn(0)} style={styles.successCard}>
          <View style={styles.successIconWrap}>
            <Feather name="check" size={28} color="#fff" />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>
            Comanda inregistrata!
          </Text>
          <Text style={[styles.successDesc, { color: colors.textSecondary }]}>
            Numar comanda
          </Text>
          <Text style={[styles.orderNumber, { color: Brand.primary }]}>
            {order.order_number}
          </Text>
          <View
            style={[styles.statusPill, { backgroundColor: statusInfo.color + '18' }]}
          >
            <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>
        </Animated.View>

        {/* ── [B] Timeline ── */}
        {!timelineState.cancelled && (
          <Animated.View entering={slideIn(40)} style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Status livrare
            </Text>
            <View style={styles.timeline}>
              {STATUS_FLOW.map((s, idx) => {
                const done = idx <= timelineState.currentIdx;
                const active = idx === timelineState.currentIdx;
                const lineIsDone = done && idx < timelineState.currentIdx;
                return (
                  <View key={s.key} style={styles.timelineCol}>
                    <View
                      style={[
                        styles.timelineCircle,
                        done && styles.timelineCircleDone,
                        active && styles.timelineCircleActive,
                      ]}
                    >
                      <Feather
                        name={s.icon}
                        size={14}
                        color={done ? '#fff' : colors.textTertiary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.timelineLabel,
                        { color: done ? colors.text : colors.textTertiary },
                      ]}
                    >
                      {s.label}
                    </Text>
                    {idx < STATUS_FLOW.length - 1 && (
                      <View
                        style={[
                          styles.timelineLine,
                          lineIsDone && styles.timelineLineDone,
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* ── [C] Billing ── */}
        {hasBilling && (
          <Animated.View entering={slideIn(60)} style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Date facturare
              </Text>
              {order.invoice_number && (
                <Text style={[styles.invoiceNo, { color: Brand.primary }]}>
                  Factura {order.invoice_number}
                </Text>
              )}
            </View>
            <Text style={[styles.billingCompany, { color: colors.text }]}>
              {order.billing_company_name}
            </Text>
            <Text style={[styles.billingLine, { color: colors.textSecondary }]}>
              {order.billing_entity_type === 'natural_person'
                ? order.billing_cnp && order.billing_cnp.length >= 4
                  ? `CNP *********${order.billing_cnp.slice(-4)}`
                  : 'CNP ***'
                : `CUI: ${order.billing_fiscal_code ?? '—'}${
                    order.billing_registration_no
                      ? ` · ${order.billing_registration_no}`
                      : ''
                  }`}
            </Text>
            {order.billing_address_line1 && (
              <Text style={[styles.billingLine, { color: colors.textSecondary }]}>
                {order.billing_address_line1}, {order.billing_city},{' '}
                {order.billing_county}
              </Text>
            )}
          </Animated.View>
        )}

        {/* ── [D] Shipping ── */}
        {hasShipping && (
          <Animated.View entering={slideIn(70)} style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Adresa de livrare
            </Text>
            {order.shipping_name && (
              <Text style={[styles.billingCompany, { color: colors.text }]}>
                {order.shipping_name}
              </Text>
            )}
            <Text style={[styles.billingLine, { color: colors.textSecondary }]}>
              {order.shipping_address_line1}
              {order.shipping_postal_code ? ` · ${order.shipping_postal_code}` : ''}
            </Text>
            <Text style={[styles.billingLine, { color: colors.textSecondary }]}>
              {order.shipping_city}, {order.shipping_county}
            </Text>
          </Animated.View>
        )}

        {/* ── [E] Items ── */}
        <Animated.View entering={slideIn(80)} style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Produse ({items.length})
          </Text>
          {items.map((i) => (
            <View key={i.id} style={styles.itemRow}>
              <Text
                style={[styles.itemName, { color: colors.text }]}
                numberOfLines={2}
              >
                {i.title_snapshot}
              </Text>
              <Text style={[styles.itemQty, { color: colors.textSecondary }]}>
                x{i.qty}
              </Text>
              <Text style={[styles.itemPrice, { color: colors.text }]}>
                {formatPrice(Number(i.line_total_cents) || 0)}
              </Text>
            </View>
          ))}
        </Animated.View>

        {/* ── [F] Payment summary ── */}
        <Animated.View entering={slideIn(140)} style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
              Subtotal
            </Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {formatPrice(subtotalCents)}
            </Text>
          </View>
          {discountCents > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.success }]}>
                Voucher {order.voucher_code ? `(${order.voucher_code})` : ''}
              </Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                -{formatPrice(discountCents)}
              </Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
              Livrare
            </Text>
            <Text
              style={[
                styles.summaryValue,
                { color: shippingCents === 0 ? colors.success : colors.text },
              ]}
            >
              {shippingCents === 0 ? 'Gratuit' : formatPrice(shippingCents)}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          <View style={styles.summaryRow}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
            <Text style={[styles.totalValue, { color: colors.text }]}>
              {formatPrice(totalCents)}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* ── Sticky footer ── */}
      <View
        style={[
          styles.footerWrap,
          { paddingBottom: insets.bottom + Spacing.md },
        ]}
      >
        <View style={styles.ctaRow}>
          <TouchableOpacity
            onPress={handleBackToShop}
            activeOpacity={0.85}
            style={styles.secondaryOuter}
          >
            <Feather name="shopping-bag" size={16} color={Brand.primary} />
            <Text style={styles.secondaryText}>La magazin</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleReorder}
            disabled={reordering || items.length === 0}
            activeOpacity={0.85}
            style={[
              styles.primaryOuterFlex,
              Shadows.glow,
              (reordering || items.length === 0) && { opacity: 0.6 },
            ]}
          >
            <LinearGradient
              colors={[Brand.gradientStart, Brand.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryGradient}
            >
              {reordering ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather
                    name="refresh-cw"
                    size={18}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.primaryText}>Comanda din nou</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Order success modal (fresh checkout only) ── */}
      <OrderSuccessModal
        visible={showSuccessModal}
        orderNumber={order.order_number}
        onViewOrders={() => {
          setShowSuccessModal(false);
          // Stay on the detail screen — user is already here.
        }}
        onContinueShopping={() => {
          setShowSuccessModal(false);
          router.replace('/(tabs)/shop' as any);
        }}
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
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  successCard: {
    ...Bubble.radii,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  successIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E7D32',
    marginBottom: Spacing.xs,
  },
  successTitle: {
    ...Typography.h2,
    fontSize: 20,
    textAlign: 'center',
  },
  successDesc: {
    ...Typography.small,
    textAlign: 'center',
    marginTop: 6,
  },
  orderNumber: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    letterSpacing: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    marginTop: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...Typography.smallSemiBold,
  },
  card: {
    ...Bubble.radii,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  invoiceNo: {
    ...Typography.captionSemiBold,
    fontSize: 12,
  },
  billingCompany: {
    ...Typography.bodySemiBold,
    fontSize: 15,
  },
  billingLine: {
    ...Typography.small,
    fontSize: 12,
    lineHeight: 16,
  },
  timeline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
    marginTop: Spacing.xs,
  },
  timelineCol: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  timelineCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
    zIndex: 2,
  },
  timelineCircleDone: {
    backgroundColor: Brand.primary,
  },
  timelineCircleActive: {
    backgroundColor: Brand.primary,
    borderWidth: 3,
    borderColor: Brand.primaryMuted,
  },
  timelineLabel: {
    ...Typography.small,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  // right: '-40%' is not valid as a StyleSheet value; use inline style for this
  timelineLine: {
    position: 'absolute',
    top: 16,
    left: '60%' as any,
    right: '-40%' as any,
    height: 2,
    backgroundColor: 'rgba(0,0,0,0.06)',
    zIndex: 1,
  },
  timelineLineDone: {
    backgroundColor: Brand.primary,
  },
  sectionTitle: {
    ...Typography.h3,
    fontSize: 16,
    lineHeight: 22,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  itemName: {
    ...Typography.caption,
    flex: 1,
  },
  itemQty: {
    ...Typography.small,
  },
  itemPrice: {
    ...Typography.captionSemiBold,
    minWidth: 70,
    textAlign: 'right',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    ...Typography.caption,
  },
  summaryValue: {
    ...Typography.captionSemiBold,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.xs,
  },
  totalLabel: {
    ...Typography.bodySemiBold,
  },
  totalValue: {
    ...Typography.h3,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'stretch',
  },
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  secondaryOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    height: 54,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: Brand.primary + '40',
    ...Bubble.radii,
  },
  secondaryText: {
    color: Brand.primary,
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
  },
  primaryOuterFlex: {
    flex: 1,
    ...Bubble.radii,
    overflow: 'hidden',
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
  emptyTitle: {
    ...Typography.h3,
    textAlign: 'center',
  },
  emptyDesc: {
    ...Typography.caption,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
});
