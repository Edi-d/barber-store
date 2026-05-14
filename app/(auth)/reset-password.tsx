import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { useAuthStore } from "@/stores/authStore";
import { Ionicons } from "@expo/vector-icons";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { GlassCard } from "@/components/auth/GlassCard";
import { SwipeButton, SwipeButtonRef } from "@/components/auth/SwipeButton";
import { Colors, Typography, Bubble, Spacing } from "@/constants/theme";
import { mapAuthError } from "@/lib/authErrors";

interface ResetPasswordForm {
  password: string;
  confirmPassword: string;
}

export default function ResetPasswordScreen() {
  const { updatePassword, isSubmitting, session, isInitialized } =
    useAuthStore();

  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [swipeLoading, setSwipeLoading] = useState(false);

  const swipeRef = useRef<SwipeButtonRef>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    defaultValues: { password: "", confirmPassword: "" },
  });

  const password = watch("password");

  // Redirect if recovery session is absent after store is ready
  useEffect(() => {
    console.log("[RESET_PASSWORD_SUBMIT] session guard effect — isInitialized:", isInitialized, "session:", session ? "present" : "null");
    if (isInitialized && !session) {
      console.log("[RESET_PASSWORD_SUBMIT] session guard triggering router.replace('/(auth)/welcome')");
      router.replace("/(auth)/welcome");
    }
  }, [isInitialized, session]);

  const onSubmit = async (data: ResetPasswordForm) => {
    console.log("[RESET_PASSWORD_SUBMIT] onSubmit called, password length:", data.password?.length);
    setError(null);
    setSwipeLoading(true);
    console.log("[RESET_PASSWORD_SUBMIT] calling updatePassword...");
    const { error: updateError } = await updatePassword(data.password);
    console.log("[RESET_PASSWORD_SUBMIT] updatePassword returned, error:", updateError);
    if (updateError) {
      console.log("[RESET_PASSWORD_SUBMIT] entering error branch, message:", updateError.message);
      setError(mapAuthError(updateError.message));
      setSwipeLoading(false);
      swipeRef.current?.reset();
    } else {
      console.log("[RESET_PASSWORD_SUBMIT] entering success branch — scheduling router.replace('/(tabs)') in 1200ms");
      // Brief moment on the success state, then enter the app
      setTimeout(() => {
        console.log("[RESET_PASSWORD_SUBMIT] setTimeout fired — calling router.replace('/(tabs)') now");
        router.replace("/(tabs)");
        console.log("[RESET_PASSWORD_SUBMIT] router.replace called");
      }, 1200);
    }
    console.log("[RESET_PASSWORD_SUBMIT] onSubmit complete (setTimeout may still be pending)");
  };

  const handleSwipe = useCallback(() => {
    console.log("[RESET_PASSWORD_SUBMIT] handleSwipe called — invoking handleSubmit(onSubmit)");
    handleSubmit(onSubmit)();
    console.log("[RESET_PASSWORD_SUBMIT] handleSubmit(onSubmit)() returned");
  }, [handleSubmit]);

  return (
    <AuthBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo */}
            <View style={styles.logoContainer}>
              <Image
                source={require("@/assets/logo-icon.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            {/* Glass Card */}
            <GlassCard style={styles.card}>
              {/* Lock icon badge */}
              <View style={styles.iconContainer}>
                <Ionicons name="lock-closed" size={48} color={Colors.gradientStart} />
              </View>

              {/* Title */}
              <Text style={[Typography.h1, styles.title]}>Parolă nouă</Text>
              <Text style={[Typography.caption, styles.subtitle]}>
                Alege o parolă pe care nu ai folosit-o până acum
              </Text>

              {/* Error banner */}
              {error && (
                <View style={styles.errorContainer}>
                  <Ionicons
                    name="alert-circle"
                    size={16}
                    color={Colors.error}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* New password field */}
              <View style={styles.fieldContainer}>
                <Text style={[Typography.captionSemiBold, styles.label]}>
                  Parolă nouă
                </Text>
                <Controller
                  control={control}
                  name="password"
                  rules={{
                    required: "Parola este obligatorie",
                    minLength: { value: 6, message: "Minim 6 caractere" },
                  }}
                  render={({ field: { onChange, value } }) => (
                    <View
                      style={[
                        styles.inputWrapper,
                        focusedField === "password" && styles.inputWrapperFocused,
                        errors.password && styles.inputWrapperError,
                      ]}
                    >
                      <Ionicons
                        name="lock-closed-outline"
                        size={20}
                        color={
                          focusedField === "password"
                            ? Colors.gradientStart
                            : Colors.textTertiary
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        value={value}
                        onChangeText={onChange}
                        placeholder="Minim 6 caractere"
                        placeholderTextColor={Colors.textTertiary}
                        secureTextEntry={!showPassword}
                        autoComplete="password-new"
                        returnKeyType="next"
                        onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField(null)}
                        style={[Typography.body, styles.input]}
                      />
                      <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={showPassword ? "eye-off-outline" : "eye-outline"}
                          size={20}
                          color={Colors.textTertiary}
                        />
                      </Pressable>
                    </View>
                  )}
                />
                {errors.password && (
                  <Text style={styles.fieldError}>{errors.password.message}</Text>
                )}
              </View>

              {/* Confirm password field */}
              <View style={styles.fieldContainer}>
                <Text style={[Typography.captionSemiBold, styles.label]}>
                  Confirmă parola
                </Text>
                <Controller
                  control={control}
                  name="confirmPassword"
                  rules={{
                    required: "Confirmă parola",
                    validate: (value: string) =>
                      value === password || "Parolele nu coincid",
                  }}
                  render={({ field: { onChange, value } }) => (
                    <View
                      style={[
                        styles.inputWrapper,
                        focusedField === "confirmPassword" &&
                          styles.inputWrapperFocused,
                        errors.confirmPassword && styles.inputWrapperError,
                      ]}
                    >
                      <Ionicons
                        name="lock-closed-outline"
                        size={20}
                        color={
                          focusedField === "confirmPassword"
                            ? Colors.gradientStart
                            : Colors.textTertiary
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        ref={confirmPasswordRef}
                        value={value}
                        onChangeText={onChange}
                        placeholder="Repetă parola"
                        placeholderTextColor={Colors.textTertiary}
                        secureTextEntry={!showConfirmPassword}
                        returnKeyType="done"
                        onSubmitEditing={handleSubmit(onSubmit)}
                        onFocus={() => setFocusedField("confirmPassword")}
                        onBlur={() => setFocusedField(null)}
                        style={[Typography.body, styles.input]}
                      />
                      <Pressable
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={
                            showConfirmPassword ? "eye-off-outline" : "eye-outline"
                          }
                          size={20}
                          color={Colors.textTertiary}
                        />
                      </Pressable>
                    </View>
                  )}
                />
                {errors.confirmPassword && (
                  <Text style={styles.fieldError}>
                    {errors.confirmPassword.message}
                  </Text>
                )}
              </View>

              {/* Swipe to save */}
              <View style={styles.swipeContainer}>
                <SwipeButton
                  ref={swipeRef}
                  onSwipeComplete={handleSwipe}
                  loading={swipeLoading || isSubmitting}
                  label="Glisează pentru a salva"
                  successLabel="Parolă salvată!"
                  icon="arrow-forward"
                />
              </View>
            </GlassCard>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AuthBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing["2xl"],
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  logo: {
    width: 150,
    height: 52,
  },
  card: {
    marginHorizontal: 0,
    alignItems: "center",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.inputBackground,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  title: {
    color: Colors.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.errorMuted,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: 12,
    marginBottom: Spacing.base,
    alignSelf: "stretch",
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    flex: 1,
  },
  fieldContainer: {
    marginBottom: Spacing.base,
    alignSelf: "stretch",
  },
  label: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    ...Bubble.radii,
    paddingHorizontal: Spacing.base,
  },
  inputWrapperFocused: {
    borderColor: Colors.inputFocusBorder,
    borderWidth: 2,
    backgroundColor: Colors.white,
  },
  inputWrapperError: {
    borderColor: Colors.error,
    borderWidth: 2,
  },
  inputIcon: {
    marginRight: Spacing.md,
  },
  input: {
    flex: 1,
    color: Colors.text,
    paddingVertical: 0,
  },
  fieldError: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  swipeContainer: {
    marginBottom: Spacing.xl,
    alignSelf: "stretch",
  },
});
