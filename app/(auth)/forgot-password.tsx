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

interface ForgotPasswordForm {
  email: string;
}

export default function ForgotPasswordScreen() {
  const { resetPassword, isSubmitting } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [swipeLoading, setSwipeLoading] = useState(false);
  const swipeRef = useRef<SwipeButtonRef>(null);
  const emailRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    setError(null);
    setSwipeLoading(true);
    const { error } = await resetPassword(data.email);
    if (error) {
      setError(mapAuthError(error.message));
      setSwipeLoading(false);
      swipeRef.current?.reset();
    } else {
      setSuccess(true);
    }
  };

  const handleSwipe = useCallback(() => {
    handleSubmit(onSubmit)();
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
            {/* Back button */}
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </Pressable>

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
              {/* Icon */}
              <View style={styles.iconContainer}>
                <View style={styles.iconCircle}>
                  <Ionicons name="lock-open-outline" size={32} color="#fff" />
                </View>
              </View>

              {/* Title */}
              <Text style={[Typography.h1, styles.title]}>
                Resetare parolă
              </Text>
              <Text style={[Typography.caption, styles.subtitle]}>
                Introdu email-ul și îți vom trimite un link de resetare
              </Text>

              {success ? (
                <View style={styles.successCard}>
                  <View style={styles.successIcon}>
                    <Ionicons name="checkmark" size={28} color="#fff" />
                  </View>
                  <Text style={styles.successTitle}>Email trimis!</Text>
                  <Text style={styles.successBody}>
                    Verifică inbox-ul pentru link-ul de resetare a parolei.
                  </Text>
                  <Pressable
                    onPress={() => router.back()}
                    style={styles.backToLoginBtn}
                  >
                    <Ionicons
                      name="arrow-back"
                      size={16}
                      color={Colors.primaryLight}
                    />
                    <Text style={styles.backToLoginText}>
                      Înapoi la conectare
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
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
                            focusedField === "email" &&
                              styles.inputWrapperFocused,
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
                            returnKeyType="done"
                            onSubmitEditing={handleSubmit(onSubmit)}
                            onFocus={() => setFocusedField("email")}
                            onBlur={() => setFocusedField(null)}
                            style={[Typography.body, styles.input]}
                          />
                        </View>
                      )}
                    />
                    {errors.email && (
                      <Text style={styles.fieldError}>
                        {errors.email.message}
                      </Text>
                    )}
                  </View>

                  {/* Swipe Button */}
                  <View style={styles.swipeContainer}>
                    <SwipeButton
                      ref={swipeRef}
                      onSwipeComplete={handleSwipe}
                      loading={swipeLoading || isSubmitting}
                      label="Glisează pentru resetare"
                      successLabel="Email trimis!"
                      icon="mail-outline"
                    />
                  </View>

                  {/* Back to Login */}
                  <Pressable
                    onPress={() => router.back()}
                    style={styles.backToLoginBtn}
                  >
                    <Ionicons
                      name="arrow-back"
                      size={16}
                      color={Colors.primaryLight}
                    />
                    <Text style={styles.backToLoginText}>
                      Înapoi la conectare
                    </Text>
                  </Pressable>
                </>
              )}
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
    paddingBottom: Spacing["3xl"],
    paddingTop: Spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  logo: {
    width: 150,
    height: 52,
  },
  card: {
    marginHorizontal: 0,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    ...Bubble.radii,
    backgroundColor: Colors.gradientStart,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: Colors.gradientStart,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
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
    lineHeight: 20,
  },
  successCard: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.base,
  },
  successTitle: {
    ...Typography.h2,
    color: "#16a34a",
    marginBottom: Spacing.sm,
  } as object,
  successBody: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 20,
  } as object,
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
  swipeContainer: {
    marginBottom: Spacing.xl,
  },
  backToLoginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  backToLoginText: {
    ...Typography.captionSemiBold,
    color: Colors.primaryLight,
  } as object,
});
