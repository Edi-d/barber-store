import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { Ionicons } from "@expo/vector-icons";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { GlassCard } from "@/components/auth/GlassCard";
import { SwipeButton, SwipeButtonRef } from "@/components/auth/SwipeButton";
import { Colors, Typography, Spacing } from "@/constants/theme";
import { mapAuthError } from "@/lib/authErrors";

const OTP_LENGTH = 6;

export default function ConfirmEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const session = useAuthStore((s) => s.session);
  const { verifySignUpOtp, resendSignUpOtp } = useAuthStore();

  const [cells, setCells] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swipeLoading, setSwipeLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const swipeRef = useRef<SwipeButtonRef>(null);
  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  const code = cells.join("");
  const isComplete = code.length === OTP_LENGTH;

  // Redirect if email param is missing
  useEffect(() => {
    if (!email) {
      router.replace("/(auth)/signup");
    }
  }, [email]);

  // Advance to onboarding once a session exists (set by verifyOtp here, or by a
  // deep-link callback if the user tapped the email link instead of typing it).
  useEffect(() => {
    if (session) {
      router.replace("/(auth)/onboarding");
    }
  }, [session]);

  const handleCellChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, "").slice(-1);
    const next = [...cells];
    next[index] = digit;
    setCells(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCellKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && cells[index] === "" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!isComplete || !email) return;
    setError(null);
    setSwipeLoading(true);
    const { error: verifyError } = await verifySignUpOtp(email, code);
    if (verifyError) {
      setError(mapAuthError(verifyError.message));
      setSwipeLoading(false);
      swipeRef.current?.reset();
    } else {
      router.replace("/(auth)/onboarding");
    }
  }, [email, code, isComplete, verifySignUpOtp]);

  const handleResend = async () => {
    if (!email || resendLoading || resendSuccess) return;
    setResendLoading(true);
    setResendSuccess(false);
    const { error: resendError } = await resendSignUpOtp(email);
    setResendLoading(false);
    if (!resendError) {
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
    }
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
              {/* Mail icon badge */}
              <View style={styles.iconContainer}>
                <Ionicons name="mail" size={48} color={Colors.gradientStart} />
              </View>

              {/* Title */}
              <Text style={[Typography.h1, styles.title]}>Verifică emailul</Text>

              {/* Body */}
              <Text style={[Typography.caption, styles.body]}>
                Am trimis un cod de 6 cifre la{" "}
                <Text style={styles.emailHighlight}>{email}</Text>. Introdu-l mai
                jos pentru a-ți confirma contul.
              </Text>

              {/* Spam note */}
              <View style={styles.noteContainer}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={Colors.textSecondary}
                  style={{ marginRight: Spacing.sm }}
                />
                <Text style={[Typography.caption, styles.noteText]}>
                  Verifică și folderul Spam dacă nu vezi emailul.
                </Text>
              </View>

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

              {/* 6-cell OTP input */}
              <View style={styles.otpRow}>
                {cells.map((cell, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    value={cell}
                    onChangeText={(text) => handleCellChange(text, index)}
                    onKeyPress={({ nativeEvent }) =>
                      handleCellKeyPress(nativeEvent.key, index)
                    }
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex(null)}
                    keyboardType="number-pad"
                    maxLength={1}
                    textContentType="oneTimeCode"
                    autoComplete={index === 0 ? "sms-otp" : "off"}
                    selectTextOnFocus
                    style={[
                      styles.otpCell,
                      focusedIndex === index && styles.otpCellFocused,
                    ]}
                  />
                ))}
              </View>

              {/* Swipe button */}
              <View style={styles.swipeContainer}>
                <SwipeButton
                  ref={swipeRef}
                  onSwipeComplete={handleSubmit}
                  loading={swipeLoading}
                  label="Glisează pentru a confirma"
                  successLabel="Cont confirmat!"
                  icon="checkmark"
                />
              </View>

              {/* Resend button */}
              <Pressable
                style={({ pressed }) => [
                  styles.resendButton,
                  (resendLoading || resendSuccess) && styles.resendButtonMuted,
                  pressed && !resendLoading && styles.resendButtonPressed,
                ]}
                onPress={handleResend}
                disabled={resendLoading || resendSuccess}
              >
                {resendLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={Colors.textTertiary}
                    style={{ marginRight: Spacing.sm }}
                  />
                ) : resendSuccess ? (
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color={Colors.gradientStart}
                    style={{ marginRight: Spacing.sm }}
                  />
                ) : (
                  <Ionicons
                    name="refresh-outline"
                    size={18}
                    color={Colors.text}
                    style={{ marginRight: Spacing.sm }}
                  />
                )}
                <Text
                  style={[
                    styles.resendButtonText,
                    resendSuccess && { color: Colors.gradientStart },
                    resendLoading && { color: Colors.textTertiary },
                  ]}
                >
                  {resendLoading
                    ? "Se trimite..."
                    : resendSuccess
                    ? "Cod retrimis"
                    : "Retrimite codul"}
                </Text>
              </Pressable>

              {/* Back to login */}
              <Pressable
                style={styles.backLink}
                onPress={() => router.replace("/(auth)/login")}
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
              >
                <Text style={[Typography.captionSemiBold, styles.backLinkText]}>
                  Înapoi la conectare
                </Text>
              </Pressable>
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
    marginBottom: Spacing.base,
  },
  body: {
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  emailHighlight: {
    ...Typography.captionSemiBold,
    color: Colors.text,
  },
  noteContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.inputBackground,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: 12,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    alignSelf: "stretch",
  },
  noteText: {
    color: Colors.textSecondary,
    flex: 1,
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
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  otpCell: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    backgroundColor: Colors.white,
    textAlign: "center",
    ...Typography.h2,
    color: Colors.text,
  },
  otpCellFocused: {
    borderColor: Colors.gradientStart,
    borderWidth: 2,
  },
  swipeContainer: {
    alignSelf: "stretch",
    marginBottom: Spacing.base,
  },
  resendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.white,
    alignSelf: "stretch",
    marginBottom: Spacing.base,
  },
  resendButtonMuted: {
    backgroundColor: Colors.inputBackground,
  },
  resendButtonPressed: {
    opacity: 0.8,
  },
  resendButtonText: {
    ...Typography.captionSemiBold,
    color: Colors.text,
  },
  backLink: {
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  backLinkText: {
    color: Colors.primaryLight,
  },
});
