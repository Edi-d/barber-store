import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Barber, BarberService } from "@/types/database";
import { formatPrice } from "@/lib/utils";
import { generateTimeSlots, getNext14Days, formatCalendarDay, findFirstAvailableDate, findSoonestAvailableBarber } from "@/lib/booking";
import {
  fetchSalonExtendedHours,
  surchargedTotalCents,
  surchargeLabel,
  extensionCoversService,
} from "@/lib/extended-hours";
import { addBookingToCalendar, openAppSettings, CalendarError } from "@/lib/calendar";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button } from "@/components/ui/Button";
import { Bubble, Colors, Typography, Shadows } from "@/constants/theme";
import { useTutorialContext } from "@/components/tutorial/TutorialProvider";
import type { BookAppointmentResult as RpcBookResult } from "@/types/database";

// ── Animated components ──────────────────────────────────────────────────────
import { BookingStepIndicator } from "@/components/shared/BookingStepIndicator";
import { BarberCard } from "@/components/shared/BarberCard";
import { AnyBarberCard } from "@/components/shared/AnyBarberCard";
import { ServiceCard } from "@/components/shared/ServiceCard";
import { BookingDatePicker } from "@/components/shared/BookingDatePicker";
import { BookingTimeGrid } from "@/components/shared/BookingTimeGrid";
import { BookingConfirmation } from "@/components/shared/BookingConfirmation";
import { BookingSuccess, BookingSuccessResult } from "@/components/shared/BookingSuccess";
import { BookingFloatingBar } from "@/components/shared/BookingFloatingBar";

type BookingStep = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<BookingStep, string> = {
  1: "Alege Frizer",
  2: "Alege Servicii",
  3: "Alege Data & Ora",
  4: "Confirmare",
};

const squircleSm = { ...Bubble.radiiSm };

