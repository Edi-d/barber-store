import { useState, useEffect } from "react";
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
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { GlassCard } from "@/components/auth/GlassCard";
import { Colors, Typography, Bubble, Spacing } from "@/constants/theme";

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ code?: string }>();

  const [sessionReady, setSessionReady] = useState(Platform.OS !== "web");
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // On web, Supabase PKCE flow sends the user back with ?code=... in the URL.
  // We must exchange that code for a session before we can call updateUser.
  // On mobile the deep-link handler sets the session via onAuthStateChange,
  // so we skip this block entirely.
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const code = params.code ?? getCodeFromWindowSearch();
    if (!code) {
      setExchangeError(
        "Link invalid sau expirat. Solicită un nou link de resetare."
      );
      setSessionReady(true);
      return;
    }

    let cancelled = false;
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (cancelled) return;
        if (error) {
          setExchangeError(
            "Link invalid sau expirat. Solicită un nou link de resetare."
          );
        }
        setSessionReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setExchangeError("A apărut o eroare. Încearcă din nou.");
        setSessionReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    setSubmitError(null);

    if (!newPassword || newPassword.length < 8) {
      setSubmitError("Parola trebuie să aibă minim 8 caractere.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setSubmitError("Parolele nu coincid.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setSuccess(true);
      // Give the user a moment to read the success message, then redirect.
      setTimeout(() => {
        router.replace("/(tabs)");
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "A apărut o eroare.";
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state while we exchange the code on web.
  if (!sessionReady) {
    return (
      <AuthBackground>
        <SafeAreaView style={styles.centeredFlex}>
          <ActivityIndicator size="large" color={Colors.gradientStart} />
          <Text style={[Typography.caption, styles.loadingText]}>
            Se verifică link-ul...
          </Text>
        </SafeAreaView>
      </AuthBackground>
    );
  }

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

            <GlassCard style={styles.card}>
              {/* Icon */}
              <View style={styles.iconContainer}>
                <View style={styles.iconCircle}>
                  <Ionicons name="lock-closed-outline" size={32} color="#fff" />
                </View>
              </View>

              <Text style={[Typography.h1, styles.title]}>Parolă nouă</Text>
              <Text style={[Typography.caption, styles.subtitle]}>
                Alege o parolă sigură pentru contul tău
              </Text>

              {/* Exchange error — link was bad */}
              {exchangeError ? (
                <View style={styles.errorContainer}>
                  <Ionicons
                    name="alert-circle"
                    size={16}
                    color={Colors.error}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.errorText}>{exchangeError}</Text>
                </View>
              ) : success ? (
                /* Success state */
                <View style={styles.successCard}>
                  <View style={styles.successIcon}>
                    <Ionicons name="checkmark" size={28} color="#fff" />
                  </View>
                  <Text style={styles.successTitle}>Parolă actualizată!</Text>
                  <Text style={styles.successBody}>
                    Te redirecționăm automat...
                  </Text>
                </View>
              ) : (
                /* Password form */
                <>
                  {submitError && (
                    <View style={styles.errorContainer}>
                      <Ionicons
                        name="alert-circle"
                        size={16}
                        color={Colors.error}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.errorText}>{submitError}</Text>
                    </View>
                  )}

                  {/* New password */}
                  <View style={styles.fieldContainer}>
                    <Text style={[Typography.captionSemiBold, styles.label]}>
                      Parolă nouă
                    </Text>
                    <View
                      style={[
                        styles.inputWrapper,
                        focusedField === "new" && styles.inputWrapperFocused,
                      ]}
                    >
                      <Ionicons
                        name="lock-closed-outline"
                        size={20}
                        color={
                          focusedField === "new"
                            ? Colors.gradientStart
                            : Colors.textTertiary
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        value={newPassword}
                        onChangeText={setNewPassword}
                        placeholder="Minim 8 caractere"
                        placeholderTextColor={Colors.textTertiary}
                        secureTextEntry={!showNew}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        onFocus={() => setFocusedField("new")}
                        onBlur={() => setFocusedField(null)}
                        style={[Typography.body, styles.input]}
                      />
                      <Pressable
                        onPress={() => setShowNew((v) => !v)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={showNew ? "eye-off-outline" : "eye-outline"}
                          size={20}
                          color={Colors.textTertiary}
                        />
                      </Pressable>
                    </View>
                  </View>

                  {/* Confirm password */}
                  <View style={styles.fieldContainer}>
                    <Text style={[Typography.captionSemiBold, styles.label]}>
                      Confirmă parola
                    </Text>
                    <View
                      style={[
                        styles.inputWrapper,
                        focusedField === "confirm" &&
                          styles.inputWrapperFocused,
                      ]}
                    >
                      <Ionicons
                        name="lock-closed-outline"
                        size={20}
                        color={
                          focusedField === "confirm"
                            ? Colors.gradientStart
                            : Colors.textTertiary
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="Repetă parola"
                        placeholderTextColor={Colors.textTertiary}
                        secureTextEntry={!showConfirm}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        onFocus={() => setFocusedField("confirm")}
                        onBlur={() => setFocusedField(null)}
                        onSubmitEditing={handleSubmit}
                        returnKeyType="done"
                        style={[Typography.body, styles.input]}
                      />
                      <Pressable
                        onPress={() => setShowConfirm((v) => !v)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={showConfirm ? "eye-off-outline" : "eye-outline"}
                          size={20}
                          color={Colors.textTertiary}
                        />
                      </Pressable>
                    </View>
                  </View>

                  {/* Submit button */}
                  <Pressable
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                    style={({ pressed }) => [
                      styles.submitButton,
                      pressed && styles.submitButtonPressed,
                      isSubmitting && styles.submitButtonDisabled,
                    ]}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.submitButtonText}>
                        Salvează parola
                      </Text>
                    )}
                  </Pressable>

                  {/* Back to login */}
                  <Pressable
                    onPress={() => router.replace("/(auth)/login")}
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

/**
 * Fallback: if expo-router hasn't parsed the query params yet (possible on
 * web during initial render), read them directly from window.location.search.
 */
function getCodeFromWindowSearch(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("code");
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  centeredFlex: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.base,
  },
  loadingText: {
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing["3xl"],
    paddingTop: Spacing.lg,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
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
  inputIcon: {
    marginRight: Spacing.md,
  },
  input: {
    flex: 1,
    color: Colors.text,
    paddingVertical: 0,
  },
  submitButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.gradientStart,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.base,
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    ...Typography.captionSemiBold,
    color: "#fff",
    fontSize: 16,
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
    lineHeight: 20,
  } as object,
  backToLoginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: Spacing.sm,
  },
  backToLoginText: {
    ...Typography.captionSemiBold,
    color: Colors.primaryLight,
  } as object,
});
