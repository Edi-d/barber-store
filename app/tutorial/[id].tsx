/**
 * app/tutorial/[id].tsx
 *
 * Chapter detail page — shows a single tutorial chapter with its lessons.
 * Layout mirrors course/[id].tsx: hero, info overlap, progress card,
 * staggered lesson list, and a fixed bottom CTA bar.
 *
 * Data: static TUTORIALS from data/tutorials.ts (no DB queries).
 * Progress: useTutorialStore (AsyncStorage + Zustand).
 */

import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Colors, Shadows, Bubble, FontFamily, Spacing } from '@/constants/theme';
import {
  TUTORIALS,
  getTutorialById,
  type TutorialChapter,
  type TutorialLesson,
} from '@/data/tutorials';
import { useTutorialStore } from '@/stores/tutorialStore';
import { useTutorial } from '@/hooks/useTutorial';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lighten a hex colour toward white by the given ratio (0–1). */
function lightenHex(hex: string, ratio: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * ratio);
  const lg = Math.round(g + (255 - g) * ratio);
  const lb = Math.round(b + (255 - b) * ratio);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/** Total estimated minutes for a chapter. */
function chapterEstimateMin(chapter: TutorialChapter): number {
  const totalSec = chapter.lessons.reduce((acc, l) => acc + l.durationSec, 0);
  return Math.ceil(totalSec / 60);
}

