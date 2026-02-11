import { useState } from "react";
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { Button, Input } from "@/components/ui";
import { useAuthStore } from "@/stores/authStore";
import { Ionicons } from "@expo/vector-icons";

interface SignUpForm {
  email: string;
  password: string;
  confirmPassword: string;
}

export default function SignUpScreen() {
  const { signUp, isSubmitting } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpForm>({
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const password = watch("password");

  const onSubmit = async (data: SignUpForm) => {
    setError(null);
    const { error } = await signUp(data.email, data.password);
    if (error) {
      setError(error.message);
    } else {
      router.replace("/(auth)/onboarding");
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
            <Pressable onPress={() => router.back()} className="mb-6">
              <Ionicons name="arrow-back" size={24} color="#334155" />
            </Pressable>

            <Image
              source={require("@/assets/image-removebg-preview.png")}
              style={{ width: 140, height: 50 }}
              resizeMode="contain"
              className="mb-6"
            />

            <Text className="text-3xl font-bold text-dark-700 mb-2">
              Creează cont
            </Text>
            <Text className="text-dark-500 text-base mb-8">
              Începe călătoria ta în lumea frizuriei
            </Text>

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
                    message: "Minim 6 caractere",
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

              <Controller
                control={control}
                name="confirmPassword"
                rules={{
                  required: "Confirmă parola",
                  validate: (value) =>
                    value === password || "Parolele nu coincid",
                }}
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Confirmă parola"
                    value={value}
                    onChangeText={onChange}
                    placeholder="••••••••"
                    secureTextEntry
                    error={errors.confirmPassword?.message}
                    icon={<Ionicons name="lock-closed" size={20} color="#64748b" />}
                  />
                )}
              />
            </View>

            {/* Terms */}
            <Text className="text-dark-500 text-center text-sm mb-6">
              Prin înregistrare, accepți{" "}
              <Text className="text-primary-500">Termenii și Condițiile</Text>{" "}
              și{" "}
              <Text className="text-primary-500">Politica de Confidențialitate</Text>
            </Text>

            {/* Submit Button */}
            <Button
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              size="lg"
              className="w-full mb-6"
            >
              Creează cont
            </Button>

            {/* Login Link */}
            <View className="flex-row justify-center">
              <Text className="text-dark-500">Ai deja cont? </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <Text className="text-primary-500 font-semibold">
                    Conectează-te
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
