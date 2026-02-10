import { useState } from "react";
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { Button, Input } from "@/components/ui";
import { useAuthStore } from "@/stores/authStore";
import { Ionicons } from "@expo/vector-icons";

interface OnboardingForm {
  username: string;
  displayName: string;
  bio: string;
}

export default function OnboardingScreen() {
  const { createProfile, isSubmitting } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingForm>({
    defaultValues: {
      username: "",
      displayName: "",
      bio: "",
    },
  });

  const onSubmit = async (data: OnboardingForm) => {
    setError(null);
    const { error } = await createProfile({
      username: data.username,
      display_name: data.displayName || data.username,
      bio: data.bio || undefined,
    });
    if (error) {
      if (error.message.includes("duplicate") || error.message.includes("unique")) {
        setError("Username-ul este deja folosit. Alege altul.");
      } else {
        setError(error.message);
      }
    } else {
      router.replace("/(tabs)/feed");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-6 pt-4">
            {/* Header */}
            <View className="items-center mb-8 mt-4">
              <View className="w-20 h-20 bg-primary-500 rounded-full items-center justify-center mb-4">
                <Ionicons name="person-add" size={36} color="white" />
              </View>
              <Text className="text-3xl font-bold text-dark-700 mb-2">
                Completează profilul
              </Text>
              <Text className="text-dark-500 text-base text-center">
                Spune-ne mai multe despre tine
              </Text>
            </View>

            {/* Error Message */}
            {error && (
              <View className="bg-red-500/10 border border-red-500 rounded-xl p-4 mb-6">
                <Text className="text-red-600">{error}</Text>
              </View>
            )}

            {/* Form */}
            <View className="gap-4 mb-8">
              <Controller
                control={control}
                name="username"
                rules={{
                  required: "Username-ul este obligatoriu",
                  minLength: {
                    value: 3,
                    message: "Minim 3 caractere",
                  },
                  pattern: {
                    value: /^[a-zA-Z0-9_]+$/,
                    message: "Doar litere, cifre și underscore",
                  },
                }}
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Username"
                    value={value}
                    onChangeText={onChange}
                    placeholder="john_barber"
                    autoComplete="username"
                    error={errors.username?.message}
                    icon={<Ionicons name="at" size={20} color="#64748b" />}
                  />
                )}
              />

              <Controller
                control={control}
                name="displayName"
                rules={{
                  required: "Numele este obligatoriu",
                  minLength: {
                    value: 2,
                    message: "Minim 2 caractere",
                  },
                }}
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Nume afișat"
                    value={value}
                    onChangeText={onChange}
                    placeholder="John Doe"
                    autoComplete="name"
                    error={errors.displayName?.message}
                    icon={<Ionicons name="person" size={20} color="#64748b" />}
                  />
                )}
              />

              <Controller
                control={control}
                name="bio"
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Bio (opțional)"
                    value={value}
                    onChangeText={onChange}
                    placeholder="Spune ceva despre tine..."
                    multiline
                    numberOfLines={3}
                    icon={<Ionicons name="create" size={20} color="#64748b" />}
                  />
                )}
              />
            </View>

            {/* Submit Button */}
            <Button
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              size="lg"
              className="w-full mb-4"
            >
              Finalizează
            </Button>

            {/* Skip for now - still creates minimal profile */}
            <Pressable
              onPress={() => handleSubmit(onSubmit)()}
              className="items-center py-2"
            >
              <Text className="text-dark-400 text-sm">
                Poți modifica oricând din setări
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
