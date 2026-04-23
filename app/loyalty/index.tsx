import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuthStore } from '@/stores/authStore';
import { useLoyaltyProfile } from '@/hooks/useLoyaltyProfile';
import { fetchRecentXpTransactions } from '@/lib/loyalty';
import { TierBadge } from '@/components/loyalty/TierBadge';
import { TierProgressBar } from '@/components/loyalty/TierProgressBar';
import { PointsTransactionList } from '@/components/loyalty/PointsTransactionList';
import { VoucherConversionSection } from '@/components/loyalty/VoucherConversionSection';
import { Brand, Colors, Bubble, Shadows, FontFamily, Typography, Spacing } from '@/constants/theme';

export default function LoyaltyScreen() {
  const session = useAuthStore((s) => s.session);
  const { data: xp, isLoading } = useLoyaltyProfile();

  const { data: transactions = [] } = useQuery({
    queryKey: ['loyalty-transactions', session?.user.id],
    queryFn: () =>
      session?.user.id
        ? fetchRecentXpTransactions(session.user.id, 20)
        : Promise.resolve([]),
    enabled: !!session?.user.id,
  });

  const backSafely = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={backSafely} hitSlop={10}>
          <View style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>Punctele mele</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading || !xp ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero card — brand blue gradient */}
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={[Brand.gradientStart, Brand.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              {/* Top row: badge in translucent circle + tier name */}
              <View style={styles.heroTop}>
                <View style={styles.badgeCircle}>
                  <TierBadge level={xp.currentLevel.level} size="md" />
                </View>
                <View style={styles.heroTierInfo}>
                  <View style={styles.tierNameRow}>
                    <View style={[styles.tierDot, { backgroundColor: xp.currentLevel.color }]} />
                    <Text style={styles.heroTierLabel}>Nivelul tau</Text>
                  </View>
                  <Text style={styles.heroTierName}>{xp.currentLevel.title}</Text>
                </View>
              </View>

              {/* Balance */}
              <Text style={styles.pointsValue} numberOfLines={1} adjustsFontSizeToFit>
                {xp.balance.toLocaleString('ro-RO')}
              </Text>
              <Text style={styles.pointsLabel}>puncte disponibile</Text>
              <Text style={styles.lifetimeLabel}>
                {xp.lifetime.toLocaleString('ro-RO')} puncte acumulate total
              </Text>

              {/* Progress bar — white on blue */}
              <View style={styles.progressWrap}>
                <TierProgressBar
                  lifetimePoints={xp.lifetime}
                  currentLevel={xp.currentLevel.level}
                  textColor="#FFFFFF"
                />
              </View>
            </LinearGradient>
          </View>

          {/* Section: Benefits */}
          <Text style={styles.sectionTitle}>Beneficii nivel {xp.currentLevel.title}</Text>
          <View style={styles.card}>
            {xp.currentLevel.perks.map((p, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={[styles.bullet, { backgroundColor: xp.currentLevel.color }]} />
                <Text style={styles.benefitText}>{p}</Text>
              </View>
            ))}
          </View>

          {/* Section: Vouchers */}
          <Text style={styles.sectionTitle}>Vouchere disponibile</Text>
          <View style={styles.card}>
            <Text style={styles.cardSub}>
              Converteste punctele in voucher folosibil la orice salon sau in marketplace.
            </Text>
            <View style={{ marginTop: Spacing.sm }}>
              <VoucherConversionSection currentBalance={xp.balance} />
            </View>
          </View>

          {/* Section: How to earn */}
          <Text style={styles.sectionTitle}>Cum castigi puncte</Text>
          <View style={styles.card}>
            <View style={styles.howToRow}>
              <View style={styles.howToIconCircle}>
                <Ionicons name="star-outline" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.howToText}>
                Primesti puncte automat dupa fiecare programare finalizata sau comanda platita.
                Cu cat cheltui mai mult, cu atat avansezi mai rapid in nivele si deblochezi
                vouchere mai valoroase.
              </Text>
            </View>
          </View>

          {/* Section: History */}
          <Text style={styles.sectionTitle}>Istoric tranzactii</Text>
          <View style={styles.card}>
            <View style={styles.historyHeaderRow}>
              <View style={styles.howToIconCircle}>
                <Ionicons name="time-outline" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.historyHeaderText}>Activitate recenta</Text>
            </View>
            <View style={{ marginTop: Spacing.md }}>
              <PointsTransactionList transactions={transactions} />
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  /* Header */
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
    paddingBottom: Spacing['3xl'],
    paddingTop: Spacing.sm,
  },

  /* Hero */
  heroWrap: {
    marginBottom: Spacing.lg,
    ...Bubble.radiiSm,
    overflow: 'hidden',
    ...Shadows.glow,
  },
  heroGradient: {
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  badgeCircle: {
    width: 64,
    height: 64,
    ...Bubble.radiiSm,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTierInfo: {
    flex: 1,
    gap: 4,
  },
  tierNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tierDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroTierLabel: {
    ...Typography.small,
    color: 'rgba(255,255,255,0.75)',
  },
  heroTierName: {
    ...Typography.h3,
    color: Brand.white,
    letterSpacing: -0.3,
  },
  pointsValue: {
    fontFamily: FontFamily.bold,
    fontSize: 44,
    lineHeight: 50,
    color: Brand.white,
    letterSpacing: -1.5,
    marginTop: 4,
  },
  pointsLabel: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.85)',
    marginTop: -2,
  },
  lifetimeLabel: {
    ...Typography.small,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  progressWrap: {
    marginTop: Spacing.lg,
  },

  /* Section titles */
  sectionTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.md,
    letterSpacing: -0.3,
  },

  /* Shared card */
  card: {
    backgroundColor: Colors.white,
    ...Bubble.radiiSm,
    ...Shadows.sm,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  cardSub: {
    ...Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  /* Benefits */
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  benefitText: {
    ...Typography.body,
    color: '#191919',
    flex: 1,
  },

  /* How to earn */
  howToRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  howToIconCircle: {
    width: 40,
    height: 40,
    ...Bubble.radiiSm,
    backgroundColor: Brand.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  howToText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },

  /* History */
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  historyHeaderText: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
});
