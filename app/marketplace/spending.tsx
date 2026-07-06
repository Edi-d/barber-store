/**
 * /marketplace/spending — salon B2B spending dashboard.
 *
 * Two KPI cards (30-day total + order count), reorder suggestions with
 * one-tap quick-reorder, and top-5 purchased SKUs.
 * Gate: shows "Niciun salon activ" if no salonId.
 */

import { useCallback } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { supabase } from '@/lib/supabase';
import { useSalonContext } from '@/hooks/useSalonContext';
import { useSpendingDashboard, type ReorderSuggestion } from '@/hooks/use-spending-dashboard';
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

export default function SalonSpendingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { salonId } = useSalonContext();
  const cart = useMarketplaceCart();

  const { spending, reorders, loading, refreshing, refresh } =
    useSpendingDashboard(salonId);

  const handleQuickReorder = useCallback(
    async (s: ReorderSuggestion) => {
      const { data: p } = await supabase
        .from('marketplace_products')
        .select('id, name, brand, price_cents, stock_qty, images, is_active')
        .eq('id', s.product_id)
        .maybeSingle();
      if (!p || !p.is_active || p.stock_qty <= 0) return;
      const qty = Math.max(1, Math.min(Math.round(s.avg_qty || 1), p.stock_qty));
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      const images = Array.isArray(p.images) ? p.images : [];
      cart.addItem({
        product_id: p.id,
        qty,
        unit_price_cents: Number(p.price_cents),
        title_snapshot: p.name,
        image_url: typeof images[0] === 'string' ? images[0] : null,
        brand: p.brand,
      });
      router.push('/marketplace/cart' as any);
    },
    [cart, router],
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
        Cheltuieli salon
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

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

  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {Header}

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + Spacing['2xl'] },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={Brand.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── KPI cards row ── */}
        <Animated.View entering={slideIn(0)} style={styles.kpiRow}>
          <View style={[styles.kpiCard, Shadows.sm]}>
            <BlurView intensity={40} tint="light" style={styles.kpiInner}>
              <Text style={[styles.kpiLabel, { color: colors.textTertiary }]}>
                Cheltuit (30 zile)
              </Text>
              <Text style={[styles.kpiValue, { color: colors.text }]}>
                {formatPrice(spending?.total_cents ?? 0)}
              </Text>
            </BlurView>
          </View>
          <View style={[styles.kpiCard, Shadows.sm]}>
            <BlurView intensity={40} tint="light" style={styles.kpiInner}>
              <Text style={[styles.kpiLabel, { color: colors.textTertiary }]}>
                Comenzi
              </Text>
              <Text style={[styles.kpiValue, { color: colors.text }]}>
                {spending?.order_count ?? 0}
              </Text>
              <Text style={[styles.kpiSubtle, { color: colors.textTertiary }]}>
                Medie: {formatPrice(spending?.avg_order_cents ?? 0)}
              </Text>
            </BlurView>
          </View>
        </Animated.View>

        {/* ── Reorder suggestions ── */}
        {reorders.length > 0 && (
          <Animated.View entering={slideIn(60)} style={styles.card}>
            <View style={styles.sectionHeader}>
              <Feather name="refresh-cw" size={16} color={Brand.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Sugestii de reorder
              </Text>
            </View>
            <Text style={[styles.sectionDesc, { color: colors.textTertiary }]}>
              Bazat pe istoricul comenzilor tale. Cele marcate "Recomandat" sunt
              candidate pentru reorder acum.
            </Text>

            {reorders.map((s) => (
              <View key={s.product_id} style={styles.reorderRow}>
                {s.image_url ? (
                  <Image
                    source={{ uri: s.image_url }}
                    style={styles.reorderImg}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.reorderImg, styles.reorderImgPh]}>
                    <Feather name="package" size={18} color={colors.textTertiary} />
                  </View>
                )}
                <View style={styles.reorderInfo}>
                  <View style={styles.reorderTitleRow}>
                    <Text
                      style={[styles.reorderName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {s.product_name}
                    </Text>
                    {s.due_now && (
                      <View style={styles.dueBadge}>
                        <Text style={styles.dueText}>Recomandat</Text>
                      </View>
                    )}
                  </View>
                  {s.brand && (
                    <Text
                      style={[styles.reorderBrand, { color: colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {s.brand}
                    </Text>
                  )}
                  <Text style={[styles.reorderMeta, { color: colors.textSecondary }]}>
                    Ultima oara: acum {s.days_since}{' '}
                    {s.days_since === 1 ? 'zi' : 'zile'} · {s.times_ordered}x · qty
                    mediu {Math.max(1, Math.round(s.avg_qty))}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleQuickReorder(s)}
                  hitSlop={6}
                  className="overflow-hidden rounded-full"
                  style={styles.reorderCta}
                >
                  <LinearGradient
                    colors={[Brand.gradientStart, Brand.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.reorderCtaGradient}
                  >
                    <Feather name="plus" size={14} color="#fff" />
                  </LinearGradient>
                </Pressable>
              </View>
            ))}
          </Animated.View>
        )}

        {/* ── Top SKUs ── */}
        {spending && spending.top_products.length > 0 && (
          <Animated.View entering={slideIn(120)} style={styles.card}>
            <View style={styles.sectionHeader}>
              <Feather name="trending-up" size={16} color={Brand.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Top produse cumparate
              </Text>
            </View>
            {spending.top_products.map((p, idx) => (
              <View key={p.product_id} style={styles.topRow}>
                <View style={styles.topRankWrap}>
                  <Text style={styles.topRank}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.topName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                  <Text style={[styles.topMeta, { color: colors.textTertiary }]}>
                    {p.total_qty} {p.total_qty === 1 ? 'bucata' : 'bucati'}
                  </Text>
                </View>
                <Text style={[styles.topPrice, { color: colors.text }]}>
                  {formatPrice(p.total_cents)}
                </Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* ── Empty state ── */}
        {spending && spending.order_count === 0 && reorders.length === 0 && (
          <Animated.View entering={slideIn(0)} style={styles.emptyWrap}>
            <View
              style={[styles.emptyIconWrap, { backgroundColor: colors.primaryMuted }]}
            >
              <Feather name="bar-chart-2" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Încă nu ai comenzi
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
              Aici vei vedea cheltuielile lunare și recomandări de reorder după ce
              salonul plasează prima comandă.
            </Text>
          </Animated.View>
        )}
      </ScrollView>
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
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  kpiCard: {
    flex: 1,
    ...Bubble.radii,
    overflow: 'hidden',
  },
  kpiInner: {
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.55)',
    padding: Spacing.md,
    gap: 4,
  },
  kpiLabel: {
    ...Typography.small,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    lineHeight: 26,
  },
  kpiSubtle: {
    ...Typography.small,
    marginTop: 2,
  },
  card: {
    ...Bubble.radii,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
    fontSize: 16,
    lineHeight: 22,
  },
  sectionDesc: {
    ...Typography.small,
    lineHeight: 16,
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  reorderImg: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: '#fff',
  },
  reorderImgPh: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderInfo: {
    flex: 1,
    gap: 1,
  },
  reorderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reorderName: {
    ...Typography.captionSemiBold,
    flex: 1,
  },
  dueBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: '#FEF3C7',
  },
  dueText: {
    color: '#92400E',
    fontSize: 9,
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reorderBrand: {
    ...Typography.small,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  reorderMeta: {
    ...Typography.small,
    fontSize: 11,
    marginTop: 2,
  },
  reorderCta: {
    overflow: 'hidden',
    borderRadius: 18,
  },
  reorderCtaGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  topRankWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primaryMuted,
  },
  topRank: {
    color: Brand.primary,
    fontFamily: FontFamily.bold,
    fontSize: 12,
  },
  topName: {
    ...Typography.captionSemiBold,
    fontSize: 13,
  },
  topMeta: {
    ...Typography.small,
    fontSize: 11,
    marginTop: 1,
  },
  topPrice: {
    ...Typography.captionSemiBold,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing['2xl'],
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
});

