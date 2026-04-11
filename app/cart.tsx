import { useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  RefreshControl,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeInDown,
  LinearTransition,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Brand, Spacing, Typography, Colors, Shadows, Bubble } from '@/constants/theme';
import { useTutorialContext } from '@/components/tutorial/TutorialProvider';
import { formatPrice } from '@/lib/utils';
import { useCartStore } from '@/stores/cartStore';
import type { CartItemWithProduct } from '@/types/database';

const FREE_DELIVERY_THRESHOLD_CENTS = 20000; // 200 RON
const DELETE_THRESHOLD = -80;
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

/* ─────────────────────────────────────────────────────────────────────────────
   Swipeable cart item
───────────────────────────────────────────────────────────────────────────── */
function SwipeableCartItem({
  item,
  index,
  onUpdateQty,
  onRemove,
  itemRef,
  quantityRef,
}: {
  item: CartItemWithProduct;
  index: number;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  itemRef?: React.RefObject<View>;
  quantityRef?: React.RefObject<View>;
}) {
  const swipeX = useSharedValue(0);
  const lineTotal = item.product.price_cents * item.qty;

  const swipePan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onUpdate((e) => {
      if (e.translationX < 0) {
        swipeX.value = Math.max(e.translationX, -120);
      }
    })
    .onEnd((e) => {
      if (e.translationX < DELETE_THRESHOLD || e.velocityX < -600) {
        swipeX.value = withTiming(-120, { duration: 200, easing: SMOOTH });
      } else {
        swipeX.value = withTiming(0, { duration: 200, easing: SMOOTH });
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));

  const deleteStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(swipeX.value) / 60),
  }));

  const handleRemove = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onRemove(item.product.id);
  }, [item.product.id, onRemove]);

  const handleDecrement = useCallback(() => {
    Haptics.selectionAsync();
    onUpdateQty(item.product.id, item.qty - 1);
  }, [item.product.id, item.qty, onUpdateQty]);

  const handleIncrement = useCallback(() => {
    Haptics.selectionAsync();
    onUpdateQty(item.product.id, item.qty + 1);
  }, [item.product.id, item.qty, onUpdateQty]);

  return (
    <Animated.View
      ref={itemRef}
      entering={FadeInDown.delay(index * 60).duration(340).easing(SMOOTH)}
      layout={LinearTransition.duration(280).easing(SMOOTH)}
      style={styles.swipeWrapper}
    >
      {/* Delete background */}
      <Animated.View style={[styles.deleteBackground, deleteStyle]}>
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={handleRemove}
          activeOpacity={0.7}
        >
          <Feather name="trash-2" size={20} color="#fff" />
          <Text style={styles.deleteText}>Sterge</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Swipeable card */}
      <GestureDetector gesture={swipePan}>
        <Animated.View style={[styles.itemCard, Shadows.sm, rowStyle]}>
          <BlurView intensity={50} tint="light" style={styles.itemInner}>
            {/* Product image */}
            {item.product.image_url ? (
              <Image
                source={{ uri: item.product.image_url }}
                style={styles.itemImage}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                <Feather name="package" size={22} color={Colors.textTertiary} />
              </View>
            )}

            {/* Info */}
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, { color: Colors.text }]} numberOfLines={2}>
                {item.product.title}
              </Text>
              <View style={styles.priceRow}>
                <Text style={[styles.itemPrice, { color: Colors.textSecondary }]}>
                  {formatPrice(item.product.price_cents)}
                </Text>
                {item.qty > 1 && (
                  <Text style={[styles.lineTotal, { color: Brand.primary }]}>
                    {formatPrice(lineTotal)}
                  </Text>
                )}
              </View>
            </View>

            {/* Quantity stepper */}
            <View style={styles.stepperCol}>
              <View ref={quantityRef} style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: Brand.primary }]}
                  onPress={handleDecrement}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Feather name="minus" size={13} color="#fff" />
                </TouchableOpacity>
                <Text style={[styles.stepCount, { color: Colors.text }]}>{item.qty}</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: Brand.primary }]}
                  onPress={handleIncrement}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Feather name="plus" size={13} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </BlurView>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Delivery progress banner
