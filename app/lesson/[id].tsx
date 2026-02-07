import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Video, ResizeMode } from "expo-av";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Button, Badge } from "@/components/ui";
import { Lesson } from "@/types/database";
import { formatDuration } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["lesson", id],
    queryFn: async () => {
      // Get lesson with module and course info
      const { data: lesson, error } = await supabase
        .from("lessons")
        .select(`
          *,
          module:course_modules(
            *,
            course:courses(*),
            lessons:lessons(id, title, order)
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      // Get user progress
      let isCompleted = false;
      let lastPosition = 0;
      if (session) {
        const { data: progress } = await supabase
          .from("lesson_progress")
          .select("*")
          .eq("user_id", session.user.id)
          .eq("lesson_id", id)
          .single();

        if (progress) {
          isCompleted = progress.completed;
          lastPosition = progress.last_position_sec || 0;
        }
      }

      // Find next lesson
      const allLessons = lesson.module?.lessons?.sort((a, b) => a.order - b.order) || [];
      const currentIndex = allLessons.findIndex((l) => l.id === id);
      const nextLesson = allLessons[currentIndex + 1];

      return {
        lesson,
        isCompleted,
        lastPosition,
        nextLesson,
        course: lesson.module?.course,
      };
    },
    enabled: !!id,
  });

  // Mark as complete mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!session) return;

      await supabase.from("lesson_progress").upsert({
        user_id: session.user.id,
        lesson_id: id,
        completed: true,
        updated_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson", id] });
      queryClient.invalidateQueries({ queryKey: ["course"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });

  // Save position mutation
  const savePositionMutation = useMutation({
    mutationFn: async (position: number) => {
      if (!session) return;

      await supabase.from("lesson_progress").upsert({
        user_id: session.user.id,
        lesson_id: id,
        last_position_sec: Math.floor(position),
        updated_at: new Date().toISOString(),
      });
    },
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#0a66c2" />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-dark-700">Lecția nu a fost găsită</Text>
      </View>
    );
  }

  const { lesson, isCompleted, nextLesson, course } = data;

  const handleVideoEnd = () => {
    if (!isCompleted) {
      completeMutation.mutate();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      {/* Video Player */}
      <View className="bg-black aspect-video">
        {lesson.type === "video" && lesson.content_url ? (
          <Pressable
            onPress={() => {
              if (isPlaying) {
                videoRef.current?.pauseAsync();
              } else {
                videoRef.current?.playAsync();
              }
              setIsPlaying(!isPlaying);
            }}
            className="flex-1"
          >
            <Video
              ref={videoRef}
              source={{ uri: lesson.content_url }}
              style={{ flex: 1 }}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              onPlaybackStatusUpdate={(status) => {
                if (status.isLoaded) {
                  setIsPlaying(status.isPlaying);
                  // Save position every 10 seconds
                  if (status.positionMillis % 10000 < 1000) {
                    savePositionMutation.mutate(status.positionMillis / 1000);
                  }
                  if (status.didJustFinish) {
                    handleVideoEnd();
                  }
                }
              }}
            />
            {!isPlaying && (
              <View className="absolute inset-0 items-center justify-center bg-black/30">
                <View className="w-16 h-16 rounded-full bg-white/20 items-center justify-center">
                  <Ionicons name="play" size={32} color="white" />
                </View>
              </View>
            )}
          </Pressable>
        ) : (
          <View className="flex-1 items-center justify-center bg-primary-100">
            <Ionicons name="document-text" size={48} color="#0a66c2" />
            <Text className="text-dark-500 mt-2">Conținut text</Text>
          </View>
        )}
      </View>

      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-dark-300 bg-white">
        <Pressable onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-dark-500 text-sm" numberOfLines={1}>
            {course?.title}
          </Text>
        </View>
        {isCompleted && (
          <Badge variant="success" size="sm">
            <Ionicons name="checkmark" size={12} color="white" /> Completat
          </Badge>
        )}
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-6 py-4">
        <Text className="text-dark-700 text-xl font-bold mb-2">
          {lesson.title}
        </Text>
        
        <View className="flex-row items-center gap-3 mb-6">
          <View className="flex-row items-center">
            <Ionicons
              name={lesson.type === "video" ? "videocam" : "document-text"}
              size={16}
              color="#64748b"
            />
            <Text className="text-dark-500 ml-1 capitalize">{lesson.type}</Text>
          </View>
          {lesson.duration_sec && (
            <View className="flex-row items-center">
              <Ionicons name="time" size={16} color="#64748b" />
              <Text className="text-dark-500 ml-1">
                {formatDuration(lesson.duration_sec)}
              </Text>
            </View>
          )}
        </View>

        {/* Text content would go here */}
        {lesson.type === "text" && (
          <View className="bg-white rounded-xl p-4 border border-dark-300">
            <Text className="text-dark-600">
              Conținutul lecției va fi afișat aici.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Actions */}
      <View className="px-6 py-4 border-t border-dark-300 bg-white gap-3">
        {!isCompleted && (
          <Button
            variant="outline"
            onPress={() => completeMutation.mutate()}
            loading={completeMutation.isPending}
            className="w-full"
          >
            <Ionicons name="checkmark-circle" size={20} color="#0a66c2" /> Marchează ca finalizat
          </Button>
        )}
        
        {nextLesson && (
          <Button
            onPress={() => router.replace(`/lesson/${nextLesson.id}`)}
            className="w-full"
          >
            Lecția următoare <Ionicons name="arrow-forward" size={20} color="white" />
          </Button>
        )}
      </View>
    </SafeAreaView>
  );
}
