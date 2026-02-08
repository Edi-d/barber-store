import { useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Button, Input, Avatar, Card } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";

interface ProfileForm {
  display_name: string;
  username: string;
  bio: string;
}

export default function SettingsScreen() {
  const { profile, signOut, updateProfile, fetchProfile } = useAuthStore();
  const [isUploading, setIsUploading] = useState(false);

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && profile) {
      setIsUploading(true);
      try {
        const file = result.assets[0];
        const fileExt = file.uri.split(".").pop();
        const fileName = `${profile.id}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        // Upload to Supabase Storage
        const response = await fetch(file.uri);
        const blob = await response.blob();
        
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, blob, { upsert: true });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        // Update profile
        await updateProfile({ avatar_url: urlData.publicUrl });
        await fetchProfile();

        Alert.alert("Succes", "Avatarul a fost actualizat!");
      } catch (error) {
        console.error(error);
        Alert.alert("Eroare", "Nu am putut încărca imaginea.");
      } finally {
        setIsUploading(false);
      }
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
    Alert.alert(
      "Șterge contul",
      "Această acțiune este ireversibilă. Toate datele tale vor fi șterse permanent.",
      [
        { text: "Anulează", style: "cancel" },
        {
          text: "Șterge contul",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Coming Soon",
              "Ștergerea contului va fi disponibilă în curând. Contactează-ne pentru asistență."
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-dark-300 bg-white">
        <Pressable onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </Pressable>
        <Text className="text-dark-700 text-xl font-bold">Setări</Text>
      </View>

      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="px-6 py-6">
          {/* Avatar Section */}
          <View className="items-center mb-8 bg-white rounded-2xl py-6">
            <View className="relative">
              <Avatar
                source={profile?.avatar_url}
                name={profile?.display_name || profile?.username}
                size="xl"
                useDefaultAvatar={true}
              />
              <Pressable
                onPress={pickAvatar}
                disabled={isUploading}
                className="absolute bottom-0 right-0 w-10 h-10 bg-primary-500 rounded-full items-center justify-center border-4 border-white"
              >
                <Ionicons
                  name={isUploading ? "hourglass" : "camera"}
                  size={18}
                  color="white"
                />
              </Pressable>
            </View>
            <Text className="text-dark-500 text-sm mt-3">
              Atinge pentru a schimba avatarul
            </Text>
          </View>

          {/* Profile Form */}
          <Card className="mb-6">
            <Text className="text-dark-700 font-bold text-lg mb-4">
              Informații profil
            </Text>
            <View className="gap-4">
              <Controller
                control={control}
                name="display_name"
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Nume afișat"
                    value={value}
                    onChangeText={onChange}
                    placeholder="Ion Popescu"
                    icon={<Ionicons name="person" size={20} color="#64748b" />}
                  />
                )}
              />

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
                  <Input
                    label="Username"
                    value={value}
                    onChangeText={onChange}
                    placeholder="ion_popescu"
                    error={errors.username?.message}
                    icon={<Ionicons name="at" size={20} color="#64748b" />}
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
              <Button
                onPress={handleSubmit((data) => updateMutation.mutate(data))}
                loading={updateMutation.isPending}
                className="mt-4 w-full"
              >
                Salvează modificările
              </Button>
            )}
          </Card>

          {/* Account Actions */}
          <Card className="mb-6 p-0 overflow-hidden">
            <SettingsItem
              icon="log-out"
              iconColor="#dc2626"
              label="Deconectare"
              onPress={handleLogout}
            />
            <SettingsItem
              icon="trash"
              iconColor="#dc2626"
              label="Șterge contul"
              onPress={handleDeleteAccount}
              hideBorder
              danger
            />
          </Card>

          {/* App Info */}
          <View className="items-center py-4">
            <Text className="text-dark-500 text-sm">Barber Store v1.0.0</Text>
            <Text className="text-dark-400 text-xs mt-1">
              Made with ❤️ for barbers
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsItem({
  icon,
  iconColor = "#64748b",
  label,
  onPress,
  hideBorder = false,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  onPress: () => void;
  hideBorder?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center px-4 py-4 ${
        !hideBorder && "border-b border-dark-300"
      }`}
    >
      <Ionicons name={icon} size={22} color={iconColor} />
      <Text
        className={`flex-1 ml-3 text-base ${
          danger ? "text-red-600" : "text-dark-700"
        }`}
      >
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={20} color="#64748b" />
    </Pressable>
  );
}
