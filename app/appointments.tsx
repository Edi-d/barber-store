import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ScrollView,
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
import { PackageGroupCard } from "@/components/shared/PackageGroupCard";
import { Bubble, Colors } from "@/constants/theme";
import type { AppointmentWithDetails } from "@/types/database";

// A row in the list is either a single appointment or a recurring-package group
// (all upcoming occurrences of one package collapsed into one card).
type ListItem =
  | { kind: "single"; appt: AppointmentWithDetails }
  | { kind: "package"; packageId: string; appts: AppointmentWithDetails[] };

// ─── Tab filter ───────────────────────────────────────────────────────────────

type TabValue = "upcoming" | "past";

// Status chips shown under the tabs. Only statuses actually present in the
// active tab get a chip, so a tab never offers a filter that yields nothing
// (e.g. "Finalizate" on Viitoare). Order here is the order they render in.
type StatusValue = AppointmentWithDetails["status"];
type StatusFilter = "all" | StatusValue;

const STATUS_ORDER: StatusValue[] = [
  "confirmed",
  "pending",
  "completed",
  "cancelled",
  "no_show",
];

// Matches the badge copy on the cards themselves (AppointmentCard).
const STATUS_FILTER_LABELS: Record<StatusValue, string> = {
  confirmed: "Confirmate",
  pending: "În așteptare",
  completed: "Finalizate",
  cancelled: "Anulate",
  no_show: "Neprezentate",
};

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
        className="flex-row bg-[#E4EAF2] p-1 relative"
        style={Bubble.radii}
        onLayout={handleLayout}
      >
        {/* Animated pill — bubble corners nested concentrically inside the
            track (track radii minus the 4px inset) so it keeps the app's
            asymmetric "bubble" shape in both positions. */}
        <Animated.View
          style={[
            pillStyle,
            {
              position: "absolute",
              top: 4,
              bottom: 4,
              left: 4,
              borderTopLeftRadius: 21,
              borderTopRightRadius: 8,
              borderBottomRightRadius: 21,
              borderBottomLeftRadius: 21,
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

// ─── Status chips ─────────────────────────────────────────────────────────────

interface StatusChipsProps {
  /** Statuses present in the active tab, already in STATUS_ORDER order. */
  available: StatusValue[];
  active: StatusFilter;
  onChange: (next: StatusFilter) => void;
  /** Per-status counts within the active tab, for the chip badges. */
  counts: Record<string, number>;
  totalCount: number;
}

function StatusChips({
  available,
  active,
  onChange,
  counts,
  totalCount,
}: StatusChipsProps) {
  // A single status means the chips carry no information — hide the row.
  if (available.length < 2) return null;

  const chips: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "Toate", count: totalCount },
    ...available.map((s) => ({
      value: s as StatusFilter,
      label: STATUS_FILTER_LABELS[s],
      count: counts[s] ?? 0,
    })),
  ];

  return (
    <View className="bg-[#F0F4F8] pb-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {chips.map((chip) => {
          const isActive = chip.value === active;
          return (
            <Pressable
              key={chip.value}
              onPress={() => onChange(chip.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              className={
                isActive
                  ? "flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#4481EB]"
                  : "flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#E4EAF2]"
              }
            >
              <Text
                className={
                  isActive ? "text-[12px] text-white" : "text-[12px] text-[#65676B]"
                }
                style={{ fontFamily: "EuclidCircularA-SemiBold" }}
              >
                {chip.label}
              </Text>
              <Text
                className={
                  isActive ? "text-[11px] text-white/70" : "text-[11px] text-[#9AA5B1]"
                }
                style={{ fontFamily: "EuclidCircularA-SemiBold" }}
              >
                {chip.count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AppointmentsScreen() {
  const { session, isInitialized } = useAuthStore();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabValue>("upcoming");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
          services:appointment_services(*, service:barber_services(*)),
          salon_client:salon_clients(first_name, last_name, managed_by_profile_id)
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
              const { data: updated, error } = await supabase
                .from("appointments")
                .update({ status: "cancelled" })
                .eq("id", item.id)
                .in("status", ["pending", "confirmed"])
                .select("id");

              if (error) {
                Alert.alert(
                  "Eroare",
                  "Nu am putut anula programarea. Încearcă din nou."
                );
                return;
              }

              if (!updated || updated.length === 0) {
                Alert.alert(
                  "Programarea nu a mai putut fi anulată",
                  "Statusul programării s-a schimbat între timp. Reîmprospătăm lista."
                );
                refetch();
                return;
              }

              // Cancel frees a slot — invalidate every cache that may show
              // availability or the next upcoming appointment.
              queryClient.invalidateQueries({ queryKey: ["appointments"] });
              queryClient.invalidateQueries({ queryKey: ["appointments-upcoming"] });
              queryClient.invalidateQueries({ queryKey: ["next-appointment"] });
              queryClient.invalidateQueries({ queryKey: ["today-appointments-all"] });
              queryClient.invalidateQueries({ queryKey: ["time-slots"] });
              queryClient.invalidateQueries({ queryKey: ["first-available-date"] });
            },
          },
        ]
      );
    },
    [queryClient, refetch]
  );

  const handleCancelPackage = useCallback(
    (packageId: string, remaining: number) => {
      Alert.alert(
        "Anulează pachetul",
        `Se vor anula toate cele ${remaining} programări viitoare din acest pachet. Programările trecute rămân neschimbate. Continui?`,
        [
          { text: "Nu", style: "cancel" },
          {
            text: "Da, anulează pachetul",
            style: "destructive",
            onPress: async () => {
              const { error } = await supabase.rpc("cancel_recurring_package", {
                p_package_id: packageId,
              });

              if (error) {
                Alert.alert(
                  "Eroare",
                  "Nu am putut anula pachetul. Încearcă din nou."
                );
                return;
              }

              queryClient.invalidateQueries({ queryKey: ["appointments"] });
              queryClient.invalidateQueries({ queryKey: ["appointments-upcoming"] });
              queryClient.invalidateQueries({ queryKey: ["next-appointment"] });
              queryClient.invalidateQueries({ queryKey: ["today-appointments-all"] });
              queryClient.invalidateQueries({ queryKey: ["time-slots"] });
              queryClient.invalidateQueries({ queryKey: ["first-available-date"] });
            },
          },
        ]
      );
    },
    [queryClient]
  );

  // Live members of each booking group (non-cancelled), keyed by
  // booking_group_id. Drives the "group" badge and the per-person vs
  // whole-group reschedule choice below.
  const groupMembersById = useMemo(() => {
    const map = new Map<string, AppointmentWithDetails[]>();
    for (const a of appointments ?? []) {
      if (!a.booking_group_id || a.status === "cancelled") continue;
      const arr = map.get(a.booking_group_id);
      if (arr) arr.push(a);
      else map.set(a.booking_group_id, [a]);
    }
    return map;
  }, [appointments]);

  const handleReschedule = useCallback(
    (item: AppointmentWithDetails) => {
      // Single-appointment reschedule (existing behavior): rebook just this
      // person and cancel just this row once the new booking is confirmed —
      // otherwise a reschedule leaves the old appointment active.
      const rescheduleSingle = () => {
        const params: Record<string, string> = { rescheduleId: item.id };
        if (item.barber?.salon_id) params.salonId = item.barber.salon_id;
        if (item.barber_id) params.barberId = item.barber_id;
        // Prefer junction-table service ids; fall back to legacy service_id.
        const serviceIds =
          item.services && item.services.length > 0
            ? item.services.map((s) => s.service_id).join(",")
            : item.service_id ?? "";
        if (serviceIds) params.serviceIds = serviceIds;
        // Preserve who it's for: a dependent/guest booking exposes its managed
        // CRM row (RLS). Without this the rebooking would default to "self",
        // silently reassigning the appointment to the account holder.
        if (item.salon_client?.managed_by_profile_id && item.salon_client_id) {
          params.rescheduleForClientId = item.salon_client_id;
          const name = [item.salon_client.first_name, item.salon_client.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();
          if (name) params.rescheduleForName = name;
        }
        router.push({ pathname: "/book-appointment", params } as any);
      };

      // Whole-group reschedule: book-appointment reconstructs every person in
      // the group from booking_group_id (services + who each is for) and
      // cancels all their original rows once the new group booking confirms.
      const rescheduleGroup = () => {
        const params: Record<string, string> = {
          rescheduleGroupId: item.booking_group_id!,
        };
        if (item.barber?.salon_id) params.salonId = item.barber.salon_id;
        if (item.barber_id) params.barberId = item.barber_id;
        router.push({ pathname: "/book-appointment", params } as any);
      };

      const members = item.booking_group_id
        ? groupMembersById.get(item.booking_group_id) ?? []
        : [];

      // Solo booking (or the rest of the group was already cancelled) — no
      // choice to offer.
      if (members.length <= 1) {
        rescheduleSingle();
        return;
      }

      // A dependent row exposes its name (RLS); the account holder's own row is
      // not readable, so a self appointment falls back to "programarea mea".
      const dependentName = item.salon_client?.managed_by_profile_id
        ? [item.salon_client.first_name, item.salon_client.last_name]
            .filter(Boolean)
            .join(" ")
            .trim()
        : "";

      Alert.alert(
        "Reprogramează",
        `Această programare face parte dintr-un grup de ${members.length} persoane. Ce vrei să reprogramezi?`,
        [
          {
            text: dependentName ? `Doar ${dependentName}` : "Doar programarea mea",
            onPress: rescheduleSingle,
          },
          {
            text: `Toată programarea (${members.length})`,
            onPress: rescheduleGroup,
          },
          { text: "Renunță", style: "cancel" },
        ]
      );
    },
    [groupMembersById]
  );

  // ── Derived lists ─────────────────────────────────────────────────────────

  const upcomingAppointments = useMemo(
    () =>
      (
        appointments?.filter(
          (a) => isUpcoming(a.scheduled_at) && a.status !== "cancelled"
        ) ?? []
      )
        // The query returns newest-first, which for upcoming means the most
        // DISTANT appointment lands on top. Soonest-first is what this tab means.
        .slice()
        .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)),
    [appointments]
  );

  const pastAppointments = useMemo(() => {
    const rows =
      appointments?.filter(
        (a) => !isUpcoming(a.scheduled_at) || a.status === "cancelled"
      ) ?? [];

    // A cancelled booking for a future date belongs in history (it isn't
    // happening) but it hasn't happened *yet* — sorting the whole bucket by
    // scheduled_at alone floats those to the top and buries everything that
    // actually took place. So: elapsed first (newest first), then the
    // cancelled-but-still-future ones (soonest first).
    const now = Date.now();
    const at = (a: AppointmentWithDetails) => +new Date(a.scheduled_at);

    return rows.slice().sort((a, b) => {
      const aPending = at(a) > now;
      const bPending = at(b) > now;
      if (aPending !== bPending) return aPending ? 1 : -1;
      return aPending ? at(a) - at(b) : at(b) - at(a);
    });
  }, [appointments]);

  // ── Status filter, scoped to the active tab ───────────────────────────────
  const tabAppointments =
    activeTab === "upcoming" ? upcomingAppointments : pastAppointments;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of tabAppointments) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    return counts;
  }, [tabAppointments]);

  const availableStatuses = useMemo(
    () => STATUS_ORDER.filter((s) => (statusCounts[s] ?? 0) > 0),
    [statusCounts]
  );

  // Switching tabs (or the active status disappearing after a cancel/refetch)
  // must not strand the list on a filter that no longer exists.
  const effectiveStatus: StatusFilter =
    statusFilter !== "all" && !availableStatuses.includes(statusFilter)
      ? "all"
      : statusFilter;

  const filteredTabAppointments = useMemo(
    () =>
      effectiveStatus === "all"
        ? tabAppointments
        : tabAppointments.filter((a) => a.status === effectiveStatus),
    [tabAppointments, effectiveStatus]
  );

  // Upcoming tab: collapse each recurring package's occurrences into one group
  // card (placed where its first occurrence appears in the list). Past tab keeps
  // occurrences individual (normal history).
  const displayedList = useMemo<ListItem[]>(() => {
    if (activeTab === "past") {
      return filteredTabAppointments.map((a) => ({ kind: "single", appt: a }));
    }

    const items: ListItem[] = [];
    const seen = new Set<string>();
    for (const a of filteredTabAppointments) {
      if (a.package_id) {
        if (seen.has(a.package_id)) continue;
        seen.add(a.package_id);
        items.push({
          kind: "package",
          packageId: a.package_id,
          appts: filteredTabAppointments.filter((x) => x.package_id === a.package_id),
        });
      } else {
        items.push({ kind: "single", appt: a });
      }
    }
    return items;
  }, [activeTab, filteredTabAppointments]);

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
          keyExtractor={(item) =>
            item.kind === "package" ? `pkg-${item.packageId}` : item.appt.id
          }
          contentContainerStyle={{
            paddingTop: 4,
            paddingBottom: 100,
            flexGrow: 1,
          }}
          ListHeaderComponent={
            <>
              <TabFilter
                activeTab={activeTab}
                onTabChange={(tab) => {
                  // Each tab carries its own status vocabulary, so a filter
                  // never survives the switch.
                  setStatusFilter("all");
                  setActiveTab(tab);
                }}
                upcomingCount={upcomingAppointments.length}
                pastCount={pastAppointments.length}
              />
              <StatusChips
                available={availableStatuses}
                active={effectiveStatus}
                onChange={setStatusFilter}
                counts={statusCounts}
                totalCount={tabAppointments.length}
              />
            </>
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
              {item.kind === "package" ? (
                <PackageGroupCard
                  appts={item.appts}
                  index={index}
                  onCancelPackage={handleCancelPackage}
                  onReschedule={handleReschedule}
                />
              ) : (
                <AppointmentCard
                  item={item.appt}
                  index={index}
                  onCancel={handleCancel}
                  onReschedule={handleReschedule}
                  groupSize={
                    item.appt.booking_group_id
                      ? groupMembersById.get(item.appt.booking_group_id)?.length ?? 1
                      : 1
                  }
                />
              )}
            </View>
          )}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
        />
      </AnimatedScreen>
    </SafeAreaView>
  );
}
