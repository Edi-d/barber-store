/**
 * app/marketplace/checkout.tsx — Marketplace checkout screen.
 *
 * Handles both buyer modes:
 *   - 'client'  → Stripe Checkout via create-marketplace-checkout edge function.
 *                 Opens returned URL in expo-web-browser, then lands on order page.
 *   - 'salon'   → Wallet credit deduction (synchronous). Same edge function,
 *                 different branch server-side via purchase_marketplace_with_credit RPC.
 *
 * Form: raw useState (no react-hook-form) for parity with Tapzi source.
 * Layout: NativeWind className throughout; style={} only where className cannot
 * express the value (flex: 1.2 city/county row, LinearGradient, Animated.View).
 *
 * Idempotency: uuid v4 key stored in uiStore, cleared on success.
 * Dependencies installed in Wave A: expo-web-browser, uuid, react-native-get-random-values.
 *
 * DO NOT TOUCH: app/checkout.tsx (legacy COD flow) — this file is a separate screen.
 */

import 'react-native-get-random-values'; // polyfill crypto.getRandomValues for uuid
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from '@/components/ui/Image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { v4 as uuidv4 } from 'uuid';
import { useQuery } from '@tanstack/react-query';

import { GradientBackground } from '@/components/ui/GradientBackground';
import { supabase } from '@/lib/supabase';
import {
  placeMarketplaceClientOrder,
  fetchShippingAddresses,
  saveShippingAddress,
  type ClientPaymentMethod,
  type ShippingAddress,
} from '@/lib/marketplace-orders';
import { useMarketplaceCartStore } from '@/hooks/use-marketplace-cart-store';
import { useMarketplaceQuote } from '@/hooks/use-marketplace-quote';
import { useShippingMethods } from '@/hooks/use-shipping-methods';
import { useDefaultSalonBilling } from '@/hooks/use-salon-billing-details';
import { useAuth } from '@/providers/auth-provider';
import { useSalon } from '@/providers/salon-provider';
import { useUIStore } from '@/stores/uiStore';
import { Brand, Bubble, Colors, FontFamily, Radius, Shadows, Spacing } from '@/constants/theme';

// ─── Animation helpers ────────────────────────────────────
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const slideIn = (delay = 0) =>
  FadeInDown.duration(400).delay(delay).easing(SMOOTH).withInitialValues({
    opacity: 0,
    transform: [{ translateY: 12 }],
  });

// ─── Formatters ───────────────────────────────────────────
function formatPrice(cents: number): string {
  const ron = cents / 100;
  return ron % 1 === 0 ? `${ron} RON` : `${ron.toFixed(2)} RON`;
}

// ─── Types ────────────────────────────────────────────────
type ShippingForm = {
  name: string;
  phone: string;
  email: string;
  address_line1: string;
  city: string;
  county: string;
  postal: string;
  notes: string;
};

const EMPTY_FORM: ShippingForm = {
  name: '',
  phone: '',
  email: '',
  address_line1: '',
  city: '',
  county: '',
  postal: '',
  notes: '',
};

type ClientCheckoutResult = {
  order_id: string;
  order_number: string;
  checkout_url: string;
};

type SalonCheckoutResult = {
  order_id: string;
  order_number: string;
  new_balance_cents?: number;
};

