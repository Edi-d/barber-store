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
import Animated, { LinearTransition } from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Barber, BarberService } from "@/types/database";
import { formatPrice } from "@/lib/utils";
import { generateTimeSlots, getNext14Days, formatCalendarDay, findFirstAvailableDate, findNextAvailableDateAfter, findSoonestAvailableBarber, DaySlots, DayStatus, DayUnavailableReason } from "@/lib/booking";
import {
  fetchSalonExtendedHours,
  finalBookingTotalCents,
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
import { BookingTimeGrid, UnavailableNotice } from "@/components/shared/BookingTimeGrid";
import { BookingConfirmation } from "@/components/shared/BookingConfirmation";
import { BookingForSelector, type BookingFor, type Dependent } from "@/components/shared/BookingForSelector";
import { BookingSuccess, BookingSuccessResult } from "@/components/shared/BookingSuccess";
import { BookingFloatingBar } from "@/components/shared/BookingFloatingBar";
import { BookingGuestsSection, type Guest } from "@/components/shared/BookingGuestsSection";
import { BookingPersonTabs } from "@/components/shared/BookingPersonTabs";

type BookingStep = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<BookingStep, string> = {
  1: "Alege Frizer",
  2: "Alege Servicii",
  3: "Alege Data & Ora",
  4: "Confirmare",
};

const squircleSm = { ...Bubble.radiiSm };

// Reflow spring for the step-2 service list — smooths its shift when
// BookingPersonTabs above it changes height (add form / active-guest row
// swap), rather than a hard jump. Tuned to match ServiceCard's own feel.
const SERVICE_LIST_LAYOUT = LinearTransition.springify().damping(20).stiffness(220);

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
  // Who the appointment is for: the account holder (default), a saved dependent,
  // or a new child added inline. Reset whenever the salon changes (dependents
  // are per-salon). See BookingForSelector.
  const [bookingFor, setBookingFor] = useState<BookingFor>({ kind: "self" });
  // Extra people ("Persoane suplimentare") added to the same slot, each with
  // their own services. `activePersonKey` is "self" or a guest's key — it
  // drives which person's services step 2's list reads/writes; switching is
  // just a chip tap (BookingPersonTabs), never a navigation.
  const [guests, setGuests] = useState<Guest[]>([]);
  const [activePersonKey, setActivePersonKey] = useState<string>("self");
  // Drives the step-2 floating bar's spinner while we re-validate a
  // carried-over slot (see handleContinueStep2) before jumping to step 4.
  const [isCheckingFit, setIsCheckingFit] = useState(false);
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
  // Main-only totals (the account holder / bookingFor person's own services).
  const mainDurationMin = useMemo(
    () => selectedServices.reduce((acc, s) => acc + s.duration_min, 0),
    [selectedServices]
  );
  const mainPriceCents = useMemo(
    () => selectedServices.reduce((acc, s) => acc + s.price_cents, 0),
    [selectedServices]
  );
  const primaryCurrency = useMemo(
    () => selectedServices[0]?.currency ?? "RON",
    [selectedServices]
  );

  // Combined duration across the main person + every guest — this is what
  // actually needs to fit in the barber's calendar (everyone is booked
  // back-to-back in one slot), so all slot-availability queries below key and
  // compute off THIS value, not the main-only one. Zero guests ⇒ identical to
  // mainDurationMin, so the zero-guest flow is unaffected.
  const guestsDurationMin = useMemo(
    () =>
      guests.reduce(
        (sum, g) => sum + g.services.reduce((s2, s) => s2 + s.duration_min, 0),
        0
      ),
    [guests]
  );
  const totalDurationMin = mainDurationMin + guestsDurationMin;

  const guestsPriceCentsBase = useMemo(
    () =>
      guests.reduce(
        (sum, g) => sum + g.services.reduce((s2, s) => s2 + s.price_cents, 0),
        0
      ),
    [guests]
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

  // Dependents (children / others the signed-in user manages) at THIS salon, for
  // the "Pentru cine?" selector. Readable via the salon_clients_read_own_dependents
  // RLS policy (managed_by_profile_id = auth.uid()). Per-salon, so keyed on the
  // effective salon.
  const { data: dependents } = useQuery({
    queryKey: ["salon-dependents", effectiveSalonId ?? "none", session?.user.id ?? "anon"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salon_clients")
        .select("id, first_name, last_name")
        .eq("salon_id", effectiveSalonId!)
        .eq("managed_by_profile_id", session!.user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Dependent[];
    },
    enabled: !!effectiveSalonId && !!session,
    staleTime: 60_000,
  });

  // Dependents are per-salon; if the salon changes (e.g. cross-salon "anyone
  // available" lands on a barber in a different salon) reset the "for whom"
  // pick and any guests (a guest's dependentClientId is per-salon too).
  useEffect(() => {
    setBookingFor({ kind: "self" });
    setGuests([]);
    setActivePersonKey("self");
  }, [effectiveSalonId]);

  // Factored out (key + fn) so handleContinueStep2's explicit fit-check can
  // reuse the EXACT SAME query via queryClient.fetchQuery — same cache entry,
  // same freshness semantics, just awaited instead of subscribed-to.
  const timeSlotsQueryKey = useMemo(
    () => [
      "time-slots",
      selectedBarber?.id,
      selectedDate?.toISOString(),
      totalDurationMin,
    ] as const,
    [selectedBarber, selectedDate, totalDurationMin]
  );

  const fetchTimeSlots = useCallback(async (): Promise<DaySlots> => {
    if (!selectedBarber || !selectedDate || totalDurationMin === 0) {
      return { slots: [], unavailableReason: null } as DaySlots;
    }
    return generateTimeSlots(
      selectedBarber.id,
      selectedDate,
      totalDurationMin,
      selectedBarber.salon_id
    );
  }, [selectedBarber, selectedDate, totalDurationMin]);

  const { data: daySlots, isLoading: slotsLoading, isError: slotsError, refetch: refetchSlots } = useQuery({
    queryKey: timeSlotsQueryKey,
    queryFn: fetchTimeSlots,
    enabled: !!selectedBarber && !!selectedDate && totalDurationMin > 0,
    staleTime: 30_000, // Override global 5-min staleTime — slots go stale quickly
  });

  const timeSlots = daySlots?.slots;

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

  // Final charged total for the chosen slot, MAIN PERSON ONLY. In an extended
  // window a service's explicit extended price REPLACES its base price +
  // surcharge; the rest are surcharged. Mirrors the book_appointment RPC
  // exactly (per-service rounding) so the preview matches what gets charged.
  const effectiveTotalCents = useMemo(() => {
    if (!isExtendedSlot || !selectedExtension) return mainPriceCents;
    return finalBookingTotalCents(selectedServices, selectedExtension, true);
  }, [isExtendedSlot, selectedExtension, selectedServices, mainPriceCents]);

  // Per-guest preview total. Approximation: a guest segment is treated as
  // extended iff the main slot is — a guest whose OWN segment crosses INTO the
  // extended window mid-group may in reality be charged slightly more; the
  // book_appointment RPC recomputes and enforces the real total server-side.
  const guestsEffectiveTotalCents = useMemo(() => {
    return guests.reduce((sum, g) => {
      if (isExtendedSlot && selectedExtension) {
        return sum + finalBookingTotalCents(g.services, selectedExtension, true);
      }
      return sum + g.services.reduce((s2, s) => s2 + s.price_cents, 0);
    }, 0);
  }, [guests, isExtendedSlot, selectedExtension]);

  // Combined preview total (main + all guests) — what the services chip and
  // the step-4 total should show. `surchargeCents` is the delta over the
  // combined base, shown as a single "Program extins" line.
  const combinedEffectiveTotalCents = effectiveTotalCents + guestsEffectiveTotalCents;
  const combinedBaseCents = mainPriceCents + guestsPriceCentsBase;
  const surchargeCents = combinedEffectiveTotalCents - combinedBaseCents;

  // At least one service in the group (main person's or a guest's) is charged
  // its explicit extended price, so the delta over base isn't a plain
  // percent/fixed surcharge — suppress the "+20%" style label in the summary
  // to avoid implying it.
  const usesExtendedServicePrice = useMemo(() => {
    if (!isExtendedSlot) return false;
    return (
      selectedServices.some((s) => (s.price_cents_extended ?? 0) > 0) ||
      guests.some((g) => g.services.some((s) => (s.price_cents_extended ?? 0) > 0))
    );
  }, [isExtendedSlot, selectedServices, guests]);

  const extendedServiceBlocked = useMemo(() => {
    if (!isExtendedSlot || !selectedExtension) return false;
    return (
      selectedServices.some((s) => !extensionCoversService(selectedExtension, s.id)) ||
      guests.some((g) => g.services.some((s) => !extensionCoversService(selectedExtension, s.id)))
    );
  }, [isExtendedSlot, selectedExtension, selectedServices, guests]);

  // Find first available date (checks schedule + appointments)
  const { data: firstAvailableData } = useQuery({
    queryKey: ["first-available-date", selectedBarber?.id, totalDurationMin],
    queryFn: () => findFirstAvailableDate(selectedBarber!.id, totalDurationMin || 30, selectedBarber!.salon_id),
    enabled: !!selectedBarber && totalDurationMin > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // First bookable day strictly AFTER the selected (unavailable) one — searched
  // beyond the 14-day strip if needed so we can always offer a concrete next day.
  const { data: nextAvailableDate } = useQuery({
    queryKey: [
      "next-available-after",
      selectedBarber?.id,
      selectedDate?.toISOString(),
      totalDurationMin,
    ],
    queryFn: () =>
      findNextAvailableDateAfter(
        selectedBarber!.id,
        totalDurationMin,
        selectedBarber!.salon_id,
        selectedDate!
      ),
    enabled:
      !!selectedBarber &&
      !!selectedDate &&
      totalDurationMin > 0 &&
      !!daySlots?.unavailableReason,
    staleTime: 60_000,
  });

  // Build the "why this day has no slot" notice shown in place of the time grid.
  // Vacation surfaces the barber's name + a button jumping to the next bookable
  // day; salon-closed and fully-booked get their own copy.
  const dayUnavailable = useMemo<UnavailableNotice | null>(() => {
    const reason = daySlots?.unavailableReason;
    if (!reason || !selectedDate) return null;

    const barberName = selectedBarber?.name ?? "Frizerul";

    // The reason line; the concrete next-available day is offered as a button
    // (see `action`) so it's always actionable, not just informational.
    const reasonText: Record<DayUnavailableReason, string> = {
      salon_closed: "Salonul este închis în această zi.",
      vacation: `${barberName} este în concediu în această zi.`,
      unavailable: `${barberName} nu este disponibil în această zi.`,
      fully_booked: "Toate orele sunt ocupate în această zi.",
    };
    const titles: Record<DayUnavailableReason, string> = {
      salon_closed: "Salon închis",
      vacation: `${barberName} este în concediu`,
      unavailable: `${barberName} este indisponibil`,
      fully_booked: "Nicio oră disponibilă",
    };
    const icons: Record<DayUnavailableReason, UnavailableNotice["icon"]> = {
      salon_closed: "moon-outline",
      vacation: "airplane-outline",
      unavailable: "airplane-outline",
      fully_booked: "moon-outline",
    };

    const action = nextAvailableDate
      ? {
          label: `Vezi ${nextAvailableDate.toLocaleDateString("ro-RO", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}`,
          onPress: () => {
            setSelectedDate(nextAvailableDate);
            setSelectedTime(null);
          },
        }
      : undefined;

    return {
      icon: icons[reason],
      title: titles[reason],
      subtitle: action ? reasonText[reason] : `${reasonText[reason]} Alege altă dată din calendar.`,
      action,
    };
  }, [daySlots, selectedDate, selectedBarber, nextAvailableDate]);

  // Per-date status map for the calendar strip (closed / vacation / booked).
  const dayStatuses = useMemo(() => {
    if (!firstAvailableData?.days) return undefined;
    const map = new Map<string, DayStatus>();
    for (const d of firstAvailableData.days) {
      map.set(d.date.toDateString(), d.status);
    }
    return map;
  }, [firstAvailableData]);

  // Auto-select first available date when entering step 3
  useEffect(() => {
    if (step === 3 && firstAvailableData && !selectedDate) {
      if (firstAvailableData.date) {
        setSelectedDate(firstAvailableData.date);
        setSelectedTime(null);
      }
    }
  }, [step, firstAvailableData, selectedDate]);

  // Safety net for STEP 3 ONLY: the combined duration can grow while the user
  // is browsing the time grid (e.g. after a step-indicator jump back from a
  // step where a guest's services changed). Gated to step 3 so it can't fire
  // while the user is still composing on step 2 — that path now has its own
  // explicit fit-check (handleContinueStep2) that shows a proper explanation
  // instead of silently blanking selectedTime out from under them.
  useEffect(() => {
    if (step === 3 && !slotsLoading && !slotsError && selectedTime && timeSlots) {
      // Membership alone isn't enough — generateTimeSlots returns taken/past
      // slots too (available: false), which the grid greys out.
      const stillAvailable = timeSlots.some((s) => s.time === selectedTime && s.available);
      if (!stillAvailable) setSelectedTime(null);
    }
  }, [step, slotsLoading, slotsError, selectedTime, timeSlots]);

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

  // ── Group booking: guests + active person ───────────────────────────────
  // Toggling a guest's services mirrors toggleService below. Unlike before,
  // this does NOT clear selectedDate/selectedTime — see the "no more
  // guest-mode bounce" note above toggleService for why.
  const toggleGuestService = useCallback((guestKey: string, service: BarberService) => {
    setGuests((prev) =>
      prev.map((g) => {
        if (g.key !== guestKey) return g;
        const exists = g.services.some((s) => s.id === service.id);
        return {
          ...g,
          services: exists
            ? g.services.filter((s) => s.id !== service.id)
            : [...g.services, service],
        };
      })
    );
  }, []);

  // Creates the guest and makes it the active person. When called from step 4
  // (BookingGuestsSection's "Adaugă persoană") this also jumps to step 2 —
  // date/time are left untouched, so if they were set, step 2's Continuă will
  // re-validate them against the new duration instead of clearing on sight.
  const addGuest = useCallback(
    (name: string, dependentClientId?: string) => {
      const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      setGuests((prev) => [...prev, { key, name, dependentClientId, services: [] }]);
      setActivePersonKey(key);
      if (step === 4) setStep(2);
    },
    [step]
  );

  // BookingGuestsSection's "Modifică" (step 4 only) — same uniform return
  // path as addGuest: just switch the active chip and land on step 2.
  const editGuestServices = useCallback((key: string) => {
    setActivePersonKey(key);
    setStep(2);
  }, []);

  const removeGuest = useCallback((key: string) => {
    // Removing a guest only ever shrinks the combined duration — a
    // previously-validated slot stays valid, so date/time are kept as-is.
    setGuests((prev) => prev.filter((g) => g.key !== key));
    // If the removed guest was the active chip, fall back to "self" so step 2
    // never points at a person that no longer exists.
    setActivePersonKey((prev) => (prev === key ? "self" : prev));
  }, []);

  const activePerson = useMemo(
    () => (activePersonKey === "self" ? null : guests.find((g) => g.key === activePersonKey) ?? null),
    [activePersonKey, guests]
  );

  // Dependent IDs to exclude from the "add guest" quick-pick chips: already a
  // guest, or already the main "bookingFor" person.
  const usedDependentIds = useMemo(() => {
    const set = new Set<string>();
    guests.forEach((g) => {
      if (g.dependentClientId) set.add(g.dependentClientId);
    });
    if (bookingFor.kind === "dependent") set.add(bookingFor.clientId);
    return set;
  }, [guests, bookingFor]);

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
    // Person chips (activePersonKey) are intentionally ignored here — free
    // switching between people is the whole point of the redesign, so
    // leaving step 2 doesn't need to "undo" whichever chip was active.
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

  // ── Toggle service selection ────────────────────────────────────────────
  // Does NOT clear selectedDate/selectedTime anymore. Navigation-driven
  // clears (goBack from step 3, step-indicator backward jumps) are the only
  // other ways to reach step 2, so a non-null date/time here means the user
  // arrived via a step-4 shortcut (Modifică / Adaugă persoană) and their slot
  // is provisional — handleContinueStep2 re-validates it explicitly instead
  // of us silently discarding it on every single tap.
  const toggleService = useCallback((service: BarberService) => {
    setSelectedServices((prev) => {
      const exists = prev.some((s) => s.id === service.id);
      if (exists) return prev.filter((s) => s.id !== service.id);
      return [...prev, service];
    });
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
        setGuests([]);
        setActivePersonKey("self");
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

    // "Adaugă copil" chosen but no name typed — validate before we hold a slot.
    if (bookingFor.kind === "new_child" && bookingFor.name.trim().length === 0) {
      Alert.alert(
        "Nume lipsă",
        "Adaugă numele copilului pentru care faci programarea.",
        [{ text: "OK" }]
      );
      return;
    }

    // Belt-and-braces — shouldn't happen by construction (handleContinueStep2
    // already blocks with the same message when a guest has 0 services), but
    // guard again here before we hold a slot.
    const emptyGuest = guests.find((g) => g.services.length === 0);
    if (emptyGuest) {
      Alert.alert(
        "Persoană fără servicii",
        `Alege serviciile pentru ${emptyGuest.name} sau șterge persoana.`,
        [{ text: "OK" }]
      );
      return;
    }

    // Re-entrancy guard: synchronously block double-tap before any await
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      // Base args resolve against both the legacy 4-arg book_appointment and the
      // extended 7-arg one (migration 156), so a plain self-booking keeps working
      // even if that migration hasn't shipped yet. Only send the "book for" args
      // when actually booking for a dependent — that path genuinely needs the new
      // function.
      const rpcArgs: Record<string, unknown> = {
        p_barber_id: selectedBarber.id,
        p_service_ids: selectedServices.map((s) => s.id),
        p_scheduled_at: scheduledAt.toISOString(),
        p_notes: notes.trim() || null,
      };
      if (bookingFor.kind !== "self") {
        rpcArgs.p_booking_for = bookingFor.kind;
        rpcArgs.p_dependent_client_id =
          bookingFor.kind === "dependent" ? bookingFor.clientId : null;
        rpcArgs.p_child_name =
          bookingFor.kind === "new_child" ? bookingFor.name.trim() : null;
      }
      // Same backward-compat reasoning as p_booking_for above: only sent when
      // there's actually a group booking, so a plain/self/dependent booking
      // keeps working even before the p_guests migration ships.
      if (guests.length > 0) {
        rpcArgs.p_guests = guests.map((g) => ({
          name: g.dependentClientId ? null : g.name.trim(),
          dependent_client_id: g.dependentClientId ?? null,
          service_ids: g.services.map((s) => s.id),
        }));
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "book_appointment",
        rpcArgs
      );

      if (rpcError) {
        const code = rpcError.code ?? "";
        const msg = rpcError.message ?? "";

        // Log the real cause — the generic fallback below hides it otherwise.
        console.error("[book] book_appointment failed", {
          code,
          message: msg,
          details: (rpcError as { details?: string }).details,
          hint: (rpcError as { hint?: string }).hint,
          bookingFor: bookingFor.kind,
        });

        // PGRST202 — PostgREST can't find a function matching the args we sent.
        // For a dependent booking this means the extended 7-arg book_appointment
        // (migration 156) isn't deployed yet; for a group booking it means the
        // p_guests migration isn't deployed yet (or the schema cache is stale
        // in either case). Give a clear signal instead of the generic "try again".
        if (
          code === "PGRST202" ||
          msg.includes("Could not find the function") ||
          msg.includes("schema cache")
        ) {
          Alert.alert(
            "Indisponibil temporar",
            guests.length > 0
              ? "Programarea cu mai multe persoane nu este disponibilă momentan. Încearcă fără persoane suplimentare sau revino mai târziu."
              : "Programarea pentru altă persoană nu este disponibilă momentan. Încearcă „Pentru mine” sau revino mai târziu.",
            [{ text: "OK" }]
          );
          return;
        }

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

        // 42501 — not authenticated OR a dependent that isn't the caller's
        if (code === "42501") {
          if (msg.includes("dependent_not_owned")) {
            setBookingFor({ kind: "self" });
            Alert.alert(
              "Persoană indisponibilă",
              "Nu am putut confirma persoana pentru care faci programarea. Am selectat „Pentru mine”. Verifică și încearcă din nou.",
              [{ text: "OK" }]
            );
            return;
          }
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
          if (msg.includes("child_name_required")) {
            Alert.alert(
              "Nume lipsă",
              "Adaugă numele copilului pentru care faci programarea.",
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

      // Success — one row per appointment, MAIN FIRST then guests in order
      // (same shape as before when there are no guests: a single-row array).
      const rows = (rpcData as RpcBookResult[]) ?? [];
      const mainRow = rows[0];

      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["next-appointment"] });
      queryClient.invalidateQueries({ queryKey: ["today-appointments-all"] });
      queryClient.invalidateQueries({ queryKey: ["time-slots"] });
      queryClient.invalidateQueries({ queryKey: ["first-available-date"] });
      // A new_child booking (main or guest) may have created a CRM row.
      queryClient.invalidateQueries({ queryKey: ["salon-dependents"] });

      setBookingResult({
        id: mainRow.id,
        barberName: selectedBarber.name,
        serviceNames: [
          ...selectedServices.map((s) => s.name),
          ...guests.map((g) => `${g.name}: ${g.services.map((s) => s.name).join(", ")}`),
        ],
        date: scheduledAt,
        time: selectedTime,
        totalPriceCents: rows.reduce((sum, r) => sum + r.total_cents, 0),
        currency: mainRow.currency,
        totalDurationMin: rows.reduce((sum, r) => sum + r.duration_min, 0),
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

  // ── Step 2 "active" services: whichever person's chip is selected ──────
  const activeServices = activePerson ? activePerson.services : selectedServices;
  const handleToggleService = activePerson
    ? (service: BarberService) => toggleGuestService(activePerson.key, service)
    : toggleService;

  // Every service across the whole group — what the step-2 floating bar
  // shows (it's a group total now, not just the active person's).
  const groupServices = useMemo(
    () => [...selectedServices, ...guests.flatMap((g) => g.services)],
    [selectedServices, guests]
  );

  // ── Step 2 "Continuă" ────────────────────────────────────────────────────
  // Three outcomes:
  //  (a) someone in the group still has 0 services → jump their chip into
  //      view + alert, don't navigate;
  //  (b) a provisional slot survived from a step-4 shortcut (Modifică /
  //      Adaugă persoană kept date/time instead of clearing it) → verify it
  //      still fits the — possibly now larger — combined duration BEFORE
  //      trusting it, via the exact same time-slots query the grid itself
  //      uses (queryClient.fetchQuery with timeSlotsQueryKey/fetchTimeSlots),
  //      so we only bounce the user through step 3 when the slot truly no
  //      longer fits, instead of unconditionally on every guest edit;
  //  (c) first pass, nothing provisional → step 3 as always.
  const handleContinueStep2 = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (selectedServices.length === 0) {
      // Can only happen while the bar is visible if some guest already has
      // services — the main person still needs at least one of their own.
      setActivePersonKey("self");
      Alert.alert("Servicii lipsă", "Alege cel puțin un serviciu pentru tine.", [{ text: "OK" }]);
      return;
    }

    const emptyGuest = guests.find((g) => g.services.length === 0);
    if (emptyGuest) {
      setActivePersonKey(emptyGuest.key);
      Alert.alert(
        "Servicii lipsă",
        `Alege serviciile pentru ${emptyGuest.name} sau șterge persoana.`,
        [{ text: "OK" }]
      );
      return;
    }

    if (selectedDate && selectedTime) {
      setIsCheckingFit(true);
      try {
        const fresh = await queryClient.fetchQuery({
          queryKey: timeSlotsQueryKey,
          queryFn: fetchTimeSlots,
          staleTime: 30_000,
        });
        step2VisitedRef.current = true;
        // available: false slots exist in the list too (taken/past, greyed
        // out by the grid) — a slot must be genuinely free for the new,
        // longer duration to skip the re-pick.
        if (fresh.slots.some((s) => s.time === selectedTime && s.available)) {
          setStep(4);
        } else {
          setSelectedTime(null);
          setStep(3);
          Alert.alert(
            "Alege o altă oră",
            `Programarea durează acum ${totalDurationMin} min — la ${selectedTime} nu mai este loc. Alege o altă oră.`,
            [{ text: "OK" }]
          );
        }
      } catch {
        // Grid has its own retry UI — land on step 3 without an extra modal.
        setStep(3);
      } finally {
        setIsCheckingFit(false);
      }
      return;
    }

    step2VisitedRef.current = true;
    setStep(3);
  }, [
    selectedServices,
    guests,
    selectedDate,
    selectedTime,
    queryClient,
    timeSlotsQueryKey,
    fetchTimeSlots,
    totalDurationMin,
  ]);

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
            setBookingFor({ kind: "self" });
            setGuests([]);
            setActivePersonKey("self");
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
                            setGuests([]);
                            setActivePersonKey("self");
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
                // Padding reserves space for the floating bar, which now
                // shows the GROUP total (not just the active person's).
                paddingBottom:
                  groupServices.length > 0 ? 120 : 32,
              },
            ]}
          >
            <BookingPersonTabs
              activePersonKey={activePersonKey}
              onSelectPerson={setActivePersonKey}
              mainServiceCount={selectedServices.length}
              guests={guests}
              dependents={dependents ?? []}
              usedDependentIds={usedDependentIds}
              barberName={selectedBarber?.name}
              onAddGuest={addGuest}
              onRemoveGuest={removeGuest}
            />

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
              <Animated.View style={{ gap: 12 }} layout={SERVICE_LIST_LAYOUT}>
                {visibleServices.map((service, index) => (
                  <View
                    key={service.id}
                    ref={index === 0 ? serviceCardRef : undefined}
                    collapsable={false}
                  >
                    <View ref={index === 0 ? serviceCheckboxRef : undefined} collapsable={false}>
                      <ServiceCard
                        service={service}
                        isSelected={activeServices.some(
                          (s) => s.id === service.id
                        )}
                        onToggle={() => handleToggleService(service)}
                        index={index}
                        formatPrice={formatPrice}
                      />
                    </View>
                  </View>
                ))}
              </Animated.View>
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
                  {guests.length > 0 ? ` · ${1 + guests.length} persoane` : ""}
                </Text>
                {isExtendedSlot && selectedExtension && (
                  <Text style={[Typography.small, { color: "#B45309", marginTop: 2 }]}>
                    {extendedServiceBlocked
                      ? "Unele servicii nu sunt disponibile în programul extins"
                      : usesExtendedServicePrice
                      ? "Program extins · preț special"
                      : `Program extins · supliment ${surchargeLabel(selectedExtension)}`}
                  </Text>
                )}
              </View>
              <View style={styles.serviceChipPrice}>
                <Text style={styles.serviceChipPriceText}>
                  {formatPrice(combinedEffectiveTotalCents, primaryCurrency)}
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
                dayStatuses={dayStatuses}
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
                unavailable={dayUnavailable}
              />
            </View>
          </View>
        )}

        {/* ── Step 4: Confirmation (animated) ── */}
        {step === 4 && selectedBarber && selectedDate && selectedTime && (
          <View style={styles.stepContent}>
            <BookingForSelector
              dependents={dependents ?? []}
              value={bookingFor}
              onChange={setBookingFor}
            />
            {/* Guest management sits ABOVE the summary card so the add-person
                affordance is seen before the Total / "Confirmă" CTA. */}
            <BookingGuestsSection
              guests={guests}
              dependents={dependents ?? []}
              usedDependentIds={usedDependentIds}
              canAdd={selectedServices.length > 0 && guests.length < 5}
              formatPrice={formatPrice}
              onAdd={addGuest}
              onEdit={editGuestServices}
              onRemove={removeGuest}
            />
            <BookingConfirmation
              barber={selectedBarber}
              services={selectedServices}
              guests={guests.length > 0 ? guests.map((g) => ({ name: g.name, services: g.services })) : undefined}
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
                usesExtendedServicePrice || !selectedExtension
                  ? undefined
                  : surchargeLabel(selectedExtension)
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
              selectedServices={groupServices}
              personCount={1 + guests.length}
              isBusy={isCheckingFit}
              onContinue={handleContinueStep2}
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
