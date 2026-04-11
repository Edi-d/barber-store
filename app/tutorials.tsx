import { useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  useWindowDimensions,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Colors, Shadows, Bubble, FontFamily, Typography, Spacing } from "@/constants/theme";
import { TUTORIALS } from "@/data/tutorials";
import type { TutorialChapter } from "@/data/tutorials";
import { useTutorialStore } from "@/stores/tutorialStore";
import { useTutorial } from "@/hooks/useTutorial";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { EmptyState } from "@/components/shared/EmptyState";

const CHAPTER_COLORS: Record<string, { icon: string; color: string; bg: string }> = {
  "ch0-welcome":      { icon: "rocket",       color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" },
  "ch1-appointments": { icon: "map",           color: "#0A66C2", bg: "rgba(10,102,194,0.12)" },
  "ch2-shop":         { icon: "bag-handle",    color: "#6366F1", bg: "rgba(99,102,241,0.12)" },
  "ch3-feed":         { icon: "chatbubbles",   color: "#16A34A", bg: "rgba(22,163,74,0.12)"  },
};

function chapterMeta(chapter: TutorialChapter): { icon: string; color: string; bg: string } {
  return (
    CHAPTER_COLORS[chapter.id] ?? {
      icon: chapter.icon,
      color: chapter.iconColor,
      bg: chapter.iconBgColor,
    }
  );
}

export default function TutorialsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W } = useWindowDimensions();
  const FEATURED_W = SCREEN_W * 0.72;

  const store = useTutorialStore();
  const tutorial = useTutorial();

  // Hydrate persisted progress on mount
  useEffect(() => {
    store.hydrate();
  }, []);

  // Derived progress values
  const totalLessons = tutorial.totalLessons;
  const completedCount = tutorial.completedCount;
  const overallProgress = tutorial.overallProgress;

  // In-progress chapters: at least 1 lesson done but not all
  const inProgressChapters = TUTORIALS.filter((ch) => {
    const lessonIds = ch.lessons.map((l) => l.id);
    const done = lessonIds.filter((id) => store.isLessonCompleted(id)).length;
    return done > 0 && done < ch.lessons.length;
  });

  const hasAnyContent = TUTORIALS.length > 0;

  // Navigate to the first incomplete lesson
  function handleContinue() {
    const next = tutorial.getNextLesson();
    if (next) {
      router.push(`/tutorial/${next.chapter.id}` as any);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Safe area top */}
      <View style={{ height: insets.top, backgroundColor: Colors.background }} />

      {/* Header */}
      <Animated.View entering={FadeInDown.duration(350)}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backBtn}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={22} color="#191919" />
            </Pressable>
            <Text style={styles.headerTitle}>Tutoriale</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </Animated.View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => store.hydrate()}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {hasAnyContent ? (
          <>
            {/* ─── Hero Progress Card ─── */}
            <Animated.View entering={FadeInDown.duration(400).delay(100)}>
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                <Text style={styles.heroLabel}>PROGRESUL TAU</Text>
                <Text style={styles.heroPercent}>{overallProgress}%</Text>

                {/* Progress bar */}
                <View style={styles.heroTrack}>
                  <View
                    style={[
                      styles.heroFill,
                      { width: `${overallProgress}%` as any },
                    ]}
                  />
                </View>

                <Text style={styles.heroSubtitle}>
                  {completedCount} din {totalLessons} lectii completate
                </Text>

                {/* CTA — only when there are incomplete lessons */}
                {completedCount < totalLessons && (
                  <Pressable onPress={handleContinue} style={styles.heroCTA}>
                    <Text style={styles.heroCTAText}>
                      Continua de unde ai ramas →
                    </Text>
                  </Pressable>
                )}
              </LinearGradient>
            </Animated.View>

            {/* ─── Continua Section ─── */}
            {inProgressChapters.length > 0 && (
              <Animated.View entering={FadeInDown.duration(400).delay(200)}>
                <View style={styles.sectionSpacing}>
                  <SectionHeader title="Continua" icon="book-outline" />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
                  >
                    {inProgressChapters.map((chapter, i) => (
                      <ContinueCard
                        key={chapter.id}
                        chapter={chapter}
                        index={i}
                        cardWidth={FEATURED_W}
                        isLessonCompleted={store.isLessonCompleted}
                      />
                    ))}
                  </ScrollView>
                </View>
              </Animated.View>
            )}

            {/* ─── Toate capitolele ─── */}
            <Animated.View entering={FadeInDown.duration(400).delay(350)}>
              <View style={styles.sectionSpacing}>
                <SectionHeader title="Toate capitolele" />
                <View style={{ paddingHorizontal: 20, gap: 14 }}>
                  {TUTORIALS.map((chapter, i) => (
                    <ChapterListCard
                      key={chapter.id}
                      chapter={chapter}
                      index={i}
                      isLessonCompleted={store.isLessonCompleted}
                    />
                  ))}
                </View>
              </View>
            </Animated.View>
          </>
        ) : (
          <EmptyState
            icon="school-outline"
            title="Niciun tutorial disponibil"
            subtitle="Revino curand"
            className="mx-5 mt-5"
          />
        )}
      </ScrollView>
    </View>
  );
}

