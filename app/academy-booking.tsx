import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import {
  AcademyBarber,
  BarberService,
  BookAcademyAppointmentResult,
} from "@/types/database";
import {
  generateTimeSlots,
  findFirstAvailableDate,
  findNextAvailableDateAfter,
  DayStatus,
  DayUnavailableReason,
} from "@/lib/booking";
import { addBookingToCalendar, openAppSettings, CalendarError } from "@/lib/calendar";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button } from "@/components/ui/Button";
import { Bubble, Colors, Typography } from "@/constants/theme";

import { BookingStepIndicator } from "@/components/shared/BookingStepIndicator";
import { BarberCard } from "@/components/shared/BarberCard";
import { ServiceCard } from "@/components/shared/ServiceCard";
import { BookingDatePicker } from "@/components/shared/BookingDatePicker";
import { BookingTimeGrid, UnavailableNotice } from "@/components/shared/BookingTimeGrid";
import { BookingConfirmation } from "@/components/shared/BookingConfirmation";
import { BookingSuccess, BookingSuccessResult } from "@/components/shared/BookingSuccess";
import { BookingFloatingBar } from "@/components/shared/BookingFloatingBar";

// ─────────────────────────────────────────────────────────────────────────────
// Academy free-haircut booking — a slim, single-person / single-service /
// always-free sibling of app/book-appointment.tsx. Reuses the exact same
// shared components and slot-generation helpers; no guests, no dependents,
// no packages, no extended-hours surcharge, no reschedule.
// ─────────────────────────────────────────────────────────────────────────────

type BookingStep = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<BookingStep, string> = {
  1: "Alege Ucenicul",
  2: "Alege Serviciul",
  3: "Alege Data & Ora",
  4: "Confirmare",
};

const squircleSm = { ...Bubble.radiiSm };

// Everything in this flow is free — every price display (service cards, the
// floating bar, the confirmation total, the success screen) is routed through
// this instead of the real formatPrice, so the real price_cents never leaks
// into the UI regardless of what's stored on barber_services.
const freeFormatPrice = () => "Gratuit";

