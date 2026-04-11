/**
 * TutorialProgress
 *
 * Hero progress card displayed at the top of the tutorials page.
 * Shows overall chapter completion percentage with a progress bar,
 * subtitle, and a CTA button to resume where the user left off.
 *
 * Design tokens:
 *   - LinearGradient: Colors.gradientStart (#4481EB) → Colors.gradientEnd (#040EFD)
 *   - Border radius: Bubble.radiiLg
 *   - Shadow: Shadows.lg
 *   - Padding: 20px (Spacing.lg)
 *   - Margin horizontal: 20px (Spacing.lg)
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Bubble, Colors, FontFamily, Shadows, Spacing } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TutorialProgressProps {
  completedCount: number;
  totalCount: number;
  onContinue: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TutorialProgress({
  completedCount,
  totalCount,
  onContinue,
}: TutorialProgressProps) {
  const percentage =
    totalCount > 0
      ? Math.min(100, Math.max(0, Math.round((completedCount / totalCount) * 100)))
      : 0;

  const isFinished = completedCount >= totalCount && totalCount > 0;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(100)}
      style={styles.wrapper}
    >
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Label */}
        <Text style={styles.label}>PROGRESUL TAU</Text>

        {/* Percentage */}
        <Text style={styles.percentage}>{percentage}%</Text>

        {/* Progress bar track */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percentage}%` as `${number}%` }]} />
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          {completedCount} din {totalCount} lectii completate
        </Text>

        {/* CTA button — only shown while there are lessons left */}
        {!isFinished && (
          <Pressable
            onPress={onContinue}
            style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaPressed]}
          >
            <Text style={styles.ctaText}>Continua de unde ai ramas →</Text>
          </Pressable>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.lg,
    ...Shadows.lg,
  },

  card: {
    ...Bubble.radiiLg,
    padding: Spacing.lg,
    overflow: 'hidden',
  },

  label: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.5,
  },

  percentage: {
    fontFamily: FontFamily.bold,
    fontSize: 36,
    color: '#FFFFFF',
    marginTop: 4,
  },

  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#34D399',
    borderRadius: 3,
  },

  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },

  ctaButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 14,
  },

  ctaPressed: {
    opacity: 0.85,
  },

  ctaText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: Colors.primary,
  },
});