/** Per-lesson duration string, per spec. */
function lessonDurationLabel(lesson: TutorialLesson): string {
  if (lesson.type === 'interactive') {
    return `${lesson.steps?.length ?? 0} pasi`;
  }
  return `~${lesson.durationSec}s`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TutorialChapterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const store = useTutorialStore();
  const tutorial = useTutorial();

  const chapter = getTutorialById(id);

  // ── Not-found guard ──────────────────────────────────────────────────────
  if (!chapter) {
    return (
      <View style={styles.errorContainer}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { top: insets.top + 8 }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color="#191919" />
        </Pressable>
        <Text style={styles.errorText}>Capitolul nu a fost gasit.</Text>
      </View>
    );
  }

  // ── Progress ─────────────────────────────────────────────────────────────
  const totalLessons = chapter.lessons.length;
  const completedCount = chapter.lessons.filter((l) =>
    store.isLessonCompleted(l.id),
  ).length;
  const progress =
    totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const allComplete = completedCount === totalLessons && totalLessons > 0;
  const inProgress = completedCount > 0 && !allComplete;

  // ── Hero gradient: pale tint top-left → full icon colour bottom-right ───
  const gradientStart = lightenHex(chapter.iconColor, 0.72);
  const gradientEnd = chapter.iconColor;

  // ── Navigation ───────────────────────────────────────────────────────────
  function handleLessonPress(lesson: TutorialLesson) {
    if (lesson.type === 'text') {
      router.push(`/tutorial-lesson/${lesson.id}` as any);
    } else {
      tutorial.start(lesson.id);
    }
  }

  function handlePrimaryAction() {
    if (allComplete) return;
    for (const lesson of chapter.lessons) {
      if (!store.isLessonCompleted(lesson.id)) {
        handleLessonPress(lesson);
        return;
      }
    }
  }

  const ctaLabel = allComplete
    ? 'Toate lectiile completate'
    : inProgress
    ? 'Continua'
    : 'Incepe capitolul';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={[gradientStart, gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <Ionicons
              name={chapter.icon as any}
              size={64}
              color="rgba(255,255,255,0.9)"
            />
          </LinearGradient>

          {/* Fade into page background */}
          <LinearGradient
            colors={['transparent', Colors.background]}
            style={styles.heroFade}
          />

          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { top: insets.top + 8 }]}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color="#191919" />
          </Pressable>
        </View>

        {/* ── Info section ─────────────────────────────────────────────── */}
        <View style={styles.infoSection}>
          {/* Badge row */}
          <View style={styles.badgeRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{totalLessons} lectii</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                ~{chapterEstimateMin(chapter)} min
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{chapter.title}</Text>
          <Text style={styles.description}>{chapter.description}</Text>
        </View>

        {/* ── Progress card (only when at least 1 lesson is done) ────── */}
        {progress > 0 && (
          <Animated.View
            entering={FadeInDown.duration(350).delay(60)}
            style={styles.progressCard}
          >
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Progresul tau</Text>
              <Text style={styles.progressPercent}>{progress}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${progress}%` as any }]}
              />
            </View>
            <Text style={styles.progressSub}>
              {completedCount} din {totalLessons} lectii completate
            </Text>
          </Animated.View>
        )}

        {/* ── Lessons section ──────────────────────────────────────────── */}
        <View style={styles.lessonsSection}>
          <Text style={styles.sectionHeader}>Lectii</Text>

          <View style={styles.lessonList}>
            {chapter.lessons.map((lesson, index) => {
              const isCompleted = store.isLessonCompleted(lesson.id);
              return (
                <Animated.View
                  key={lesson.id}
                  entering={FadeInDown.duration(350).delay(60 * index)}
                >
                  <LessonCard
                    lesson={lesson}
                    index={index}
                    isCompleted={isCompleted}
                    onPress={() => handleLessonPress(lesson)}
                  />
                </Animated.View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Safe area bottom spacer */}
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// LessonCard
// ---------------------------------------------------------------------------

interface LessonCardProps {
  lesson: TutorialLesson;
  index: number;
  isCompleted: boolean;
  onPress: () => void;
}

function LessonCard({ lesson, index, isCompleted, onPress }: LessonCardProps) {
  const isInteractive = lesson.type === 'interactive';

  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-70"
    >
      <View
        style={[
          styles.lessonCardInner,
          isCompleted && { backgroundColor: 'rgba(46,125,50,0.03)' },
        ]}
      >
        {/* Number / checkmark circle */}
        <View
          style={[
            styles.statusCircle,
            isCompleted ? styles.statusCircleDone : styles.statusCircleDefault,
          ]}
        >
          {isCompleted ? (
            <Ionicons name="checkmark" size={18} color={Colors.white} />
          ) : (
            <Text style={styles.statusNumber}>{index + 1}</Text>
          )}
        </View>

        {/* Title + meta */}
        <View style={styles.lessonBody}>
          <Text style={styles.lessonTitle} numberOfLines={2}>
            {lesson.title}
          </Text>
          <View style={styles.metaRow}>
            {isInteractive ? (
              <View style={styles.badgeInteractive}>
                <Ionicons
                  name="hand-left-outline"
                  size={12}
                  color="#F59E0B"
                />
                <Text style={styles.badgeInteractiveText}>Interactiv</Text>
              </View>
            ) : (
              <View style={styles.badgeRead}>
                <Ionicons
                  name="book-outline"
                  size={12}
                  color={Colors.primary}
                />
                <Text style={styles.badgeReadText}>Citeste</Text>
              </View>
            )}
            <Text style={styles.duration}>{lessonDurationLabel(lesson)}</Text>
          </View>
        </View>

        {/* Chevron */}
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const HERO_HEIGHT = 224;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },

  // ── Error state ──────────────────────────────────────────────────────────
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: '#64748B',
  },

  // ── Hero ─────────────────────────────────────────────────────────────────
  heroContainer: {
    position: 'relative',
    height: HERO_HEIGHT,
  },
  heroGradient: {
    width: '100%',
    height: HERO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.10,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },

  // ── Info section ─────────────────────────────────────────────────────────
  infoSection: {
    paddingHorizontal: 20,
    marginTop: -24,
    // Ensure pills render above the hero on all platforms
    zIndex: 1,
    backgroundColor: Colors.background,
    paddingTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 0,
  },
  pill: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  pillText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    color: '#475569',
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 26,
    lineHeight: 32,
    color: '#1E293B',
    marginTop: 12,
  },
  description: {
    fontFamily: FontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: '#64748B',
    marginTop: 6,
  },

  // ── Progress card ─────────────────────────────────────────────────────────
  progressCard: {
    backgroundColor: Colors.white,
    ...Bubble.radii,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
    ...Shadows.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: '#1E293B',
  },
  progressPercent: {
    fontFamily: FontFamily.bold,
    fontSize: 14,
    color: Colors.primary,
  },
  progressTrack: {
    height: 10,
    backgroundColor: '#E2E8F0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 5,
  },
  progressSub: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
  },

  // ── Lessons section ───────────────────────────────────────────────────────
  lessonsSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    color: '#1E293B',
  },
  lessonList: {
    marginTop: 12,
    gap: 8,
  },

  // Lesson card inner row — View (not Pressable) so flexDirection always works
  lessonCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: 16,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },

  // Status circle
  statusCircle: {
    width: 36,
    height: 36,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 12,
  },
  statusCircleDone: {
    backgroundColor: '#2E7D32',
    ...Platform.select({
      ios: {
        shadowColor: '#2E7D32',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.30,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  statusCircleDefault: {
    backgroundColor: '#E8EDF2',
    borderWidth: 1,
    borderColor: '#D1D9E4',
  },
  statusNumber: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: '#94A3B8',
  },

  // Body
  lessonBody: {
    flex: 1,
    marginRight: 8,
  },
  lessonTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
    color: '#1E293B',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },

  // Type badges
  badgeRead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10,102,194,0.08)',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeReadText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: Colors.primary,
  },
  badgeInteractive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeInteractiveText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: '#F59E0B',
  },

  // Duration
  duration: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: '#94A3B8',
  },

  // ── Bottom bar ───────────────────────────────────────────────────────────
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    ...Bubble.radii,
  },
  ctaButtonDone: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  ctaButtonPressed: {
    opacity: 0.88,
  },
  ctaLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    color: Colors.white,
    letterSpacing: 0.2,
  },
  ctaLabelDone: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    color: '#2E7D32',
    letterSpacing: 0.2,
  },
});