// ─── Screen ───────────────────────────────────────────────
export default function MarketplaceCheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // colorScheme-aware colors — shop components all use Colors[scheme]
  const colors = Colors.light;

  const { voucher_code } = useLocalSearchParams<{ voucher_code?: string }>();

  const { user, profile } = useAuth();
  const { salon, isOwner } = useSalon();
  const cart = useMarketplaceCartStore();

  const { marketplaceIdempotencyKey, setMarketplaceIdempotencyKey } = useUIStore();

  // ── Buyer mode ────────────────────────────────────────
  const buyerMode: 'client' | 'salon' = isOwner && !!salon?.id ? 'salon' : 'client';

  // ── Form state (raw useState — no react-hook-form) ───
  const [form, setForm] = useState<ShippingForm>(() => ({
    ...EMPTY_FORM,
    name: profile?.display_name ?? '',
    email: user?.email ?? '',
  }));
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<ClientPaymentMethod>('cod');
  const [selectedShippingMethodId, setSelectedShippingMethodId] = useState<number | null>(null);
  const [saveAddr, setSaveAddr] = useState(true);
  const [prefilledFromSaved, setPrefilledFromSaved] = useState(false);

  const setField = useCallback(
    (key: keyof ShippingForm, value: string) =>
      setForm((f) => ({ ...f, [key]: value })),
    [],
  );

  // ── Saved addresses (client only) ────────────────────
  const { data: savedAddresses = [] } = useQuery({
    queryKey: ['marketplace-addresses', user?.id],
    queryFn: () => (user?.id ? fetchShippingAddresses(user.id) : Promise.resolve([])),
    enabled: buyerMode === 'client' && !!user?.id,
  });

  const applyAddress = useCallback((a: ShippingAddress) => {
    setForm((f) => ({
      ...f,
      name: a.name,
      phone: a.phone,
      email: a.email ?? f.email,
      address_line1: a.address_line1,
      city: a.city,
      county: a.county,
      postal: a.postal_code,
    }));
    setSaveAddr(false); // already saved
  }, []);

  // Prefill the form from the default saved address, once.
  useEffect(() => {
    if (prefilledFromSaved || savedAddresses.length === 0) return;
    const def = savedAddresses.find((a) => a.is_default) ?? savedAddresses[0];
    if (def) {
      applyAddress(def);
      setPrefilledFromSaved(true);
    }
  }, [savedAddresses, prefilledFromSaved, applyAddress]);

  // ── Idempotency key — generate once per checkout session ─
  useEffect(() => {
    if (!marketplaceIdempotencyKey) {
      setMarketplaceIdempotencyKey(uuidv4());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Billing pre-fill (salon mode only) ───────────────
  const { details: billingDetails } = useDefaultSalonBilling(
    buyerMode === 'salon' ? salon?.id : null,
  );
  const hasBillingDetails = !!billingDetails;

  // ── Server-side quote (tier discount + shipping) ─────
  const quoteInputs = useMemo(
    () => cart.items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
    [cart.items],
  );
  const { quote } = useMarketplaceQuote(quoteInputs, buyerMode);

  // ── Shipping methods (client only) — from nopCommerce, logo + flat fee ─
  const { data: shippingMethods = [], isLoading: shippingLoading } = useShippingMethods({
    pictureSize: 160,
    enabled: buyerMode === 'client',
  });

  // Default-select the first method (sorted by display_order) once loaded.
  useEffect(() => {
    if (selectedShippingMethodId == null && shippingMethods.length > 0) {
      setSelectedShippingMethodId(shippingMethods[0].id);
    }
  }, [shippingMethods, selectedShippingMethodId]);

  const selectedShippingMethod = useMemo(
    () => shippingMethods.find((m) => m.id === selectedShippingMethodId) ?? null,
    [shippingMethods, selectedShippingMethodId],
  );

  const subtotalCents = quote?.subtotal_cents ?? cart.totalCents();
  const tierSavingsCents = quote?.tier_savings_cents ?? 0;
  // The chosen courier's fee drives the total; fall back to the quote until a
  // method is selected. Salon orders ship free.
  const shippingCents =
    buyerMode === 'salon'
      ? 0
      : selectedShippingMethod
        ? Math.round(selectedShippingMethod.shipping_price * 100)
        : (quote?.shipping_cents ?? 0);
  const totalCents = Math.max(0, subtotalCents + shippingCents);

  // ── Validation ────────────────────────────────────────
  const missingFields = useMemo<string[]>(() => {
    if (buyerMode !== 'client') return [];
    const required: { key: keyof ShippingForm; label: string }[] = [
      { key: 'name', label: 'Nume' },
      { key: 'phone', label: 'Telefon' },
      { key: 'email', label: 'Email' },
      { key: 'address_line1', label: 'Adresă' },
      { key: 'city', label: 'Oraș' },
      { key: 'county', label: 'Județ' },
      { key: 'postal', label: 'Cod postal' },
    ];
    return required.filter((r) => !form[r.key].trim()).map((r) => r.label);
  }, [form, buyerMode]);

  // ── Handlers ──────────────────────────────────────────
  const handleBack = useCallback(() => router.back(), [router]);

  const handleSubmit = useCallback(async () => {
    if (cart.items.length === 0) return;

    if (buyerMode === 'client' && missingFields.length > 0) {
      Alert.alert(
        'Date lipsa',
        `Completează: ${missingFields.join(', ')}.`,
        [{ text: 'OK' }],
      );
      return;
    }

    setSubmitting(true);
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // ── Client path: write the order straight into Supabase (nop products). ──
    if (buyerMode === 'client') {
      try {
        const shipping = {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address_line1: form.address_line1.trim(),
          city: form.city.trim(),
          county: form.county.trim(),
          postal: form.postal.trim(),
          notes: form.notes.trim() || undefined,
        };

        const result = await placeMarketplaceClientOrder({
          items: cart.items,
          paymentMethod,
          shipping,
          shippingMethod:
            selectedShippingMethod?.shipping_method_system_name ??
            selectedShippingMethod?.display_name ??
            null,
          shippingCents,
          voucherCode: voucher_code ?? null,
        });

        // Remember the address for next time (best-effort).
        if (saveAddr && user?.id) {
          try {
            await saveShippingAddress(user.id, shipping, true);
          } catch {
            /* non-fatal — order already placed */
          }
        }

        cart.clear();
        setMarketplaceIdempotencyKey(null);
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        router.replace(`/marketplace/order/${result.order_id}?fresh=1` as any);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Eroare necunoscută';
        Alert.alert('Nu am putut plasa comanda', msg, [{ text: 'OK' }]);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('Autentificare expirată. Reconectează-te.');
      }

      const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!SUPABASE_URL) {
        throw new Error('Configurare lipsa: EXPO_PUBLIC_SUPABASE_URL');
      }

      const payload: Record<string, unknown> = {
        items: cart.items.map((i) => ({
          product_id: i.product_id,
          qty: i.qty,
        })),
        buyer_mode: buyerMode,
        idempotency_key: marketplaceIdempotencyKey,
      };

      // Include billing snapshot when available (both buyer modes)
      if (billingDetails) {
        payload.billing = {
          company_name: billingDetails.company_name,
          fiscal_code: billingDetails.fiscal_code,
          registration_no: billingDetails.registration_no,
          is_vat_payer: billingDetails.is_vat_payer,
          address_line1: billingDetails.address_line1,
          address_line2: billingDetails.address_line2,
          city: billingDetails.city,
          county: billingDetails.county,
          postal_code: billingDetails.postal_code,
          country: billingDetails.country,
          contact_email: billingDetails.contact_email,
          contact_phone: billingDetails.contact_phone,
        };
      }

      if (buyerMode === 'salon') {
        payload.salon_id = salon?.id;
      } else {
        payload.shipping = {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address_line1: form.address_line1.trim(),
          city: form.city.trim(),
          county: form.county.trim(),
          postal: form.postal.trim(),
          notes: form.notes.trim() || undefined,
        };
        if (voucher_code) payload.voucher_code = voucher_code;
      }

      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/create-marketplace-checkout`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const raw = await resp.text();
      let result: any = {};
      try {
        result = raw ? JSON.parse(raw) : {};
      } catch {
        // leave as empty object — error message surfaced via resp.ok check below
      }

      if (!resp.ok) {
        const msg =
          (result?.message as string) ||
          (result?.error as string) ||
          'Eroare necunoscută. Încearcă din nou.';
        throw new Error(msg);
      }

      // Success — clear cart and idempotency key
      cart.clear();
      setMarketplaceIdempotencyKey(null);

      // Salon (marketplace-credit) success. The client path returns earlier.
      const typed = result as SalonCheckoutResult;
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Navigate to order detail with fresh=1 so the OrderSuccessModal fires.
      router.replace(`/marketplace/order/${typed.order_id}?fresh=1` as any);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Eroare necunoscută';
      Alert.alert('Nu am putut plasa comanda', msg, [{ text: 'OK' }]);
    } finally {
      setSubmitting(false);
    }
  }, [
    cart,
    buyerMode,
    form,
    missingFields,
    router,
    salon?.id,
    totalCents,
    voucher_code,
    billingDetails,
    marketplaceIdempotencyKey,
    setMarketplaceIdempotencyKey,
    paymentMethod,
    selectedShippingMethod,
    shippingCents,
    saveAddr,
    user?.id,
  ]);

  // ── Empty cart guard ──────────────────────────────────
  if (cart.items.length === 0) {
    return (
      <GradientBackground>
        <Stack.Screen options={{ headerShown: false }} />
        <View
          style={{ paddingTop: insets.top + Spacing.sm }}
          className="flex-row items-center justify-between px-5 pb-2"
        >
          <Pressable
            onPress={handleBack}
            className="w-10 h-10 items-center justify-center border"
            style={[
              Bubble.radiiSm,
              { backgroundColor: 'rgba(255,255,255,0.65)', borderColor: 'rgba(255,255,255,0.9)' },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <Text className="flex-1 text-center text-lg font-semibold" style={{ color: colors.text }}>
            Checkout
          </Text>
          <View className="w-10 h-10" />
        </View>
        <View className="flex-1 items-center justify-center gap-4 px-5">
          <Feather name="shopping-bag" size={44} color={colors.textTertiary} />
          <Text className="text-lg font-semibold text-center" style={{ color: colors.text }}>
            Cosul tau este gol
          </Text>
        </View>
      </GradientBackground>
    );
  }

  // ── Main render ───────────────────────────────────────
  return (
    <GradientBackground>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        style={{ paddingTop: insets.top + Spacing.sm }}
        className="flex-row items-center justify-between px-5 pb-2"
      >
        <Pressable
          onPress={handleBack}
          className="w-10 h-10 items-center justify-center border"
          style={[
            Bubble.radiiSm,
            { backgroundColor: 'rgba(255,255,255,0.65)', borderColor: 'rgba(255,255,255,0.9)' },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text
          className="flex-1 text-center"
          style={{ fontFamily: FontFamily.semiBold, fontSize: 18, lineHeight: 24, color: colors.text }}
        >
          Checkout
        </Text>
        <View className="w-10 h-10" />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.md, paddingBottom: insets.bottom + 140 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Buyer mode banner ── */}
          <Animated.View
            entering={slideIn(0)}
            className="flex-row items-center gap-3 p-3 border"
            style={[Bubble.radii, { backgroundColor: Brand.primaryMuted, borderColor: 'rgba(10,102,194,0.15)' }]}
          >
            <Feather
              name={buyerMode === 'salon' ? 'briefcase' : 'user'}
              size={16}
              color={Brand.primary}
            />
            <View className="flex-1">
              <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 14, lineHeight: 18, color: colors.text }}>
                {buyerMode === 'salon' ? 'Plata cu credit de salon' : 'Plata cu cardul'}
              </Text>
              <Text className="mt-0.5" style={{ fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: colors.textSecondary }}>
                {buyerMode === 'salon'
                  ? `Salon: ${salon?.name ?? '—'}`
                  : 'Stripe Checkout, RON'}
              </Text>
            </View>
          </Animated.View>

          {/* ── Fiscal data card (salon B2B only) ── */}
          {buyerMode === 'salon' && (
            <Animated.View
              entering={slideIn(40)}
              className="border p-4 gap-2"
              style={[Bubble.radii, { backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.8)' }]}
            >
              <View className="flex-row items-center justify-between">
                <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 16, lineHeight: 22, color: colors.text }}>
                  Date facturare
                </Text>
                <Pressable
                  onPress={() => router.push('/settings/billing-details' as any)}
                  hitSlop={6}
                >
                  <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 13, color: Brand.primary }}>
                    {hasBillingDetails ? 'Modifică' : 'Configurează'}
                  </Text>
                </Pressable>
              </View>

              {hasBillingDetails ? (
                <View className="gap-1">
                  <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 15, lineHeight: 22, color: colors.text }}>
                    {billingDetails!.company_name}
                  </Text>
                  <Text style={{ fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: colors.textSecondary }}>
                    {billingDetails!.entity_type === 'natural_person'
                      ? billingDetails!.cnp && billingDetails!.cnp.length >= 4
                        ? `CNP ****${billingDetails!.cnp.slice(-4)}`
                        : 'CNP ***'
                      : `CUI: ${billingDetails!.fiscal_code ?? '—'}${
                          billingDetails!.registration_no
                            ? ` · ${billingDetails!.registration_no}`
                            : ''
                        }`}
                  </Text>
                  <Text style={{ fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: colors.textSecondary }}>
                    {billingDetails!.address_line1}, {billingDetails!.city}, {billingDetails!.county}
                  </Text>
                </View>
              ) : (
                <View
                  className="flex-row items-start gap-2 py-2 px-2"
                  style={{ backgroundColor: '#FEF3C7', borderRadius: Radius.sm }}
                >
                  <Feather name="alert-circle" size={14} color="#F59E0B" />
                  <Text className="flex-1" style={{ fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: colors.text }}>
                    Nu ai date de facturare salvate. Adaugă o entitate (firmă sau persoană fizică) pentru a primi factura corectă.
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* ── Shipping form (client only) ── */}
          {buyerMode === 'client' && (
            <Animated.View
              entering={slideIn(60)}
              className="border p-4 gap-3"
              style={[Bubble.radii, { backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.8)' }]}
            >
              <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 16, lineHeight: 22, color: colors.text }}>
                Adresa de livrare
              </Text>

              {savedAddresses.length > 0 && (
                <View className="gap-2">
                  <Text style={{ fontFamily: FontFamily.regular, fontSize: 12, color: colors.textSecondary }}>
                    Adrese salvate
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingRight: 4 }}
                  >
                    {savedAddresses.map((a) => (
                      <Pressable
                        key={a.id}
                        onPress={() => applyAddress(a)}
                        style={[
                          Bubble.radiiSm,
                          {
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            maxWidth: 230,
                            backgroundColor: 'rgba(10,102,194,0.06)',
                            borderWidth: 1,
                            borderColor: 'rgba(10,102,194,0.18)',
                          },
                        ]}
                      >
                        <Text numberOfLines={1} style={{ fontFamily: FontFamily.semiBold, fontSize: 13, color: colors.text }}>
                          {a.name}{a.is_default ? ' · implicit' : ''}
                        </Text>
                        <Text numberOfLines={1} style={{ fontFamily: FontFamily.regular, fontSize: 11, color: colors.textSecondary }}>
                          {a.address_line1}, {a.city}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              <FormField
                label="Nume complet"
                value={form.name}
                onChange={(v) => setField('name', v)}
                placeholder="Ion Popescu"
                autoCapitalize="words"
                colors={colors}
              />
              <FormField
                label="Telefon"
                value={form.phone}
                onChange={(v) => setField('phone', v)}
                placeholder="07xx xxx xxx"
                keyboardType="phone-pad"
                colors={colors}
              />
              <FormField
                label="Email"
                value={form.email}
                onChange={(v) => setField('email', v)}
                placeholder="nume@example.ro"
                keyboardType="email-address"
                autoCapitalize="none"
                colors={colors}
              />
              <FormField
                label="Adresă"
                value={form.address_line1}
                onChange={(v) => setField('address_line1', v)}
                placeholder="Str. Principala nr. 1"
                colors={colors}
              />

              {/* City + County — 2-col row. flex: 1.2 cannot be expressed as a NativeWind class. */}
              <View className="flex-row gap-2">
                <View style={{ flex: 1.2 }}>
                  <FormField
                    label="Oraș"
                    value={form.city}
                    onChange={(v) => setField('city', v)}
                    placeholder="Bucuresti"
                    colors={colors}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FormField
                    label="Județ"
                    value={form.county}
                    onChange={(v) => setField('county', v)}
                    placeholder="Ilfov"
                    colors={colors}
                  />
                </View>
              </View>

              <FormField
                label="Cod postal"
                value={form.postal}
                onChange={(v) => setField('postal', v)}
                placeholder="010101"
                keyboardType="number-pad"
                colors={colors}
              />
              <FormField
                label="Note (optional)"
                value={form.notes}
                onChange={(v) => setField('notes', v)}
                placeholder="Instructiuni pentru curier"
                multiline
                colors={colors}
              />

              <Pressable
                onPress={() => setSaveAddr((v) => !v)}
                className="flex-row items-center gap-2 mt-1"
                hitSlop={6}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    borderWidth: 1.5,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderColor: saveAddr ? Brand.primary : colors.inputBorder,
                    backgroundColor: saveAddr ? Brand.primary : 'transparent',
                  }}
                >
                  {saveAddr && <Feather name="check" size={14} color="#fff" />}
                </View>
                <Text style={{ fontFamily: FontFamily.regular, fontSize: 13, color: colors.text }}>
                  Salvează această adresă pentru data viitoare
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* ── Shipping method (client only) — nop couriers ── */}
          {buyerMode === 'client' && (
            <Animated.View
              entering={slideIn(75)}
              className="border p-4 gap-3"
              style={[Bubble.radii, { backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.8)' }]}
            >
              <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 16, lineHeight: 22, color: colors.text }}>
                Metoda de livrare
              </Text>

              {shippingLoading && shippingMethods.length === 0 ? (
                <View className="flex-row items-center gap-2 py-2">
                  <ActivityIndicator size="small" color={Brand.primary} />
                  <Text style={{ fontFamily: FontFamily.regular, fontSize: 13, color: colors.textSecondary }}>
                    Se încarcă metodele de livrare…
                  </Text>
                </View>
              ) : shippingMethods.length === 0 ? (
                <Text style={{ fontFamily: FontFamily.regular, fontSize: 13, color: colors.textSecondary }}>
                  Momentan nu sunt metode de livrare disponibile.
                </Text>
              ) : (
                shippingMethods.map((m) => {
                  const active = selectedShippingMethodId === m.id;
                  const priceCents = Math.round(m.shipping_price * 100);
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setSelectedShippingMethodId(m.id)}
                      className="flex-row items-center gap-3 p-3 border"
                      style={[
                        Bubble.radiiSm,
                        {
                          borderColor: active ? Brand.primary : colors.inputBorder,
                          backgroundColor: active ? Brand.primaryMuted : 'transparent',
                        },
                      ]}
                    >
                      {m.picture_url ? (
                        <Image
                          source={{ uri: m.picture_url }}
                          style={{ width: 36, height: 36, borderRadius: 8 }}
                          contentFit="contain"
                        />
                      ) : (
                        <Feather name="truck" size={18} color={active ? Brand.primary : colors.textSecondary} />
                      )}
                      <View className="flex-1">
                        <Text numberOfLines={1} style={{ fontFamily: FontFamily.semiBold, fontSize: 14, color: colors.text }}>
                          {m.display_name ?? 'Livrare'}
                        </Text>
                        <Text style={{ fontFamily: FontFamily.regular, fontSize: 12, color: priceCents === 0 ? colors.success : colors.textSecondary }}>
                          {priceCents === 0 ? 'Gratuit' : formatPrice(priceCents)}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          borderWidth: 2,
                          borderColor: active ? Brand.primary : colors.inputBorder,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {active && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Brand.primary }} />}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </Animated.View>
          )}

          {/* ── Payment method (client only) ── */}
          {buyerMode === 'client' && (
            <Animated.View
              entering={slideIn(90)}
              className="border p-4 gap-3"
              style={[Bubble.radii, { backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.8)' }]}
            >
              <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 16, lineHeight: 22, color: colors.text }}>
                Metoda de plată
              </Text>
              {([
                { key: 'cod', icon: 'truck', title: 'Ramburs la livrare', sub: 'Platesti curierului la primire' },
                { key: 'card', icon: 'credit-card', title: 'Card bancar', sub: 'Plata online (demo)' },
              ] as const).map((opt) => {
                const active = paymentMethod === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setPaymentMethod(opt.key)}
                    className="flex-row items-center gap-3 p-3 border"
                    style={[
                      Bubble.radiiSm,
                      {
                        borderColor: active ? Brand.primary : colors.inputBorder,
                        backgroundColor: active ? Brand.primaryMuted : 'transparent',
                      },
                    ]}
                  >
                    <Feather name={opt.icon} size={18} color={active ? Brand.primary : colors.textSecondary} />
                    <View className="flex-1">
                      <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 14, color: colors.text }}>
                        {opt.title}
                      </Text>
                      <Text style={{ fontFamily: FontFamily.regular, fontSize: 12, color: colors.textSecondary }}>
                        {opt.sub}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: active ? Brand.primary : colors.inputBorder,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Brand.primary }} />}
                    </View>
                  </Pressable>
                );
              })}
            </Animated.View>
          )}

          {/* ── Items summary ── */}
          <Animated.View
            entering={slideIn(120)}
            className="border p-4 gap-2"
            style={[Bubble.radii, { backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.8)' }]}
          >
            <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 16, lineHeight: 22, color: colors.text }}>
              Produse ({cart.totalItems()})
            </Text>
            {cart.items.map((i) => (
              <View key={i.product_id} className="flex-row items-center gap-2 py-1">
                <Text
                  className="flex-1"
                  numberOfLines={2}
                  style={{ fontFamily: FontFamily.regular, fontSize: 14, lineHeight: 18, color: colors.text }}
                >
                  {i.title_snapshot}
                </Text>
                <Text style={{ fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: colors.textSecondary }}>
                  x{i.qty}
                </Text>
                <Text
                  style={{ fontFamily: FontFamily.semiBold, fontSize: 14, lineHeight: 18, color: colors.text, minWidth: 70, textAlign: 'right' }}
                >
                  {formatPrice(i.unit_price_cents * i.qty)}
                </Text>
              </View>
            ))}
          </Animated.View>

          {/* ── Pricing breakdown ── */}
          <Animated.View
            entering={slideIn(160)}
            className="border p-4 gap-1"
            style={[Bubble.radii, { backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.8)' }]}
          >
            {/* Subtotal */}
            <View className="flex-row items-center justify-between">
              <Text style={{ fontFamily: FontFamily.regular, fontSize: 14, lineHeight: 18, color: colors.textSecondary }}>
                Subtotal
              </Text>
              <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 14, lineHeight: 18, color: colors.text }}>
                {formatPrice(subtotalCents)}
              </Text>
            </View>

            {/* Tier savings (green) */}
            {tierSavingsCents > 0 && (
              <View className="flex-row items-center justify-between">
                <Text style={{ fontFamily: FontFamily.regular, fontSize: 14, lineHeight: 18, color: colors.success }}>
                  Reducere volum
                </Text>
                <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 14, lineHeight: 18, color: colors.success }}>
                  -{formatPrice(tierSavingsCents)}
                </Text>
              </View>
            )}

            {/* Voucher (client only — blocked for salon by edge fn) */}
            {voucher_code && buyerMode === 'client' && (
              <View className="flex-row items-center justify-between">
                <Text style={{ fontFamily: FontFamily.regular, fontSize: 14, lineHeight: 18, color: colors.success }}>
                  Voucher ({voucher_code})
                </Text>
                <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 14, lineHeight: 18, color: colors.success }}>
                  la confirmare
                </Text>
              </View>
            )}

            {/* Shipping */}
            <View className="flex-row items-center justify-between">
              <Text style={{ fontFamily: FontFamily.regular, fontSize: 14, lineHeight: 18, color: colors.textSecondary }}>
                Livrare
              </Text>
              <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 14, lineHeight: 18, color: shippingCents === 0 ? colors.success : colors.text }}>
                {shippingCents === 0 ? 'Gratuit' : formatPrice(shippingCents)}
              </Text>
            </View>

            {/* Divider */}
            <View className="h-px my-1" style={{ backgroundColor: colors.separator }} />

            {/* Total */}
            <View className="flex-row items-center justify-between">
              <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 16, lineHeight: 22, color: colors.text }}>
                Total {voucher_code && buyerMode === 'client' ? '(estimat)' : ''}
              </Text>
              <Text style={{ fontFamily: FontFamily.semiBold, fontSize: 18, lineHeight: 24, color: colors.text }}>
                {formatPrice(totalCents)}
              </Text>
            </View>

            {voucher_code && buyerMode === 'client' && (
              <Text className="mt-1" style={{ fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: colors.textTertiary }}>
                Voucherul este validat și aplicat la plată.
              </Text>
            )}
          </Animated.View>

          {/* ── Trust signals ── */}
          <Animated.View
            entering={slideIn(200)}
            className="flex-row items-center justify-around px-4 py-3 border"
            style={{ backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: Radius.md, borderColor: 'rgba(255,255,255,0.6)' }}
          >
            {([
              { icon: 'lock', label: 'Plata sigura' },
              { icon: 'package', label: 'Livrare 2-3 zile' },
              { icon: 'rotate-ccw', label: 'Retur 14 zile' },
            ] as const).map(({ icon, label }) => (
              <View key={icon} className="items-center gap-1">
                <Feather name={icon} size={16} color={Brand.primary} />
                <Text style={{ fontFamily: FontFamily.regular, fontSize: 11, color: colors.textSecondary }}>
                  {label}
                </Text>
              </View>
            ))}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Sticky CTA ── */}
      <View
        className="absolute left-0 right-0 bottom-0 px-5 pt-2"
        style={{ paddingBottom: insets.bottom + Spacing.md }}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          className="overflow-hidden self-stretch"
          style={[Bubble.radii, Shadows.glow, submitting && { opacity: 0.7 }]}
        >
          {/* LinearGradient does not accept className — style prop required */}
          <LinearGradient
            colors={[Brand.gradientStart, Brand.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaGradient}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="check-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={{ color: '#fff', fontFamily: FontFamily.semiBold, fontSize: 16, lineHeight: 20, letterSpacing: 0.2 }}>
                  Plasează comanda
                </Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </GradientBackground>
  );
}

// ─── FormField ────────────────────────────────────────────
function FormField({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
  colors,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  colors: (typeof Colors)['light'];
}) {
  return (
    <View className="gap-1">
      <Text className="text-xs font-semibold mb-1" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          {
            color: colors.text,
            backgroundColor: colors.inputBackground,
            borderColor: colors.inputBorder,
          },
        ]}
      />
    </View>
  );
}

// ─── Styles (style={} only for properties not expressible in NativeWind) ──
const styles = StyleSheet.create({
  ctaGradient: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  input: {
    height: 46,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    fontFamily: FontFamily.regular,
    fontSize: 14,
  },
  inputMultiline: {
    height: 72,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
});
