import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
  FadeInDown,
  FadeOutUp,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Brand, Spacing, Typography, Colors, Shadows, Bubble } from '@/constants/theme';
import { formatPrice } from '@/lib/utils';
import type { CartItemWithProduct } from '@/types/database';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;
const DISMISS_THRESHOLD = 120;
const FREE_DELIVERY_THRESHOLD_CENTS = 20000; // 200 RON in cents

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const TIMING_IN = { duration: 380, easing: SMOOTH };
const TIMING_SNAP = { duration: 260, easing: SMOOTH };

const DELETE_THRESHOLD = -80;

type Props = {
  visible: boolean;
  items: CartItemWithProduct[];
  /** Total price in cents */
  totalPrice: number;
  onClose: () => void;
  onSetQuantity: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCheckout?: () => void;
};

/* ─── Animated delivery progress bar ─── */
function DeliveryProgressBar({ progress }: { progress: number }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(progress * 100, { duration: 600, easing: SMOOTH });
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as `${number}%`,
  }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, barStyle]} />
    </View>
  );
}

function DeliveryProgressBarComplete() {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(100, { duration: 400, easing: SMOOTH });
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as `${number}%`,
  }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, styles.progressFillComplete, barStyle]} />
    </View>
  );
}

/* ─── Swipeable cart item ─── */
function SwipeableCartItem({
  item,
  onSetQuantity,
  onRemove,
}: {
  item: CartItemWithProduct;
  onSetQuantity: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
}) {
  const swipeX = useSharedValue(0);
  const stepScale = useSharedValue(1);
  const prevQty = useRef(item.qty);

  // Animate stepper count on qty change
  useEffect(() => {
    if (prevQty.current !== item.qty) {
      prevQty.current = item.qty;
      stepScale.value = withSpring(1.35, { damping: 6, stiffness: 300 }, () => {
        stepScale.value = withSpring(1, { damping: 10, stiffness: 200 });
      });
    }
  }, [item.qty]);

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

  const stepCountStyle = useAnimatedStyle(() => ({
    transform: [{ scale: stepScale.value }],
  }));

  const lineTotal = item.product.price_cents * item.qty;

  return (
    <Animated.View entering={FadeInDown.duration(280).springify()} exiting={FadeOutUp.duration(200)}>
      <View style={styles.swipeWrapper}>
        {/* Delete background */}
        <Animated.View style={[styles.deleteBackground, deleteStyle]}>
          <TouchableOpacity
            style={styles.deleteAction}
            onPress={() => onRemove(item.product.id)}
            activeOpacity={0.7}
          >
            <Feather name="trash-2" size={20} color="#fff" />
            <Text style={styles.deleteText}>Sterge</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Card */}
        <GestureDetector gesture={swipePan}>
          <Animated.View style={[styles.itemCard, Shadows.sm, rowStyle]}>
            <BlurView intensity={50} tint="light" style={styles.itemInner}>
              {/* Image */}
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
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: Brand.primary }]}
                    onPress={() => onSetQuantity(item.product.id, item.qty - 1)}
                    activeOpacity={0.7}
                  >
                    <Feather name="minus" size={13} color="#fff" />
                  </TouchableOpacity>
                  <Animated.Text style={[styles.stepCount, { color: Colors.text }, stepCountStyle]}>
                    {item.qty}
                  </Animated.Text>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: Brand.primary }]}
                    onPress={() => onSetQuantity(item.product.id, item.qty + 1)}
                    activeOpacity={0.7}
                  >
                    <Feather name="plus" size={13} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </BlurView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

