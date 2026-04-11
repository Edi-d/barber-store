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
import { generateTimeSlots, getNext14Days, formatCalendarDay, findFirstAvailableDate } from "@/lib/booking";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button } from "@/components/ui/Button";
import { Bubble, Colors, Typography, Shadows } from "@/constants/theme";
import { useTutorialContext } from "@/components/tutorial/TutorialProvider";

// ── Animated components ──────────────────────────────────────────────────────
import { BookingStepIndicator } from "@/components/shared/BookingStepIndicator";
import { BarberCard } from "@/components/shared/BarberCard";
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
  const { salonId: rawSalonId, serviceId, barberId } = useLocalSearchParams<{
    salonId?: string;
    serviceId?: string;
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
  const [paramsApplied, setParamsApplied] = useState(false);
  const [bookingResult, setBookingResult] =
    useState<BookingSuccessResult | null>(null);

  // ── Tutorial refs ────────────────────────────────────────────────────────
  const { registerRef, unregisterRef } = useTutorialContext();

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
  const { data: barbers, isLoading: barbersLoading } = useQuery({
    queryKey: ["barbers", salonId || "all"],
    queryFn: async () => {
      let query = supabase
        .from("barbers")
        .select("*")
        .eq("active", true)
        .order("name");
      if (salonId) query = query.eq("salon_id", salonId);
      const { data, error } = await query;
      if (error) throw error;
      return data as Barber[];
    },
  });

  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ["barber-services", salonId || "all"],
    queryFn: async () => {
      let query = supabase
        .from("barber_services")
        .select("*")
        .eq("active", true)
        .order("price_cents");
      if (salonId) query = query.eq("salon_id", salonId);
      const { data, error } = await query;
      if (error) throw error;
      return data as BarberService[];
    },
  });

  const { data: timeSlots, isLoading: slotsLoading } = useQuery({
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
        totalDurationMin
      );
    },
    enabled: !!selectedBarber && !!selectedDate && totalDurationMin > 0,
  });

  // Find first available date (checks schedule + appointments)
  const { data: firstAvailableData } = useQuery({
    queryKey: ["first-available-date", selectedBarber?.id, totalDurationMin],
    queryFn: () => findFirstAvailableDate(selectedBarber!.id, totalDurationMin || 30),
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
  }, [step, firstAvailableData]);

  // ── Auto-apply route params ────────────────────────────────────────────
  useEffect(() => {
    if (paramsApplied || !barbers) return;

    // If barberId is provided, pre-select that barber and skip to step 2
    if (barberId) {
      const barber = barbers.find((b) => b.id === barberId);
      if (barber) {
        setSelectedBarber(barber);
        if (serviceId && services) {
          const service = services.find((s) => s.id === serviceId);
          if (service) {
            setSelectedServices([service]);
            setStep(3); // Skip to date/time
          } else {
            setStep(2); // Go to services
          }
        } else {
          setStep(2); // Go to services
        }
        setParamsApplied(true);
        return;
      }
    }

    if (salonId && barbers.length === 1) {
      setSelectedBarber(barbers[0]);
      if (serviceId && services) {
        const service = services.find((s) => s.id === serviceId);
        if (service) {
          setSelectedServices([service]);
          setStep(3);
        } else {
          setStep(2);
        }
      } else {
        setStep(2);
      }
      setParamsApplied(true);
      return;
    }

    if (salonId && barbers.length > 1) {
      if (serviceId && services) {
        const service = services.find((s) => s.id === serviceId);
        if (service) setSelectedServices([service]);
      }
      setStep(1);
      setParamsApplied(true);
      return;
    }

    if (!salonId) {
      setParamsApplied(true);
    }
  }, [barberId, salonId, serviceId, barbers, services, paramsApplied]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (step === 1) {
      if (selectedServices.length > 0) {
        setStep(3);
      } else {
        setStep(2);
      }
    } else if (step < 4) {
      setStep((step + 1) as BookingStep);
    }
  }, [step, selectedServices]);

  const goBack = useCallback(() => {
    if (
      step === 3 &&
      selectedServices.length > 0 &&
      salonId &&
      barbers &&
      barbers.length > 1
    ) {
      setStep(1);
    } else if (step === 2 && salonId && barbers && barbers.length === 1) {
      router.back();
    } else if (
      step === 3 &&
      salonId &&
      barbers &&
      barbers.length === 1 &&
      selectedServices.length > 0
    ) {
      router.back();
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
  }, []);

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

    setIsSubmitting(true);
    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      // Race condition guard — overlap check, not just exact-timestamp match.
      // Fetch all pending/confirmed appointments for this barber on the same day
      // and check whether any of them overlaps the new slot window.
      const newSlotStart = scheduledAt.getTime();
      const newSlotEnd = newSlotStart + totalDurationMin * 60_000;

      const dayStart = new Date(scheduledAt);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(scheduledAt);
      dayEnd.setHours(23, 59, 59, 999);

      const { data: dayAppointments, error: checkError } = await supabase
        .from("appointments")
        .select("id, scheduled_at, duration_min")
        .eq("barber_id", selectedBarber.id)
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_at", dayStart.toISOString())
        .lte("scheduled_at", dayEnd.toISOString());

      if (checkError) throw checkError;

      const hasOverlap = (dayAppointments ?? []).some((apt) => {
        const aptStart = new Date(apt.scheduled_at).getTime();
        const aptEnd = aptStart + apt.duration_min * 60_000;
        // Two intervals overlap when: A starts before B ends AND A ends after B starts
        return newSlotStart < aptEnd && newSlotEnd > aptStart;
      });

      if (hasOverlap) {
        Alert.alert(
          "Interval indisponibil",
          "Acest interval nu mai este disponibil. Te rugăm să alegi alt interval.",
          [{ text: "OK" }]
        );
        setIsSubmitting(false);
        return;
      }

      const { data: inserted, error } = await supabase
        .from("appointments")
        .insert({
          user_id: session.user.id,
          barber_id: selectedBarber.id,
          service_id: selectedServices[0].id,
          scheduled_at: scheduledAt.toISOString(),
          duration_min: totalDurationMin,
          status: "pending",
          notes: notes.trim() || null,
          total_cents: totalPriceCents,
          currency: primaryCurrency,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Insert junction rows for every selected service (migration 047)
      const serviceRows = selectedServices.map((s, index) => ({
        appointment_id: inserted.id,
        service_id: s.id,
        duration_min: s.duration_min,
        price_cents: s.price_cents,
        sort_order: index,
      }));

      const { error: servicesError } = await supabase
        .from("appointment_services")
        .insert(serviceRows);

      if (servicesError) throw servicesError;

      queryClient.invalidateQueries({ queryKey: ["appointments"] });

      setBookingResult({
        id: inserted.id,
        barberName: selectedBarber.name,
        serviceNames: selectedServices.map((s) => s.name),
        date: scheduledAt,
        time: selectedTime,
        totalPriceCents,
        currency: primaryCurrency,
        totalDurationMin,
      });
    } catch (err) {
      Alert.alert(
        "Eroare",
        "Nu am putut crea programarea. Încearcă din nou."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddToCalendar = () => {
    if (!bookingResult) return;
    Alert.alert(
      "Calendar",
      "Funcționalitate disponibilă în curând.",
      [{ text: "OK" }]
    );
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
      <View ref={stepIndicatorRef}>
        <BookingStepIndicator currentStep={step} stepTitles={STEP_TITLES} />
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
            ) : (
              <View style={{ gap: 12 }}>
                {barbers?.map((barber, index) => (
                  <View
                    key={barber.id}
                    ref={index === 0 ? barberCardRef : undefined}
                  >
                    <View ref={index === 0 ? barberSelectedRef : undefined}>
                      <BarberCard
                        barber={barber}
                        isSelected={selectedBarber?.id === barber.id}
                        onSelect={() => {
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
            ) : services?.length === 0 ? (
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
                {services?.map((service, index) => (
                  <View
                    key={service.id}
                    ref={index === 0 ? serviceCardRef : undefined}
                  >
                    <View ref={index === 0 ? serviceCheckboxRef : undefined}>
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
              </View>
              <View style={styles.serviceChipPrice}>
                <Text style={styles.serviceChipPriceText}>
                  {formatPrice(totalPriceCents, primaryCurrency)}
                </Text>
              </View>
            </View>

            {/* Animated date picker */}
            <View ref={datePickerRef}>
              <BookingDatePicker
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setSelectedTime(null);
                }}
                disabledDays={firstAvailableData?.offDays ?? [0]}
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
              summaryCardRef={summaryCardRef}
              notesInputRef={notesInputRef}
              confirmBtnRef={confirmBtnRef}
            />
          </View>
        )}
      </ScrollView>

      {/* ── Step 2: Floating bar (animated) ── */}
      {step === 2 && (
        <View ref={floatingBarRef} style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
          <View ref={continueBtnRef} pointerEvents="box-none">
            <BookingFloatingBar
              selectedServices={selectedServices}
              onContinue={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStep(3);
              }}
              formatPrice={formatPrice}
            />
          </View>
        </View>
      )}

      {/* ── Step 3: Sticky CTA when time is selected ── */}
      {step === 3 && selectedTime ? (
        <View ref={timeCtaRef} style={styles.stickyBar}>
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
