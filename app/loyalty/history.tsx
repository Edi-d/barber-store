import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/stores/authStore';
import { fetchRecentXpTransactions } from '@/lib/loyalty';
import { useXpRealtime, XP_TX_ALL_QK } from '@/hooks/useXpRealtime';
import { PointsTransactionList } from '@/components/loyalty/PointsTransactionList';
import { Colors, Bubble, Shadows, Typography, Spacing } from '@/constants/theme';

export default function TransactionHistoryScreen() {
  const session = useAuthStore((s) => s.session);

  // Live points: refresh the history the moment a new XP transaction lands.
  useXpRealtime(session?.user.id);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: session?.user.id ? XP_TX_ALL_QK(session.user.id) : ['loyalty-transactions-all', 'anonymous'],
    queryFn: () =>
      session?.user.id
        ? fetchRecentXpTransactions(session.user.id, 100)
        : Promise.resolve([]),
    enabled: !!session?.user.id,
  });

  const backSafely = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/loyalty');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={backSafely} hitSlop={10}>
          <View style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>Istoric tranzacții</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <PointsTransactionList transactions={transactions} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
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
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing['3xl'] * 3,
  },
  card: {
    backgroundColor: Colors.white,
    ...Bubble.radiiSm,
    ...Shadows.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
});
