import React, { useRef, useEffect } from "react";
import { View, ScrollView, Pressable, RefreshControl, ActivityIndicator, StyleSheet, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";
import { AnimatedScreen } from "@/components/ui/AnimatedScreen";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors, Bubble, Shadows, Spacing } from "@/constants/theme";
import { useTutorialContext } from "@/components/tutorial/TutorialProvider";

import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileMenu } from "@/components/profile/ProfileMenu";

export default function ProfileScreen() {
  const { profile, session } = useAuthStore();
  const { registerRef, unregisterRef } = useTutorialContext();

  const heroRef = useRef<View>(null);
  const menuAppointmentsRef = useRef<View>(null);
  const menuTutorialsRef = useRef<View>(null);

  useEffect(() => {
    registerRef("profile-hero", heroRef);
    registerRef("profile-menu-appointments", menuAppointmentsRef);
    registerRef("profile-menu-tutorials", menuTutorialsRef);
    return () => {
      unregisterRef("profile-hero");
      unregisterRef("profile-menu-appointments");
      unregisterRef("profile-menu-tutorials");
    };
  }, [registerRef, unregisterRef]);

  const { data: stats, refetch, isRefetching } = useQuery({
    queryKey: ["profile-stats", session?.user.id],
    queryFn: async () => {
      if (!session) return null;
      const [ordersResult, appointmentsResult] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", session.user.id),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("user_id", session.user.id)
          .in("status", ["pending", "confirmed"])
          .gte("scheduled_at", new Date().toISOString()),
      ]);
      return {
        orders: ordersResult.count || 0,
        upcomingAppointments: appointmentsResult.count || 0,
      };
    },
    enabled: !!session,
  });

  if (!profile) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const isCreator = profile.role === "creator" || profile.role === "admin";

  const menuItems = [
    {
      icon: "calendar",
      label: "Programările mele",
      onPress: () => router.push("/appointments"),
      badge: stats?.upcomingAppointments,
      iconColor: Colors.primary,
      iconBgColor: "rgba(10,102,194,0.1)",
      tutorialRef: menuAppointmentsRef,
    },
    {
      icon: "cart",
      label: "Comenzile mele",
      onPress: () => router.push("/orders"),
      iconColor: Colors.indigo,
      iconBgColor: "rgba(99,102,241,0.1)",
    },
    {
      icon: "play-circle",
      label: "Tutoriale aplicație",
      onPress: () => router.push("/tutorials"),
      iconColor: "#FF0033",
      iconBgColor: "rgba(255,0,51,0.1)",
      tutorialRef: menuTutorialsRef,
    },
    {
      icon: "chatbubble-ellipses",
      label: "Ajutor & Suport",
      onPress: () => router.push("/support"),
      iconColor: "#16a34a",
      iconBgColor: "rgba(22,163,74,0.1)",
    },
  ];

  return (
    <AnimatedScreen>
      <SafeAreaView style={s.safeArea} edges={["top"]}>
        <ScrollView
          style={s.scrollView}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.primary}
            />
          }
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(350)}>
            <View style={s.header}>
              <Image
                source={require("@/assets/logo-text.png")}
                style={s.headerLogo}
                resizeMode="contain"
              />
              <Pressable
                onPress={() => router.push("/settings")}
                className="w-10 h-10 items-center justify-center active:opacity-70"
                style={s.settingsBtn}
              >
                <Ionicons name="settings-outline" size={20} color={Colors.text} />
              </Pressable>
            </View>
          </Animated.View>

          {/* Profile Hero Card */}
          <Animated.View entering={FadeInDown.duration(400).delay(80)} style={{ marginTop: 4 }}>
            <View ref={heroRef}>
            <ProfileHero
              avatarUrl={profile.avatar_url}
              displayName={profile.display_name || profile.username}
              username={profile.username}
              bio={profile.bio}
              isCreator={isCreator}
              followers={profile.followers_count ?? 0}
              following={profile.following_count ?? 0}
              onEditProfile={() => router.push("/settings")}
            />
            </View>
          </Animated.View>

          {/* Menu */}
          <Animated.View entering={FadeInDown.duration(400).delay(160)} style={s.sectionGap}>
            <ProfileMenu items={menuItems} />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </AnimatedScreen>
  );
}

const s = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerLogo: {
    width: 100,
    height: 32,
  },
  settingsBtn: {
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    ...Bubble.radiiSm,
    ...Bubble.accent,
  },
  sectionGap: {
    marginTop: 14,
  },
});
