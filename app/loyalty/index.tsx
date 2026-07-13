import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useAuthStore } from '@/stores/authStore';
import { useSalonLoyaltyCards } from '@/hooks/useSalonLoyaltyCards';
import { useSalonLoyaltyDetail } from '@/hooks/useSalonLoyaltyDetail';
import { useRedeemSalonReward } from '@/hooks/useRedeemSalonReward';
import {
  getSalonPointHistory,
  type CatalogReward,
  type PointHistoryItem,
  type RedeemResult,
} from '@/lib/salon-loyalty';
import { SalonWalletCarousel } from '@/components/loyalty/salon/SalonWalletCarousel';
import { SalonLoyaltyTabs, type SalonLoyaltyTab } from '@/components/loyalty/salon/SalonLoyaltyTabs';
import { SalonRewardCard } from '@/components/loyalty/salon/SalonRewardCard';
import { SalonVoucherRow } from '@/components/loyalty/salon/SalonVoucherRow';
import { SalonHistoryRow } from '@/components/loyalty/salon/SalonHistoryRow';
import { RewardCodeModal } from '@/components/loyalty/salon/RewardCodeModal';
import { Bubble, Colors, Shadows, Spacing, Typography } from '@/constants/theme';

export default function LoyaltyScreen() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;
  const { from } = useLocalSearchParams<{ from?: string }>();
  const showBackBtn = from === 'profile';

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<SalonLoyaltyTab>('recompense');
  const [refreshing, setRefreshing] = useState(false);

  const cardsQuery = useSalonLoyaltyCards(userId);
  // Only surface salons that actually run a loyalty program — hide "no program"
  // salons the client has merely visited.
  const cards = (cardsQuery.data ?? []).filter((c) => c.hasProgram);
  const selectedSalonId = cards[selectedIndex]?.salonId;

  const detailQuery = useSalonLoyaltyDetail(userId, selectedSalonId);
  const detail = detailQuery.data ?? null;

  /* ── Reward redemption ── */
  const redeem = useRedeemSalonReward();
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [codeModal, setCodeModal] = useState<{ title: string; code: string; subtitle?: string } | null>(null);

  const onRedeem = useCallback(
    async (reward: CatalogReward) => {
      if (!userId || !selectedSalonId) return;
      setRedeemingId(reward.id);
      try {
        // mutateAsync returns the RedeemResult as a plain local, which narrows
        // cleanly (react-query's mutate onSuccess callback defeats union narrowing).
        const res: RedeemResult = await redeem.mutateAsync({ userId, salonId: selectedSalonId, rewardId: reward.id });
        if (res.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setCodeModal({ title: res.rewardName, code: res.code });
        } else {
          Alert.alert('Nu s-a putut revendica', res.error);
        }
      } catch (e: any) {
        Alert.alert('Eroare', e?.message ?? 'A apărut o eroare.');
      } finally {
        setRedeemingId(null);
      }
    },
    [userId, selectedSalonId, redeem],
  );

  /* ── History pagination (page 0 comes from the detail query) ── */
  const [extraHistory, setExtraHistory] = useState<PointHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Reset accumulated pages whenever the salon (or refetched detail) changes.
  useEffect(() => {
    setExtraHistory([]);
    setHistoryPage(0);
    setHistoryHasMore(detail?.historyHasMore ?? false);
  }, [selectedSalonId, detail?.historyHasMore]);

  const combinedHistory = [...(detail?.history ?? []), ...extraHistory];

  const loadMoreHistory = useCallback(async () => {
    if (!userId || !selectedSalonId || loadingMore) return;
    setLoadingMore(true);
    const next = historyPage + 1;
    const { rows, hasMore } = await getSalonPointHistory(userId, selectedSalonId, next);
    setExtraHistory((prev) => [...prev, ...rows]);
    setHistoryPage(next);
    setHistoryHasMore(hasMore);
    setLoadingMore(false);
  }, [userId, selectedSalonId, loadingMore, historyPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([cardsQuery.refetch(), detailQuery.refetch()]);
    setRefreshing(false);
  }, [cardsQuery, detailQuery]);

  const backSafely = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const header = (
    <View style={styles.header}>
      {showBackBtn ? (
        <Pressable onPress={backSafely} hitSlop={10}>
          <View style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </View>
        </Pressable>
      ) : (
        <View style={{ width: 36 }} />
      )}
      <Text style={styles.headerTitle}>Loialitate</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  /* ── Loading & empty states ── */
  if (cardsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <View style={styles.centerWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="storefront-outline" size={30} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Niciun salon încă</Text>
          <Text style={styles.emptyText}>
            Fă prima ta programare pentru a începe să acumulezi puncte de loialitate.
          </Text>
          <Pressable style={styles.emptyCta} onPress={() => router.push('/(tabs)/discover')}>
            <Text style={styles.emptyCtaText}>Descoperă saloane</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}

      {/* Fixed top: wallet carousel + tabs */}
      <View style={styles.topFixed}>
        <SalonWalletCarousel
          cards={cards}
          selectedIndex={selectedIndex}
          onIndexChange={(i) => {
            setSelectedIndex(i);
            setActiveTab('recompense');
          }}
        />
        <View style={styles.tabsWrap}>
          <SalonLoyaltyTabs
            active={activeTab}
            onChange={setActiveTab}
            counts={{
              recompense: detail?.rewards.length,
              vouchere: detail?.vouchers.length,
            }}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {!detail && detailQuery.isFetching ? (
          <View style={styles.detailLoading}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        ) : detail ? (
          <>
            {/* Tab: Recompense */}
            {activeTab === 'recompense' &&
              (!detail.hasProgram ? (
                <MutedNote text="Acest salon nu are un program de loialitate momentan." />
              ) : detail.rewards.length === 0 ? (
                <MutedNote text="Nicio recompensă disponibilă deocamdată." />
              ) : (
                <View style={styles.list}>
                  {detail.rewards.map((r) => (
                    <SalonRewardCard
                      key={r.id}
                      reward={r}
                      currentPoints={detail.currentPoints}
                      userTier={detail.progress?.currentTier ?? null}
                      enrolled={detail.enrolled}
                      redeeming={redeemingId === r.id}
                      onRedeem={onRedeem}
                    />
                  ))}
                </View>
              ))}

            {/* Tab: Vouchere */}
            {activeTab === 'vouchere' &&
              (detail.vouchers.length === 0 ? (
                <MutedNote text="Nu ai vouchere la acest salon încă." />
              ) : (
                <View style={styles.list}>
                  {detail.vouchers.map((v) => (
                    <SalonVoucherRow key={v.id} voucher={v} />
                  ))}
                </View>
              ))}

            {/* Tab: Istoric */}
            {activeTab === 'istoric' &&
              (combinedHistory.length === 0 ? (
                <MutedNote text="Nicio activitate încă la acest salon." />
              ) : (
                <View style={styles.historyCard}>
                  {combinedHistory.map((h) => (
                    <SalonHistoryRow key={h.id} item={h} />
                  ))}
                  {historyHasMore && (
                    <Pressable style={styles.loadMore} onPress={loadMoreHistory} disabled={loadingMore}>
                      {loadingMore ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <Text style={styles.loadMoreText}>Vezi mai mult</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              ))}
          </>
        ) : (
          <MutedNote text="Nu am putut încărca detaliile salonului." />
        )}
      </ScrollView>

      <RewardCodeModal
        visible={codeModal !== null}
        onClose={() => setCodeModal(null)}
        title={codeModal?.title ?? ''}
        code={codeModal?.code ?? ''}
        subtitle={codeModal?.subtitle}
      />
    </SafeAreaView>
  );
}

function MutedNote({ text }: { text: string }) {
  return (
    <View style={styles.mutedNote}>
      <Text style={styles.mutedNoteText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    ...Bubble.radiiSm,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.text,
    letterSpacing: -0.3,
  },

  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    ...Bubble.radiiSm,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  emptyText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCta: {
    marginTop: Spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  emptyCtaText: {
    ...Typography.captionSemiBold,
    color: '#FFFFFF',
  },

  topFixed: {
    paddingTop: Spacing.sm,
  },
  tabsWrap: {
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.lg,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['3xl'] * 3,
  },

  detailLoading: {
    paddingVertical: Spacing['3xl'],
    alignItems: 'center',
  },

  list: { gap: Spacing.md },

  historyCard: {
    backgroundColor: Colors.white,
    ...Bubble.radiiSm,
    ...Shadows.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
  },
  loadMoreText: {
    ...Typography.captionSemiBold,
    color: Colors.primary,
  },

  mutedNote: {
    backgroundColor: Colors.white,
    ...Bubble.radiiSm,
    ...Shadows.sm,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  mutedNoteText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