export default function AcademyBookingScreen() {
  const { session } = useAuthStore();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<BookingStep>(1);
  const [selectedBarber, setSelectedBarber] = useState<AcademyBarber | null>(null);
  const [selectedService, setSelectedService] = useState<BarberService | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingCalendar, setIsAddingCalendar] = useState(false);
  const [calendarEventAdded, setCalendarEventAdded] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingSuccessResult | null>(null);

  // Re-entrancy guard for handleSubmit — set synchronously to prevent double-tap.
  const submittingRef = useRef(false);

  // ── Step 1: Academy trainee barbers, pooled across ALL salons ──────────────
  const {
    data: barbers,
    isLoading: barbersLoading,
    error: barbersError,
    refetch: refetchBarbers,
  } = useQuery({
    queryKey: ["academy-barbers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academy_barbers").select("*");
      if (error) throw error;
      return (data ?? []) as AcademyBarber[];
    },
  });

  const sortedBarbers = useMemo(() => {
    if (!barbers) return barbers;
    return [...barbers].sort((a, b) => a.name.localeCompare(b.name, "ro"));
  }, [barbers]);

  // ── Step 2: this barber's services (mirrors book-appointment.tsx) ─────────
  const { data: barberAssignments } = useQuery({
    queryKey: ["academy-barber-assignments", selectedBarber?.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_service_assignments")
        .select("service_id")
        .eq("barber_id", selectedBarber!.id);
      if (error) throw error;
      return (data ?? []) as { service_id: string }[];
    },
    enabled: !!selectedBarber,
  });

  const {
    data: services,
    isLoading: servicesLoading,
    error: servicesError,
    refetch: refetchServices,
  } = useQuery({
    queryKey: ["academy-services", selectedBarber?.salon_id ?? "none"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_services")
        .select("*")
        .eq("active", true)
        .eq("salon_id", selectedBarber!.salon_id!)
        .order("price_cents");
      if (error) throw error;
      return (data ?? []) as BarberService[];
    },
    enabled: !!selectedBarber,
  });

  // Zero assignment rows == every active salon service is allowed for this barber.
  const visibleServices = useMemo<BarberService[]>(() => {
    if (!services) return [];
    if (!barberAssignments || barberAssignments.length === 0) return services;
    const allowed = new Set(barberAssignments.map((a) => a.service_id));
    return services.filter((s) => allowed.has(s.id));
  }, [services, barberAssignments]);

  // ── Step 3: slots for the single chosen service's duration ─────────────────
  const timeSlotsQueryKey = useMemo(
    () =>
      [
        "academy-time-slots",
        selectedBarber?.id,
        selectedDate?.toISOString(),
        selectedService?.duration_min,
      ] as const,
    [selectedBarber, selectedDate, selectedService]
  );

  const {
    data: daySlots,
    isLoading: slotsLoading,
    isError: slotsError,
    refetch: refetchSlots,
  } = useQuery({
    queryKey: timeSlotsQueryKey,
    queryFn: async () => {
      if (!selectedBarber || !selectedDate || !selectedService) {
        return { slots: [], unavailableReason: null };
      }
      return generateTimeSlots(
        selectedBarber.id,
        selectedDate,
        selectedService.duration_min,
        selectedBarber.salon_id
      );
    },
    enabled: !!selectedBarber && !!selectedDate && !!selectedService,
    staleTime: 30_000,
  });

  const timeSlots = daySlots?.slots;

  const { data: firstAvailableData } = useQuery({
    queryKey: ["academy-first-available-date", selectedBarber?.id, selectedService?.duration_min],
    queryFn: () =>
      findFirstAvailableDate(
        selectedBarber!.id,
        selectedService!.duration_min,
        selectedBarber!.salon_id
      ),
    enabled: !!selectedBarber && !!selectedService,
    staleTime: 2 * 60 * 1000,
  });

  const { data: nextAvailableDate } = useQuery({
    queryKey: [
      "academy-next-available-after",
      selectedBarber?.id,
      selectedDate?.toISOString(),
      selectedService?.duration_min,
    ],
    queryFn: () =>
      findNextAvailableDateAfter(
        selectedBarber!.id,
        selectedService!.duration_min,
        selectedBarber!.salon_id,
        selectedDate!
      ),
    enabled:
      !!selectedBarber && !!selectedDate && !!selectedService && !!daySlots?.unavailableReason,
    staleTime: 60_000,
  });

  const dayUnavailable = useMemo<UnavailableNotice | null>(() => {
    const reason = daySlots?.unavailableReason;
    if (!reason || !selectedDate) return null;

    const barberName = selectedBarber?.name ?? "Frizerul";

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

  const dayStatuses = useMemo(() => {
    if (!firstAvailableData?.days) return undefined;
    const map = new Map<string, DayStatus>();
    for (const d of firstAvailableData.days) {
      map.set(d.date.toDateString(), d.status);
    }
    return map;
  }, [firstAvailableData]);

  // Auto-select first available date when entering step 3.
  useEffect(() => {
    if (step === 3 && firstAvailableData && !selectedDate) {
      if (firstAvailableData.date) {
        setSelectedDate(firstAvailableData.date);
        setSelectedTime(null);
      }
    }
  }, [step, firstAvailableData, selectedDate]);

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return "";
    return selectedDate.toLocaleDateString("ro-RO", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }, [selectedDate]);

  // ── Navigation ───────────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    if (step === 3) {
      setSelectedTime(null);
      setSelectedDate(null);
      setStep(2);
    } else if (step > 1) {
      setStep((step - 1) as BookingStep);
    } else {
      router.back();
    }
  }, [step]);

  // Single-select: choosing a service replaces any previous selection.
  const handleSelectService = useCallback((service: BarberService) => {
    setSelectedService((prev) => (prev?.id === service.id ? null : service));
    setSelectedDate(null);
    setSelectedTime(null);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!session || !selectedBarber || !selectedService || !selectedDate || !selectedTime) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      const { data, error } = await supabase.rpc("book_academy_appointment", {
        p_barber_id: selectedBarber.id,
        p_service_id: selectedService.id,
        p_scheduled_at: scheduledAt.toISOString(),
        p_notes: notes.trim() || null,
      });

      if (error) {
        const code = error.code ?? "";
        const msg = error.message ?? "";

        console.error("[academy-book] book_academy_appointment failed", {
          code,
          message: msg,
          details: (error as { details?: string }).details,
          hint: (error as { hint?: string }).hint,
        });

        // One active free booking at a time (migration 162, errcode 23505).
        if (code === "23505" || msg.includes("academy_booking_exists")) {
          Alert.alert(
            "Programare activă existentă",
            "Ai deja o programare gratuită activă. Poți face una nouă după ce o finalizezi.",
            [{ text: "OK" }]
          );
          return;
        }

        // Slot just taken / barber on break (errcode 23P01).
        if (code === "23P01") {
          queryClient.invalidateQueries({ queryKey: ["academy-time-slots"] });
          queryClient.invalidateQueries({ queryKey: ["academy-first-available-date"] });
          setSelectedTime(null);
          setStep(3);
          Alert.alert("Interval indisponibil", "Acest interval nu mai este disponibil.", [
            { text: "OK" },
          ]);
          return;
        }

        if (code === "42501") {
          Alert.alert("Sesiune expirată", "Te rugăm să te autentifici din nou.", [{ text: "OK" }]);
          return;
        }

        if (code === "22023") {
          if (msg.includes("outside_working_hours") || msg.includes("past_slot")) {
            queryClient.invalidateQueries({ queryKey: ["academy-time-slots"] });
            queryClient.invalidateQueries({ queryKey: ["academy-first-available-date"] });
            setSelectedTime(null);
            setStep(3);
            Alert.alert("Interval indisponibil", "Acest interval nu mai este disponibil.", [
              { text: "OK" },
            ]);
            return;
          }
          if (msg.includes("service_not_assigned") || msg.includes("invalid_service")) {
            setSelectedService(null);
            setStep(2);
            Alert.alert(
              "Serviciu indisponibil",
              "Acest serviciu nu mai este disponibil la acest ucenic. Alege din nou.",
              [{ text: "OK" }]
            );
            return;
          }
          if (msg.includes("invalid_academy_barber")) {
            setSelectedBarber(null);
            setSelectedService(null);
            setStep(1);
            Alert.alert(
              "Ucenic indisponibil",
              "Acest ucenic nu mai este disponibil pentru tunsori gratuite. Alege alt ucenic.",
              [{ text: "OK" }]
            );
            return;
          }
        }

        Alert.alert("Eroare", "Nu am putut crea programarea. Încearcă din nou.", [{ text: "OK" }]);
        return;
      }

      const rows = (data as BookAcademyAppointmentResult[]) ?? [];
      const row = rows[0];
      if (!row) {
        Alert.alert("Eroare", "Nu am putut crea programarea. Încearcă din nou.", [{ text: "OK" }]);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["next-appointment"] });
      queryClient.invalidateQueries({ queryKey: ["today-appointments-all"] });

      setBookingResult({
        id: row.id,
        barberName: selectedBarber.name,
        serviceNames: [selectedService.name],
        date: scheduledAt,
        time: selectedTime,
        totalPriceCents: 0,
        currency: row.currency,
        totalDurationMin: row.duration_min,
      });
    } catch (err) {
      Alert.alert("Eroare", "Nu am putut crea programarea. Încearcă din nou.", [{ text: "OK" }]);
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
      Alert.alert("Adăugat în calendar", "Programarea apare acum în calendarul tău.", [
        { text: "OK" },
      ]);
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
          Alert.alert("Nu există calendar", "Nu am găsit un calendar editabil pe acest dispozitiv.", [
            { text: "OK" },
          ]);
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

  // ══════════════════════════════════════════════════════════════════════════
  // SUCCESS SCREEN
  // ══════════════════════════════════════════════════════════════════════════
  if (bookingResult) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fbff" }} edges={["top"]}>
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
            setSelectedService(null);
            setSelectedDate(null);
            setSelectedTime(null);
            setNotes("");
            setCalendarEventAdded(false);
            setIsAddingCalendar(false);
          }}
          onGoHome={() => {
            router.replace("/(tabs)/discover" as any);
          }}
          formatPrice={freeFormatPrice}
        />
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN BOOKING FLOW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
      {/* ── Header ── */}
      <View style={styles.headerBar}>
        <Pressable onPress={goBack} style={[squircleSm, styles.backButton]}>
          <Ionicons name="arrow-back" size={20} color="#334155" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.h3, { color: Colors.text }]}>Tuns gratuit</Text>
          <Text style={[Typography.small, { color: Colors.textSecondary }]}>
            {STEP_TITLES[step]}
          </Text>
        </View>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{step}/4</Text>
        </View>
      </View>

      {/* ── Step indicator ── */}
      <BookingStepIndicator
        currentStep={step}
        stepTitles={STEP_TITLES}
        onStepPress={(target) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          if (target < step) {
            if (step >= 3 && target <= 2) {
              setSelectedTime(null);
              setSelectedDate(null);
            }
            setStep(target);
          }
        }}
      />

      {/* ── Content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: step === 2 ? 0 : step === 3 && selectedTime ? 100 : 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Step 1: Trainee barber selection ── */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Alege un ucenic</Text>
            <Text style={styles.stepSubtitle}>
              Rezervă o tunsoare gratuită cu un frizer aflat în formare (Academy).
            </Text>

            {barbersLoading ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 32 }} />
            ) : barbersError ? (
              <View style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>Nu am putut încărca datele.</Text>
                <Pressable onPress={() => refetchBarbers()} style={styles.inlineRetry}>
                  <Text style={styles.inlineRetryText}>Reîncearcă</Text>
                </Pressable>
              </View>
            ) : !sortedBarbers || sortedBarbers.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyStateIcon}>
                  <Ionicons name="school-outline" size={28} color="#64748b" />
                </View>
                <Text style={styles.emptyTitle}>Niciun ucenic disponibil</Text>
                <Text style={styles.emptySubtitle}>
                  Revino mai târziu pentru programări gratuite.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {sortedBarbers.map((barber, index) => {
                  // BarberCard reads avatar_url with a profile.avatar_url fallback
                  // (used when a barber row has no avatar of its own) — the view
                  // exposes that as profile_avatar_url, so bridge it here.
                  const cardBarber = {
                    ...barber,
                    profile: { avatar_url: barber.profile_avatar_url },
                  };
                  return (
                    <View key={barber.id}>
                      <View className="flex-row items-center justify-between px-1 mb-2">
                        <View className="flex-row items-center gap-1 bg-[#E8F3FF] px-2 py-1 rounded-full">
                          <Ionicons name="school-outline" size={12} color={Colors.primary} />
                          <Text
                            className="text-[11px]"
                            style={{ fontFamily: "EuclidCircularA-Bold", color: Colors.primary }}
                          >
                            Academy
                          </Text>
                        </View>
                        <Text
                          className="text-xs flex-shrink ml-2"
                          numberOfLines={1}
                          style={{ fontFamily: "EuclidCircularA-Medium", color: Colors.textTertiary }}
                        >
                          {barber.salon_name}
                          {barber.salon_city ? `, ${barber.salon_city}` : ""}
                        </Text>
                      </View>
                      <BarberCard
                        barber={cardBarber}
                        isSelected={selectedBarber?.id === barber.id}
                        onSelect={() => {
                          if (selectedBarber?.id !== barber.id) {
                            setSelectedService(null);
                            setSelectedDate(null);
                            setSelectedTime(null);
                          }
                          setSelectedBarber(barber);
                          setStep(2);
                        }}
                        index={index}
                      />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── Step 2: Single free service selection ── */}
        {step === 2 && (
          <View
            style={[styles.stepContent, { paddingBottom: selectedService ? 120 : 32 }]}
          >
            <Text style={styles.stepTitle}>Alege serviciul</Text>
            <Text style={styles.stepSubtitle}>
              Un singur serviciu, complet gratuit — alegerea unui alt serviciu o înlocuiește pe cea curentă.
            </Text>

            {servicesLoading ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 32 }} />
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
                <Text style={styles.emptyTitle}>Niciun serviciu disponibil</Text>
                <Text style={styles.emptySubtitle}>
                  Acest ucenic nu are servicii active momentan.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {visibleServices.map((service, index) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    isSelected={selectedService?.id === service.id}
                    onToggle={() => handleSelectService(service)}
                    index={index}
                    formatPrice={freeFormatPrice}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Step 3: Date & Time ── */}
        {step === 3 && (
          <View style={{ flex: 1 }}>
            <View style={styles.serviceChip}>
              <View style={styles.serviceChipIcon}>
                <Ionicons name="cut" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.captionSemiBold, { color: Colors.text }]} numberOfLines={2}>
                  {selectedService?.name ?? ""}
                </Text>
                <Text style={[Typography.small, { color: Colors.textTertiary, marginTop: 2 }]}>
                  {selectedService?.duration_min ?? 0} min · cu {selectedBarber?.name}
                </Text>
              </View>
              <View style={styles.serviceChipPrice}>
                <Text style={styles.serviceChipPriceText}>Gratuit</Text>
              </View>
            </View>

            <BookingDatePicker
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setSelectedTime(null);
              }}
              disabledDays={firstAvailableData?.offDays}
              dayStatuses={dayStatuses}
            />

            <View style={styles.divider} />

            <View style={{ paddingHorizontal: 16, flex: 1 }}>
              <BookingTimeGrid
                timeSlots={timeSlots}
                selectedTime={selectedTime}
                onSelectTime={setSelectedTime}
                isLoading={slotsLoading}
                hasSelectedDate={!!selectedDate}
                isError={slotsError}
                onRetry={refetchSlots}
                unavailable={dayUnavailable}
              />
            </View>
          </View>
        )}

        {/* ── Step 4: Confirmation ── */}
        {step === 4 && selectedBarber && selectedService && selectedDate && selectedTime && (
          <View style={styles.stepContent}>
            <BookingConfirmation
              barber={selectedBarber}
              services={[selectedService]}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              notes={notes}
              onNotesChange={setNotes}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              formatPrice={freeFormatPrice}
            />
          </View>
        )}
      </ScrollView>

      {/* ── Step 2: Floating bar ── */}
      {step === 2 && (
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
          <BookingFloatingBar
            selectedServices={selectedService ? [selectedService] : []}
            onContinue={() => {
              if (!selectedService) return;
              setStep(3);
            }}
            formatPrice={freeFormatPrice}
          />
        </View>
      )}

      {/* ── Step 3: Sticky CTA when time is selected ── */}
      {step === 3 && selectedTime ? (
        <View style={styles.stickyBar}>
          <Button variant="primary" size="lg" onPress={() => setStep(4)}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="calendar" size={16} color="rgba(255,255,255,0.8)" />
              <Text style={styles.stickyDateText}>{formattedSelectedDate}</Text>
              <Text style={styles.stickyDot}>·</Text>
              <Ionicons name="time" size={16} color="rgba(255,255,255,0.8)" />
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
