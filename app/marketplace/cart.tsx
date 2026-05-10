/**
 * app/marketplace/cart.tsx — Marketplace cart screen.
 *
 * Gradient hero header, store card with swipeable items, voucher pill,
 * free-shipping progress, quote-driven summary, sticky checkout CTA.
 *
 * Hooks: useMarketplaceCartStore, useMarketplaceQuote, useBuyerType
 * Auth:  useAuthStore for voucher user_id validation
 */

import {
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Image,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { useMarketplaceCartStore, type MarketplaceCartItem } from '@/hooks/use-marketplace-cart-store';
import { useMarketplaceQuote, type QuoteInput } from '@/hooks/use-marketplace-quote';
import { useBuyerType } from '@/hooks/use-buyer-type';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatPrice } from '@/lib/utils';
import { SLIDE_IN_DOWN, SMOOTH } from '@/lib/animations';
import {
  Brand,
  Colors,
  Spacing,
  Typography,
  Bubble,
  Shadows,
  FontFamily,
} from '@/constants/theme';

// ── Constants ────────────────────────────────────────────────────────────────
const FREE_THRESHOLD_FALLBACK = 30000; // 300 RON cents
const DELETE_THRESHOLD = -80;
const MAX_SWIPE = -120;
const SNAP_DURATION = 200;

// ── Cascade animation ────────────────────────────────────────────────────────
const slideIn = (delay = 0) =>
  FadeInDown.duration(400)
    .delay(delay)
    .easing(SMOOTH)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] } as never);

// ── Types ────────────────────────────────────────────────────────────────────
type VoucherStatus = 'idle' | 'validating' | 'valid' | 'invalid';
type AppliedVoucher = { code: string; value_cents: number };

