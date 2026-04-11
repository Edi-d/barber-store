import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTutorialContext } from '@/components/tutorial/TutorialProvider';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useForm, Controller } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { Brand, Spacing, Typography, Colors, Shadows, Bubble } from '@/constants/theme';
import { formatPrice } from '@/lib/utils';
import { CartItemWithProduct } from '@/types/database';
import { OrderSuccessModal } from '@/components/shop/OrderSuccessModal';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

const slideIn = (delay: number) =>
  FadeInDown.duration(400)
    .delay(delay)
    .easing(SMOOTH)
    .withInitialValues({ transform: [{ translateY: 12 }] });

type DeliveryMode = 'pickup' | 'delivery';

interface CheckoutForm {
  name: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
}

const colors = Colors;

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, totalPrice, clearCart } = useCartStore();
  const { session } = useAuthStore();
  const total = totalPrice();

  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('pickup');
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [lastOrderId, setLastOrderId] = useState('');

  /* ─── Animation for submit button ─── */
  const btnScale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CheckoutForm>({
    defaultValues: {
      name: '',
      phone: '',
      address: '',
      city: '',
      notes: '',
    },
  });

  const watchedName = watch('name');
  const watchedPhone = watch('phone');
  const watchedAddress = watch('address');
  const watchedCity = watch('city');
  const watchedNotes = watch('notes');

  const orderMutation = useMutation({
    mutationFn: async (data: CheckoutForm) => {
      if (!session) throw new Error('Not authenticated');

      const shippingAddress =
        deliveryMode === 'delivery'
          ? `${data.name}\n${data.phone}\n${data.address}, ${data.city}${data.notes ? `\n\nObservatie: ${data.notes}` : ''}`
          : `${data.name}\n${data.phone}\nRidicare personala${data.notes ? `\n\nObservatie: ${data.notes}` : ''}`;

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: session.user.id,
          status: 'pending',
          total_cents: total,
          currency: 'RON',
          shipping_address: shippingAddress,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        qty: item.qty,
        price_cents: item.product.price_cents,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      // Decrement stock concurrently
      await Promise.all(
        items.map(async (item) => {
          try {
            const { data: productRow, error: fetchErr } = await supabase
              .from('products')
              .select('stock')
              .eq('id', item.product_id)
              .single();

            if (fetchErr || productRow?.stock == null) return;

            const newStock = Math.max(0, productRow.stock - item.qty);
            await supabase
              .from('products')
              .update({ stock: newStock })
              .eq('id', item.product_id);
          } catch (err) {
            console.error('Stock decrement error for product', item.product_id, err);
          }
        }),
      );

      return order;
    },
    onSuccess: async (order) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await clearCart();
      setLastOrderId(order.id.slice(0, 8).toUpperCase());
      setOrderPlaced(true);
    },
    onError: (error) => {
      console.error(error);
    },
  });

  const canSubmit = useMemo(() => {
    if (!watchedName.trim() || !watchedPhone.trim()) return false;
    if (deliveryMode === 'delivery' && (!watchedAddress.trim() || !watchedCity.trim())) return false;
    if (items.length === 0) return false;
    return true;
  }, [watchedName, watchedPhone, deliveryMode, watchedAddress, watchedCity, items.length]);

  const onSubmit = useCallback(
    (data: CheckoutForm) => {
      if (!canSubmit || orderMutation.isPending) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      btnScale.value = withSequence(
        withTiming(0.95, { duration: 100, easing: SMOOTH }),
        withTiming(1, { duration: 150, easing: SMOOTH }),
      );

      orderMutation.mutate(data);
    },
    [canSubmit, orderMutation, btnScale],
  );

  /* ─── Tutorial refs ─── */
  const { registerRef, unregisterRef } = useTutorialContext();
  const contactRef = useRef<View>(null);
  const deliveryModeRef = useRef<View>(null);
  const addressRef = useRef<View>(null);
  const paymentRef = useRef<View>(null);
  const placeOrderRef = useRef<View>(null);

  useEffect(() => {
    registerRef('checkout-contact', contactRef);
    registerRef('checkout-delivery-mode', deliveryModeRef);
    registerRef('checkout-address', addressRef);
    registerRef('checkout-payment', paymentRef);
    registerRef('checkout-place-order', placeOrderRef);
    return () => {
      unregisterRef('checkout-contact');
      unregisterRef('checkout-delivery-mode');
      unregisterRef('checkout-address');
      unregisterRef('checkout-payment');
      unregisterRef('checkout-place-order');
    };
  }, [registerRef, unregisterRef]);

  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleBackToShop = useCallback(() => {
    router.replace('/(tabs)/shop');
  }, [router]);

  /* ─── Success modal ─── */
  if (orderPlaced) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <OrderSuccessModal
          visible={orderPlaced}
          orderNumber={lastOrderId}
          onViewOrders={() => router.replace('/orders')}
          onContinueShopping={() => {
            setOrderPlaced(false);
            router.replace('/(tabs)/shop');
          }}
        />
      </>
    );
  }

  /* ─── Empty cart guard ─── */
  if (items.length === 0) {
    return (
      <View style={[styles.successContainer, { backgroundColor: colors.background, paddingTop: insets.top + 56 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.successContent}>
          <View style={styles.emptyIconCircle}>
            <Feather name="shopping-bag" size={48} color={colors.textTertiary} />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>
            Cosul tau este gol
          </Text>
          <Text style={[styles.successMessage, { color: colors.textTertiary }]}>
            Adauga produse inainte de a plasa comanda.
          </Text>
          <TouchableOpacity activeOpacity={0.8} onPress={handleGoBack} style={Shadows.glow}>
            <LinearGradient
              colors={[Brand.gradientStart, Brand.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.successBtn}
            >
              <Feather name="arrow-left" size={16} color="#fff" />
              <Text style={styles.successBtnText}>Inapoi</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ─── Custom Header ─── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity
          style={[
            styles.backButton,
            { backgroundColor: 'rgba(255,255,255,0.65)', borderColor: 'rgba(255,255,255,0.9)' },
          ]}
          onPress={handleGoBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Finalizeaza comanda</Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ─── Order Summary ─── */}
          <Animated.View entering={slideIn(0)} style={[styles.card, Shadows.sm]}>
            <View style={styles.cardInner}>
              <View style={styles.sectionHeader}>
                <Feather name="shopping-bag" size={18} color={Brand.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Sumar comanda
                </Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{items.reduce((s, i) => s + i.qty, 0)}</Text>
                </View>
              </View>

              {items.map((item: CartItemWithProduct) => (
                <View key={item.product_id} style={styles.orderItem}>
                  {item.product.image_url ? (
                    <Image
                      source={{ uri: item.product.image_url }}
                      style={styles.orderItemImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.orderItemImage, styles.orderItemPlaceholder]}>
                      <Feather name="package" size={18} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={styles.orderItemInfo}>
                    <Text
                      style={[styles.orderItemName, { color: colors.text }]}
                      numberOfLines={2}
                    >
                      {item.product.title}
                    </Text>
                    <Text style={[styles.orderItemQty, { color: colors.textSecondary }]}>
                      x{item.qty}
                    </Text>
                  </View>
                  <Text style={[styles.orderItemPrice, { color: colors.text }]}>
                    {formatPrice(item.product.price_cents * item.qty, item.product.currency)}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ─── Contact Info ─── */}
          <Animated.View entering={slideIn(100)} style={[styles.card, Shadows.sm]}>
            <View ref={contactRef} style={styles.cardInner}>
              <View style={styles.sectionHeader}>
                <Feather name="user" size={18} color={Brand.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Date de contact
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  Nume complet *
                </Text>
                <Controller
                  control={control}
                  name="name"
                  rules={{ required: 'Numele este obligatoriu' }}
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.inputBackground,
                          borderColor: value ? colors.inputFocusBorder : colors.inputBorder,
                          color: colors.text,
                        },
                        errors.name && styles.inputError,
                      ]}
                      value={value}
                      onChangeText={onChange}
                      placeholder="Ion Popescu"
                      placeholderTextColor={colors.textTertiary}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  )}
                />
                {errors.name && (
                  <Text style={styles.errorText}>{errors.name.message}</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  Telefon *
                </Text>
                <Controller
                  control={control}
                  name="phone"
                  rules={{
                    required: 'Telefonul este obligatoriu',
                    pattern: {
                      value: /^[0-9+\s-]{10,}$/,
                      message: 'Numar invalid',
                    },
                  }}
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.inputBackground,
                          borderColor: value ? colors.inputFocusBorder : colors.inputBorder,
                          color: colors.text,
                        },
                        errors.phone && styles.inputError,
                      ]}
                      value={value}
                      onChangeText={onChange}
                      placeholder="07xx xxx xxx"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="phone-pad"
                      returnKeyType="next"
                    />
                  )}
                />
                {errors.phone && (
                  <Text style={styles.errorText}>{errors.phone.message}</Text>
                )}
              </View>
            </View>
          </Animated.View>

          {/* ─── Delivery Mode ─── */}
          <Animated.View entering={slideIn(200)} style={[styles.card, Shadows.sm]}>
            <View style={styles.cardInner}>
              <View style={styles.sectionHeader}>
                <Feather name="truck" size={18} color={Brand.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Metoda de livrare
                </Text>
              </View>

              <View ref={deliveryModeRef} style={styles.deliveryToggle}>
                <TouchableOpacity
                  style={[
                    styles.deliveryOption,
                    deliveryMode === 'pickup' && styles.deliveryOptionActive,
                    deliveryMode === 'pickup' && { borderColor: Brand.primary },
                  ]}
                  onPress={() => {
                    setDeliveryMode('pickup');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather
                    name="home"
                    size={20}
                    color={deliveryMode === 'pickup' ? Brand.primary : colors.textTertiary}
                  />
                  <Text
                    style={[
                      styles.deliveryOptionText,
                      {
                        color: deliveryMode === 'pickup' ? Brand.primary : colors.textSecondary,
                      },
                    ]}
                  >
                    Ridicare personala
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.deliveryOption,
                    deliveryMode === 'delivery' && styles.deliveryOptionActive,
                    deliveryMode === 'delivery' && { borderColor: Brand.primary },
                  ]}
                  onPress={() => {
                    setDeliveryMode('delivery');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather
                    name="truck"
                    size={20}
                    color={deliveryMode === 'delivery' ? Brand.primary : colors.textTertiary}
                  />
                  <Text
                    style={[
                      styles.deliveryOptionText,
                      {
                        color: deliveryMode === 'delivery' ? Brand.primary : colors.textSecondary,
                      },
                    ]}
                  >
                    Livrare la adresa
                  </Text>
                </TouchableOpacity>
              </View>

              {deliveryMode === 'delivery' && (
                <>
                  <View ref={addressRef} style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                      Adresa de livrare *
                    </Text>
                    <Controller
                      control={control}
                      name="address"
                      rules={{ required: deliveryMode === 'delivery' ? 'Adresa este obligatorie' : false }}
                      render={({ field: { onChange, value } }) => (
                        <TextInput
                          style={[
                            styles.input,
                            styles.inputMultiline,
                            {
                              backgroundColor: colors.inputBackground,
                              borderColor: value ? colors.inputFocusBorder : colors.inputBorder,
                              color: colors.text,
                            },
                            errors.address && styles.inputError,
                          ]}
                          value={value}
                          onChangeText={onChange}
                          placeholder="Strada, numar, bloc, apartament"
                          placeholderTextColor={colors.textTertiary}
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                        />
                      )}
                    />
                    {errors.address && (
                      <Text style={styles.errorText}>{errors.address.message}</Text>
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                      Oras *
                    </Text>
                    <Controller
                      control={control}
                      name="city"
                      rules={{ required: deliveryMode === 'delivery' ? 'Orasul este obligatoriu' : false }}
                      render={({ field: { onChange, value } }) => (
                        <TextInput
                          style={[
                            styles.input,
                            {
                              backgroundColor: colors.inputBackground,
                              borderColor: value ? colors.inputFocusBorder : colors.inputBorder,
                              color: colors.text,
                            },
                            errors.city && styles.inputError,
                          ]}
                          value={value}
                          onChangeText={onChange}
                          placeholder="Bucuresti"
                          placeholderTextColor={colors.textTertiary}
                          returnKeyType="next"
                        />
                      )}
                    />
                    {errors.city && (
                      <Text style={styles.errorText}>{errors.city.message}</Text>
                    )}
                  </View>
                </>
              )}
            </View>
          </Animated.View>

          {/* ─── Notes ─── */}
          <Animated.View entering={slideIn(300)} style={[styles.card, Shadows.sm]}>
            <View style={styles.cardInner}>
              <View style={styles.sectionHeader}>
                <Feather name="edit-3" size={18} color={Brand.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Observatii (optional)
                </Text>
              </View>

              <Controller
                control={control}
                name="notes"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputMultiline,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: value ? colors.inputFocusBorder : colors.inputBorder,
                        color: colors.text,
                      },
                    ]}
                    value={value}
                    onChangeText={onChange}
                    placeholder="Mentiuni speciale pentru comanda ta..."
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                )}
              />
            </View>
          </Animated.View>

          {/* ─── Payment Method ─── */}
          <Animated.View entering={slideIn(350)} style={[styles.card, Shadows.sm]}>
            <View ref={paymentRef} style={styles.cardInner}>
              <View style={styles.sectionHeader}>
                <Feather name="credit-card" size={18} color={Brand.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Metoda de plata
                </Text>
              </View>

              {/* Cash on Delivery - Selected */}
              <View style={styles.paymentOption}>
                <View style={styles.paymentRadioActive}>
                  <View style={styles.paymentRadioDot} />
                </View>
                <View style={styles.paymentIconWrap}>
                  <Feather name="dollar-sign" size={20} color="#d4af37" />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={[styles.paymentTitle, { color: colors.text }]}>
                    Ramburs (Plata la livrare)
                  </Text>
                  <Text style={[styles.paymentSubtitle, { color: colors.textTertiary }]}>
                    Platesti cash cand primesti coletul
                  </Text>
                </View>
              </View>

              {/* Card - Coming Soon */}
              <View style={[styles.paymentOption, styles.paymentOptionDisabled]}>
                <View style={styles.paymentRadioInactive} />
                <View style={[styles.paymentIconWrap, { backgroundColor: 'rgba(0,0,0,0.04)' }]}>
                  <Feather name="credit-card" size={20} color={colors.textTertiary} />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={[styles.paymentTitle, { color: colors.textTertiary }]}>
                    Card online
                  </Text>
                  <Text style={[styles.paymentSubtitle, { color: colors.textTertiary }]}>
                    In curand
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* ─── Total Breakdown ─── */}
          <Animated.View entering={slideIn(400)} style={[styles.card, Shadows.sm]}>
            <View style={styles.cardInner}>
              <View style={styles.sectionHeader}>
                <Feather name="file-text" size={18} color={Brand.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Total comanda
                </Text>
              </View>

              <View style={styles.summarySection}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                    Produse
                  </Text>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>
                    {items.reduce((s, i) => s + i.qty, 0)}{' '}
                    {items.reduce((s, i) => s + i.qty, 0) === 1 ? 'articol' : 'articole'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                    Subtotal
                  </Text>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>
                    {formatPrice(total, 'RON')}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                    Livrare
                  </Text>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>
                    {deliveryMode === 'pickup' ? 'Gratuit' : 'Se va calcula'}
                  </Text>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.separator }]} />
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
                  <Text style={[styles.totalValue, { color: colors.text }]}>
                    {formatPrice(total, 'RON')}
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* ─── COD Notice ─── */}
          <Animated.View entering={slideIn(440)}>
            <View style={styles.codNotice}>
              <Feather name="info" size={16} color="#d97706" />
              <Text style={styles.codNoticeText}>
                Plata se face la livrare (ramburs)
              </Text>
            </View>
          </Animated.View>
        </ScrollView>

        {/* ─── Bottom CTA ─── */}
        <Animated.View
          entering={slideIn(500)}
          style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.sm }]}
        >
          <BlurView intensity={80} tint="light" style={styles.bottomBarBlur}>
            <View style={styles.bottomTotal}>
              <Text style={[styles.bottomTotalLabel, { color: colors.textSecondary }]}>
                Total
              </Text>
              <Text style={[styles.bottomTotalValue, { color: colors.text }]}>
                {formatPrice(total, 'RON')}
              </Text>
            </View>

            <Animated.View ref={placeOrderRef} style={[styles.submitBtnWrapper, btnAnimStyle]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleSubmit(onSubmit)}
                disabled={!canSubmit || orderMutation.isPending}
                style={[Shadows.glow, (!canSubmit || orderMutation.isPending) && styles.disabledBtn]}
              >
                <LinearGradient
                  colors={[Brand.gradientStart, Brand.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitBtn}
                >
                  {orderMutation.isPending ? (
                    <Text style={styles.submitText}>Se proceseaza...</Text>
                  ) : (
                    <>
                      <Feather name="check-circle" size={18} color="#fff" />
                      <Text style={styles.submitText}>Plaseaza comanda</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </BlurView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  /* ─── Header ─── */
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

  /* ─── Scroll ─── */
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.lg,
  },

  /* ─── Cards ─── */
  card: {
    ...Bubble.radii,
    overflow: 'hidden',
  },
  cardInner: {
    padding: Spacing.lg,
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  sectionTitle: {
    ...Typography.bodySemiBold,
    flex: 1,
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

  /* ─── Order items ─── */
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  orderItemImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  orderItemPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemInfo: {
    flex: 1,
    gap: 1,
  },
  orderItemName: {
    ...Typography.captionSemiBold,
    fontSize: 13,
    lineHeight: 17,
  },
  orderItemQty: {
    ...Typography.small,
    fontSize: 11,
  },
  orderItemPrice: {
    ...Typography.captionSemiBold,
  },

  /* ─── Inputs ─── */
  inputGroup: {
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontFamily: 'EuclidCircularA-Medium',
    fontSize: 13,
    lineHeight: 16,
    marginLeft: 2,
    marginBottom: 2,
  },
  input: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md + 2,
    borderWidth: 1,
    borderRadius: 14,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: Spacing.md,
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 12,
    color: Colors.error,
    marginLeft: 2,
  },

  /* ─── Delivery toggle ─── */
  deliveryToggle: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  deliveryOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
  },
  deliveryOptionActive: {
    backgroundColor: Brand.primaryMuted,
  },
  deliveryOptionText: {
    ...Typography.captionSemiBold,
    fontSize: 13,
  },

  /* ─── Payment ─── */
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  paymentOptionDisabled: {
    opacity: 0.45,
    borderBottomWidth: 0,
  },
  paymentRadioActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Brand.primary,
  },
  paymentRadioInactive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  paymentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(212,175,55,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentInfo: {
    flex: 1,
    gap: 2,
  },
  paymentTitle: {
    ...Typography.captionSemiBold,
  },
  paymentSubtitle: {
    ...Typography.small,
    fontSize: 11,
  },

  /* ─── COD Notice ─── */
  codNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(217,119,6,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.2)',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: 14,
  },
  codNoticeText: {
    fontFamily: 'EuclidCircularA-Medium',
    fontSize: 13,
    color: '#92400e',
    flex: 1,
  },

  /* ─── Summary ─── */
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

  /* ─── Bottom bar ─── */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  bottomBarBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    gap: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(10,102,194,0.18)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    overflow: 'hidden',
  },
  bottomTotal: {
    gap: 2,
  },
  bottomTotalLabel: {
    ...Typography.small,
  },
  bottomTotalValue: {
    ...Typography.h2,
  },
  submitBtnWrapper: {
    flex: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
    ...Bubble.radiiSm,
  },
  submitText: {
    ...Typography.button,
    color: '#fff',
    fontSize: 16,
  },
  disabledBtn: {
    opacity: 0.5,
  },

  /* ─── Empty / Success state ─── */
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.base,
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
  successTitle: {
    ...Typography.h3,
    fontSize: 22,
    textAlign: 'center',
  },
  successMessage: {
    ...Typography.body,
    textAlign: 'center',
    lineHeight: 24,
  },
  successBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    ...Bubble.radii,
  },
  successBtnText: {
    ...Typography.button,
    color: '#fff',
  },
});
