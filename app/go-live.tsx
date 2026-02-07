import { useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Button, Input, Card, Badge } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { Live } from "@/types/database";

interface GoLiveForm {
  title: string;
}

export default function GoLiveScreen() {
  const { session, profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GoLiveForm>({
    defaultValues: {
      title: "",
    },
  });

  // Check for active live
  const { data: activeLive, refetch: refetchLive } = useQuery({
    queryKey: ["active-live", session?.user.id],
    queryFn: async () => {
      if (!session) return null;

      const { data, error } = await supabase
        .from("lives")
        .select("*")
        .eq("host_id", session.user.id)
        .in("status", ["starting", "live"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data as Live | null;
    },
    enabled: !!session,
  });

  // Start live mutation
  const startLiveMutation = useMutation({
    mutationFn: async (data: GoLiveForm) => {
      if (!session) throw new Error("Not authenticated");

      const { data: live, error } = await supabase
        .from("lives")
        .insert({
          host_id: session.user.id,
          title: data.title,
          cover_url: coverImage,
          is_public: isPublic,
          status: "starting",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return live;
    },
    onSuccess: () => {
      refetchLive();
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      reset();
      setCoverImage(null);
    },
    onError: (error) => {
      Alert.alert("Eroare", "Nu am putut porni live-ul. Încearcă din nou.");
      console.error(error);
    },
  });

  // End live mutation
  const endLiveMutation = useMutation({
    mutationFn: async () => {
      if (!activeLive) return;

      const { error } = await supabase
        .from("lives")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
        })
        .eq("id", activeLive.id);

      if (error) throw error;
    },
    onSuccess: () => {
      refetchLive();
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      Alert.alert("Live încheiat", "Sesiunea live a fost încheiată cu succes.");
    },
  });

  const pickCoverImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled) {
      setCoverImage(result.assets[0].uri);
    }
  };

  const isCreator = profile?.role === "creator" || profile?.role === "admin";

  if (!isCreator) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Ionicons name="lock-closed" size={64} color="#64748b" />
        <Text className="text-dark-700 text-xl font-bold mt-4 text-center">
          Acces restricționat
        </Text>
        <Text className="text-dark-500 text-center mt-2">
          Doar creatorii pot porni sesiuni live
        </Text>
        <Button
          variant="secondary"
          onPress={() => router.back()}
          className="mt-6"
        >
          Înapoi
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-dark-300 bg-white">
        <Pressable onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </Pressable>
        <Text className="text-dark-700 text-xl font-bold">Go Live</Text>
      </View>

      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="px-6 py-6">
          {/* Active Live Banner */}
          {activeLive && (
            <Card className="mb-6 bg-red-500/10 border-red-500">
              <View className="flex-row items-center">
                <View className="w-3 h-3 rounded-full bg-red-500 mr-3 animate-pulse" />
                <View className="flex-1">
                  <Text className="text-dark-700 font-bold">
                    Ești live acum!
                  </Text>
                  <Text className="text-red-600 text-sm mt-1">
                    {activeLive.title}
                  </Text>
                </View>
                <Button
                  variant="danger"
                  size="sm"
                  onPress={() => {
                    Alert.alert(
                      "Încheie live",
                      "Ești sigur că vrei să închei sesiunea live?",
                      [
                        { text: "Anulează", style: "cancel" },
                        {
                          text: "Încheie",
                          style: "destructive",
                          onPress: () => endLiveMutation.mutate(),
                        },
                      ]
                    );
                  }}
                  loading={endLiveMutation.isPending}
                >
                  End Live
                </Button>
              </View>
            </Card>
          )}

          {/* Coming Soon Notice */}
          <Card className="mb-6 bg-primary-50 border-primary-200">
            <View className="flex-row items-start">
              <Ionicons name="information-circle" size={24} color="#0a66c2" />
              <View className="flex-1 ml-3">
                <Text className="text-dark-700 font-semibold">MVP Mode</Text>
                <Text className="text-dark-500 text-sm mt-1">
                  Streaming-ul video real va fi disponibil în curând. 
                  Deocamdată poți crea placeholder-uri pentru live-uri care vor apărea în feed.
                </Text>
              </View>
            </View>
          </Card>

          {!activeLive && (
            <>
              {/* Cover Image */}
              <Text className="text-dark-700 font-semibold mb-3">
                Imagine cover (opțional)
              </Text>
              <Pressable
                onPress={pickCoverImage}
                className="w-full aspect-video rounded-xl bg-white border border-dark-300 items-center justify-center mb-6 overflow-hidden"
              >
                {coverImage ? (
                  <Image
                    source={{ uri: coverImage }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={48} color="#64748b" />
                    <Text className="text-dark-500 mt-2">
                      Adaugă imagine cover
                    </Text>
                  </>
                )}
              </Pressable>

              {/* Title Input */}
              <Controller
                control={control}
                name="title"
                rules={{ required: "Titlul este obligatoriu" }}
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Titlul live-ului"
                    value={value}
                    onChangeText={onChange}
                    placeholder="Ex: Tutorial fade cu perie"
                    error={errors.title?.message}
                    icon={<Ionicons name="text" size={20} color="#64748b" />}
                  />
                )}
              />

              {/* Visibility Toggle */}
              <View className="mt-6">
                <Text className="text-dark-700 font-semibold mb-3">
                  Vizibilitate
                </Text>
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => setIsPublic(true)}
                    className={`flex-1 p-4 rounded-xl border-2 ${
                      isPublic
                        ? "border-primary-600 bg-primary-50"
                        : "border-dark-300 bg-white"
                    }`}
                  >
                    <Ionicons
                      name="globe"
                      size={24}
                      color={isPublic ? "#0a66c2" : "#64748b"}
                    />
                    <Text
                      className={`font-semibold mt-2 ${
                        isPublic ? "text-dark-700" : "text-dark-500"
                      }`}
                    >
                      Public
                    </Text>
                    <Text className="text-dark-500 text-sm mt-1">
                      Oricine poate vedea
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setIsPublic(false)}
                    className={`flex-1 p-4 rounded-xl border-2 ${
                      !isPublic
                        ? "border-primary-600 bg-primary-50"
                        : "border-dark-300 bg-white"
                    }`}
                  >
                    <Ionicons
                      name="lock-closed"
                      size={24}
                      color={!isPublic ? "#0a66c2" : "#64748b"}
                    />
                    <Text
                      className={`font-semibold mt-2 ${
                        !isPublic ? "text-dark-700" : "text-dark-500"
                      }`}
                    >
                      Privat
                    </Text>
                    <Text className="text-dark-500 text-sm mt-1">
                      Doar cu link
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Start Live Button */}
      {!activeLive && (
        <View className="px-6 py-4 border-t border-dark-300 bg-white">
          <Button
            size="lg"
            onPress={handleSubmit((data) => startLiveMutation.mutate(data))}
            loading={startLiveMutation.isPending}
            className="w-full"
            icon={<Ionicons name="radio" size={20} color="white" />}
          >
            Start Live
          </Button>
        </View>
      )}
    </SafeAreaView>
  );
}