// ── Swipeable item row ───────────────────────────────────────────────────────
function SwipeableItem({
  item,
  onRemove,
  onSetQty,
  colors,
}: {
  item: MarketplaceCartItem;
  onRemove: (id: string) => void;
  onSetQty: (id: string, qty: number) => void;
  colors: typeof Colors.light;
}) {
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const isDeleting = useRef(false);

  const handleDelete = useCallback(() => {
    if (isDeleting.current) return;
    isDeleting.current = true;
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onRemove(item.product_id);
  }, [item.product_id, onRemove]);

  const snapBack = () => {
    translateX.value = withTiming(0, { duration: SNAP_DURATION, easing: SMOOTH });
  };

  const snapDelete = () => {
    translateX.value = withTiming(MAX_SWIPE, { duration: SNAP_DURATION, easing: SMOOTH }, () => {
      runOnJS(handleDelete)();
    });
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      translateX.value = Math.max(MAX_SWIPE, Math.min(0, next));
    })
    .onEnd((e) => {
      const velocity = e.velocityX;
      if (translateX.value < DELETE_THRESHOLD || velocity < -600) {
        runOnJS(snapDelete)();
      } else {
        runOnJS(snapBack)();
      }
    });

  const itemAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, DELETE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const unitPrice = item.unit_price_cents;

  return (
    <View style={styles.swipeWrap}>
      {/* Delete background */}
      <Animated.View style={[styles.deleteBg, deleteOpacityStyle]}>
        <Pressable
          onPress={handleDelete}
          className="items-center gap-1"
        >
          <Feather name="trash-2" size={20} color="#fff" />
          <Text className="text-white text-[11px] font-semibold">Sterge</Text>
        </Pressable>
      </Animated.View>

      {/* Item card */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.itemCard, itemAnimStyle]}>
          <View style={[styles.itemInner, { backgroundColor: 'rgba(255,255,255,0.55)' }]}>
            {/* Thumbnail */}
            {item.image_url ? (
              <Image
                source={{ uri: item.image_url }}
                style={styles.itemImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                <Feather name="package" size={20} color={colors.textTertiary} />
              </View>
            )}

            {/* Info */}
            <View style={styles.itemInfo}>
              {item.brand ? (
                <Text style={[styles.itemBrand, { color: Brand.primary }]} numberOfLines={1}>
                  {item.brand}
                </Text>
              ) : null}
              <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>
                {item.title_snapshot}
              </Text>
              <Text style={[styles.itemPrice, { color: colors.textSecondary }]}>
                {formatPrice(unitPrice)} / buc
              </Text>
            </View>

            {/* Qty stepper */}
            <View style={styles.stepper}>
              <Pressable
                onPress={() => onSetQty(item.product_id, item.qty - 1)}
                className="w-7 h-7 rounded-full items-center justify-center"
                style={{ backgroundColor: item.qty <= 1 ? colors.textTertiary : Brand.primary }}
                disabled={item.qty <= 1}
              >
                <Feather name="minus" size={13} color="#fff" />
              </Pressable>
              <Text style={[styles.stepCount, { color: colors.text }]}>{item.qty}</Text>
              <Pressable
                onPress={() => onSetQty(item.product_id, item.qty + 1)}
                className="w-7 h-7 rounded-full items-center justify-center"
                style={{ backgroundColor: Brand.primary }}
              >
                <Feather name="plus" size={13} color="#fff" />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function MarketplaceCartScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { items, totalCents, removeItem, setQty } = useMarketplaceCartStore();
  const { session } = useAuthStore();
  const buyerType = useBuyerType();

  // Hydration guard
  const [hydrated] = useState(() => useMarketplaceCartStore.persist.hasHydrated());

  // Quote
  const quoteInputs = useMemo<QuoteInput[]>(
    () => items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
    [items],
  );
  const { quote, loading: quoteLoading } = useMarketplaceQuote(quoteInputs, buyerType);

  const subtotalCents = quote?.subtotal_cents ?? totalCents();
  const tierSavings = quote?.tier_savings_cents ?? 0;
  const shippingCents = buyerType === 'salon' ? 0 : (quote?.shipping_cents ?? 0);
  const freeThreshold = quote?.free_shipping_threshold_cents ?? FREE_THRESHOLD_FALLBACK;
  const missingFree = quote?.missing_for_free_shipping_cents ?? Math.max(0, freeThreshold - subtotalCents);
  const freeProgress = freeThreshold > 0 ? Math.min(1, subtotalCents / freeThreshold) : 0;
  const voucherDiscount = 0; // will be applied below after voucher state
  const totalFinal = subtotalCents - tierSavings - voucherDiscount + shippingCents;

  // Voucher state
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherStatus, setVoucherStatus] = useState<VoucherStatus>('idle');
  const [applied, setApplied] = useState<AppliedVoucher | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  const appliedDiscount = applied ? applied.value_cents : 0;
  const checkoutTotal = subtotalCents - tierSavings - appliedDiscount + shippingCents;

  const handleApplyVoucher = useCallback(async () => {
    const code = voucherInput.trim().toUpperCase();
    if (!code) return;
    const userId = session?.user?.id;
    if (!userId) {
      setVoucherError('Autentifica-te pentru a folosi voucherul.');
      setVoucherStatus('invalid');
      return;
    }
    setVoucherStatus('validating');
    setVoucherError(null);

    const { data, error } = await supabase
      .from('loyalty_vouchers')
      .select('id, code, value_cents, status, user_id, expires_at')
      .eq('code', code)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (error || !data) {
      setVoucherError('Voucher invalid sau indisponibil.');
      setVoucherStatus('invalid');
      return;
    }
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      setVoucherError('Voucherul a expirat.');
      setVoucherStatus('invalid');
      return;
    }
    setApplied({ code: data.code, value_cents: Number(data.value_cents) || 0 });
    setVoucherStatus('valid');
    setVoucherInput('');
  }, [voucherInput, session]);

  const handleRemoveVoucher = useCallback(() => {
    setApplied(null);
    setVoucherStatus('idle');
    setVoucherError(null);
  }, []);

  const handleCheckout = useCallback(() => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push({
      pathname: '/marketplace/checkout',
      params: applied ? { voucher_code: applied.code } : {},
    } as never);
  }, [applied]);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleSetQty = useCallback((product_id: string, qty: number) => {
    setQty(product_id, qty);
  }, [setQty]);

  const handleRemove = useCallback((product_id: string) => {
    removeItem(product_id);
  }, [removeItem]);

  const totalItemCount = items.reduce((s, i) => s + i.qty, 0);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* [A] Gradient hero header */}
      <LinearGradient
        colors={[Brand.gradientStart, Brand.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroHeader, { paddingTop: insets.top + Spacing.sm }]}
      >
        <Pressable
          onPress={handleBack}
          className="w-10 h-10 rounded-full bg-white items-center justify-center"
          hitSlop={8}
        >
          <Feather name="arrow-left" size={20} color={Brand.primary} />
        </Pressable>

        <Text style={styles.heroTitle}>Cosul tau</Text>

        <Pressable className="w-10 h-10 rounded-full bg-white items-center justify-center">
          <Feather name="shopping-bag" size={18} color={Brand.primary} />
          {totalItemCount > 0 && (
            <View style={styles.heroCartBadge}>
              <Text style={styles.heroCartBadgeText}>
                {totalItemCount > 99 ? '99+' : totalItemCount}
              </Text>
            </View>
          )}
        </Pressable>
      </LinearGradient>

      {/* [B] ScrollView */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 140 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!hydrated ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={Brand.primary} />
          </View>
        ) : items.length === 0 ? (
          /* [B1] Empty state */
          <Animated.View entering={slideIn(0)} style={styles.emptyWrap}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.primaryMuted }]}>
              <Feather name="shopping-bag" size={40} color={Brand.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Cosul tau este gol</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              Adauga produse din catalog pentru a le vedea aici.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/shop' as never)}
              activeOpacity={0.85}
              style={[styles.emptyCtaShadow, Shadows.glow]}
            >
              <LinearGradient
                colors={[Brand.gradientStart, Brand.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emptyCta}
              >
                <Text style={styles.emptyCtaText}>Vezi produsele</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            {/* [B2a] Store card */}
            <Animated.View entering={slideIn(0)}>
              <View style={[styles.storeCard, Bubble.radii, { backgroundColor: 'rgba(255,255,255,0.82)' }]}>
                {/* Store header */}
                <View style={styles.storeHeader}>
                  <LinearGradient
                    colors={[Brand.gradientStart, Brand.primary]}
                    style={styles.storeLogoCircle}
                  >
                    <Feather name="shopping-bag" size={16} color="#fff" />
                  </LinearGradient>
                  <View style={styles.storeInfo}>
                    <Text style={[styles.storeName, { color: colors.text }]}>Magazin DIVE</Text>
                    <Text style={[styles.storeMeta, { color: colors.textSecondary }]}>
                      {totalItemCount} {totalItemCount === 1 ? 'produs' : 'produse'}
                    </Text>
                  </View>
                </View>

                {/* Divider */}
                <View style={[styles.divider, { backgroundColor: colors.separator }]} />

                {/* Line items */}
                {items.map((item) => (
                  <SwipeableItem
                    key={item.product_id}
                    item={item}
                    onRemove={handleRemove}
                    onSetQty={handleSetQty}
                    colors={colors}
                  />
                ))}
              </View>
            </Animated.View>

            {/* [B2b] Voucher pill */}
            <Animated.View entering={slideIn(80)}>
              <View style={styles.voucherWrap}>
                {applied ? (
                  /* Applied state */
                  <View style={[styles.promoApplied, { backgroundColor: colors.successMuted }]}>
                    <Feather name="check-circle" size={18} color={colors.success} />
                    <Text style={[styles.promoAppliedText, { color: colors.success }]}>
                      {applied.code} — -{formatPrice(applied.value_cents)}
                    </Text>
                    <TouchableOpacity onPress={handleRemoveVoucher} hitSlop={8}>
                      <Text style={[styles.promoRemove, { color: colors.error }]}>Elimina</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* Input state */
                  <View style={styles.promoPill}>
                    <Feather
                      name="tag"
                      size={16}
                      color={colors.textTertiary}
                      style={{ marginLeft: Spacing.md }}
                    />
                    <TextInput
                      value={voucherInput}
                      onChangeText={(t) => {
                        setVoucherInput(t.toUpperCase());
                        setVoucherError(null);
                        setVoucherStatus('idle');
                      }}
                      autoCapitalize="characters"
                      style={[styles.promoInput, { color: colors.text }]}
                      placeholder="Adauga cod promotional"
                      placeholderTextColor={colors.textTertiary}
                      returnKeyType="done"
                      onSubmitEditing={handleApplyVoucher}
                    />
                    <Pressable
                      onPress={handleApplyVoucher}
                      disabled={!voucherInput.trim() || voucherStatus === 'validating'}
                      className="h-11 mr-1 overflow-hidden"
                      style={[Bubble.radiiSm, !voucherInput.trim() ? { opacity: 0.5 } : undefined]}
                    >
                      <LinearGradient
                        colors={[Brand.gradientStart, Brand.primary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.applyBtnGradient}
                      >
                        {voucherStatus === 'validating' ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.applyBtnText}>Aplica</Text>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </View>
                )}
                {voucherError ? (
                  <Text style={[styles.promoError, { color: colors.error }]}>
                    {voucherError}
                  </Text>
                ) : null}
              </View>
            </Animated.View>

            {/* [B2c] Free shipping progress */}
            {freeThreshold > 0 ? (
              <Animated.View entering={slideIn(110)}>
                <View
                  style={[
                    styles.freeShipCard,
                    Bubble.radii,
                    {
                      backgroundColor: 'rgba(255,255,255,0.65)',
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  {missingFree > 0 ? (
                    <>
                      <View style={styles.freeShipRow}>
                        <Feather name="truck" size={16} color={Brand.primary} />
                        <Text style={[styles.freeShipLabel, { color: colors.text }]}>
                          Mai adauga{' '}
                          <Text style={{ color: Brand.primary, fontFamily: FontFamily.semiBold }}>
                            {formatPrice(missingFree)}
                          </Text>{' '}
                          pentru livrare gratuita
                        </Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.round(freeProgress * 100)}%` as `${number}%`,
                              backgroundColor: Brand.primary,
                            },
                          ]}
                        />
                      </View>
                    </>
                  ) : (
                    <View style={styles.freeShipRow}>
                      <Feather name="check-circle" size={16} color={colors.success} />
                      <Text style={[styles.freeShipLabel, { color: colors.success }]}>
                        Livrare gratuita aplicata!
                      </Text>
                    </View>
                  )}
                </View>
              </Animated.View>
            ) : null}

            {/* [B2d] Summary card */}
            <Animated.View entering={slideIn(140)}>
              <View
                style={[
                  styles.summaryCard,
                  Bubble.radii,
                  {
                    backgroundColor: 'rgba(255,255,255,0.55)',
                    borderColor: 'rgba(255,255,255,0.8)',
                  },
                ]}
              >
                {/* Subtotal */}
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Subtotal</Text>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>
                    {quoteLoading ? '…' : formatPrice(subtotalCents)}
                  </Text>
                </View>

                {/* Tier savings */}
                {tierSavings > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.success }]}>Discount tier</Text>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>
                      -{formatPrice(tierSavings)}
                    </Text>
                  </View>
                )}

                {/* Voucher discount */}
                {appliedDiscount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.success }]}>
                      Voucher ({applied!.code})
                    </Text>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>
                      -{formatPrice(appliedDiscount)}
                    </Text>
                  </View>
                )}

                {/* Shipping */}
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Livrare</Text>
                  <Text style={[styles.summaryValue, { color: shippingCents === 0 ? colors.success : colors.text }]}>
                    {shippingCents === 0 ? 'Gratuita' : formatPrice(shippingCents)}
                  </Text>
                </View>

                {/* Hairline */}
                <View style={[styles.divider, { backgroundColor: colors.separator, marginVertical: Spacing.sm }]} />

                {/* Total */}
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryTotalLabel, { color: colors.text }]}>Total</Text>
                  <Text style={[styles.summaryTotalValue, { color: Brand.primary }]}>
                    {quoteLoading ? '…' : formatPrice(checkoutTotal)}
                  </Text>
                </View>
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/* [C] Sticky checkout CTA */}
      {items.length > 0 && (
        <View
          style={[
            styles.footerWrap,
            { paddingBottom: insets.bottom + Spacing.md },
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={handleCheckout}
            className="overflow-hidden self-stretch"
            style={[Bubble.radii, Shadows.glow]}
          >
            <LinearGradient
              colors={[Brand.gradientStart, Brand.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryGradient}
            >
              <Text style={styles.primaryText}>Checkout</Text>
              <View className="w-1 h-1 rounded-full bg-white/70" />
              <Text style={styles.primaryPrice}>{formatPrice(checkoutTotal)}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg + 4,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroTitle: {
    ...Typography.h3,
    color: '#fff',
  },
  heroCartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#fff',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  heroCartBadgeText: {
    color: Brand.primary,
    fontSize: 10,
    fontFamily: FontFamily.bold,
    lineHeight: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  // ── Empty state ────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    gap: Spacing.md,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...Typography.h3,
    marginTop: Spacing.sm,
  },
  emptyHint: {
    ...Typography.caption,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyCtaShadow: {
    ...Bubble.radii,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  emptyCta: {
    height: 52,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...Bubble.radii,
  },
  emptyCtaText: {
    ...Typography.button,
    color: '#fff',
  },
  // ── Store card ─────────────────────────────────────────
  storeCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.base,
  },
  storeLogoCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeInfo: {
    flex: 1,
    gap: 2,
  },
  storeName: {
    ...Typography.captionSemiBold,
  },
  storeMeta: {
    ...Typography.small,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.base,
  },
  // ── Swipeable item ─────────────────────────────────────
  swipeWrap: {
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  deleteBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: Spacing.lg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
  },
  itemCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
  },
  itemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    overflow: 'hidden',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  itemImagePlaceholder: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemBrand: {
    ...Typography.small,
    fontFamily: FontFamily.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemTitle: {
    ...Typography.captionSemiBold,
    lineHeight: 18,
  },
  itemPrice: {
    ...Typography.small,
    marginTop: 2,
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
  stepCount: {
    ...Typography.captionSemiBold,
    minWidth: 20,
    textAlign: 'center',
  },
  // ── Voucher ────────────────────────────────────────────
  voucherWrap: {
    gap: Spacing.xs,
  },
  promoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F4F5F7',
    overflow: 'hidden',
  },
  promoInput: {
    flex: 1,
    ...Typography.caption,
    paddingHorizontal: Spacing.sm,
    height: 52,
  },
  applyBtnGradient: {
    height: 44,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    ...Bubble.radiiSm,
  },
  applyBtnText: {
    ...Typography.captionSemiBold,
    color: '#fff',
  },
  promoApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 52,
    borderRadius: 26,
    paddingHorizontal: Spacing.base,
  },
  promoAppliedText: {
    flex: 1,
    ...Typography.captionSemiBold,
  },
  promoRemove: {
    ...Typography.captionSemiBold,
  },
  promoError: {
    ...Typography.small,
    paddingHorizontal: Spacing.base,
  },
  // ── Free shipping bar ──────────────────────────────────
  freeShipCard: {
    borderWidth: 1,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  freeShipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  freeShipLabel: {
    ...Typography.small,
    flex: 1,
    lineHeight: 18,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  // ── Summary card ───────────────────────────────────────
  summaryCard: {
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.xs + 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    ...Typography.caption,
  },
  summaryValue: {
    ...Typography.captionSemiBold,
  },
  summaryTotalLabel: {
    ...Typography.bodySemiBold,
  },
  summaryTotalValue: {
    ...Typography.h3,
  },
  // ── Sticky CTA ─────────────────────────────────────────
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  primaryGradient: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  primaryText: {
    ...Typography.button,
    color: '#fff',
  },
  primaryPrice: {
    ...Typography.button,
    color: 'rgba(255,255,255,0.9)',
  },
});
