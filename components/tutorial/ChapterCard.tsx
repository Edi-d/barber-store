/**
 * ChapterCard
 *
 * Vertical-list card for a single tutorial chapter.
 * Follows the CourseListCard pattern from app/courses.tsx.
 *
 * Layout:
 *   [ Icon column (80px) ][ Content (flex 1) ][ Chevron ]
 *
 * Progress states:
 *   - Not started  → gray dot + "Neinceput"
 *   - In progress  → thin progress bar + percentage
 *   - Completed    → green checkmark + "Completat"
 *
 * Animation: FadeInDown with 60 ms × index stagger.
 */

import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily } from '@/constants/theme';
import type { TutorialChapter } from '@/data/tutorials';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChapterCardProps {
  chapter: TutorialChapter;
  completedCount: number;
  totalCount: number;
  index: number;
  onPress: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sums all lesson durations (in seconds) across the chapter and converts to
 * minutes, rounded up to the nearest whole minute.
 */
function calcEstimatedMinutes(chapter: TutorialChapter): number {
  const totalSeconds = chapter.lessons.reduce(
    (acc, lesson) => acc + (lesson.durationSec ?? 0),
    0,
  );
  return Math.ceil(totalSeconds / 60);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChapterCard({
  chapter,
  completedCount,
  totalCount,
  index,
  onPress,
}: ChapterCardProps) {
  const isNotStarted = completedCount === 0;
  const isCompleted = completedCount >= totalCount && totalCount > 0;
  const isInProgress = !isNotStarted && !isCompleted;

  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const estimatedMinutes = calcEstimatedMinutes(chapter);

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(60 * index)}
      style={styles.shadow}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      >
        {/* ── Left: icon column ── */}
        <View style={styles.iconColumn}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: chapter.iconBgColor },
            ]}
          >
            <Ionicons
              name={chapter.icon as React.ComponentProps<typeof Ionicons>['name']}
              size={28}
              color={chapter.iconColor}
            />
          </View>
        </View>

        {/* ── Center: text + progress ── */}
        <View style={styles.content}>
          {/* Title */}
          <Text style={styles.title} numberOfLines={1}>
            {chapter.title}
          </Text>

          {/* Meta line */}
          <Text style={styles.meta} numberOfLines={1}>
            {totalCount} lectii · ~{estimatedMinutes} min
          </Text>

          {/* Progress section */}
          <View style={styles.progressSection}>
            {isCompleted && (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={Colors.success}
                />
                <Text style={styles.completedText}>Completat</Text>
              </>
            )}

            {isInProgress && (
              <>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${progressPercent}%` as `${number}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressPercent}>{progressPercent}%</Text>
              </>
            )}

            {isNotStarted && (
              <>
                <View style={styles.notStartedDot} />
                <Text style={styles.notStartedText}>Neinceput</Text>
              </>
            )}
          </View>
        </View>

        {/* ── Right: chevron ── */}
        <View style={styles.chevronColumn}>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  shadow: Platform.select({
    ios: {
      shadowColor: '#1E293B',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
    default: {},
  })!,

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },

  // ── Icon column ──────────────────────────────────────────────────────────────

  iconColumn: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },

  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Center content ────────────────────────────────────────────────────────────

  content: {
    flex: 1,
    paddingVertical: 12,
  },

  title: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: '#1E293B',
  },

  meta: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 3,
  },

  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },

  // In-progress bar
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },

  progressPercent: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    color: Colors.primary,
  },

  // Completed state
  completedText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: Colors.success,
  },

  // Not-started state
  notStartedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },

  notStartedText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: '#94A3B8',
  },

  // ── Chevron column ────────────────────────────────────────────────────────────

  chevronColumn: {
    paddingRight: 14,
    justifyContent: 'center',
  },
});