───────────────────────────────────────────────────────────────────────────── */
function DeliveryBanner({ totalPrice, bannerRef }: { totalPrice: number; bannerRef?: React.RefObject<View> }) {
  const deliveryRemaining = Math.max(0, FREE_DELIVERY_THRESHOLD_CENTS - totalPrice);
  const deliveryProgress = Math.min(1, totalPrice / FREE_DELIVERY_THRESHOLD_CENTS);
  const isFree = deliveryRemaining === 0;

  const progressWidth = useSharedValue(0);

  useEffect(() => {
    progressWidth.value = withTiming(deliveryProgress, { duration: 500, easing: SMOOTH });
  }, [deliveryProgress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progressWidth.value * 100)}%` as `${number}%`,
  }));

  return (
    <View ref={bannerRef} style={styles.deliveryBanner}>
      <View style={styles.deliveryTextRow}>
        <Feather
          name={isFree ? 'check-circle' : 'truck'}
          size={13}
          color={isFree ? Colors.success : Brand.primary}
        />
        {isFree ? (
          <Text style={[styles.deliveryText, { color: Colors.success }]}>
            Livrare gratuita inclusa!
          </Text>
        ) : (
          <Text style={[styles.deliveryText, { color: Colors.textSecondary }]}>
            Mai adauga{' '}
            <Text style={{ color: Brand.primary, fontFamily: Typography.captionSemiBold.fontFamily }}>
              {formatPrice(deliveryRemaining)}
            </Text>
            {' '}pentru livrare gratuita
          </Text>
        )}
      </View>
      <View style={styles.progressTrack}>
        <Animated.View
          style={[styles.progressFill, isFree && styles.progressFillComplete, progressStyle]}
        />
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Empty state
───────────────────────────────────────────────────────────────────────────── */
function EmptyState({ onGoToShop }: { onGoToShop: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.empty}>
      <View style={styles.emptyIconCircle}>
        <Feather name="shopping-bag" size={48} color={Colors.textTertiary} />
      </View>
      <Text style={[styles.emptyTitle, { color: Colors.text }]}>Cosul tau este gol</Text>
      <Text style={[styles.emptyMsg, { color: Colors.textTertiary }]}>
        Adauga produse din catalog pentru a continua
      </Text>
      <TouchableOpacity activeOpacity={0.8} onPress={onGoToShop}>
        <LinearGradient
          colors={[Brand.gradientStart, Brand.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emptyBtn}
        >
          <Feather name="arrow-left" size={16} color="#fff" />
          <Text style={styles.emptyBtnText}>Exploreaza magazinul</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Cart Screen
───────────────────────────────────────────────────────────────────────────── */
export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { items, fetchCart, updateQty, removeItem, clearCart, totalPrice, totalItems, isLoading } =
    useCartStore();
  const { registerRef, unregisterRef } = useTutorialContext();

  const cartItemRef = useRef<View>(null);
  const cartQuantityRef = useRef<View>(null);
  const cartDeliveryBarRef = useRef<View>(null);
  const cartCheckoutBtnRef = useRef<View>(null);

  useEffect(() => {
    registerRef('cart-item', cartItemRef);
    registerRef('cart-quantity', cartQuantityRef);
    registerRef('cart-delivery-bar', cartDeliveryBarRef);
    registerRef('cart-checkout-btn', cartCheckoutBtnRef);
    return () => {
      unregisterRef('cart-item');
      unregisterRef('cart-quantity');
      unregisterRef('cart-delivery-bar');
      unregisterRef('cart-checkout-btn');
    };
  }, [registerRef, unregisterRef]);

  const computedTotal = totalPrice();
  const computedItemCount = totalItems();

  useEffect(() => {
    fetchCart();
  }, []);

  const handleUpdateQty = useCallback(
    (productId: string, qty: number) => {
      updateQty(productId, qty);
    },
    [updateQty],
  );

  const handleRemove = useCallback(
    (productId: string) => {
      removeItem(productId);
    },
    [removeItem],
  );

  const handleClear = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    clearCart();
  }, [clearCart]);

  const handleCheckout = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/checkout');
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleGoToShop = useCallback(() => {
    router.back();
    setTimeout(() => router.push('/(tabs)/shop'), 50);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: CartItemWithProduct; index: number }) => (
      <SwipeableCartItem
        item={item}
        index={index}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemove}
        itemRef={index === 0 ? cartItemRef : undefined}
        quantityRef={index === 0 ? cartQuantityRef : undefined}
      />
    ),
    [handleUpdateQty, handleRemove],
  );

  const keyExtractor = useCallback((item: CartItemWithProduct) => item.product_id, []);

  const ListHeader = items.length > 0 ? <DeliveryBanner totalPrice={computedTotal} bannerRef={cartDeliveryBarRef} /> : null;

  return (
    <View style={styles.root}>
      {/* Gradient background */}
      <LinearGradient
        colors={['#EDF1F7', '#F0F4F8', '#EEF1F6']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Glassmorphism header */}
      <BlurView
        intensity={80}
        tint="light"
        style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}
      >
        <View style={styles.headerInner}>
          {/* Back */}
          <TouchableOpacity
            style={[styles.headerBtn, Shadows.sm]}
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={20} color={Colors.text} />
          </TouchableOpacity>

          {/* Title + item count badge */}
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: Colors.text }]}>Cosul meu</Text>
            {computedItemCount > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{computedItemCount}</Text>
              </View>
            )}
          </View>

          {/* Clear all */}
          {items.length > 0 ? (
            <TouchableOpacity
              style={[styles.headerBtn, Shadows.sm]}
              onPress={handleClear}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="trash-2" size={18} color={Colors.error} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerBtnPlaceholder} />
          )}
        </View>
      </BlurView>

      {/* Empty state */}
      {items.length === 0 && !isLoading ? (
        <EmptyState onGoToShop={handleGoToShop} />
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + 200 },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={fetchCart}
                tintColor={Brand.primary}
                colors={[Brand.primary]}
              />
            }
            ListHeaderComponent={ListHeader}
            itemLayoutAnimation={LinearTransition.duration(280).easing(SMOOTH)}
          />

          {/* Sticky checkout footer */}
          <BlurView
            intensity={85}
            tint="light"
            style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}
          >
            <View style={[styles.footerContent, { borderTopColor: Colors.separator }]}>
              {/* Order summary */}
              <View style={styles.summarySection}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>
                    Produse
                  </Text>
                  <Text style={[styles.summaryValue, { color: Colors.text }]}>
                    {computedItemCount} {computedItemCount === 1 ? 'articol' : 'articole'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>
                    Livrare
                  </Text>
                  <Text
                    style={[
                      styles.summaryValue,
                      {
                        color:
                          computedTotal >= FREE_DELIVERY_THRESHOLD_CENTS
                            ? Colors.success
                            : Colors.text,
                      },
                    ]}
                  >
                    {computedTotal >= FREE_DELIVERY_THRESHOLD_CENTS
                      ? 'Gratuita'
                      : 'Se calculeaza'}
                  </Text>
                </View>
                <View style={[styles.divider, { backgroundColor: Colors.separator }]} />
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: Colors.text }]}>Total</Text>
                  <Text style={[styles.totalValue, { color: Colors.text }]}>
                    {formatPrice(computedTotal)}
                  </Text>
                </View>
              </View>

              {/* Checkout CTA */}
              <TouchableOpacity
                ref={cartCheckoutBtnRef}
                activeOpacity={0.85}
                style={Shadows.glow}
                onPress={handleCheckout}
              >
                <LinearGradient
                  colors={[Brand.gradientStart, Brand.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.checkoutBtn}
                >
                  <Feather name="send" size={18} color="#fff" />
                  <Text style={styles.checkoutText}>Continua la plata</Text>
                </LinearGradient>
              </TouchableOpacity>

              <Text style={[styles.disclaimer, { color: Colors.textTertiary }]}>
                Comanda va fi procesata de barber-store.ro
              </Text>
            </View>
          </BlurView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  /* ─── Header ─── */
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(245,247,250,0.88)',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerBtn: {
    width: 38,
    height: 38,
    ...Bubble.radiiSm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  headerBtnPlaceholder: {
    width: 38,
    height: 38,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    ...Typography.h3,
  },
  countBadge: {
    backgroundColor: Brand.primary,
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    color: '#fff',
    fontFamily: Typography.smallSemiBold.fontFamily,
    fontSize: 12,
  },

  /* ─── Delivery banner ─── */
  deliveryBanner: {
    marginHorizontal: 0,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    gap: Spacing.xs + 2,
  },
  deliveryTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  deliveryText: {
    ...Typography.small,
    flex: 1,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Brand.primary,
  },
  progressFillComplete: {
    backgroundColor: '#2E7D32',
  },

  /* ─── List ─── */
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },

  /* ─── Swipeable item ─── */
  swipeWrapper: {
    overflow: 'hidden',
    ...Bubble.radiiSm,
  },
  deleteBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E53935',
    ...Bubble.radiiSm,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: Spacing.lg,
  },
  deleteAction: {
    alignItems: 'center',
    gap: 4,
  },
  deleteText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: Typography.smallSemiBold.fontFamily,
  },
  itemCard: {
    ...Bubble.radiiSm,
  },
  itemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    ...Bubble.radiiSm,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.5)',
    padding: Spacing.sm,
    overflow: 'hidden',
  },
  itemImage: {
    width: 64,
    height: 64,
    ...Bubble.radiiSm,
    backgroundColor: '#fff',
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    ...Typography.captionSemiBold,
    fontSize: 13,
    lineHeight: 17,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  itemPrice: {
    ...Typography.small,
    fontSize: 12,
  },
  lineTotal: {
    ...Typography.smallSemiBold,
    fontSize: 12,
  },

  /* ─── Stepper ─── */
  stepperCol: {
    alignItems: 'center',
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
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCount: {
    ...Typography.captionSemiBold,
    minWidth: 20,
    textAlign: 'center',
  },

  /* ─── Empty state ─── */
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 60,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(10,102,194,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.h3,
    textAlign: 'center',
  },
  emptyMsg: {
    ...Typography.caption,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    ...Bubble.radii,
  },
  emptyBtnText: {
    ...Typography.button,
    color: '#fff',
  },

  /* ─── Footer ─── */
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(245,247,250,0.92)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  footerContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summarySection: {
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
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    ...Typography.bodySemiBold,
  },
  totalValue: {
    ...Typography.h3,
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
    ...Bubble.radii,
  },
  checkoutText: {
    ...Typography.button,
    color: '#fff',
    fontSize: 17,
  },
  disclaimer: {
    ...Typography.small,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: Spacing.xs,
  },
});
