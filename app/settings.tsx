import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { getInitials } from "@/lib/utils";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";

import Animated, { FadeInDown } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Button, Input } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Bubble, Shadows, Spacing } from "@/constants/theme";

interface ProfileForm {
  display_name: string;
  username: string;
  bio: string;
}

// Legal/policy pages embedded from barber-store.ro. Slugs map to /legal/[doc].
const LEGAL_DOCS: {
  slug: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { slug: "terms", label: "Termeni și condiții", icon: "reader-outline" },
  { slug: "privacy", label: "Politica de confidențialitate", icon: "lock-closed-outline" },
  { slug: "returns", label: "Retur produse", icon: "refresh-outline" },
  { slug: "service", label: "Politică de service", icon: "construct-outline" },
  { slug: "shipping", label: "Livrare și plată", icon: "car-outline" },
];

export default function SettingsScreen() {
  const { profile, signOut, deleteAccount, updateProfile, fetchProfile } =
    useAuthStore();
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    defaultValues: {
      display_name: profile?.display_name || "",
      username: profile?.username || "",
      bio: profile?.bio || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const { error } = await updateProfile(data);
      if (error) throw error;
    },
    onSuccess: () => {
      Alert.alert("Succes", "Profilul a fost actualizat!");
    },
    onError: (error: Error) => {
      Alert.alert("Eroare", error.message);
    },
  });

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permisiune refuzată", "Acordă acces la galerie din setările telefonului pentru a schimba avatarul.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets.length || !profile) return;

    setIsUploading(true);
    try {
      const asset = result.assets[0];
      if (!asset.base64) throw new Error("Imaginea nu a putut fi citită.");
      const ext = "jpg";
      const path = `avatars/${profile.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, decode(asset.base64), {
          contentType: `image/${ext}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      // Cache-bust so the new image shows immediately in <Image source={{ uri }}>
      const bustedUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await updateProfile({ avatar_url: bustedUrl });
      await fetchProfile();

      Alert.alert("Succes", "Avatarul a fost actualizat!");
    } catch (error) {
      console.error("[AVATAR] Upload failed:", error);
      Alert.alert("Eroare", "Nu am putut încărca imaginea.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Deconectare", "Ești sigur că vrei să te deconectezi?", [
      { text: "Anulează", style: "cancel" },
      {
        text: "Deconectare",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/welcome");
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    if (isDeleting) return;
    Alert.alert(
      "Șterge contul",
      "Această acțiune este ireversibilă. Toate datele tale — profil, programări și conținut — vor fi șterse permanent.",
      [
        { text: "Anulează", style: "cancel" },
        {
          text: "Șterge contul",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            const { error } = await deleteAccount();
            setIsDeleting(false);
            if (error) {
              Alert.alert(
                "Eroare",
                "Nu am putut șterge contul. Încearcă din nou mai târziu."
              );
              return;
            }
            router.replace("/(auth)/welcome");
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.safeArea} edges={["top"]}>
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(300)}>
        <View style={s.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.text} />
          </Pressable>
          <Text style={s.headerTitle}>Setări</Text>
          <View style={s.headerSpacer} />
        </View>
      </Animated.View>

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar Section */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
          <View style={s.avatarCard}>
            <Pressable
              onPress={pickAvatar}
              disabled={isUploading}
              style={({ pressed }) => [
                s.avatarWrapper,
                pressed && { opacity: 0.85 },
              ]}
            >
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={s.avatarImage} />
              ) : (
                <View style={s.avatarFallback}>
                  <Text style={s.avatarInitials}>
                    {getInitials(profile?.display_name || profile?.username || "")}
                  </Text>
                </View>
              )}
              <View style={[s.cameraBtn, isUploading && { opacity: 0.6 }]}>
                {isUploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={22} color="#fff" />
                )}
              </View>
            </Pressable>
            <Text style={s.avatarHint}>Atinge pentru a schimba avatarul</Text>
          </View>
        </Animated.View>

        {/* Profile Form */}
        <Animated.View entering={FadeInDown.duration(400).delay(200)}>
          <View style={s.sectionCard}>
            <View style={s.sectionHeaderRow}>
              <View style={[s.sectionIconBg, { backgroundColor: Colors.primary + "15" }]}>
                <Ionicons name="person" size={16} color={Colors.primary} />
              </View>
              <Text style={s.sectionTitle}>Informații profil</Text>
            </View>

            <View style={s.formGroup}>
              <Controller
                control={control}
                name="display_name"
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Nume afișat"
                    value={value}
                    onChangeText={onChange}
                    placeholder="Ion Popescu"
                    icon={<Ionicons name="person-outline" size={18} color={Colors.textSecondary} />}
                  />
                )}
              />

              <Controller
                control={control}
                name="username"
                rules={{
                  required: "Numele de utilizator este obligatoriu",
                  minLength: { value: 3, message: "Minim 3 caractere" },
                  pattern: {
                    value: /^[a-zA-Z0-9_]+$/,
                    message: "Doar litere, cifre și underscore",
                  },
                }}
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Nume de utilizator"
                    value={value}
                    onChangeText={onChange}
                    placeholder="ion_popescu"
                    error={errors.username?.message}
                    icon={<Ionicons name="at" size={18} color={Colors.textSecondary} />}
                  />
                )}
              />

              <Controller
                control={control}
                name="bio"
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Bio"
                    value={value}
                    onChangeText={onChange}
                    placeholder="Spune ceva despre tine..."
                    multiline
                    numberOfLines={3}
                  />
                )}
              />
            </View>

            {isDirty && (
              <View style={s.saveWrap}>
                <Button
                  onPress={handleSubmit((data) => updateMutation.mutate(data))}
                  loading={updateMutation.isPending}
                  style={{ width: "100%" }}
                >
                  Salvează modificările
                </Button>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Account Actions */}
        <Animated.View entering={FadeInDown.duration(400).delay(300)}>
          <View style={s.sectionCard}>
            <View style={s.sectionHeaderRow}>
              <View style={[s.sectionIconBg, { backgroundColor: "#E5393515" }]}>
                <Ionicons name="shield" size={16} color="#E53935" />
              </View>
              <Text style={s.sectionTitle}>Cont</Text>
            </View>

            <View style={s.actionsCard}>
              <SettingsItem
                icon="log-out-outline"
                iconColor="#E53935"
                iconBg="#E5393512"
                label="Deconectare"
                onPress={handleLogout}
              />
              <View style={s.actionDivider} />
              <SettingsItem
                icon="trash-outline"
                iconColor="#E53935"
                iconBg="#E5393512"
                label="Șterge contul"
                onPress={handleDeleteAccount}
                loading={isDeleting}
                danger
              />
            </View>
          </View>
        </Animated.View>

        {/* Legal Documents */}
        <Animated.View entering={FadeInDown.duration(400).delay(350)}>
          <View style={s.sectionCard}>
            <View style={s.sectionHeaderRow}>
              <View style={[s.sectionIconBg, { backgroundColor: Colors.indigo + "15" }]}>
                <Ionicons name="document-text" size={16} color={Colors.indigo} />
              </View>
              <Text style={s.sectionTitle}>Documente legale</Text>
            </View>

            <View style={s.actionsCard}>
              {LEGAL_DOCS.map((d, i) => (
                <View key={d.slug}>
                  {i > 0 && <View style={s.actionDivider} />}
                  <SettingsItem
                    icon={d.icon}
                    iconColor={Colors.indigo}
                    iconBg="rgba(99,102,241,0.1)"
                    label={d.label}
                    onPress={() => router.push(`/legal/${d.slug}` as any)}
                  />
                </View>
              ))}
            </View>
          </View>
        </Animated.View>

        {/* App Info */}
        <Animated.View entering={FadeInDown.duration(400).delay(400)}>
          <View style={s.footer}>
            <Text style={s.footerVersion}>Tapzi v1.0.0</Text>
            <Text style={s.footerMeta}>Facut cu ♥ pentru frizeri</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsItem({
  icon,
  iconColor = Colors.textSecondary,
  iconBg,
  label,
  onPress,
  danger = false,
  loading = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [pressed && { opacity: 0.7 }, loading && { opacity: 0.6 }]}
    >
      <View style={s.settingsItemRow}>
        <View style={[s.settingsItemIconBg, iconBg ? { backgroundColor: iconBg } : {}]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={[s.settingsItemLabel, danger && { color: "#E53935" }]}>
          {label}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={danger ? "#E53935" : Colors.textTertiary} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
    borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
    borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
    borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(10,102,194,0.18)",
  },
  headerTitle: {
    flex: 1,
    fontFamily: "EuclidCircularA-Bold",
    fontSize: 20,
    color: "#1E293B",
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },

  // Avatar Section
  avatarCard: {
    alignItems: "center",
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.base,
    backgroundColor: Colors.white,
    borderTopLeftRadius: Bubble.radiiLg.borderTopLeftRadius,
    borderTopRightRadius: Bubble.radiiLg.borderTopRightRadius,
    borderBottomRightRadius: Bubble.radiiLg.borderBottomRightRadius,
    borderBottomLeftRadius: Bubble.radiiLg.borderBottomLeftRadius,
    ...Shadows.md,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.inputBackground,
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontFamily: "EuclidCircularA-Bold",
    fontSize: 32,
    color: Colors.white,
  },
  cameraBtn: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 44,
    height: 44,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Colors.white,
    ...Bubble.radiiSm,
    ...Shadows.sm,
  },
  avatarHint: {
    fontFamily: "EuclidCircularA-Regular",
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: Spacing.md,
  },

  // Section Card
  sectionCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderTopLeftRadius: Bubble.radiiLg.borderTopLeftRadius,
    borderTopRightRadius: Bubble.radiiLg.borderTopRightRadius,
    borderBottomRightRadius: Bubble.radiiLg.borderBottomRightRadius,
    borderBottomLeftRadius: Bubble.radiiLg.borderBottomLeftRadius,
    ...Shadows.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  sectionIconBg: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
    borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
    borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
    borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
    borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
  },
  sectionTitle: {
    fontFamily: "EuclidCircularA-SemiBold",
    fontSize: 17,
    color: Colors.text,
  },
  formGroup: {
    gap: 16,
  },
  saveWrap: {
    marginTop: Spacing.lg,
  },

  // Actions Card
  actionsCard: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Bubble.radii.borderTopLeftRadius,
    borderTopRightRadius: Bubble.radii.borderTopRightRadius,
    borderBottomRightRadius: Bubble.radii.borderBottomRightRadius,
    borderBottomLeftRadius: Bubble.radii.borderBottomLeftRadius,
    overflow: "hidden",
  },
  actionDivider: {
    height: 1,
    backgroundColor: Colors.separator,
    marginHorizontal: Spacing.base,
  },

  // Settings Item
  settingsItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
  },
  settingsItemIconBg: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
    borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
    borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
    borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
    borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
  },
  settingsItemLabel: {
    flex: 1,
    fontFamily: "EuclidCircularA-Medium",
    fontSize: 15,
    color: Colors.text,
  },

  // Footer
  footer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    marginTop: Spacing.sm,
  },
  footerVersion: {
    fontFamily: "EuclidCircularA-Medium",
    fontSize: 13,
    color: Colors.textTertiary,
  },
  footerMeta: {
    fontFamily: "EuclidCircularA-Regular",
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
  },
});
