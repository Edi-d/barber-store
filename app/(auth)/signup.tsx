import { useState, useCallback, useRef } from "react";
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
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { useAuthStore } from "@/stores/authStore";
import { Ionicons } from "@expo/vector-icons";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { GlassCard } from "@/components/auth/GlassCard";
import { SwipeButton, SwipeButtonRef } from "@/components/auth/SwipeButton";
import { Colors, Typography, Bubble, Spacing } from "@/constants/theme";
import { mapAuthError } from "@/lib/authErrors";

interface SignUpForm {
  email: string;
  password: string;
  confirmPassword: string;
}

export default function SignUpScreen() {
  const { signUp, isSubmitting } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [swipeLoading, setSwipeLoading] = useState(false);

  const swipeRef = useRef<SwipeButtonRef>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpForm>({
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const password = watch("password");

  const onSubmit = async (data: SignUpForm) => {
    setError(null);
    setSwipeLoading(true);
    const { error } = await signUp(data.email, data.password);
    if (error) {
      setError(mapAuthError(error.message));
      setSwipeLoading(false);
      swipeRef.current?.reset();
    } else {
      router.replace("/(auth)/onboarding");
    }
  };

  const handleSwipe = useCallback(() => {
    handleSubmit(onSubmit)();
  }, [handleSubmit]);

  const handleSocialLogin = (provider: "Google" | "Apple") => {
    Alert.alert(
      "În curând",
      `Autentificarea cu ${provider} va fi disponibilă în curând.`
    );
  };

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
              {/* Title */}
              <Text style={[Typography.h1, styles.title]}>Creează cont</Text>
              <Text style={[Typography.caption, styles.subtitle]}>
                Începe călătoria ta în lumea frizuriei
              </Text>

              {/* Error */}
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

              {/* Email Field */}
              <View style={styles.fieldContainer}>
                <Text style={[Typography.captionSemiBold, styles.label]}>
                  Email
                </Text>
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
                    <View
                      style={[
                        styles.inputWrapper,
                        focusedField === "email" && styles.inputWrapperFocused,
                        errors.email && styles.inputWrapperError,
                      ]}
                    >
                      <Ionicons
                        name="mail-outline"
                        size={20}
                        color={
                          focusedField === "email"
                            ? Colors.gradientStart
                            : Colors.textTertiary
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        ref={emailRef}
                        value={value}
                        onChangeText={onChange}
                        placeholder="email@exemplu.ro"
                        placeholderTextColor={Colors.textTertiary}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        onFocus={() => setFocusedField("email")}
                        onBlur={() => setFocusedField(null)}
                        style={[Typography.body, styles.input]}
                      />
                    </View>
                  )}
                />
                {errors.email && (
                  <Text style={styles.fieldError}>{errors.email.message}</Text>
                )}
              </View>

              {/* Password Field */}
              <View style={styles.fieldContainer}>
                <Text style={[Typography.captionSemiBold, styles.label]}>
                  Parolă
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
                        focusedField === "password" &&
                          styles.inputWrapperFocused,
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
                        ref={passwordRef}
                        value={value}
                        onChangeText={onChange}
                        placeholder="Minim 6 caractere"
                        placeholderTextColor={Colors.textTertiary}
                        secureTextEntry={!showPassword}
                        autoComplete="password"
                        returnKeyType="next"
                        onSubmitEditing={() =>
                          confirmPasswordRef.current?.focus()
                        }
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField(null)}
                        style={[Typography.body, styles.input]}
                      />
                      <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={
                            showPassword ? "eye-off-outline" : "eye-outline"
                          }
                          size={20}
                          color={Colors.textTertiary}
                        />
                      </Pressable>
                    </View>
                  )}
                />
                {errors.password && (
                  <Text style={styles.fieldError}>
                    {errors.password.message}
                  </Text>
                )}
              </View>

              {/* Confirm Password Field */}
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
                        onPress={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        hitSlop={8}
                      >
                        <Ionicons
                          name={
                            showConfirmPassword
                              ? "eye-off-outline"
                              : "eye-outline"
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

              {/* Terms */}
              <Text style={styles.terms}>
                Prin înregistrare, accepți{" "}
                <Text
                  style={{ color: Colors.primaryLight }}
                  onPress={() => Linking.openURL("https://tapzi.ro/terms")}
                >
                  Termenii și Condițiile
                </Text>{" "}
                și{" "}
                <Text
                  style={{ color: Colors.primaryLight }}
                  onPress={() => Linking.openURL("https://tapzi.ro/privacy")}
                >
                  Politica de Confidențialitate
                </Text>
              </Text>

              {/* Swipe to Sign Up */}
              <View style={styles.swipeContainer}>
                <SwipeButton
                  ref={swipeRef}
                  onSwipeComplete={handleSwipe}
                  loading={swipeLoading || isSubmitting}
                  label="Glisează pentru înregistrare"
                  successLabel="Cont creat!"
                  icon="arrow-forward"
                />
              </View>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>sau</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Social Login Buttons */}
              <Pressable
                style={styles.socialButton}
                onPress={() => handleSocialLogin("Google")}
              >
                <Ionicons
                  name="logo-google"
                  size={20}
                  color={Colors.text}
                  style={styles.socialIcon}
                />
                <Text style={styles.socialButtonText}>Continuă cu Google</Text>
              </Pressable>

              {Platform.OS === "ios" && (
                <Pressable
                  style={[styles.socialButton, styles.appleButton]}
                  onPress={() => handleSocialLogin("Apple")}
                >
                  <Ionicons
                    name="logo-apple"
                    size={20}
                    color="#fff"
                    style={styles.socialIcon}
                  />
                  <Text style={[styles.socialButtonText, { color: "#fff" }]}>
                    Continuă cu Apple
                  </Text>
                </Pressable>
              )}

              {/* Login Link */}
              <View style={styles.footer}>
                <Text
                  style={[
                    Typography.caption,
                    { color: Colors.textSecondary },
                  ]}
                >
                  Ai deja cont?{" "}
                </Text>
                <Link href="/(auth)/login" asChild>
                  <Pressable>
                    <Text
                      style={[
                        Typography.captionSemiBold,
                        { color: Colors.primaryLight },
                      ]}
                    >
                      Conectează-te
                    </Text>
                  </Pressable>
                </Link>
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
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    flex: 1,
  },
  fieldContainer: {
    marginBottom: Spacing.base,
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
  terms: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  swipeContainer: {
    marginBottom: Spacing.xl,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.base,
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.inputBorder,
  },
  dividerText: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.white,
    marginBottom: Spacing.md,
  },
  appleButton: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  socialIcon: {
    marginRight: Spacing.md,
  },
  socialButtonText: {
    ...Typography.captionSemiBold,
    color: Colors.text,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
});
