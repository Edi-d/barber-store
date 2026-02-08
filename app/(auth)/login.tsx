import { useState } from "react";
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { Button, Input } from "@/components/ui";
import { useAuthStore } from "@/stores/authStore";
import { Ionicons } from "@expo/vector-icons";

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginScreen() {
  const { signIn, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    const { error } = await signIn(data.email, data.password);
    if (error) {
      setError(error.message);
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
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 pt-4">
            {/* Header */}
            <Pressable onPress={() => router.back()} className="mb-8">
              <Ionicons name="arrow-back" size={24} color="#334155" />
            </Pressable>

            <Text className="text-3xl font-bold text-dark-700 mb-2">
              Bine ai revenit
            </Text>
            <Text className="text-dark-500 text-base mb-8">
              Conectează-te pentru a continua
            </Text>

            {/* Error Message */}
            {error && (
              <View className="bg-red-500/10 border border-red-500 rounded-xl p-4 mb-6">
                <Text className="text-red-600">{error}</Text>
              </View>
            )}

            {/* Form */}
            <View className="gap-4 mb-6">
              <Controller
                control={control}
                name="email"
                rules={{
                  required: "Email-ul este obligatoriu",
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: "Email invalid",
                  },
                }}
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Email"
                    value={value}
                    onChangeText={onChange}
                    placeholder="email@exemplu.ro"
                    keyboardType="email-address"
                    autoComplete="email"
                    error={errors.email?.message}
                    icon={<Ionicons name="mail" size={20} color="#64748b" />}
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                rules={{
                  required: "Parola este obligatorie",
                  minLength: {
                    value: 6,
                    message: "Parola trebuie să aibă minim 6 caractere",
                  },
                }}
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Parolă"
                    value={value}
                    onChangeText={onChange}
                    placeholder="••••••••"
                    secureTextEntry
                    autoComplete="password"
                    error={errors.password?.message}
                    icon={<Ionicons name="lock-closed" size={20} color="#64748b" />}
                  />
                )}
              />
            </View>

            {/* Forgot Password */}
            <Link href="/(auth)/forgot-password" asChild>
              <Pressable className="mb-8">
                <Text className="text-primary-500 text-right font-medium">
                  Ai uitat parola?
                </Text>
              </Pressable>
            </Link>

            {/* Submit Button */}
            <Button
              onPress={handleSubmit(onSubmit)}
              loading={isLoading}
              size="lg"
              className="w-full mb-6"
            >
              Conectare
            </Button>

            {/* Sign Up Link */}
            <View className="flex-row justify-center">
              <Text className="text-dark-500">Nu ai cont? </Text>
              <Link href="/(auth)/signup" asChild>
                <Pressable>
                  <Text className="text-primary-500 font-semibold">
                    Înregistrează-te
                  </Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
