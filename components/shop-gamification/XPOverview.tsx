/**
 * XPOverview
 *
 * Full XP overview card for the shop screen. Shows level, XP progress bar,
 * recent XP transactions, and a "Magazin Recompense" navigation button.
 * Glassmorphic card with the app's Bubble asymmetric corners.
 */

import { memo } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeInDown,
} from 'react-native-reanimated';

import {
  Colors,
  FontFamily,
  Spacing,
  Bubble,
  Shadows,
} from '@/constants/theme';
import { XPProgressBar } from './XPProgressBar';

// ─── Constants ──────────────────────────────────────────

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

const OVERVIEW_COLORS = {
  gold: '#FFB300',
  goldDark: '#FF8F00',
  goldLight: '#FFD54F',
  amber: '#F57C00',
  glassBg: 'rgba(255, 255, 255, 0.78)',
  glassBorder: 'rgba(255, 255, 255, 0.55)',
  sectionBg: 'rgba(255, 249, 235, 0.6)',
  transactionPlus: '#2E7D32',
  transactionMinus: '#E53935',
};

// ─── Types ──────────────────────────────────────────────

export interface XPTransaction {
  id: string;
  /** XP amount (positive = earned, negative = spent) */
  amount: number;
  /** Description in Romanian */
  description: string;
  /** ISO date string */
  date: string;
}

interface XPOverviewProps {
  /** Current level */
  level: number;
  /** XP in current level */
  currentXP: number;
  /** XP required for next level */
  requiredXP: number;
  /** Total lifetime XP */
  totalXP: number;
  /** Recent transactions to display (max 5) */
  recentTransactions?: XPTransaction[];
  /** Navigate to rewards shop */
  onNavigateRewards?: () => void;
}

// ─── Helpers ────────────────────────────────────────────

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
  });
}

function formatXP(amount: number): string {
  const prefix = amount > 0 ? '+' : '';
  return `${prefix}${amount.toLocaleString('ro-RO')} XP`;
}

// ─── Component ──────────────────────────────────────────

function XPOverviewInner({
  level,
  currentXP,
  requiredXP,
  totalXP,
  recentTransactions = [],
  onNavigateRewards,
}: XPOverviewProps) {
  const colors = Colors.light;
  const displayTransactions = recentTransactions.slice(0, 5);

  return (
    <Animated.View
      entering={FadeInDown.duration(400).easing(SMOOTH).withInitialValues({ transform: [{ translateY: 12 }] })}
      style={[Shadows.md, Bubble.radii]}
    >
      <BlurView
        intensity={45}
        tint="light"
        style={[
          styles.card,
          {
            backgroundColor: OVERVIEW_COLORS.glassBg,
            borderColor: OVERVIEW_COLORS.glassBorder,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Feather name="zap" size={18} color={OVERVIEW_COLORS.gold} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                Experienta Magazin
              </Text>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                Total: {totalXP.toLocaleString('ro-RO')} XP
              </Text>
            </View>
          </View>
        </View>

        {/* XP Progress Bar (inline, no card wrapper) */}
        <XPProgressBar
          level={level}
          currentXP={currentXP}
          requiredXP={requiredXP}
          showCard={false}
        />

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={[styles.statItem, { backgroundColor: OVERVIEW_COLORS.sectionBg }]}>
            <Feather name="star" size={14} color={OVERVIEW_COLORS.gold} />
            <Text style={[styles.statValue, { color: OVERVIEW_COLORS.goldDark }]}>
              {level}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Nivel
            </Text>
          </View>

          <View style={[styles.statItem, { backgroundColor: OVERVIEW_COLORS.sectionBg }]}>
            <Feather name="trending-up" size={14} color={OVERVIEW_COLORS.gold} />
            <Text style={[styles.statValue, { color: OVERVIEW_COLORS.goldDark }]}>
              {totalXP.toLocaleString('ro-RO')}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              XP Total
            </Text>
          </View>

          <View style={[styles.statItem, { backgroundColor: OVERVIEW_COLORS.sectionBg }]}>
            <Feather name="target" size={14} color={OVERVIEW_COLORS.gold} />
            <Text style={[styles.statValue, { color: OVERVIEW_COLORS.goldDark }]}>
              {(requiredXP - currentXP).toLocaleString('ro-RO')}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Pana la urm.
            </Text>
          </View>
        </View>

        {/* Recent transactions */}
        {displayTransactions.length > 0 && (
          <View style={styles.transactionsSection}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              Activitate recenta
            </Text>
            {displayTransactions.map((tx) => (
              <View key={tx.id} style={styles.txRow}>
                <View style={[
                  styles.txIcon,
                  {
                    backgroundColor: tx.amount > 0
                      ? 'rgba(46, 125, 50, 0.08)'
                      : 'rgba(229, 57, 53, 0.08)',
                  },
                ]}>
                  <Feather
                    name={tx.amount > 0 ? 'plus' : 'minus'}
                    size={12}
                    color={tx.amount > 0 ? OVERVIEW_COLORS.transactionPlus : OVERVIEW_COLORS.transactionMinus}
                  />
                </View>
                <View style={styles.txContent}>
                  <Text
                    style={[styles.txDescription, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {tx.description}
                  </Text>
                  <Text style={[styles.txDate, { color: colors.textTertiary }]}>
                    {formatDate(tx.date)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    {
                      color: tx.amount > 0
                        ? OVERVIEW_COLORS.transactionPlus
                        : OVERVIEW_COLORS.transactionMinus,
                    },
                  ]}
                >
                  {formatXP(tx.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* CTA Button — NativeWind className for Pressable layout */}
        {onNavigateRewards && (
          <Pressable
            onPress={onNavigateRewards}
            className="self-stretch mt-1 overflow-hidden"
            style={Bubble.radiiSm}
          >
            <LinearGradient
              colors={[OVERVIEW_COLORS.goldLight, OVERVIEW_COLORS.gold]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaButton}
            >
              <Feather name="gift" size={16} color="#000" />
              <Text style={styles.ctaText}>Magazin Recompense</Text>
              <Feather name="chevron-right" size={16} color="#000" />
            </LinearGradient>
          </Pressable>
        )}
      </BlurView>
    </Animated.View>
  );
}

export const XPOverview = memo(XPOverviewInner);

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.base,
    gap: Spacing.base,
    borderBottomColor: 'rgba(255, 179, 0, 0.2)',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  headerSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    borderRadius: 12,
    gap: 3,
  },
  statValue: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
  },
  statLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
  },

  // Transactions
  transactionsSection: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  txIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txContent: {
    flex: 1,
    gap: 1,
  },
  txDescription: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 17,
  },
  txDate: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    lineHeight: 14,
  },
  txAmount: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    lineHeight: 17,
  },

  // CTA
  ctaButton: {
    height: 46,
    ...Bubble.radiiSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  ctaText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: '#000000',
    letterSpacing: 0.2,
  },
});
