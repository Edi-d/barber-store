import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Card, Badge } from "@/components/ui";
import { AppointmentWithDetails } from "@/types/database";
import { formatPrice } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";

const statusConfig = {
  pending: { label: "În așteptare", variant: "warning" as const, icon: "time" as const },
  confirmed: { label: "Confirmat", variant: "success" as const, icon: "checkmark-circle" as const },
  completed: { label: "Finalizat", variant: "primary" as const, icon: "checkmark-done" as const },
  cancelled: { label: "Anulat", variant: "danger" as const, icon: "close-circle" as const },
  no_show: { label: "Neprezentare", variant: "danger" as const, icon: "alert-circle" as const },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  if (isToday) return "Astăzi";
  if (isTomorrow) return "Mâine";
  
  return date.toLocaleDateString("ro-RO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isUpcoming(dateString: string): boolean {
  return new Date(dateString) > new Date();
}

export default function AppointmentsScreen() {
  const { session } = useAuthStore();

  const { data: appointments, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["appointments", session?.user.id],
    queryFn: async () => {
      if (!session) return [];

      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          barber:barbers(*),
          service:barber_services(*)
        `)
        .eq("user_id", session.user.id)
        .order("scheduled_at", { ascending: false });

      if (error) throw error;
      return data as AppointmentWithDetails[];
    },
    enabled: !!session,
  });

  // Separate upcoming and past appointments
  const upcomingAppointments = appointments?.filter(
    (a) => isUpcoming(a.scheduled_at) && a.status !== "cancelled"
  ) || [];
  const pastAppointments = appointments?.filter(
    (a) => !isUpcoming(a.scheduled_at) || a.status === "cancelled"
  ) || [];

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#0a66c2" />
      </View>
    );
  }

  const renderAppointment = ({ item }: { item: AppointmentWithDetails }) => {
    const status = statusConfig[item.status as keyof typeof statusConfig] || statusConfig.pending;
    const upcoming = isUpcoming(item.scheduled_at) && item.status !== "cancelled";

    return (
      <Card className={upcoming ? "border-primary-200 bg-primary-50/30" : ""}>
        {/* Date & Status Header */}
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-row items-center">
            <View className="w-12 h-12 bg-primary-100 rounded-xl items-center justify-center mr-3">
              <Ionicons name="calendar" size={24} color="#0a66c2" />
            </View>
            <View>
              <Text className="text-dark-700 font-bold text-base">
                {formatDate(item.scheduled_at)}
              </Text>
              <Text className="text-dark-500 text-sm">
                {formatTime(item.scheduled_at)} • {item.duration_min} min
              </Text>
            </View>
          </View>
          <Badge variant={status.variant} size="sm">
            <Ionicons name={status.icon} size={12} color="white" /> {status.label}
          </Badge>
        </View>

        {/* Service Info */}
        <View className="border-t border-dark-300 pt-3">
          <Text className="text-dark-700 font-semibold text-base">
            {item.service?.name}
          </Text>
          {item.service?.description && (
            <Text className="text-dark-500 text-sm mt-1" numberOfLines={2}>
              {item.service.description}
            </Text>
          )}
        </View>

        {/* Barber Info */}
        <View className="flex-row items-center mt-3 pt-3 border-t border-dark-300">
          <View className="w-10 h-10 bg-dark-300 rounded-full items-center justify-center overflow-hidden mr-3">
            {item.barber?.avatar_url ? (
              <View className="w-full h-full bg-dark-400" />
            ) : (
              <Ionicons name="person" size={20} color="#64748b" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-dark-600 text-sm">Frizer</Text>
            <Text className="text-dark-700 font-medium">{item.barber?.name}</Text>
          </View>
          <Text className="text-dark-700 font-bold text-lg">
            {formatPrice(item.total_cents, item.currency)}
          </Text>
        </View>

        {/* Notes */}
        {item.notes && (
          <View className="mt-3 pt-3 border-t border-dark-300">
            <Text className="text-dark-500 text-sm italic">"{item.notes}"</Text>
          </View>
        )}

        {/* Actions for upcoming appointments */}
        {upcoming && item.status !== "completed" && (
          <View className="flex-row gap-3 mt-4 pt-3 border-t border-dark-300">
            <Pressable 
              className="flex-1 flex-row items-center justify-center py-2.5 bg-dark-200 rounded-xl"
              onPress={() => {
                // TODO: Cancel appointment
              }}
            >
              <Ionicons name="close-outline" size={18} color="#64748b" />
              <Text className="text-dark-600 font-medium ml-1.5">Anulează</Text>
            </Pressable>
            <Pressable 
              className="flex-1 flex-row items-center justify-center py-2.5 bg-primary-500 rounded-xl"
              onPress={() => {
                // TODO: Reschedule
              }}
            >
              <Ionicons name="calendar-outline" size={18} color="white" />
              <Text className="text-white font-medium ml-1.5">Reprogramează</Text>
            </Pressable>
          </View>
        )}
      </Card>
    );
  };

  const ListHeader = () => (
    <>
      {/* Upcoming Section */}
      {upcomingAppointments.length > 0 && (
        <View className="mb-4">
          <Text className="text-dark-700 font-bold text-lg mb-3">
            Programări viitoare
          </Text>
          {upcomingAppointments.map((appointment) => (
            <View key={appointment.id} className="mb-3">
              {renderAppointment({ item: appointment })}
            </View>
          ))}
        </View>
      )}

      {/* New Appointment CTA */}
      <Card 
        className="mb-4 bg-gradient-to-r border-primary-200"
        onPress={() => {
          // TODO: Navigate to booking flow
        }}
      >
        <View className="flex-row items-center">
          <View className="w-14 h-14 bg-primary-500 rounded-2xl items-center justify-center mr-4">
            <Ionicons name="add" size={28} color="white" />
          </View>
          <View className="flex-1">
            <Text className="text-dark-700 font-bold text-base">
              Programare nouă
            </Text>
            <Text className="text-dark-500 text-sm mt-0.5">
              Rezervă-ți locul la frizer
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#0a66c2" />
        </View>
      </Card>

      {/* Past appointments header */}
      {pastAppointments.length > 0 && (
        <Text className="text-dark-700 font-bold text-lg mb-3">
          Istoric programări
        </Text>
      )}
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-dark-300 bg-white">
        <Pressable onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </Pressable>
        <Text className="text-dark-700 text-xl font-bold">Programările mele</Text>
      </View>

      <FlatList
        data={pastAppointments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#0a66c2"
          />
        }
        ListEmptyComponent={
          upcomingAppointments.length === 0 ? (
            <View className="items-center justify-center py-12 bg-white rounded-xl">
              <Ionicons name="calendar-outline" size={64} color="#64748b" />
              <Text className="text-dark-700 text-lg font-bold mt-4">
                Nicio programare încă
              </Text>
              <Text className="text-dark-500 mt-2 text-center px-6">
                Rezervă-ți prima programare la frizer
              </Text>
              <Pressable 
                className="mt-6 px-6 py-3 bg-primary-500 rounded-xl flex-row items-center"
                onPress={() => {
                  // TODO: Navigate to booking
                }}
              >
                <Ionicons name="add-circle" size={20} color="white" />
                <Text className="text-white font-semibold ml-2">Programare nouă</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={renderAppointment}
      />
    </SafeAreaView>
  );
}
