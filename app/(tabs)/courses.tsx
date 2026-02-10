import { View, Text, FlatList, RefreshControl, Pressable, Image, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Card, Badge } from "@/components/ui";
import { Course } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";

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
          (acc, mod) => acc + (mod.lessons?.length || 0),
          0
        ) || 0;

        const completedLessons = course.modules?.reduce((acc, mod) => {
          return (
            acc +
            (mod.lessons?.filter((l) => progressMap.has(l.id)).length || 0)
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

  // Split courses into categories
  const premiumCourses = courses?.filter((c) => c.is_premium) || [];
  const freeCourses = courses?.filter((c) => !c.is_premium) || [];
  const inProgressCourses = courses?.filter((c) => c.completed_count > 0 && c.completed_count < c.lessons_count) || [];

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#0a66c2" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      {/* Header - 45px */}
      <View className="h-[50px] flex-row items-center justify-between px-4 border-b border-dark-300 bg-white">
        <View className="flex-row items-center">
          <Image
            source={require("@/assets/image-removebg-preview.png")}
            style={{ width: 100, height: 36 }}
            resizeMode="contain"
          />
          <Text className="text-dark-700 text-xl font-bold ml-2">Academy</Text>
        </View>
        <Pressable className="w-10 h-10 bg-dark-200 rounded-full items-center justify-center">
          <Ionicons name="search-outline" size={22} color="#64748b" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#0a66c2"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Continue Learning Section */}
        {inProgressCourses.length > 0 && (
          <View className="py-4">
            <SectionHeader title="Continue Learning" icon="play-circle" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            >
              {inProgressCourses.map((course) => (
                <CourseCardHorizontal key={course.id} course={course} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Premium Courses */}
        {premiumCourses.length > 0 && (
          <View className="py-4">
            <SectionHeader title="Premium Courses" icon="diamond" iconColor="#d4af37" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            >
              {premiumCourses.map((course) => (
                <CourseCardHorizontal key={course.id} course={course} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* All Courses */}
        <View className="py-4">
          <SectionHeader title="All Courses" />
          <View className="px-4 gap-3">
            {courses?.map((course) => (
              <CourseCardVertical key={course.id} course={course} />
            ))}
          </View>
        </View>

        {/* Empty State */}
        {(!courses || courses.length === 0) && (
          <View className="items-center justify-center py-12 bg-white rounded-xl mx-4">
            <Ionicons name="school-outline" size={64} color="#64748b" />
            <Text className="text-dark-700 text-lg font-bold mt-4">
              Niciun curs disponibil
            </Text>
            <Text className="text-dark-500 mt-2">
              Revino curând pentru cursuri noi
            </Text>
          </View>
        )}

        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ 
  title, 
  icon, 
  iconColor = "#0a66c2",
  onSeeAll 
}: { 
  title: string; 
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onSeeAll?: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 mb-3">
      <View className="flex-row items-center">
        {icon && (
          <Ionicons name={icon} size={20} color={iconColor} style={{ marginRight: 8 }} />
        )}
        <Text className="text-dark-700 text-lg font-bold">{title}</Text>
      </View>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} className="flex-row items-center">
          <Text className="text-primary-500 text-sm font-medium">See all</Text>
          <Ionicons name="chevron-forward" size={16} color="#0a66c2" />
        </Pressable>
      )}
    </View>
  );
}

function CourseCardHorizontal({ course }: { course: Course & { lessons_count: number; completed_count: number } }) {
  const progress = course.lessons_count > 0
    ? Math.round((course.completed_count / course.lessons_count) * 100)
    : 0;

  return (
    <Pressable
      onPress={() => router.push(`/course/${course.id}`)}
      className="w-64 bg-white rounded-2xl overflow-hidden border border-dark-300"
    >
      {/* Cover Image */}
      {course.cover_url ? (
        <Image
          source={{ uri: course.cover_url }}
          className="w-full h-32"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full h-32 bg-primary-100 items-center justify-center">
          <Ionicons name="school" size={40} color="#0a66c2" />
        </View>
      )}

      {/* Premium Badge */}
      {course.is_premium && (
        <View className="absolute top-2 right-2">
          <Badge variant="warning" size="sm">
            <Ionicons name="diamond" size={10} color="white" /> Premium
          </Badge>
        </View>
      )}

      {/* Content */}
      <View className="p-3">
        <Text className="text-dark-700 font-semibold" numberOfLines={2}>
          {course.title}
        </Text>
        <Text className="text-dark-500 text-xs mt-1">
          {course.lessons_count} lecții
        </Text>

        {/* Progress Bar */}
        {progress > 0 && (
          <View className="mt-2">
            <View className="h-1.5 bg-dark-300 rounded-full overflow-hidden">
              <View
                className="h-full bg-primary-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </View>
            <Text className="text-primary-500 text-xs mt-1">{progress}% complete</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function CourseCardVertical({ course }: { course: Course & { lessons_count: number; completed_count: number } }) {
  const progress = course.lessons_count > 0
    ? Math.round((course.completed_count / course.lessons_count) * 100)
    : 0;

  return (
    <Pressable
      onPress={() => router.push(`/course/${course.id}`)}
      className="flex-row bg-white rounded-2xl overflow-hidden border border-dark-300"
    >
      {/* Thumbnail */}
      {course.cover_url ? (
        <Image
          source={{ uri: course.cover_url }}
          className="w-28 h-28"
          resizeMode="cover"
        />
      ) : (
        <View className="w-28 h-28 bg-primary-100 items-center justify-center">
          <Ionicons name="school" size={32} color="#0a66c2" />
        </View>
      )}

      {/* Content */}
      <View className="flex-1 p-3 justify-between">
        <View>
          <View className="flex-row items-center gap-2 mb-1">
            {course.is_premium && (
              <Badge variant="warning" size="sm">Premium</Badge>
            )}
          </View>
          <Text className="text-dark-700 font-semibold" numberOfLines={2}>
            {course.title}
          </Text>
          <Text className="text-dark-500 text-sm mt-1" numberOfLines={1}>
            {course.lessons_count} lecții • {course.description?.slice(0, 30)}...
          </Text>
        </View>

        {/* Progress */}
        {progress > 0 ? (
          <View className="flex-row items-center">
            <View className="flex-1 h-1.5 bg-dark-300 rounded-full overflow-hidden mr-2">
              <View
                className="h-full bg-primary-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </View>
            <Text className="text-primary-500 text-xs">{progress}%</Text>
          </View>
        ) : (
          <View className="flex-row items-center">
            <Ionicons name="time-outline" size={14} color="#64748b" />
            <Text className="text-dark-500 text-xs ml-1">Not started</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
