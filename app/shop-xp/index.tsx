/**
 * XP Magazin — Shop XP Dashboard
 *
 * Displays the user's shop-scoped XP progress, level, transaction history,
 * and a CTA to the rewards catalog. Separate from the platform loyalty screen
 * which shows voucher-based platform XP.
 *
 * TODO (checkout wiring — Phase 2):
 *   - Import useShopXP and useXpQueueStore in app/marketplace/checkout.tsx
 *   - In onSuccess callback: call earnXP(order.id, total / 100) fire-and-forget
 *   - Pipe result to enqueueToast({ id, xp, source, leveled_up, newLevel })
 *   - Shop XP is idempotent on order_id — safe on retries
 *
 * Data: user_shop_xp + shop_xp_transactions tables (migration 069)
 * Hook: useShopXP() resolves salonId from salon_provider context or EXPO_PUBLIC_SALON_ID
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Bubble, Colors, Spacing, FontFamily, Shadows } from '@/constants/theme';
import { useShopXP } from '@/hooks/use-shop-xp';
import { XPOverview } from '@/components/shop-gamification/XPOverview';
import type { XPTransaction } from '@/components/shop-gamification/XPOverview';

// ─── Component ──────────────────────────────────────────

export default function ShopXPScreen() {
  const colors = Colors.light;
  const { xpSummary, isLoading, error } = useShopXP();

  const handleNavigateRewards = useCallback(() => {
    // TODO: navigate to rewards catalog when it is implemented
    // router.push('/marketplace/rewards');
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile');
    }
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          className="w-10 h-10 items-center justify-center active:opacity-70"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>XP Magazin</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFB300" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textTertiary} />
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            Nu am putut incarca XP-ul
          </Text>
          <Text style={[styles.errorSubtext, { color: colors.textTertiary }]}>
            {error}
          </Text>
        </View>
      ) : !xpSummary ? (
        <View style={styles.center}>
          <Ionicons name="flash-outline" size={48} color="#FFB300" />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Incepe sa castigi XP!
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Plaseaza comenzi din Magazin pentru a acumula XP Magazin si debloca recompense exclusive.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/shop' as any)}
            className="mt-6 px-8 py-3 overflow-hidden active:opacity-80"
            style={[styles.shopBtn, Bubble.radiiSm]}
          >
            <Text style={styles.shopBtnText}>Mergi la Magazin</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.duration(400).delay(80)}>
            <XPOverview
              level={xpSummary.level}
              currentXP={xpSummary.currentXP}
              requiredXP={xpSummary.currentXP + xpSummary.xpToNextLevel}
              totalXP={xpSummary.totalXP}
              recentTransactions={[] as XPTransaction[]}
              onNavigateRewards={handleNavigateRewards}
            />
          </Animated.View>

          {/* Info card */}
          <Animated.View
            entering={FadeInDown.duration(400).delay(200)}
            style={[styles.infoCard, Shadows.sm, { backgroundColor: colors.backgroundSecondary }]}
          >
            <Ionicons name="information-circle-outline" size={18} color={colors.textTertiary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              XP Magazin este o valuta separata de Punctele de fidelitate. Se castiga exclusiv din comenzile de produse si se poate folosi pentru recompense din catalogul Magazin.
            </Text>
          </Animated.View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 20,
  },
  headerTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: 17,
    lineHeight: 22,
  },
  headerRight: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.base,
    gap: Spacing.base,
    paddingBottom: 120,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
    gap: Spacing.md,
  },
  errorText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorSubtext: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  shopBtn: {
    backgroundColor: '#FFB300',
  },
  shopBtnText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: '#000000',
    letterSpacing: 0.2,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: 14,
    padding: Spacing.base,
  },
  infoText: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
  },
});
