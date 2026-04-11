import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import type { AppointmentWithDetails } from "@/types/database";

export function useNextAppointment(): {
  nextAppointment: AppointmentWithDetails | null;
  isLoading: boolean;
  refetch: () => void;
} {
  const session = useAuthStore((s) => s.session);

  const { data: nextAppointment = null, isLoading, refetch } = useQuery<AppointmentWithDetails | null>({
    queryKey: ["next-appointment", session?.user.id],
    enabled: !!session,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          barber:barbers(*),
          service:barber_services(*),
          services:appointment_services(*, service:barber_services(*))
        `)
        .eq("user_id", session!.user.id)
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .single();

      // PGRST116 means no rows matched — not an error for this use case
      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }

      return data as AppointmentWithDetails;
    },
  });

  return { nextAppointment, isLoading, refetch };
}
