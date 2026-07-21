import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

// One recent-appointment row, trimmed to what preselection needs.
type LastBookedAppointmentRow = {
  id: string;
  barber_id: string;
  service_id: string | null;
  scheduled_at: string;
  services: { service_id: string; sort_order: number }[] | null;
  // Non-null managed_by_profile_id ⇒ booked for a dependent/guest, not the
  // account holder — those must not drive the holder's own preselection.
  salon_client: { managed_by_profile_id: string | null } | null;
};

export type LastBookedSource = "barber" | "salon";

const EMPTY_IDS: string[] = [];

/**
 * Service ids of the user's most recent non-cancelled appointment at
 * `salonId` — preferring an exact `barberId` match, falling back to the
 * salon's most recent appointment with any barber. One fetch per salon;
 * switching barbers reuses the cached rows (derivation is client-side).
 */
export function useLastBookedServices(
  salonId: string | null | undefined,
  barberId: string | null | undefined
): { serviceIds: string[]; source: LastBookedSource | null; isLoading: boolean } {
  const session = useAuthStore((s) => s.session);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["last-booked-services", session?.user.id, salonId],
    enabled: !!session && !!salonId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          `id, barber_id, service_id, scheduled_at,
           barber:barbers!inner(salon_id),
           services:appointment_services(service_id, sort_order),
           salon_client:salon_clients(managed_by_profile_id)`
        )
        .eq("user_id", session!.user.id)
        .eq("barber.salon_id", salonId!)
        .neq("status", "cancelled")
        .order("scheduled_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      const all = (data ?? []) as unknown as LastBookedAppointmentRow[];
      // Dependent/guest bookings don't count as "your" last service.
      return all.filter((r) => !r.salon_client?.managed_by_profile_id);
    },
  });

  const derived = useMemo(() => {
    const serviceIdsOf = (row: LastBookedAppointmentRow): string[] => {
      if (row.services && row.services.length > 0) {
        return [...row.services]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => s.service_id);
      }
      return row.service_id ? [row.service_id] : [];
    };

    if (rows && rows.length > 0) {
      const exact = barberId
        ? rows.find((r) => r.barber_id === barberId)
        : undefined;
      if (exact) {
        const ids = serviceIdsOf(exact);
        if (ids.length > 0) return { serviceIds: ids, source: "barber" as const };
      }
      const fallbackIds = serviceIdsOf(rows[0]);
      if (fallbackIds.length > 0) {
        return { serviceIds: fallbackIds, source: "salon" as const };
      }
    }
    return { serviceIds: EMPTY_IDS, source: null as LastBookedSource | null };
  }, [rows, barberId]);

  return { serviceIds: derived.serviceIds, source: derived.source, isLoading };
}
