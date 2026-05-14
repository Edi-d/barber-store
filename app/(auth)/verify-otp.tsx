import { useState, useRef, useCallback, useEffect } from "react";
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

export default function VerifyOtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();

  const { verifyResetPasswordOtp, resetPassword } = useAuthStore();

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
      router.replace("/(auth)/forgot-password");
    }
  }, [email]);

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
    console.log("[VERIFY_OTP] Submitting OTP for:", email, "code:", code);
    const { error: verifyError } = await verifyResetPasswordOtp(email, code);
    console.log("[VERIFY_OTP] Verify result error:", verifyError ?? null);
    if (verifyError) {
      setError(mapAuthError(verifyError.message));
      setSwipeLoading(false);
      swipeRef.current?.reset();
    } else {
      router.replace("/(auth)/reset-password");
    }
  }, [email, code, isComplete]);

  const handleResend = async () => {
    if (!email || resendLoading || resendSuccess) return;
    setResendLoading(true);
    setResendSuccess(false);
    console.log("[VERIFY_OTP] Resending OTP for:", email);
    const { error: resendError } = await resetPassword(email);
    console.log("[VERIFY_OTP] Resend result error:", resendError ?? null);
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
              {/* Key icon badge */}
              <View style={styles.iconContainer}>
                <Ionicons
                  name="key-outline"
                  size={48}
                  color={Colors.gradientStart}
                />
              </View>

              {/* Title */}
              <Text style={[Typography.h1, styles.title]}>Introdu codul</Text>

              {/* Body */}
              <Text style={[Typography.caption, styles.body]}>
                Am trimis un cod de 6 cifre la{" "}
                <Text style={styles.emailHighlight}>{email}</Text>. Introdu-l
                mai jos pentru a-ți reseta parola.
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
                  label="Glisează pentru a verifica"
                  successLabel="Cod verificat!"
                  icon="key-outline"
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

              {/* Back link */}
              <Pressable
                style={styles.backLink}
                onPress={() => router.back()}
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
              >
                <Ionicons
                  name="arrow-back"
                  size={16}
                  color={Colors.primaryLight}
                  style={{ marginRight: 4 }}
                />
                <Text style={[Typography.captionSemiBold, styles.backLinkText]}>
                  Înapoi
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
  },
  backLinkText: {
    color: Colors.primaryLight,
  },
});
