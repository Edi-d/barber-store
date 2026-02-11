import { useState } from "react";
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { Button, Input } from "@/components/ui";
import { useAuthStore } from "@/stores/authStore";
import { Ionicons } from "@expo/vector-icons";

interface ForgotPasswordForm {
  email: string;
}

export default function ForgotPasswordScreen() {
  const { resetPassword, isSubmitting } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    setError(null);
    const { error } = await resetPassword(data.email);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-4">
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
            Resetare parolă
          </Text>
          <Text className="text-dark-500 text-base mb-8">
            Introdu email-ul și îți vom trimite un link de resetare
          </Text>

          {success ? (
            <View className="bg-green-500/10 border border-green-500 rounded-xl p-6 mb-6">
              <View className="w-16 h-16 bg-green-500 rounded-full items-center justify-center mx-auto mb-4">
                <Ionicons name="checkmark" size={32} color="white" />
              </View>
              <Text className="text-green-600 text-center text-lg font-semibold mb-2">
                Email trimis!
              </Text>
              <Text className="text-dark-500 text-center">
                Verifică inbox-ul pentru link-ul de resetare
              </Text>
            </View>
          ) : (
            <>
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
              </View>

              {/* Submit Button */}
              <Button
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                size="lg"
                className="w-full"
              >
                Trimite link de resetare
              </Button>
            </>
          )}

          {/* Back to Login */}
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center justify-center mt-8"
          >
            <Ionicons name="arrow-back" size={16} color="#0a66c2" />
            <Text className="text-primary-500 font-medium ml-2">
              Înapoi la conectare
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