/* ─── Continue Card (horizontal scroll, FeaturedCard style) ─── */
function ContinueCard({
  chapter,
  index,
  cardWidth,
  isLessonCompleted,
}: {
  chapter: TutorialChapter;
  index: number;
  cardWidth: number;
  isLessonCompleted: (id: string) => boolean;
}) {
  const router = useRouter();
  const meta = chapterMeta(chapter);

  const lessonIds = chapter.lessons.map((l) => l.id);
  const doneCount = lessonIds.filter((id) => isLessonCompleted(id)).length;
  const progress = lessonIds.length > 0
    ? Math.round((doneCount / lessonIds.length) * 100)
    : 0;

  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withDelay(
      80 * index,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateX: (1 - entrance.value) * 40 },
      { scale: 0.92 + entrance.value * 0.08 },
    ],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={() => router.push(`/tutorial/${chapter.id}` as any)}
        style={[styles.featuredCard, { width: cardWidth }]}
      >
        {/* Colored gradient background */}
        <LinearGradient
          colors={[meta.color + "CC", meta.color + "88"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Chapter icon centered top-area */}
        <View style={styles.featuredIconWrap}>
          <Ionicons name={meta.icon as any} size={44} color="#fff" />
        </View>

        {/* Gradient overlay for text legibility */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.65)"]}
          style={styles.featuredGradient}
        />

        {/* Bottom content */}
        <View style={styles.featuredBottom}>
          <Text style={styles.featuredTitle} numberOfLines={2}>
            {chapter.title}
          </Text>
          <View style={styles.featuredMeta}>
            <Ionicons name="book-outline" size={12} color="rgba(255,255,255,0.8)" />
            <Text style={styles.featuredMetaText}>
              {chapter.lessons.length} lectii
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
            </View>
            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ─── Chapter List Card (vertical list, CourseListCard style) ─── */
function ChapterListCard({
  chapter,
  index,
  isLessonCompleted,
}: {
  chapter: TutorialChapter;
  index: number;
  isLessonCompleted: (id: string) => boolean;
}) {
  const router = useRouter();
  const meta = chapterMeta(chapter);

  const lessonIds = chapter.lessons.map((l) => l.id);
  const doneCount = lessonIds.filter((id) => isLessonCompleted(id)).length;
  const progress = lessonIds.length > 0
    ? Math.round((doneCount / lessonIds.length) * 100)
    : 0;

  // Estimate total minutes from lesson durations
  const totalSec = chapter.lessons.reduce((acc, l) => acc + l.durationSec, 0);
  const totalMin = Math.max(1, Math.round(totalSec / 60));

  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withDelay(
      60 * index,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 20 }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={() => router.push(`/tutorial/${chapter.id}` as any)}
        style={styles.listCard}
      >
        {/* Chapter icon in colored circle */}
        <View style={[styles.listIconCircle, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon as any} size={28} color={meta.color} />
        </View>

        {/* Content */}
        <View style={styles.listContent}>
          <View>
            <Text style={styles.listTitle} numberOfLines={2}>
              {chapter.title}
            </Text>
            <Text style={styles.listMeta} numberOfLines={1}>
              {chapter.lessons.length} lectii · ~{totalMin} min
            </Text>
          </View>

          {/* Progress bar or "Neinceput" status */}
          {progress > 0 ? (
            <View style={styles.listProgressRow}>
              <View style={styles.listProgressTrack}>
                <View style={[styles.listProgressFill, { width: `${progress}%` as any }]} />
              </View>
              <Text style={styles.listProgressText}>{progress}%</Text>
            </View>
          ) : (
            <View style={styles.listStatusRow}>
              <View style={styles.listStatusDot} />
              <Text style={styles.listStatusText}>Neinceput</Text>
            </View>
          )}
        </View>

        {/* Arrow */}
        <View style={styles.listArrow}>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  /* Header — identical pattern to courses.tsx */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: FontFamily.bold,
    color: "#1E293B",
  },
  helpBtn: {
    width: 40,
    height: 40,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(10,102,194,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Hero Progress Card */
  heroCard: {
    marginHorizontal: 20,
    marginTop: 8,
    ...Bubble.radiiLg,
    ...Shadows.lg,
    padding: 20,
  },
  heroLabel: {
    fontSize: 12,
    fontFamily: FontFamily.semiBold,
    color: "#fff",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  heroPercent: {
    fontSize: 32,
    fontFamily: FontFamily.bold,
    color: "#fff",
    lineHeight: 38,
    marginBottom: 10,
  },
  heroTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  heroFill: {
    height: "100%",
    backgroundColor: "#34D399",
    borderRadius: 3,
  },
  heroSubtitle: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 4,
  },
  heroCTA: {
    alignSelf: "flex-start",
    marginTop: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
  },
  heroCTAText: {
    fontSize: 13,
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },

  /* Section */
  sectionSpacing: {
    paddingTop: 0,
    paddingBottom: 4,
  },

  /* Featured Card (Continue section) */
  featuredCard: {
    height: 150,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 30,
    borderBottomLeftRadius: 30,
    overflow: "hidden",
    backgroundColor: "#fff",
    ...Platform.select({
      ios: {
        shadowColor: "#1E293B",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.10,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  featuredIconWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  featuredGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "65%",
  },
  featuredBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
  },
  featuredTitle: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: "#fff",
    marginBottom: 6,
  },
  featuredMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  featuredMetaText: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    color: "rgba(255,255,255,0.8)",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#34D399",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: "#34D399",
  },

  /* List Card — matches courses.tsx CourseListCard */
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    ...Bubble.radii,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#1E293B",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  listIconCircle: {
    width: 56,
    height: 56,
    margin: 12,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 22,
    borderBottomLeftRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  listContent: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 4,
    paddingLeft: 2,
    justifyContent: "space-between",
    minHeight: 80,
  },
  listTitle: {
    fontSize: 15,
    fontFamily: FontFamily.semiBold,
    color: "#1E293B",
    lineHeight: 20,
  },
  listMeta: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: "#94A3B8",
    marginTop: 3,
  },
  listProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  listProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    overflow: "hidden",
  },
  listProgressFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  listProgressText: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: Colors.primary,
  },
  listStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 6,
  },
  listStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#CBD5E1",
  },
  listStatusText: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    color: "#94A3B8",
  },
  listArrow: {
    paddingRight: 14,
  },
});
