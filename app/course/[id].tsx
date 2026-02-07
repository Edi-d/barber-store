import { View, Text, ScrollView, Image, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Button, Badge, Card } from "@/components/ui";
import { CourseWithModules } from "@/types/database";
import { formatDuration } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();

  const { data: course, isLoading } = useQuery({
    queryKey: ["course", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select(`
          *,
          modules:course_modules(
            *,
            lessons:lessons(*)
          )
        `)
        .eq("id", id)
        .order("order", { referencedTable: "course_modules", ascending: true })
        .single();

      if (error) throw error;

      // Get user progress
      let completedLessons = new Set<string>();
      if (session) {
        const { data: progress } = await supabase
          .from("lesson_progress")
          .select("lesson_id")
          .eq("user_id", session.user.id)
          .eq("completed", true);

        progress?.forEach((p) => completedLessons.add(p.lesson_id));
      }

      // Sort lessons by order
      data.modules = data.modules?.map((mod) => ({
        ...mod,
        lessons: mod.lessons?.sort((a, b) => a.order - b.order) || [],
      })) || [];

      const totalLessons = data.modules.reduce(
        (acc, mod) => acc + (mod.lessons?.length || 0),
        0
      );

      const completedCount = data.modules.reduce(
        (acc, mod) =>
          acc + (mod.lessons?.filter((l) => completedLessons.has(l.id)).length || 0),
        0
      );

      return {
        ...data,
        lessons_count: totalLessons,
        completed_count: completedCount,
        completedLessons,
      } as CourseWithModules & { completedLessons: Set<string> };
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#0a66c2" />
      </View>
    );
  }

  if (!course) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-dark-700">Cursul nu a fost găsit</Text>
      </View>
    );
  }

  const progress = course.lessons_count > 0
    ? Math.round((course.completed_count! / course.lessons_count) * 100)
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="relative">
          {course.cover_url ? (
            <Image
              source={{ uri: course.cover_url }}
              className="w-full h-56"
              resizeMode="cover"
            />
          ) : (
            <View className="w-full h-56 bg-primary-100 items-center justify-center">
              <Ionicons name="school" size={64} color="#0a66c2" />
            </View>
          )}
          
          {/* Back Button */}
          <Pressable
            onPress={() => router.back()}
            className="absolute top-4 left-4 w-10 h-10 bg-white/90 rounded-full items-center justify-center"
          >
            <Ionicons name="arrow-back" size={24} color="#334155" />
          </Pressable>

          {/* Gradient Overlay */}
          <View className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-dark-200" />
        </View>

        {/* Course Info */}
        <View className="px-6 -mt-6">
          <View className="flex-row gap-2 mb-3">
            {course.is_premium && (
              <Badge variant="warning" size="sm">
                <Ionicons name="diamond" size={12} color="white" /> Premium
              </Badge>
            )}
            <Badge variant="default" size="sm">
              {course.lessons_count} lecții
            </Badge>
          </View>

          <Text className="text-dark-700 text-2xl font-bold mb-2">
            {course.title}
          </Text>
          
          {course.description && (
            <Text className="text-dark-500 text-base mb-4">
              {course.description}
            </Text>
          )}

          {/* Progress */}
          {progress > 0 && (
            <Card className="mb-6">
              <View className="flex-row justify-between mb-2">
                <Text className="text-dark-700 font-semibold">Progresul tău</Text>
                <Text className="text-primary-600 font-bold">{progress}%</Text>
              </View>
              <View className="h-3 bg-dark-300 rounded-full overflow-hidden">
                <View
                  className="h-full bg-primary-600 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </View>
              <Text className="text-dark-500 text-sm mt-2">
                {course.completed_count} din {course.lessons_count} lecții completate
              </Text>
            </Card>
          )}

          {/* Modules & Lessons */}
          <Text className="text-dark-700 text-lg font-bold mb-4">Curriculum</Text>
          
          {course.modules?.map((module, moduleIndex) => (
            <View key={module.id} className="mb-6">
              <Text className="text-dark-600 font-semibold mb-3">
                Modulul {moduleIndex + 1}: {module.title}
              </Text>
              
              <View className="gap-2">
                {module.lessons?.map((lesson, lessonIndex) => {
                  const isCompleted = course.completedLessons.has(lesson.id);
                  
                  return (
                    <Pressable
                      key={lesson.id}
                      onPress={() => router.push(`/lesson/${lesson.id}`)}
                      className="flex-row items-center bg-white rounded-xl p-4 border border-dark-300"
                    >
                      <View
                        className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${
                          isCompleted ? "bg-green-600" : "bg-dark-200"
                        }`}
                      >
                        {isCompleted ? (
                          <Ionicons name="checkmark" size={18} color="white" />
                        ) : (
                          <Text className="text-dark-500 font-semibold">
                            {lessonIndex + 1}
                          </Text>
                        )}
                      </View>
                      
                      <View className="flex-1">
                        <Text className="text-dark-700 font-medium">
                          {lesson.title}
                        </Text>
                        <View className="flex-row items-center mt-1">
                          <Ionicons
                            name={lesson.type === "video" ? "videocam" : "document-text"}
                            size={14}
                            color="#64748b"
                          />
                          {lesson.duration_sec && (
                            <Text className="text-dark-500 text-sm ml-1">
                              {formatDuration(lesson.duration_sec)}
                            </Text>
                          )}
                        </View>
                      </View>
                      
                      <Ionicons name="chevron-forward" size={20} color="#64748b" />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Start Course Button */}
      <View className="px-6 py-4 border-t border-dark-300 bg-white">
        <Button
          size="lg"
          className="w-full"
          onPress={() => {
            // Find first incomplete lesson or first lesson
            for (const module of course.modules || []) {
              for (const lesson of module.lessons || []) {
                if (!course.completedLessons.has(lesson.id)) {
                  router.push(`/lesson/${lesson.id}`);
                  return;
                }
              }
            }
            // All completed, go to first lesson
            const firstLesson = course.modules?.[0]?.lessons?.[0];
            if (firstLesson) {
              router.push(`/lesson/${firstLesson.id}`);
            }
          }}
        >
          {progress > 0 ? "Continuă cursul" : "Începe cursul"}
        </Button>
      </View>
    </SafeAreaView>
  );
}
