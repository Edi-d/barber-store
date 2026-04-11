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
import Animated, { FadeInDown } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";

interface OnboardingForm {
  username: string;
  displayName: string;
  bio: string;
}

export default function OnboardingScreen() {
  const { createProfile, updateProfile, session, isSubmitting } =
    useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [swipeLoading, setSwipeLoading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const swipeRef = useRef<SwipeButtonRef>(null);
  const usernameRef = useRef<TextInput>(null);
  const displayNameRef = useRef<TextInput>(null);
  const bioRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingForm>({
    defaultValues: { username: "", displayName: "", bio: "" },
  });

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setError("Permisiunea pentru galerie a fost refuzată.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets.length) return;

    const asset = result.assets[0];
    setAvatarUri(asset.uri);

    // Upload to Supabase storage if user session is available
    const userId = session?.user?.id;
    if (!userId) return;

    setAvatarUploading(true);
    try {
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const path = `avatars/${userId}.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, arrayBuffer, {
          contentType: `image/${ext}`,
          upsert: true,
        });

      if (uploadError) {
        console.warn("[AVATAR] Upload failed:", uploadError.message);
        // Local preview is still shown — not fatal
      } else {
        const { data: urlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(path);
        if (urlData?.publicUrl) {
          await updateProfile({ avatar_url: urlData.publicUrl });
        }
      }
    } catch (err) {
      console.warn("[AVATAR] Upload exception:", err);
    } finally {
      setAvatarUploading(false);
    }
  };

  const onSubmit = async (data: OnboardingForm) => {
    setError(null);
    setSwipeLoading(true);
    const { error } = await createProfile({
      username: data.username,
      display_name: data.displayName || data.username,
      bio: data.bio || undefined,
    });
    if (error) {
      if (
        error.message.includes("duplicate") ||
        error.message.includes("unique")
      ) {
        setError("Username-ul este deja folosit. Alege altul.");
      } else {
        setError(error.message);
      }
      setSwipeLoading(false);
      swipeRef.current?.reset();
    } else {
      router.replace("/(tabs)/discover");
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
            {/* Logo */}
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={styles.logoContainer}
            >
              <Image
                source={require("@/assets/logo-icon.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </Animated.View>

            {/* Glass Card */}
            <GlassCard style={styles.card}>
              {/* Avatar Picker */}
              <Animated.View
                entering={FadeInDown.duration(450).delay(100)}
                style={styles.avatarContainer}
              >
                <Pressable
                  onPress={handlePickAvatar}
                  style={styles.avatarCircle}
                  disabled={avatarUploading}
                >
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Ionicons name="person-add" size={32} color="#fff" />
                  )}
                  {/* Camera badge */}
                  <View style={styles.cameraBadge}>
                    <Ionicons
                      name={avatarUploading ? "sync-outline" : "camera"}
                      size={12}
                      color="#fff"
                    />
                  </View>
                </Pressable>
                <Text style={styles.avatarHint}>
                  {avatarUri ? "Schimbă poza" : "Adaugă poză"}
                </Text>
              </Animated.View>

              {/* Title */}
              <Animated.View entering={FadeInDown.duration(400).delay(150)}>
                <Text style={[Typography.h1, styles.title]}>
                  Completează profilul
                </Text>
                <Text style={[Typography.caption, styles.subtitle]}>
                  Spune-ne mai multe despre tine pentru a personaliza
                  experiența
                </Text>
              </Animated.View>

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

              {/* Username Field */}
              <View style={styles.fieldContainer}>
                <Text style={[Typography.captionSemiBold, styles.label]}>
                  Nume de utilizator
                </Text>
                <Controller
                  control={control}
                  name="username"
                  rules={{
                    required: "Username-ul este obligatoriu",
                    minLength: { value: 3, message: "Minim 3 caractere" },
                    pattern: {
                      value: /^[a-zA-Z0-9_]+$/,
                      message: "Doar litere, cifre și underscore",
                    },
                  }}
                  render={({ field: { onChange, value } }) => (
                    <View
                      style={[
                        styles.inputWrapper,
                        focusedField === "username" &&
                          styles.inputWrapperFocused,
                        errors.username && styles.inputWrapperError,
                      ]}
                    >
                      <Ionicons
                        name="at"
                        size={20}
                        color={
                          focusedField === "username"
                            ? Colors.gradientStart
                            : Colors.textTertiary
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        ref={usernameRef}
                        value={value}
                        onChangeText={onChange}
                        placeholder="ion_barber"
                        placeholderTextColor={Colors.textTertiary}
                        autoCapitalize="none"
                        returnKeyType="next"
                        onSubmitEditing={() => displayNameRef.current?.focus()}
                        onFocus={() => setFocusedField("username")}
                        onBlur={() => setFocusedField(null)}
                        style={[Typography.body, styles.input]}
                      />
                    </View>
                  )}
                />
                {errors.username && (
                  <Text style={styles.fieldError}>
                    {errors.username.message}
                  </Text>
                )}
              </View>

              {/* Display Name Field */}
              <View style={styles.fieldContainer}>
                <Text style={[Typography.captionSemiBold, styles.label]}>
                  Nume afișat
                </Text>
                <Controller
                  control={control}
                  name="displayName"
                  rules={{
                    required: "Numele este obligatoriu",
                    minLength: { value: 2, message: "Minim 2 caractere" },
                  }}
                  render={({ field: { onChange, value } }) => (
                    <View
                      style={[
                        styles.inputWrapper,
                        focusedField === "displayName" &&
                          styles.inputWrapperFocused,
                        errors.displayName && styles.inputWrapperError,
                      ]}
                    >
                      <Ionicons
                        name="person-outline"
                        size={20}
                        color={
                          focusedField === "displayName"
                            ? Colors.gradientStart
                            : Colors.textTertiary
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        ref={displayNameRef}
                        value={value}
                        onChangeText={onChange}
                        placeholder="John Doe"
                        placeholderTextColor={Colors.textTertiary}
                        autoCapitalize="words"
                        returnKeyType="next"
                        onSubmitEditing={() => bioRef.current?.focus()}
                        onFocus={() => setFocusedField("displayName")}
                        onBlur={() => setFocusedField(null)}
                        style={[Typography.body, styles.input]}
                      />
                    </View>
                  )}
                />
                {errors.displayName && (
                  <Text style={styles.fieldError}>
                    {errors.displayName.message}
                  </Text>
                )}
              </View>

              {/* Bio Field */}
              <View style={styles.fieldContainer}>
                <Text style={[Typography.captionSemiBold, styles.label]}>
                  Bio (opțional)
                </Text>
                <Controller
                  control={control}
                  name="bio"
                  render={({ field: { onChange, value } }) => (
                    <View
                      style={[
                        styles.inputWrapper,
                        styles.inputMultiline,
                        focusedField === "bio" && styles.inputWrapperFocused,
                      ]}
                    >
                      <Ionicons
                        name="create-outline"
                        size={20}
                        color={
                          focusedField === "bio"
                            ? Colors.gradientStart
                            : Colors.textTertiary
                        }
                        style={[styles.inputIcon, { marginTop: 2 }]}
                      />
                      <TextInput
                        ref={bioRef}
                        value={value}
                        onChangeText={onChange}
                        placeholder="Spune ceva despre tine..."
                        placeholderTextColor={Colors.textTertiary}
                        autoCapitalize="sentences"
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                        returnKeyType="done"
                        blurOnSubmit
                        onFocus={() => setFocusedField("bio")}
                        onBlur={() => setFocusedField(null)}
                        style={[
                          Typography.body,
                          styles.input,
                          styles.inputTextMultiline,
                        ]}
                      />
                    </View>
                  )}
                />
              </View>

              {/* Swipe Button */}
              <View style={styles.swipeContainer}>
                <SwipeButton
                  ref={swipeRef}
                  onSwipeComplete={handleSwipe}
                  loading={swipeLoading || isSubmitting}
                  label="Glisează pentru a finaliza"
                  successLabel="Profil creat!"
                  icon="checkmark"
                />
              </View>

              {/* Hint */}
              <View style={styles.hintContainer}>
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={Colors.textTertiary}
                />
                <Text style={styles.hintText}>
                  Poți modifica oricând din setări
                </Text>
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
  avatarContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    ...Bubble.radii,
    backgroundColor: Colors.gradientStart,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
  avatarImage: {
    width: 88,
    height: 88,
    ...Bubble.radii,
  },
  cameraBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarHint: {
    ...Typography.caption,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
  } as object,
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
    ...Bubble.radiiSm,
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
  inputMultiline: {
    height: 90,
    alignItems: "flex-start",
    paddingVertical: Spacing.md,
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
  inputTextMultiline: {
    height: 66,
    textAlignVertical: "top",
    paddingTop: 0,
  },
  fieldError: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  swipeContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  hintContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  hintText: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
});
