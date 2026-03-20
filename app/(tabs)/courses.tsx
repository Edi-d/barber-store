import { useEffect } from "react";
import {
  View,
  Text,
  RefreshControl,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Badge } from "@/components/ui";
import { Course } from "@/types/database";
import { Ionicons, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  FadeInRight,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Bubble, Colors } from "@/constants/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const FEATURED_W = SCREEN_W * 0.72;
const FEATURED_H = 200;

export default function CoursesScreen() {
  const { session } = useAuthStore();

  const { data: courses, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select(`
          *,
          modules:course_modules(
            id,
            lessons:lessons(id)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      let progressMap = new Map<string, number>();
      if (session) {
        const { data: progress } = await supabase
          .from("lesson_progress")
          .select("lesson_id")
          .eq("user_id", session.user.id)
          .eq("completed", true);

        progress?.forEach((p) => {
          progressMap.set(p.lesson_id, 1);
        });
      }

      return data.map((course) => {
        const totalLessons = course.modules?.reduce(
          (acc: number, mod: any) => acc + (mod.lessons?.length || 0),
          0
        ) || 0;

        const completedLessons = course.modules?.reduce((acc: number, mod: any) => {
          return (
            acc +
            (mod.lessons?.filter((l: any) => progressMap.has(l.id)).length || 0)
          );
        }, 0) || 0;

        return {
          ...course,
          lessons_count: totalLessons,
          completed_count: completedLessons,
        };
      });
    },
  });

  const premiumCourses = courses?.filter((c) => c.is_premium) || [];
  const inProgressCourses = courses?.filter((c) => c.completed_count > 0 && c.completed_count < c.lessons_count) || [];

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.background }}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(350)}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Image
                source={require("@/assets/logo-text.png")}
                style={{ width: 100, height: 32 }}
                resizeMode="contain"
              />
              <Text style={styles.headerTitle}>Academy</Text>
            </View>
            <Pressable style={styles.searchBtn}>
              <Feather name="search" size={20} color="#191919" />
            </Pressable>
          </View>
        </Animated.View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Continue Learning */}
        {inProgressCourses.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <View style={styles.sectionSpacing}>
              <SectionHeader title="Continuă" icon="play-circle" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
              >
                {inProgressCourses.map((course, i) => (
                  <FeaturedCard key={course.id} course={course} index={i} />
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        )}

        {/* Premium Courses */}
        {premiumCourses.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400).delay(200)}>
            <View style={styles.sectionSpacing}>
              <SectionHeader title="Premium Courses" icon="diamond" iconColor="#d4af37" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
              >
                {premiumCourses.map((course, i) => (
                  <FeaturedCard key={course.id} course={course} index={i} />
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        )}

        {/* All Courses */}
        <Animated.View entering={FadeInDown.duration(400).delay(350)}>
          <View style={styles.sectionSpacing}>
            <SectionHeader title="Toate Cursurile" />
            <View style={{ paddingHorizontal: 20, gap: 14 }}>
              {courses?.map((course, i) => (
                <CourseListCard key={course.id} course={course} index={i} />
              ))}
            </View>
          </View>
        </Animated.View>

        {/* Empty State */}
        {(!courses || courses.length === 0) && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="school-outline" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Niciun curs disponibil</Text>
            <Text style={styles.emptySubtitle}>Revino curând pentru cursuri noi</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* ─── Section Header ─── */
function SectionHeader({
  title,
  icon,
  iconColor = Colors.primary,
  onSeeAll,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        {icon && (
          <View style={[styles.sectionIconBg, { backgroundColor: iconColor + "18" }]}>
            <Ionicons name={icon} size={16} color={iconColor} />
          </View>
        )}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} style={styles.seeAllBtn}>
          <Text style={styles.seeAllText}>See all</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

/* ─── Featured Card (horizontal scroll) ─── */
function FeaturedCard({
  course,
  index,
}: {
  course: Course & { lessons_count: number; completed_count: number };
  index: number;
}) {
  const progress = course.lessons_count > 0
    ? Math.round((course.completed_count / course.lessons_count) * 100)
    : 0;

  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withDelay(
      80 * index,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
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
        onPress={() => router.push(`/course/${course.id}`)}
        style={styles.featuredCard}
      >
        {/* Cover */}
        {course.cover_url ? (
          <Image
            source={{ uri: course.cover_url }}
            style={styles.featuredImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.featuredImage, styles.featuredPlaceholder]}>
            <Ionicons name="school" size={40} color={Colors.primary} />
          </View>
        )}

        {/* Gradient overlay */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)"]}
          style={styles.featuredGradient}
        />

        {/* Premium badge */}
        {course.is_premium && (
          <View style={styles.premiumBadge}>
            <Ionicons name="diamond" size={11} color="#d4af37" />
            <Text style={styles.premiumText}>PRO</Text>
          </View>
        )}

        {/* Bottom content */}
        <View style={styles.featuredBottom}>
          <Text style={styles.featuredTitle} numberOfLines={2}>
            {course.title}
          </Text>
          <View style={styles.featuredMeta}>
            <Ionicons name="book-outline" size={12} color="rgba(255,255,255,0.8)" />
            <Text style={styles.featuredMetaText}>
              {course.lessons_count} lecții
            </Text>
          </View>

          {/* Progress bar */}
          {progress > 0 && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressText}>{progress}%</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ─── Course List Card (vertical list) ─── */
function CourseListCard({
  course,
  index,
}: {
  course: Course & { lessons_count: number; completed_count: number };
  index: number;
}) {
  const progress = course.lessons_count > 0
    ? Math.round((course.completed_count / course.lessons_count) * 100)
    : 0;

  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withDelay(
      60 * index,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 20 }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={() => router.push(`/course/${course.id}`)}
        style={styles.listCard}
      >
        {/* Thumbnail */}
        {course.cover_url ? (
          <Image
            source={{ uri: course.cover_url }}
            style={styles.listThumb}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.listThumb, styles.listThumbPlaceholder]}>
            <Ionicons name="school" size={28} color={Colors.primary} />
          </View>
        )}

        {/* Content */}
        <View style={styles.listContent}>
          <View>
            {course.is_premium && (
              <View style={styles.listPremiumBadge}>
                <Ionicons name="diamond" size={10} color="#d4af37" />
                <Text style={styles.listPremiumText}>PRO</Text>
              </View>
            )}
            <Text style={styles.listTitle} numberOfLines={2}>
              {course.title}
            </Text>
            <Text style={styles.listMeta} numberOfLines={1}>
              {course.lessons_count} lecții
              {course.description ? ` · ${course.description.slice(0, 35)}...` : ""}
            </Text>
          </View>

          {/* Progress or status */}
          {progress > 0 ? (
            <View style={styles.listProgressRow}>
              <View style={styles.listProgressTrack}>
                <View style={[styles.listProgressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.listProgressText}>{progress}%</Text>
            </View>
          ) : (
            <View style={styles.listStatusRow}>
              <View style={styles.listStatusDot} />
              <Text style={styles.listStatusText}>Not started</Text>
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
  /* Header */
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
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "EuclidCircularA-Bold",
    color: "#1E293B",
    marginLeft: 8,
  },
  searchBtn: {
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

  /* Section */
  sectionSpacing: {
    paddingTop: 20,
    paddingBottom: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionIconBg: {
    width: 28,
    height: 28,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 19,
    fontFamily: "EuclidCircularA-Bold",
    color: "#1E293B",
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  seeAllText: {
    fontSize: 13,
    fontFamily: "EuclidCircularA-SemiBold",
    color: Colors.primary,
    marginRight: 2,
  },

  /* Featured Card */
  featuredCard: {
    width: FEATURED_W,
    height: FEATURED_H,
    ...Bubble.radiiLg,
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
  featuredImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  featuredPlaceholder: {
    backgroundColor: "#EFF6FF",
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
  premiumBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 15, 25, 0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 12,
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
  },
  premiumText: {
    fontSize: 10,
    fontFamily: "EuclidCircularA-Bold",
    color: "#d4af37",
    letterSpacing: 1.2,
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
    fontFamily: "EuclidCircularA-Bold",
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
    fontFamily: "EuclidCircularA-Medium",
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
    fontFamily: "EuclidCircularA-Bold",
    color: "#34D399",
  },

  /* List Card */
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
  listThumb: {
    width: 100,
    height: 100,
    borderTopLeftRadius: Bubble.radii.topLeft,
    borderBottomLeftRadius: Bubble.radii.bottomLeft,
  },
  listThumbPlaceholder: {
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: "space-between",
    minHeight: 100,
  },
  listPremiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(15, 15, 25, 0.75)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 10,
    gap: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
  },
  listPremiumText: {
    fontSize: 10,
    fontFamily: "EuclidCircularA-Bold",
    color: "#d4af37",
    letterSpacing: 1.2,
  },
  listTitle: {
    fontSize: 15,
    fontFamily: "EuclidCircularA-SemiBold",
    color: "#1E293B",
    lineHeight: 20,
  },
  listMeta: {
    fontSize: 12,
    fontFamily: "EuclidCircularA-Regular",
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
    fontFamily: "EuclidCircularA-Bold",
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
    fontFamily: "EuclidCircularA-Medium",
    color: "#94A3B8",
  },
  listArrow: {
    paddingRight: 14,
  },

  /* Empty State */
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: "#fff",
    ...Bubble.radii,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    ...Bubble.radiiLg,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "EuclidCircularA-Bold",
    color: "#1E293B",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "EuclidCircularA-Regular",
    color: "#94A3B8",
    marginTop: 6,
  },
});