export default function BookAppointmentScreen() {
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const { salonId: rawSalonId, serviceId, serviceIds: rawServiceIds, barberId } = useLocalSearchParams<{
    salonId?: string;
    serviceId?: string;
    serviceIds?: string;
    barberId?: string;
  }>();
  const salonId = rawSalonId && rawSalonId.length > 0 ? rawSalonId : undefined;

  const [step, setStep] = useState<BookingStep>(1);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedServices, setSelectedServices] = useState<BarberService[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingCalendar, setIsAddingCalendar] = useState(false);
  const [calendarEventAdded, setCalendarEventAdded] = useState(false);
  const [paramsApplied, setParamsApplied] = useState(false);
  const [isResolvingAnyBarber, setIsResolvingAnyBarber] = useState(false);
  const [bookingResult, setBookingResult] =
    useState<BookingSuccessResult | null>(null);

  // ── Tutorial refs ────────────────────────────────────────────────────────
  const { registerRef, unregisterRef } = useTutorialContext();

  // Tracks whether the user has manually visited step 2 at least once
  const step2VisitedRef = useRef(false);

  // Re-entrancy guard for handleSubmit — set synchronously to prevent double-tap
  const submittingRef = useRef(false);

  // Step 1
  const stepIndicatorRef = useRef<View>(null);
  const barberCardRef = useRef<View>(null);
  const barberSelectedRef = useRef<View>(null);
  // Step 2
  const serviceCardRef = useRef<View>(null);
  const serviceCheckboxRef = useRef<View>(null);
  const floatingBarRef = useRef<View>(null);
  const continueBtnRef = useRef<View>(null);
  // Step 3
  const datePickerRef = useRef<View>(null);
  const timeMorningRef = useRef<View>(null);
  const timeAfternoonRef = useRef<View>(null);
  const timeCtaRef = useRef<View>(null);
  // Step 4 — passed down to BookingConfirmation
  const summaryCardRef = useRef<View>(null);
  const notesInputRef = useRef<View>(null);
  const confirmBtnRef = useRef<View>(null);

  useEffect(() => {
    registerRef("booking-step-indicator", stepIndicatorRef);
    registerRef("booking-barber-card", barberCardRef);
    registerRef("booking-barber-selected", barberSelectedRef);
    registerRef("booking-service-card", serviceCardRef);
    registerRef("booking-service-checkbox", serviceCheckboxRef);
    registerRef("booking-floating-bar", floatingBarRef);
    registerRef("booking-continue-btn", continueBtnRef);
    registerRef("booking-date-picker", datePickerRef);
    registerRef("booking-time-morning", timeMorningRef);
    registerRef("booking-time-afternoon", timeAfternoonRef);
    registerRef("booking-time-cta", timeCtaRef);
    registerRef("booking-summary-card", summaryCardRef);
    registerRef("booking-notes-input", notesInputRef);
    registerRef("booking-confirm-btn", confirmBtnRef);

    return () => {
      unregisterRef("booking-step-indicator");
      unregisterRef("booking-barber-card");
      unregisterRef("booking-barber-selected");
      unregisterRef("booking-service-card");
      unregisterRef("booking-service-checkbox");
      unregisterRef("booking-floating-bar");
      unregisterRef("booking-continue-btn");
      unregisterRef("booking-date-picker");
      unregisterRef("booking-time-morning");
      unregisterRef("booking-time-afternoon");
      unregisterRef("booking-time-cta");
      unregisterRef("booking-summary-card");
      unregisterRef("booking-notes-input");
      unregisterRef("booking-confirm-btn");
    };
  }, [registerRef, unregisterRef]);

  // ── Derived totals ───────────────────────────────────────────────────────
  const totalDurationMin = useMemo(
    () => selectedServices.reduce((acc, s) => acc + s.duration_min, 0),
    [selectedServices]
  );
  const totalPriceCents = useMemo(
    () => selectedServices.reduce((acc, s) => acc + s.price_cents, 0),
    [selectedServices]
  );
  const primaryCurrency = useMemo(
    () => selectedServices[0]?.currency ?? "RON",
    [selectedServices]
  );

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: barbers, isLoading: barbersLoading, error: barbersError, refetch: refetchBarbers } = useQuery({
    queryKey: ["barbers", salonId || "all"],
    queryFn: async () => {
      // Embed the linked profile so the avatar can be backfilled when
      // barbers.avatar_url is NULL (typical for the salon owner).
      let query = supabase
        .from("barbers")
        .select("*, profile:profiles(avatar_url)")
        .eq("active", true)
        .order("name");
      if (salonId) query = query.eq("salon_id", salonId);
      const { data, error } = await query;
      if (error) throw error;
      return data as (Barber & { profile: { avatar_url: string | null } | null })[];
    },
  });

  // Authoritative roles live in salon_members.role (barbers.role defaults to
  // 'owner' and is unreliable). Fetch the salon's roster keyed by profile_id.
  const { data: memberRoles } = useQuery({
    queryKey: ["salon-member-roles", salonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salon_members")
        .select("profile_id, role")
        .eq("salon_id", salonId!);
      if (error) throw error;
      return data as { profile_id: string; role: string }[];
    },
    enabled: !!salonId,
  });

  const roleByProfileId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of memberRoles ?? []) map.set(m.profile_id, m.role);
    return map;
  }, [memberRoles]);

  // Owner always first, then the rest of the team alphabetically. Owner is
  // resolved from the authoritative salon_members role (same source the card
  // badge uses); in the cross-salon "all" view that map is empty, so the list
  // simply stays alphabetical. The query already returns rows by name, so
  // within each group order is preserved.
  const sortedBarbers = useMemo(() => {
    if (!barbers) return barbers;
    const isOwner = (b: Barber) =>
      b.profile_id ? roleByProfileId.get(b.profile_id) === "owner" : false;
    return [...barbers].sort((a, b) => {
      const ao = isOwner(a);
      const bo = isOwner(b);
      if (ao !== bo) return ao ? -1 : 1;
      return a.name.localeCompare(b.name, "ro");
    });
  }, [barbers, roleByProfileId]);

  // Effective salon ID: prefer the barber's own salon_id once a barber is selected
  const effectiveSalonId = selectedBarber?.salon_id ?? salonId;

  // Barber-service assignments: which services this specific barber is assigned to.
  // RLS: viewable by everyone (migration 011). Zero rows = all salon services are allowed.
  const { data: barberAssignments } = useQuery({
    queryKey: ["barber-assignments", selectedBarber?.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_service_assignments")
        .select("service_id")
        .eq("barber_id", selectedBarber!.id);
      if (error) throw error;
      return data as { service_id: string }[];
    },
    enabled: !!selectedBarber,
  });

  const { data: services, isLoading: servicesLoading, error: servicesError, refetch: refetchServices } = useQuery({
    queryKey: ["barber-services", selectedBarber?.salon_id ?? salonId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("barber_services")
        .select("*")
        .eq("active", true)
        .order("price_cents");
      // Filter by the barber's salon when known
      if (effectiveSalonId) query = query.eq("salon_id", effectiveSalonId);
      const { data, error } = await query;
      if (error) throw error;
      return data as BarberService[];
    },
  });

  // Services visible in step 2: if the barber has explicit assignments, restrict to those
  const visibleServices = useMemo<BarberService[]>(() => {
    if (!services) return [];
    if (!barberAssignments || barberAssignments.length === 0) return services;
    const allowed = new Set(barberAssignments.map((a) => a.service_id));
    return services.filter((s) => allowed.has(s.id));
  }, [services, barberAssignments]);

  // Salon extended-hours config (after-close window + surcharge), keyed by
  // weekday. Drives the surcharge preview; the book_appointment RPC enforces it.
  const { data: extendedHoursByDay } = useQuery({
    queryKey: ["salon-extended-hours", effectiveSalonId ?? "none"],
    queryFn: () => fetchSalonExtendedHours(effectiveSalonId!),
    enabled: !!effectiveSalonId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: timeSlots, isLoading: slotsLoading, isError: slotsError, refetch: refetchSlots } = useQuery({
    queryKey: [
      "time-slots",
      selectedBarber?.id,
      selectedDate?.toISOString(),
      totalDurationMin,
    ],
    queryFn: async () => {
      if (!selectedBarber || !selectedDate || totalDurationMin === 0) return [];
      return generateTimeSlots(
        selectedBarber.id,
        selectedDate,
        totalDurationMin,
        selectedBarber.salon_id
      );
    },
    enabled: !!selectedBarber && !!selectedDate && totalDurationMin > 0,
    staleTime: 30_000, // Override global 5-min staleTime — slots go stale quickly
  });

  // ── Extended-hours surcharge (preview only; RPC is authoritative) ──────────
  // The chosen slot is "extended" when generateTimeSlots tagged it so (start at/
  // after the salon's normal close). Surcharge the displayed total and flag any
  // selected service that isn't allowed in the extended window.
  const selectedExtension = useMemo(() => {
    if (!selectedDate || !extendedHoursByDay) return undefined;
    return extendedHoursByDay.get(selectedDate.getDay());
  }, [selectedDate, extendedHoursByDay]);

  const isExtendedSlot = useMemo(() => {
    if (!selectedTime || !timeSlots) return false;
    return timeSlots.find((s) => s.time === selectedTime)?.extended === true;
  }, [selectedTime, timeSlots]);

  const surchargeCents = useMemo(() => {
    if (!isExtendedSlot || !selectedExtension) return 0;
    return surchargedTotalCents(totalPriceCents, selectedExtension) - totalPriceCents;
  }, [isExtendedSlot, selectedExtension, totalPriceCents]);

  const extendedServiceBlocked = useMemo(() => {
    if (!isExtendedSlot || !selectedExtension) return false;
    return selectedServices.some((s) => !extensionCoversService(selectedExtension, s.id));
  }, [isExtendedSlot, selectedExtension, selectedServices]);

  const effectiveTotalCents = totalPriceCents + surchargeCents;

  // Find first available date (checks schedule + appointments)
  const { data: firstAvailableData } = useQuery({
    queryKey: ["first-available-date", selectedBarber?.id, totalDurationMin],
    queryFn: () => findFirstAvailableDate(selectedBarber!.id, totalDurationMin || 30, selectedBarber!.salon_id),
    enabled: !!selectedBarber && totalDurationMin > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Auto-select first available date when entering step 3
  useEffect(() => {
    if (step === 3 && firstAvailableData && !selectedDate) {
      if (firstAvailableData.date) {
        setSelectedDate(firstAvailableData.date);
        setSelectedTime(null);
      }
    }
  }, [step, firstAvailableData, selectedDate]);

  // ── Auto-apply route params ────────────────────────────────────────────
  useEffect(() => {
    // Clobber guard: if the user already interacted, params are no longer relevant
    if (selectedBarber || selectedServices.length > 0) {
      setParamsApplied(true);
      return;
    }

    if (paramsApplied || !barbers || ((serviceId || rawServiceIds) && !services)) return;

    // Resolve service(s) from params: support both serviceId and serviceIds (comma-separated)
    const resolveParamServices = (): BarberService[] => {
      if (!services) return [];
      const ids = new Set<string>();
      if (serviceId) ids.add(serviceId);
      if (rawServiceIds) rawServiceIds.split(",").forEach((id) => ids.add(id.trim()));
      return services.filter((s) => ids.has(s.id));
    };

    // If barberId is provided, pre-select that barber and skip to step 2
    if (barberId) {
      const barber = barbers.find((b) => b.id === barberId);
      if (barber) {
        setSelectedBarber(barber);
        const resolved = resolveParamServices();
        if (resolved.length > 0) {
          setSelectedServices(resolved);
          setStep(3); // Skip to date/time
        } else {
          setStep(2); // Go to services
        }
        setParamsApplied(true);
        return;
      }
    }

    if (salonId && barbers.length === 1) {
      setSelectedBarber(barbers[0]);
      const resolved = resolveParamServices();
      if (resolved.length > 0) {
        setSelectedServices(resolved);
        setStep(3);
      } else {
        setStep(2);
      }
      setParamsApplied(true);
      return;
    }

    if (salonId && barbers.length > 1) {
      const resolved = resolveParamServices();
      if (resolved.length > 0) setSelectedServices(resolved);
      setStep(1);
      setParamsApplied(true);
      return;
    }

    if (!salonId) {
      setParamsApplied(true);
    }
  }, [barberId, salonId, serviceId, rawServiceIds, barbers, services, paramsApplied, selectedBarber, selectedServices.length]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (step === 1) {
      if (selectedServices.length > 0 && !step2VisitedRef.current) {
        // Deep-link shortcut: services pre-selected and user hasn't visited step 2 yet
        setStep(3);
      } else {
        setStep(2);
      }
    } else if (step < 4) {
      setStep((step + 1) as BookingStep);
    }
  }, [step, selectedServices]);

  const goBack = useCallback(() => {
    if (step === 2 && salonId && barbers && barbers.length === 1) {
      // Single-barber salon: no step 1 to return to
      router.back();
    } else if (
      step === 3 &&
      salonId &&
      barbers &&
      barbers.length === 1 &&
      selectedServices.length > 0 &&
      !step2VisitedRef.current
    ) {
      // Single-barber + pre-selected service + step 2 never manually visited = exit
      router.back();
    } else if (step === 3) {
      // Going back from date/time to services: clear date/time so auto-select works fresh
      setSelectedTime(null);
      setSelectedDate(null);
      setStep(2);
    } else if (step > 1) {
      setStep((step - 1) as BookingStep);
    } else {
      router.back();
    }
  }, [step, salonId, barbers, selectedServices]);

  // ── Toggle service selection ───────────────────────────────────────────
  const toggleService = useCallback((service: BarberService) => {
    setSelectedServices((prev) => {
      const exists = prev.some((s) => s.id === service.id);
      if (exists) return prev.filter((s) => s.id !== service.id);
      return [...prev, service];
    });
    setSelectedTime(null);
    setSelectedDate(null);
  }, []);

  // ── "Anyone available": auto-pick the soonest-bookable barber ──────────
  const handleSelectAnyBarber = useCallback(async () => {
    if (!barbers || barbers.length === 0 || isResolvingAnyBarber) return;

    setIsResolvingAnyBarber(true);
    try {
      // No service chosen yet at step 1 → rank on a default 30-min slot.
      const best = await findSoonestAvailableBarber(
        barbers.map((b) => ({ id: b.id, salon_id: b.salon_id })),
        totalDurationMin || 30
      );

      if (!best) {
        Alert.alert(
          "Niciun frizer disponibil",
          "Niciun frizer nu are intervale libere în următoarele 14 zile. Încearcă mai târziu.",
          [{ text: "OK" }]
        );
        return;
      }

      const barber = barbers.find((b) => b.id === best.barberId);
      if (!barber) return;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // Same dependent-state reset as a manual barber switch.
      if (selectedBarber?.id !== barber.id) {
        setSelectedServices([]);
        setSelectedDate(null);
        setSelectedTime(null);
      }
      setSelectedBarber(barber);
      goNext();
    } catch (err) {
      Alert.alert(
        "Eroare",
        "Nu am putut găsi un frizer disponibil. Încearcă din nou.",
        [{ text: "OK" }]
      );
    } finally {
      setIsResolvingAnyBarber(false);
    }
  }, [barbers, isResolvingAnyBarber, totalDurationMin, selectedBarber, goNext]);

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (
      !session ||
      !selectedBarber ||
      selectedServices.length === 0 ||
      !selectedDate ||
      !selectedTime
    )
      return;

    // Re-entrancy guard: synchronously block double-tap before any await
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      const { data: rpcData, error: rpcError } = await supabase.rpc("book_appointment", {
        p_barber_id: selectedBarber.id,
        p_service_ids: selectedServices.map((s) => s.id),
        p_scheduled_at: scheduledAt.toISOString(),
        p_notes: notes.trim() || null,
      });

      if (rpcError) {
        const code = rpcError.code ?? "";
        const msg = rpcError.message ?? "";

        // 23P01 — any exclusion constraint violation → slot conflict class
        if (code === "23P01") {
          queryClient.invalidateQueries({ queryKey: ["time-slots"] });
          queryClient.invalidateQueries({ queryKey: ["first-available-date"] });
          setSelectedTime(null);
          setStep(3);
          Alert.alert(
            "Interval indisponibil",
            "Acest interval tocmai a fost ocupat sau frizerul este în pauză. Alege alt interval.",
            [{ text: "OK" }]
          );
          return;
        }

        // 42501 — not authenticated
        if (code === "42501") {
          Alert.alert("Sesiune expirată", "Te rugăm să te autentifici din nou.", [{ text: "OK" }]);
          return;
        }

        // 22023 — various semantic errors
        if (code === "22023") {
          if (msg.includes("outside_working_hours")) {
            queryClient.invalidateQueries({ queryKey: ["time-slots"] });
            queryClient.invalidateQueries({ queryKey: ["first-available-date"] });
            setSelectedTime(null);
            setStep(3);
            Alert.alert(
              "În afara programului",
              "Intervalul ales este în afara orelor de lucru ale frizerului. Alege alt interval.",
              [{ text: "OK" }]
            );
            return;
          }
          if (msg.includes("past_slot")) {
            queryClient.invalidateQueries({ queryKey: ["time-slots"] });
            queryClient.invalidateQueries({ queryKey: ["first-available-date"] });
            setSelectedTime(null);
            setStep(3);
            Alert.alert(
              "Interval trecut",
              "Intervalul ales a trecut deja. Alege un interval viitor.",
              [{ text: "OK" }]
            );
            return;
          }
          if (msg.includes("service_not_assigned") || msg.includes("invalid_services")) {
            setSelectedServices([]);
            setStep(2);
            Alert.alert(
              "Servicii indisponibile",
              "Unul sau mai multe servicii alese nu sunt disponibile la acest frizer. Alege din nou.",
              [{ text: "OK" }]
            );
            return;
          }
          if (msg.includes("not_authenticated")) {
            Alert.alert("Sesiune expirată", "Te rugăm să te autentifici din nou.", [{ text: "OK" }]);
            return;
          }
        }

        // Default fallback
        Alert.alert("Eroare", "Nu am putut crea programarea. Încearcă din nou.", [{ text: "OK" }]);
        return;
      }

      // Success — use server-returned row
      const result = (rpcData as RpcBookResult[])[0];

      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["next-appointment"] });
      queryClient.invalidateQueries({ queryKey: ["today-appointments-all"] });
      queryClient.invalidateQueries({ queryKey: ["time-slots"] });
      queryClient.invalidateQueries({ queryKey: ["first-available-date"] });

      setBookingResult({
        id: result.id,
        barberName: selectedBarber.name,
        serviceNames: selectedServices.map((s) => s.name),
        date: scheduledAt,
        time: selectedTime,
        totalPriceCents: result.total_cents,
        currency: result.currency,
        totalDurationMin: result.duration_min,
      });
    } catch (err) {
      Alert.alert(
        "Eroare",
        "Nu am putut crea programarea. Încearcă din nou.",
        [{ text: "OK" }]
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleAddToCalendar = async () => {
    if (!bookingResult || isAddingCalendar || calendarEventAdded) return;
    setIsAddingCalendar(true);
    try {
      await addBookingToCalendar({
        id: bookingResult.id,
        barberName: bookingResult.barberName,
        serviceNames: bookingResult.serviceNames,
        date: bookingResult.date,
        time: bookingResult.time,
        totalDurationMin: bookingResult.totalDurationMin,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCalendarEventAdded(true);
      Alert.alert("Adăugat în calendar", "Programarea apare acum în calendarul tău.", [{ text: "OK" }]);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      if (err instanceof CalendarError) {
        if (err.code === "permission_denied") {
          Alert.alert(
            "Permisiune refuzată",
            "Tapzi nu are acces la calendar. Deschide Setări pentru a permite.",
            [
              { text: "Anulează", style: "cancel" },
              { text: "Setări", onPress: () => openAppSettings() },
            ]
          );
        } else if (err.code === "no_calendar") {
          Alert.alert("Nu există calendar", "Nu am găsit un calendar editabil pe acest dispozitiv.", [{ text: "OK" }]);
        } else {
          Alert.alert("Eroare", "Nu am putut salva programarea în calendar.", [{ text: "OK" }]);
        }
      } else {
        Alert.alert("Eroare", "Nu am putut salva programarea în calendar.", [{ text: "OK" }]);
      }
    } finally {
      setIsAddingCalendar(false);
    }
  };

  // ── Services summary for step 3 info chip ──────────────────────────────
  const servicesSummary = useMemo(() => {
    if (selectedServices.length === 0) return "";
    if (selectedServices.length === 1) return selectedServices[0].name;
    return selectedServices.map((s) => s.name).join(", ");
  }, [selectedServices]);

  // ── Formatted date for sticky bar ──────────────────────────────────────
  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return "";
    return selectedDate.toLocaleDateString("ro-RO", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }, [selectedDate]);

  // ══════════════════════════════════════════════════════════════════════════
  // SUCCESS SCREEN
  // ══════════════════════════════════════════════════════════════════════════
  if (bookingResult) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#f8fbff" }}
        edges={["top"]}
      >
        <BookingSuccess
          result={bookingResult}
          onAddToCalendar={handleAddToCalendar}
          isAddingToCalendar={isAddingCalendar}
          calendarEventAdded={calendarEventAdded}
          onViewAppointments={() => {
            router.replace("/appointments" as any);
          }}
          onBookAnother={() => {
            setBookingResult(null);
            setStep(1);
            setSelectedBarber(null);
            setSelectedServices([]);
            setSelectedDate(null);
            setSelectedTime(null);
            setNotes("");
            setCalendarEventAdded(false);
            setIsAddingCalendar(false);
            // Reset flow control refs so a fresh manual booking starts clean
            step2VisitedRef.current = false;
            // Mark params consumed so deep-link doesn't re-fire on a new booking
            setParamsApplied(true);
          }}
          onGoHome={() => {
            router.replace("/(tabs)/discover" as any);
          }}
          formatPrice={formatPrice}
        />
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN BOOKING FLOW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      {/* ── Header ── */}
      <View style={styles.headerBar}>
        <Pressable
          onPress={goBack}
          style={[squircleSm, styles.backButton]}
        >
          <Ionicons name="arrow-back" size={20} color="#334155" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.h3, { color: Colors.text }]}>
            {STEP_TITLES[step]}
          </Text>
        </View>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{step}/4</Text>
        </View>
      </View>

      {/* ── Step indicator (animated) ── */}
      <View ref={stepIndicatorRef} collapsable={false}>
        <BookingStepIndicator
          currentStep={step}
          stepTitles={STEP_TITLES}
          onStepPress={(target) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            if (target < step) {
              // Jumping backward from step 3 or 4 always clears date/time
              if (step >= 3 && target <= 2) {
                setSelectedTime(null);
                setSelectedDate(null);
              }
              // Jumping to step 1 also clears services if barber will change
              // (barber change logic in BarberCard onSelect handles service clear)
              setStep(target);
            }
          }}
        />
      </View>

      {/* ── Content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom:
            step === 2
              ? 0
              : step === 3 && selectedTime
              ? 100
              : 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Step 1: Barber selection ── */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Alege frizerul tău</Text>
            <Text style={styles.stepSubtitle}>
              {salonId
                ? "Selectează un frizer din echipă"
                : "Selectează un frizer disponibil"}
            </Text>

            {barbersLoading ? (
              <ActivityIndicator
                size="large"
                color={Colors.primary}
                style={{ marginVertical: 32 }}
              />
            ) : barbersError ? (
              <View style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>Nu am putut încărca datele.</Text>
                <Pressable onPress={() => refetchBarbers()} style={styles.inlineRetry}>
                  <Text style={styles.inlineRetryText}>Reîncearcă</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {(barbers?.length ?? 0) > 1 && (
                  <AnyBarberCard
                    onSelect={handleSelectAnyBarber}
                    isResolving={isResolvingAnyBarber}
                  />
                )}
                {sortedBarbers?.map((barber, index) => (
                  <View
                    key={barber.id}
                    ref={index === 0 ? barberCardRef : undefined}
                    collapsable={false}
                  >
                    <View ref={index === 0 ? barberSelectedRef : undefined} collapsable={false}>
                      <BarberCard
                        barber={barber}
                        role={
                          barber.profile_id
                            ? roleByProfileId.get(barber.profile_id)
                            : undefined
                        }
                        isSelected={selectedBarber?.id === barber.id}
                        onSelect={() => {
                          if (selectedBarber?.id !== barber.id) {
                            // Barber changed — clear dependent state to avoid
                            // cross-salon service / stale date-time contamination
                            setSelectedServices([]);
                            setSelectedDate(null);
                            setSelectedTime(null);
                          }
                          setSelectedBarber(barber);
                          goNext();
                        }}
                        index={index}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Step 2: Service selection (multi) ── */}
        {step === 2 && (
          <View
            style={[
              styles.stepContent,
              {
                paddingBottom:
                  selectedServices.length > 0 ? 120 : 32,
              },
            ]}
          >
            <Text style={styles.stepTitle}>Alege serviciile</Text>
            <Text style={styles.stepSubtitle}>
              Cu {selectedBarber?.name} · poți selecta mai multe
            </Text>

            {servicesLoading ? (
              <ActivityIndicator
                size="large"
                color={Colors.primary}
                style={{ marginVertical: 32 }}
              />
            ) : servicesError ? (
              <View style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>Nu am putut încărca datele.</Text>
                <Pressable onPress={() => refetchServices()} style={styles.inlineRetry}>
                  <Text style={styles.inlineRetryText}>Reîncearcă</Text>
                </Pressable>
              </View>
            ) : visibleServices.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyStateIcon}>
                  <Ionicons name="cut-outline" size={28} color="#64748b" />
                </View>
                <Text style={styles.emptyTitle}>
                  Niciun serviciu disponibil
                </Text>
                <Text style={styles.emptySubtitle}>
                  Salonul nu are servicii active momentan.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {visibleServices.map((service, index) => (
                  <View
                    key={service.id}
                    ref={index === 0 ? serviceCardRef : undefined}
                    collapsable={false}
                  >
                    <View ref={index === 0 ? serviceCheckboxRef : undefined} collapsable={false}>
                      <ServiceCard
                        service={service}
                        isSelected={selectedServices.some(
                          (s) => s.id === service.id
                        )}
                        onToggle={() => toggleService(service)}
                        index={index}
                        formatPrice={formatPrice}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Step 3: Date & Time ── */}
        {step === 3 && (
          <View style={{ flex: 1 }}>
            {/* Services info chip */}
            <View style={styles.serviceChip}>
              <View style={styles.serviceChipIcon}>
                <Ionicons name="cut" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[Typography.captionSemiBold, { color: Colors.text }]}
                  numberOfLines={2}
                >
                  {servicesSummary}
                </Text>
                <Text
                  style={[
                    Typography.small,
                    { color: Colors.textTertiary, marginTop: 2 },
                  ]}
                >
                  {totalDurationMin} min · cu {selectedBarber?.name}
                </Text>
                {isExtendedSlot && selectedExtension && (
                  <Text style={[Typography.small, { color: "#B45309", marginTop: 2 }]}>
                    {extendedServiceBlocked
                      ? "Unele servicii nu sunt disponibile în programul extins"
                      : `Program extins · supliment ${surchargeLabel(selectedExtension)}`}
                  </Text>
                )}
              </View>
              <View style={styles.serviceChipPrice}>
                <Text style={styles.serviceChipPriceText}>
                  {formatPrice(effectiveTotalCents, primaryCurrency)}
                </Text>
              </View>
            </View>

            {/* Animated date picker */}
            <View ref={datePickerRef} collapsable={false}>
              <BookingDatePicker
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setSelectedTime(null);
                }}
                disabledDays={firstAvailableData?.offDays}
              />
            </View>

            <View style={styles.divider} />

            {/* Animated time grid */}
            <View style={{ paddingHorizontal: 16, flex: 1 }}>
              <BookingTimeGrid
                timeSlots={timeSlots}
                selectedTime={selectedTime}
                onSelectTime={setSelectedTime}
                isLoading={slotsLoading}
                hasSelectedDate={!!selectedDate}
                morningSectionRef={timeMorningRef}
                afternoonSectionRef={timeAfternoonRef}
                isError={slotsError}
                onRetry={refetchSlots}
              />
            </View>
          </View>
        )}

        {/* ── Step 4: Confirmation (animated) ── */}
        {step === 4 && selectedBarber && selectedDate && selectedTime && (
          <View style={styles.stepContent}>
            <BookingConfirmation
              barber={selectedBarber}
              services={selectedServices}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              notes={notes}
              onNotesChange={setNotes}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              formatPrice={formatPrice}
              role={
                selectedBarber.profile_id
                  ? roleByProfileId.get(selectedBarber.profile_id)
                  : undefined
              }
              summaryCardRef={summaryCardRef}
              notesInputRef={notesInputRef}
              confirmBtnRef={confirmBtnRef}
              surchargeCents={surchargeCents}
              surchargeLabel={
                selectedExtension ? surchargeLabel(selectedExtension) : undefined
              }
            />
          </View>
        )}
      </ScrollView>

      {/* ── Step 2: Floating bar (animated) ── */}
      {step === 2 && (
        <View ref={floatingBarRef} collapsable={false} style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
          <View ref={continueBtnRef} collapsable={false} pointerEvents="box-none">
            <BookingFloatingBar
              selectedServices={selectedServices}
              onContinue={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                step2VisitedRef.current = true;
                setStep(3);
              }}
              formatPrice={formatPrice}
            />
          </View>
        </View>
      )}

      {/* ── Step 3: Sticky CTA when time is selected ── */}
      {step === 3 && selectedTime ? (
        <View ref={timeCtaRef} collapsable={false} style={styles.stickyBar}>
          <Button variant="primary" size="lg" onPress={() => setStep(4)}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="calendar"
                size={16}
                color="rgba(255,255,255,0.8)"
              />
              <Text style={styles.stickyDateText}>
                {formattedSelectedDate}
              </Text>
              <Text style={styles.stickyDot}>·</Text>
              <Ionicons
                name="time"
                size={16}
                color="rgba(255,255,255,0.8)"
              />
              <Text style={styles.stickyTimeText}>{selectedTime}</Text>
              <View style={{ marginLeft: 12 }}>
                <Ionicons name="arrow-forward" size={18} color="white" />
              </View>
            </View>
          </Button>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
  },
  backButton: {
    width: 40,
    height: 40,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepBadge: {
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  stepBadgeText: {
    ...Typography.small,
    fontFamily: "EuclidCircularA-SemiBold",
    color: Colors.textSecondary,
  },

  // Step content
  stepContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stepTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: 4,
  },
  stepSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: 16,
  },

  // Inline error state (step 1 barbers, step 2 services)
  inlineError: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  inlineErrorText: {
    ...Typography.captionSemiBold,
    color: Colors.text,
    textAlign: "center",
  },
  inlineRetry: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primaryMuted,
  },
  inlineRetryText: {
    ...Typography.captionSemiBold,
    color: Colors.primary,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: "center",
  },

  // Step 3 — service info chip
  serviceChip: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  serviceChipIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  serviceChipPrice: {
    backgroundColor: Colors.primaryMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  serviceChipPriceText: {
    fontFamily: "EuclidCircularA-Bold",
    fontSize: 12,
    color: Colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.separator,
    marginHorizontal: 16,
    marginVertical: 16,
  },

  // Step 3 — sticky CTA bar
  stickyBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 20,
    paddingTop: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
    }),
  },
  stickyDateText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    marginLeft: 6,
    fontFamily: "EuclidCircularA-Regular",
  },
  stickyDot: {
    color: "rgba(255,255,255,0.5)",
    marginHorizontal: 8,
  },
  stickyTimeText: {
    color: "white",
    fontSize: 14,
    fontFamily: "EuclidCircularA-Bold",
    marginLeft: 6,
  },
});
