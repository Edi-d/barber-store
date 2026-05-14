import { useEffect, useState } from "react";
import {
  View,
  Text,
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
import { Colors, Typography, Bubble, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

export default function ConfirmEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const session = useAuthStore((s) => s.session);

  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Advance to onboarding once the deep-link callback sets the session
  useEffect(() => {
    if (session) {
      router.replace("/(auth)/onboarding");
    }
  }, [session]);

  const handleResend = async () => {
    if (!email || resendLoading) return;
    setResendLoading(true);
    setResendSuccess(false);
    try {
      await supabase.auth.resend({ type: "signup", email });
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
    } finally {
      setResendLoading(false);
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
              {/* Mail icon */}
              <View style={styles.iconContainer}>
                <Ionicons
                  name="mail"
                  size={48}
                  color={Colors.gradientStart}
                />
              </View>

              {/* Title */}
              <Text style={[Typography.h1, styles.title]}>
                Verifică emailul
              </Text>

              {/* Body */}
              <Text style={[Typography.caption, styles.body]}>
                Ți-am trimis un email de confirmare la{" "}
                <Text style={styles.emailHighlight}>{email}</Text>. Apasă
                link-ul din email pentru a continua.
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
                    ? "Email retrimis"
                    : "Retrimite emailul"}
                </Text>
              </Pressable>

              {/* Back to login */}
              <Pressable
                style={styles.backLink}
                onPress={() => router.replace("/(auth)/login")}
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
              >
                <Text
                  style={[Typography.captionSemiBold, styles.backLinkText]}
                >
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
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    alignSelf: "stretch",
  },
  noteText: {
    color: Colors.textSecondary,
    flex: 1,
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
