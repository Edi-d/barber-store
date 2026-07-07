/**
 * MarketplaceCartModal — bottom-sheet cart overlay for the marketplace cart.
 *
 * Shows line items (title_snapshot, unit_price_cents, qty stepper),
 * free-shipping progress bar, and a "Spre cos complet" CTA that pushes to
 * /marketplace/cart. Visibility driven by useUIStore.marketplaceCartOpen.
 *
 * Adapted from CartModal.tsx but typed for MarketplaceCartItem.
 * Uses the shim hook useMarketplaceCart() for backward compat with existing call sites.
 */

import { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { Image } from '@/components/ui/Image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import {
  Brand,
  Colors,
  FontFamily,
  Shadows,
  Spacing,
  Bubble,
  Typography,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMarketplaceCart } from '@/hooks/use-marketplace-cart';
import { formatPrice } from '@/lib/utils';

const FREE_THRESHOLD = 30000; // 300 RON fallback until RPC wired

export type MarketplaceCartModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function MarketplaceCartModal({
  visible,
  onClose,
}: MarketplaceCartModalProps): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const cart = useMarketplaceCart();

  const handleViewCart = useCallback(() => {
    onClose();
    setTimeout(() => router.push('/marketplace/cart' as never), 220);
  }, [onClose, router]);

  const freeProgress = FREE_THRESHOLD > 0
    ? Math.min(1, cart.totalCents / FREE_THRESHOLD)
    : 0;
  const missingForFree = Math.max(0, FREE_THRESHOLD - cart.totalCents);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        className="absolute inset-0 z-[9]"
        style={{ backgroundColor: 'rgba(10,16,28,0.45)' }}
        onPress={onClose}
        activeOpacity={1}
      />

      {/* Sheet */}
      <View
        className="absolute left-0 right-0 bottom-0 z-10"
        style={[
          styles.sheet,
          Bubble.sheetRadii,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + Spacing.base },
        ]}
      >
        {/* Handle */}
        <View className="items-center pt-3 pb-2">
          <View
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: colors.handleBar }}
          />
        </View>

        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pb-3">
          <Text style={[styles.title, { color: colors.text }]}>
            Cosul tau
            {cart.totalItems > 0 ? (
              <Text style={{ color: Brand.primary }}> ({cart.totalItems})</Text>
            ) : null}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.closeBtn, { backgroundColor: colors.overlay }]}
          >
            <Feather name="x" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Body */}
        {cart.totalItems === 0 ? (
          <View className="items-center justify-center py-10 px-5">
            <Feather name="shopping-bag" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Cosul este gol
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              Adaugă produse din catalog pentru a le vedea aici.
            </Text>
          </View>
        ) : (
          <>
            {/* Line items */}
            <ScrollView
              style={styles.itemsList}
              showsVerticalScrollIndicator={false}
            >
              {cart.items.map((item) => (
                <View
                  key={item.product_id}
                  style={[styles.itemRow, { borderBottomColor: colors.separator }]}
                >
                  {item.image_url ? (
                    <Image
                      source={{ uri: item.image_url }}
                      style={styles.itemImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.itemImage, { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }]}>
                      <Feather name="package" size={16} color={colors.textTertiary} />
                    </View>
                  )}

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
                      {formatPrice(item.unit_price_cents)} / buc
                    </Text>
                  </View>

                  {/* Qty stepper */}
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => cart.setQty(item.product_id, item.qty - 1)}
                      className="w-6 h-6 items-center justify-center"
                      style={[
                        styles.stepBtn,
                        { backgroundColor: item.qty <= 1 ? colors.textTertiary : Brand.primary },
                      ]}
                      disabled={item.qty <= 1}
                    >
                      <Feather name="minus" size={11} color="#fff" />
                    </Pressable>
                    <Text style={[styles.stepCount, { color: colors.text }]}>{item.qty}</Text>
                    <Pressable
                      onPress={() => cart.setQty(item.product_id, item.qty + 1)}
                      className="w-6 h-6 items-center justify-center"
                      style={[styles.stepBtn, { backgroundColor: Brand.primary }]}
                    >
                      <Feather name="plus" size={11} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Free-ship progress */}
            {missingForFree > 0 ? (
              <View className="px-5 pb-3">
                <View style={styles.freeShipRow}>
                  <Feather name="truck" size={13} color={Brand.primary} />
                  <Text style={[styles.freeShipText, { color: colors.textSecondary }]}>
                    Mai adaugă{' '}
                    <Text style={{ color: Brand.primary, fontFamily: FontFamily.semiBold }}>
                      {formatPrice(missingForFree)}
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
              </View>
            ) : (
              <View className="px-5 pb-3">
                <View style={styles.freeShipRow}>
                  <Feather name="check-circle" size={13} color={colors.success} />
                  <Text style={[styles.freeShipText, { color: colors.success }]}>
                    Livrare gratuită aplicată!
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* CTA */}
        <View className="px-5 pt-2">
          <TouchableOpacity
            onPress={handleViewCart}
            activeOpacity={0.85}
            style={[styles.ctaShadow, Bubble.radii, Shadows.glow]}
          >
            <LinearGradient
              colors={[Brand.gradientStart, Brand.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.cta, Bubble.radii]}
            >
              <Feather name="shopping-bag" size={18} color={Brand.white} />
              <Text style={styles.ctaText}>Spre coș complet</Text>
              {cart.totalItems > 0 && (
                <Text style={styles.ctaPrice}>{formatPrice(cart.totalCents)}</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    minHeight: 220,
    maxHeight: '85%',
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    letterSpacing: 0.2,
  },
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    marginTop: Spacing.md,
    letterSpacing: 0.2,
  },
  emptyHint: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  itemsList: {
    maxHeight: 280,
    paddingHorizontal: Spacing.lg,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemBrand: {
    fontFamily: FontFamily.semiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemTitle: {
    ...Typography.captionSemiBold,
    lineHeight: 16,
  },
  itemPrice: {
    ...Typography.small,
    marginTop: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  stepBtn: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 12,
  },
  stepCount: {
    ...Typography.captionSemiBold,
    minWidth: 18,
    textAlign: 'center',
    fontSize: 13,
  },
  freeShipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  freeShipText: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  ctaShadow: {
    overflow: 'hidden',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
  },
  ctaText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  ctaPrice: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
});