/* ─── Cart Modal ─── */
export function CartModal({
  visible,
  items,
  totalPrice,
  onClose,
  onSetQuantity,
  onRemove,
  onClear,
  onCheckout,
}: Props) {
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  const totalItems = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);

  // Free delivery progress
  const deliveryRemaining = useMemo(
    () => Math.max(0, FREE_DELIVERY_THRESHOLD_CENTS - totalPrice),
    [totalPrice],
  );
  const deliveryProgress = useMemo(
    () => Math.min(1, totalPrice / FREE_DELIVERY_THRESHOLD_CENTS),
    [totalPrice],
  );

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 280, easing: SMOOTH });
      translateY.value = withTiming(0, TIMING_IN);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200, easing: SMOOTH });
      translateY.value = withTiming(SCREEN_HEIGHT, {
        duration: 280,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [visible]);

  const closeModal = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 200, easing: SMOOTH });
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 280, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
  }, [onClose]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY * 0.6;
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > 800) {
        runOnJS(closeModal)();
      } else {
        translateY.value = withTiming(0, TIMING_SNAP);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.45,
    pointerEvents: backdropOpacity.value > 0 ? ('auto' as const) : ('none' as const),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const renderCartItem = useCallback(
    ({ item }: { item: CartItemWithProduct }) => (
      <SwipeableCartItem
        item={item}
        onSetQuantity={onSetQuantity}
        onRemove={onRemove}
      />
    ),
    [onSetQuantity, onRemove],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={closeModal}
        />
      </Animated.View>

      {/* Sheet */}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheetContainer, sheetStyle]}>
          <BlurView
            intensity={85}
            tint="light"
            style={[styles.sheet, { paddingBottom: insets.bottom }]}
          >
            {/* Handle */}
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={[styles.title, { color: Colors.text }]}>Cosul tau</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{totalItems}</Text>
                </View>
              </View>
              <View style={styles.headerRight}>
                {items.length > 0 && (
                  <TouchableOpacity onPress={onClear} activeOpacity={0.7}>
                    <Text style={[styles.clearText, { color: Colors.error }]}>Goleste</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={closeModal}
                  style={[styles.closeBtn, { backgroundColor: Colors.card, borderColor: Colors.cardBorder }]}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Free delivery progress */}
            {items.length > 0 && deliveryRemaining > 0 && (
              <View style={styles.deliveryBanner}>
                <View style={styles.deliveryTextRow}>
                  <Feather name="truck" size={13} color={Brand.primary} />
                  <Text style={[styles.deliveryText, { color: Colors.textSecondary }]}>
                    Mai adauga{' '}
                    <Text style={{ color: Brand.primary, fontWeight: '700' }}>
                      {formatPrice(deliveryRemaining)}
                    </Text>
                    {' '}pentru livrare gratuita
                  </Text>
                </View>
                <DeliveryProgressBar progress={deliveryProgress} />
              </View>
            )}

            {/* Free delivery achieved */}
            {items.length > 0 && deliveryRemaining === 0 && (
              <View style={styles.deliveryBanner}>
                <View style={styles.deliveryTextRow}>
                  <Feather name="check-circle" size={13} color={Colors.success} />
                  <Text style={[styles.deliveryText, { color: Colors.success }]}>
                    Livrare gratuita inclusa!
                  </Text>
                </View>
                <DeliveryProgressBarComplete />
              </View>
            )}

            {/* Cart content */}
            {items.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="shopping-bag" size={48} color={Colors.textTertiary} />
                </View>
                <Text style={[styles.emptyTitle, { color: Colors.text }]}>
                  Cosul tau este gol
                </Text>
                <Text style={[styles.emptyMsg, { color: Colors.textTertiary }]}>
                  Adauga produse din catalog
                </Text>
                <TouchableOpacity activeOpacity={0.8} onPress={closeModal}>
                  <LinearGradient
                    colors={[Brand.gradientStart, Brand.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.emptyBtn}
                  >
                    <Feather name="arrow-left" size={16} color="#fff" />
                    <Text style={styles.emptyBtnText}>Continua cumparaturile</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <FlatList
                  data={items}
                  keyExtractor={(item) => item.product.id}
                  renderItem={renderCartItem}
                  contentContainerStyle={styles.list}
                  showsVerticalScrollIndicator={false}
                />

                {/* Order summary + footer */}
                <View style={[styles.footer, { borderTopColor: Colors.separator }]}>
                  {/* Summary section */}
                  <View style={styles.summarySection}>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>
                        Produse
                      </Text>
                      <Text style={[styles.summaryValue, { color: Colors.text }]}>
                        {totalItems} {totalItems === 1 ? 'articol' : 'articole'}
                      </Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: Colors.separator }]} />
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, { color: Colors.text }]}>Total</Text>
                      <Text style={[styles.totalValue, { color: Colors.text }]}>
                        {formatPrice(totalPrice)}
                      </Text>
                    </View>
                  </View>

                  {/* Order button */}
                  <TouchableOpacity activeOpacity={0.8} style={Shadows.glow} onPress={onCheckout}>
                    <LinearGradient
                      colors={[Brand.gradientStart, Brand.gradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.orderBtn}
                    >
                      <Feather name="send" size={18} color="#fff" />
                      <Text style={styles.orderText}>Trimite comanda</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <Text style={[styles.disclaimer, { color: Colors.textTertiary }]}>
                    Comanda va fi procesata de barber-store.ro
                  </Text>
                </View>
              </>
            )}
          </BlurView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    ...Shadows.glass,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(245,247,250,0.88)',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm + 2,
    paddingBottom: Spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  /* ─── Header ─── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  title: {
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
    fontWeight: '700',
    fontSize: 12,
  },
  clearText: {
    ...Typography.captionSemiBold,
  },
  closeBtn: {
    width: 36,
    height: 36,
    ...Bubble.radiiSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  /* ─── Delivery Banner ─── */
  deliveryBanner: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
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
    paddingBottom: Spacing.sm,
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
    fontWeight: '600',
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
    width: 60,
    height: 60,
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
    paddingBottom: 40,
    paddingHorizontal: Spacing.xl,
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
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
  orderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
    ...Bubble.radii,
  },
  orderText: {
    ...Typography.button,
    color: '#fff',
    fontSize: 17,
  },
  disclaimer: {
    ...Typography.small,
    textAlign: 'center',
    marginTop: 2,
  },
});
