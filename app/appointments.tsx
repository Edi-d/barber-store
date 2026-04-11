import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
  LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { AnimatedScreen } from "@/components/ui/AnimatedScreen";
import { ScreenHeader } from "@/components/shared/ScreenHeader";
import {
  AppointmentCard,
  formatDate,
  formatTime,
  isUpcoming,
} from "@/components/shared/AppointmentCard";
import { NewAppointmentCTA, TabEmptyState } from "@/components/appointments/AppointmentsCTA";
import { AppointmentsSkeleton, AppointmentsError } from "@/components/appointments/AppointmentSkeletons";
import { Colors } from "@/constants/theme";
import type { AppointmentWithDetails } from "@/types/database";

// ─── Tab filter ───────────────────────────────────────────────────────────────

type TabValue = "upcoming" | "past";

interface TabFilterProps {
  activeTab: TabValue;
  onTabChange: (tab: TabValue) => void;
  upcomingCount: number;
  pastCount: number;
}

function TabFilter({
  activeTab,
  onTabChange,
  upcomingCount,
  pastCount,
}: TabFilterProps) {
  const translateX = useSharedValue(0);
  const halfWidth = useSharedValue(0);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const trackWidth = e.nativeEvent.layout.width;
      const tabWidth = (trackWidth - 8) / 2;
      halfWidth.value = tabWidth;
      translateX.value = activeTab === "upcoming" ? 0 : tabWidth;
    },
    [activeTab]
  );

  const pillStyle = useAnimatedStyle(() => ({
    width: halfWidth.value,
    transform: [{ translateX: translateX.value }],
  }));

  const handlePress = (tab: TabValue) => {
    if (tab === activeTab) return;
    const target = tab === "upcoming" ? 0 : halfWidth.value;
    translateX.value = withSpring(target, {
      damping: 22,
      stiffness: 300,
      mass: 0.8,
    });
    onTabChange(tab);
  };

  return (
    <View className="px-4 pb-3 pt-1 bg-[#F0F4F8]">
      <View
        className="flex-row bg-[#E4EAF2] rounded-full p-1 relative"
        onLayout={handleLayout}
      >
        {/* Animated pill */}
        <Animated.View
          style={[
            pillStyle,
            {
              position: "absolute",
              top: 4,
              bottom: 4,
              left: 4,
              borderRadius: 9999,
              backgroundColor: Colors.gradientStart,
            },
          ]}
        />

        {/* Upcoming tab */}
        <Pressable
          onPress={() => handlePress("upcoming")}
          className="flex-1 flex-row items-center justify-center py-2 gap-1.5 z-10"
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "upcoming" }}
        >
          <Text
            className={
              activeTab === "upcoming"
                ? "text-[13px] text-white"
                : "text-[13px] text-[#65676B]"
            }
            style={{ fontFamily: "EuclidCircularA-SemiBold" }}
          >
            Viitoare
          </Text>
          {upcomingCount > 0 && (
            <View
              className={
                activeTab === "upcoming"
                  ? "rounded-full px-[5px] py-[1px] bg-white/30"
                  : "rounded-full px-[5px] py-[1px] bg-[#4481EB]/15"
              }
            >
              <Text
                className={
                  activeTab === "upcoming"
                    ? "text-[11px] text-white"
                    : "text-[11px] text-[#4481EB]"
                }
                style={{ fontFamily: "EuclidCircularA-SemiBold" }}
              >
                {upcomingCount}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Past tab */}
        <Pressable
          onPress={() => handlePress("past")}
          className="flex-1 flex-row items-center justify-center py-2 gap-1.5 z-10"
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "past" }}
        >
          <Text
            className={
              activeTab === "past"
                ? "text-[13px] text-white"
                : "text-[13px] text-[#65676B]"
            }
            style={{ fontFamily: "EuclidCircularA-SemiBold" }}
          >
            Istoric
          </Text>
          {pastCount > 0 && (
            <View
              className={
                activeTab === "past"
                  ? "rounded-full px-[5px] py-[1px] bg-white/30"
                  : "rounded-full px-[5px] py-[1px] bg-[#65676B]/15"
              }
            >
              <Text
                className={
                  activeTab === "past"
                    ? "text-[11px] text-white"
                    : "text-[11px] text-[#65676B]"
                }
                style={{ fontFamily: "EuclidCircularA-SemiBold" }}
              >
                {pastCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AppointmentsScreen() {
  const { session, isInitialized } = useAuthStore();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabValue>("upcoming");

  const {
    data: appointments,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["appointments", session?.user.id ?? "anonymous"],
    queryFn: async () => {
      if (!session) return [];

      const { data, error } = await supabase
        .from("appointments")
        .select(
          `
          *,
          barber:barbers(*),
          service:barber_services(*),
          services:appointment_services(*, service:barber_services(*))
        `
        )
        .eq("user_id", session.user.id)
        .order("scheduled_at", { ascending: false });

      if (error) {
        console.error("[appointments] Primary query failed:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });

        const { data: fallbackData, error: fallbackError } = await supabase
          .from("appointments")
          .select(
            `
            *,
            barber:barbers(*),
            service:barber_services(*)
          `
          )
          .eq("user_id", session.user.id)
          .order("scheduled_at", { ascending: false });

        if (fallbackError) {
          console.error("[appointments] Fallback query also failed:", {
            message: fallbackError.message,
            code: fallbackError.code,
            details: fallbackError.details,
            hint: fallbackError.hint,
          });
          throw fallbackError;
        }

        return (fallbackData ?? []) as AppointmentWithDetails[];
      }

      return (data ?? []) as AppointmentWithDetails[];
    },
    enabled: isInitialized,
    retry: 1,
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCancel = useCallback(
    (item: AppointmentWithDetails) => {
      Alert.alert(
        "Anulează programarea",
        `Ești sigur că vrei să anulezi programarea la ${item.barber?.name} din ${formatDate(item.scheduled_at)} la ${formatTime(item.scheduled_at)}?`,
        [
          { text: "Nu", style: "cancel" },
          {
            text: "Da, anulează",
            style: "destructive",
            onPress: async () => {
              const { error } = await supabase
                .from("appointments")
                .update({ status: "cancelled" })
                .eq("id", item.id);

              if (error) {
                Alert.alert(
                  "Eroare",
                  "Nu am putut anula programarea. Încearcă din nou."
                );
              } else {
                queryClient.invalidateQueries({ queryKey: ["appointments"] });
              }
            },
          },
        ]
      );
    },
    [queryClient]
  );

  const handleReschedule = useCallback((item: AppointmentWithDetails) => {
    const params: Record<string, string> = {};
    if (item.barber?.salon_id) {
      params.salonId = item.barber.salon_id;
    }
    if (item.service_id) {
      params.serviceId = item.service_id;
    }
    router.push({ pathname: "/book-appointment", params } as any);
  }, []);

  // ── Derived lists ─────────────────────────────────────────────────────────

  const upcomingAppointments = useMemo(
    () =>
      appointments?.filter(
        (a) => isUpcoming(a.scheduled_at) && a.status !== "cancelled"
      ) ?? [],
    [appointments]
  );

  const pastAppointments = useMemo(
    () =>
      appointments?.filter(
        (a) => !isUpcoming(a.scheduled_at) || a.status === "cancelled"
      ) ?? [],
    [appointments]
  );

  const displayedList =
    activeTab === "upcoming" ? upcomingAppointments : pastAppointments;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (!isInitialized || isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-[#F0F4F8]" edges={["top"]}>
        <ScreenHeader title="Programările mele" />
        <AppointmentsSkeleton />
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-[#F0F4F8]" edges={["top"]}>
        <ScreenHeader title="Programările mele" />
        <AppointmentsError onRetry={() => refetch()} />
      </SafeAreaView>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-[#F0F4F8]" edges={["top"]}>
      <ScreenHeader title="Programările mele" />

      <AnimatedScreen>
        <FlatList
          data={displayedList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingTop: 4,
            paddingBottom: 100,
            flexGrow: 1,
          }}
          ListHeaderComponent={
            <TabFilter
              activeTab={activeTab}
              onTabChange={setActiveTab}
              upcomingCount={upcomingAppointments.length}
              pastCount={pastAppointments.length}
            />
          }
          stickyHeaderIndices={[0]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.gradientStart}
            />
          }
          ListEmptyComponent={<TabEmptyState tab={activeTab} />}
          ListFooterComponent={
            activeTab === "upcoming" && upcomingAppointments.length > 0 ? (
              <View className="mt-2 mb-4 px-4">
                <NewAppointmentCTA />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <View className="mb-2.5 px-4">
              <AppointmentCard
                item={item}
                index={index}
                onCancel={handleCancel}
                onReschedule={handleReschedule}
              />
            </View>
          )}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
        />
      </AnimatedScreen>
    </SafeAreaView>
  );
}
