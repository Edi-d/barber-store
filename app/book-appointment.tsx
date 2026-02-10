import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Barber, BarberService } from "@/types/database";
import { formatPrice } from "@/lib/utils";
import { generateTimeSlots, getNext14Days, formatCalendarDay, TimeSlot } from "@/lib/booking";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "@/components/ui";

type BookingStep = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<BookingStep, string> = {
  1: "Alege Frizer",
  2: "Alege Serviciu",
  3: "Alege Data & Ora",
  4: "Confirmare",
};

export default function BookAppointmentScreen() {
  const { session } = useAuthStore();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<BookingStep>(1);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedService, setSelectedService] = useState<BarberService | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch barbers
  const { data: barbers, isLoading: barbersLoading } = useQuery({
    queryKey: ["barbers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barbers")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Barber[];
    },
  });

  // Fetch services
  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ["barber-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_services")
        .select("*")
        .eq("active", true)
        .order("price_cents");
      if (error) throw error;
      return data as BarberService[];
    },
  });

  // Fetch time slots when barber, service, and date are selected
  const { data: timeSlots, isLoading: slotsLoading } = useQuery({
    queryKey: ["time-slots", selectedBarber?.id, selectedDate?.toISOString(), selectedService?.duration_min],
    queryFn: async () => {
      if (!selectedBarber || !selectedDate || !selectedService) return [];
      return generateTimeSlots(selectedBarber.id, selectedDate, selectedService.duration_min);
    },
    enabled: !!selectedBarber && !!selectedDate && !!selectedService,
  });

  const next14Days = getNext14Days();

  const goNext = () => {
    if (step < 4) setStep((step + 1) as BookingStep);
  };

  const goBack = () => {
    if (step > 1) {
      setStep((step - 1) as BookingStep);
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    if (!session || !selectedBarber || !selectedService || !selectedDate || !selectedTime) return;

    setIsSubmitting(true);
    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      const { error } = await supabase.from("appointments").insert({
        user_id: session.user.id,
        barber_id: selectedBarber.id,
        service_id: selectedService.id,
        scheduled_at: scheduledAt.toISOString(),
        duration_min: selectedService.duration_min,
        status: "pending",
        notes: notes.trim() || null,
        total_cents: selectedService.price_cents,
        currency: selectedService.currency,
      });

      if (error) throw error;

      // Invalidate appointments cache
      queryClient.invalidateQueries({ queryKey: ["appointments"] });

      Alert.alert(
        "Programare creată! ✅",
        `Programarea ta la ${selectedBarber.name} pentru ${selectedService.name} a fost trimisă. Vei primi confirmarea în curând.`,
        [{ text: "OK", onPress: () => router.replace("/appointments") }]
      );
    } catch (err) {
      Alert.alert("Eroare", "Nu am putut crea programarea. Încearcă din nou.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Stepper indicator
  const StepIndicator = () => (
    <View className="flex-row items-center justify-center px-4 py-3 bg-white">
      {([1, 2, 3, 4] as BookingStep[]).map((s, i) => (
        <View key={s} className="flex-row items-center">
          <View
            className={`w-8 h-8 rounded-full items-center justify-center ${
              s === step
                ? "bg-primary-500"
                : s < step
                ? "bg-primary-500"
                : "bg-dark-200"
            }`}
          >
            {s < step ? (
              <Ionicons name="checkmark" size={16} color="white" />
            ) : (
              <Text
                className={`text-sm font-bold ${
                  s === step ? "text-white" : "text-dark-500"
                }`}
              >
                {s}
              </Text>
            )}
          </View>
          {i < 3 && (
            <View
              className={`w-8 h-0.5 ${
                s < step ? "bg-primary-500" : "bg-dark-300"
              }`}
            />
          )}
        </View>
      ))}
    </View>
  );

  // Step 1: Select Barber
  const BarberSelection = () => (
    <View className="px-4 py-2">
      <Text className="text-dark-700 font-bold text-lg mb-1">Alege frizerul tău</Text>
      <Text className="text-dark-500 text-sm mb-4">Selectează un frizer disponibil</Text>

      {barbersLoading ? (
        <ActivityIndicator size="large" color="#0a66c2" className="my-8" />
      ) : (
        <View className="gap-3">
          {barbers?.map((barber) => (
            <Pressable
              key={barber.id}
              onPress={() => {
                setSelectedBarber(barber);
                goNext();
              }}
              className={`flex-row items-center p-4 rounded-2xl border-2 bg-white ${
                selectedBarber?.id === barber.id
                  ? "border-primary-500 bg-primary-50"
                  : "border-dark-200"
              }`}
            >
              {/* Avatar */}
              <View className="w-14 h-14 rounded-full overflow-hidden bg-dark-200 mr-4">
                {barber.avatar_url ? (
                  <Image
                    source={{ uri: barber.avatar_url }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="w-full h-full items-center justify-center bg-primary-100">
                    <Ionicons name="person" size={24} color="#0a66c2" />
                  </View>
                )}
              </View>

              {/* Info */}
              <View className="flex-1">
                <Text className="text-dark-700 font-bold text-base">{barber.name}</Text>
                {barber.bio && (
                  <Text className="text-dark-500 text-sm mt-0.5" numberOfLines={2}>
                    {barber.bio}
                  </Text>
                )}
                {barber.city && (
                  <View className="flex-row items-center mt-1.5">
                    <Ionicons name="location-outline" size={14} color="#64748b" />
                    <Text className="text-dark-400 text-xs ml-1">
                      {barber.address ? `${barber.address}, ${barber.city}` : barber.city}
                    </Text>
                  </View>
                )}
                {barber.specialties && barber.specialties.length > 0 && (
                  <View className="flex-row flex-wrap gap-1 mt-2">
                    {barber.specialties.slice(0, 3).map((spec) => (
                      <View key={spec} className="bg-primary-50 px-2 py-0.5 rounded-full">
                        <Text className="text-primary-600 text-[10px] font-medium">{spec}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Arrow */}
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  // Step 2: Select Service
  const ServiceSelection = () => (
    <View className="px-4 py-2">
      <Text className="text-dark-700 font-bold text-lg mb-1">Alege serviciul</Text>
      <Text className="text-dark-500 text-sm mb-4">
        Cu {selectedBarber?.name}
      </Text>

      {servicesLoading ? (
        <ActivityIndicator size="large" color="#0a66c2" className="my-8" />
      ) : (
        <View className="gap-3">
          {services?.map((service) => (
            <Pressable
              key={service.id}
              onPress={() => {
                setSelectedService(service);
                goNext();
              }}
              className={`p-4 rounded-2xl border-2 bg-white ${
                selectedService?.id === service.id
                  ? "border-primary-500 bg-primary-50"
                  : "border-dark-200"
              }`}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-dark-700 font-bold text-base">{service.name}</Text>
                  {service.description && (
                    <Text className="text-dark-500 text-sm mt-1" numberOfLines={2}>
                      {service.description}
                    </Text>
                  )}
                  <View className="flex-row items-center mt-2 gap-3">
                    <View className="flex-row items-center">
                      <Ionicons name="time-outline" size={14} color="#64748b" />
                      <Text className="text-dark-500 text-xs ml-1">{service.duration_min} min</Text>
                    </View>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-primary-500 font-bold text-lg">
                    {formatPrice(service.price_cents, service.currency)}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  // Step 3: Select Date & Time
  const DateTimeSelection = () => (
    <View className="py-2">
      <View className="px-4">
        <Text className="text-dark-700 font-bold text-lg mb-1">Alege data și ora</Text>
        <Text className="text-dark-500 text-sm mb-4">
          {selectedService?.name} • {selectedService?.duration_min} min
        </Text>
      </View>

      {/* Date Picker - Horizontal Calendar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        className="mb-5"
      >
        {next14Days.map((day) => {
          const { dayName, dayNumber, monthName } = formatCalendarDay(day);
          const isSelected = selectedDate?.toDateString() === day.toDateString();
          const isSunday = day.getDay() === 0;

          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => {
                if (!isSunday) {
                  setSelectedDate(day);
                  setSelectedTime(null); // Reset time when date changes
                }
              }}
              className={`w-16 py-3 rounded-2xl items-center ${
                isSelected
                  ? "bg-primary-500"
                  : isSunday
                  ? "bg-dark-100 opacity-40"
                  : "bg-white border border-dark-200"
              }`}
            >
              <Text
                className={`text-[10px] font-medium ${
                  isSelected ? "text-white" : isSunday ? "text-dark-400" : "text-dark-500"
                }`}
              >
                {dayName}
              </Text>
              <Text
                className={`text-xl font-bold mt-0.5 ${
                  isSelected ? "text-white" : isSunday ? "text-dark-400" : "text-dark-700"
                }`}
              >
                {dayNumber}
              </Text>
              <Text
                className={`text-[10px] ${
                  isSelected ? "text-white/80" : isSunday ? "text-dark-400" : "text-dark-400"
                }`}
              >
                {monthName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Time Slots */}
      <View className="px-4">
        {!selectedDate ? (
          <View className="items-center py-8">
            <Ionicons name="calendar-outline" size={48} color="#94a3b8" />
            <Text className="text-dark-500 mt-3">Selectează o dată mai întâi</Text>
          </View>
        ) : slotsLoading ? (
          <ActivityIndicator size="large" color="#0a66c2" className="my-8" />
        ) : !timeSlots || timeSlots.length === 0 ? (
          <View className="items-center py-8">
            <Ionicons name="time-outline" size={48} color="#94a3b8" />
            <Text className="text-dark-500 mt-3 text-center">
              Frizerul nu lucrează în această zi.{"\n"}Alege altă dată.
            </Text>
          </View>
        ) : (
          <>
            <Text className="text-dark-600 font-semibold text-sm mb-3">Ore disponibile</Text>
            <View className="flex-row flex-wrap gap-2">
              {timeSlots.map((slot) => (
                <Pressable
                  key={slot.time}
                  onPress={() => {
                    if (slot.available) {
                      setSelectedTime(slot.time);
                    }
                  }}
                  disabled={!slot.available}
                  className={`px-4 py-2.5 rounded-xl ${
                    selectedTime === slot.time
                      ? "bg-primary-500"
                      : slot.available
                      ? "bg-white border border-dark-200"
                      : "bg-dark-100 opacity-40"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      selectedTime === slot.time
                        ? "text-white"
                        : slot.available
                        ? "text-dark-700"
                        : "text-dark-400 line-through"
                    }`}
                  >
                    {slot.time}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Next button */}
      {selectedTime && (
        <View className="px-4 mt-6">
          <Pressable
            onPress={goNext}
            className="bg-primary-500 py-4 rounded-2xl items-center flex-row justify-center"
          >
            <Text className="text-white font-bold text-base">Continuă</Text>
            <Ionicons name="arrow-forward" size={20} color="white" className="ml-2" />
          </Pressable>
        </View>
      )}
    </View>
  );

  // Step 4: Confirmation
  const Confirmation = () => (
    <View className="px-4 py-2">
      <Text className="text-dark-700 font-bold text-lg mb-4">Confirmă programarea</Text>

      {/* Summary Card */}
      <View className="bg-white rounded-2xl border border-dark-200 overflow-hidden mb-4">
        {/* Barber */}
        <View className="flex-row items-center p-4 border-b border-dark-200">
          <View className="w-12 h-12 rounded-full overflow-hidden bg-dark-200 mr-3">
            {selectedBarber?.avatar_url ? (
              <Image
                source={{ uri: selectedBarber.avatar_url }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <View className="w-full h-full items-center justify-center bg-primary-100">
                <Ionicons name="person" size={20} color="#0a66c2" />
              </View>
            )}
          </View>
          <View className="flex-1">
            <Text className="text-dark-500 text-xs">Frizer</Text>
            <Text className="text-dark-700 font-bold">{selectedBarber?.name}</Text>
          </View>
          <Ionicons name="checkmark-circle" size={24} color="#0a66c2" />
        </View>

        {/* Service */}
        <View className="flex-row items-center p-4 border-b border-dark-200">
          <View className="w-12 h-12 rounded-xl bg-primary-50 items-center justify-center mr-3">
            <Ionicons name="cut" size={20} color="#0a66c2" />
          </View>
          <View className="flex-1">
            <Text className="text-dark-500 text-xs">Serviciu</Text>
            <Text className="text-dark-700 font-bold">{selectedService?.name}</Text>
            <Text className="text-dark-500 text-xs mt-0.5">{selectedService?.duration_min} minute</Text>
          </View>
          <Text className="text-primary-500 font-bold text-lg">
            {selectedService && formatPrice(selectedService.price_cents, selectedService.currency)}
          </Text>
        </View>

        {/* Date & Time */}
        <View className="flex-row items-center p-4">
          <View className="w-12 h-12 rounded-xl bg-primary-50 items-center justify-center mr-3">
            <Ionicons name="calendar" size={20} color="#0a66c2" />
          </View>
          <View className="flex-1">
            <Text className="text-dark-500 text-xs">Data & Ora</Text>
            <Text className="text-dark-700 font-bold">
              {selectedDate?.toLocaleDateString("ro-RO", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </Text>
            <Text className="text-primary-500 font-semibold mt-0.5">{selectedTime}</Text>
          </View>
        </View>
      </View>

      {/* Notes */}
      <View className="mb-4">
        <Text className="text-dark-600 font-semibold text-sm mb-2">Note (opțional)</Text>
        <Input
          placeholder="Ex: Fade mediu, păstrat lungimea sus..."
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </View>

      {/* Total */}
      <View className="flex-row items-center justify-between bg-primary-50 p-4 rounded-2xl mb-6">
        <Text className="text-dark-700 font-semibold text-base">Total</Text>
        <Text className="text-primary-500 font-bold text-2xl">
          {selectedService && formatPrice(selectedService.price_cents, selectedService.currency)}
        </Text>
      </View>

      {/* Submit Button */}
      <Pressable
        onPress={handleSubmit}
        disabled={isSubmitting}
        className={`py-4 rounded-2xl items-center flex-row justify-center ${
          isSubmitting ? "bg-primary-300" : "bg-primary-500"
        }`}
      >
        {isSubmitting ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={22} color="white" />
            <Text className="text-white font-bold text-base ml-2">Confirmă Programarea</Text>
          </>
        )}
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-dark-300 bg-white">
        <Pressable onPress={goBack} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </Pressable>
        <Text className="text-dark-700 text-xl font-bold flex-1">
          {STEP_TITLES[step]}
        </Text>
        <Text className="text-dark-400 text-sm">Pas {step}/4</Text>
      </View>

      {/* Step Indicator */}
      <StepIndicator />

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && <BarberSelection />}
        {step === 2 && <ServiceSelection />}
        {step === 3 && <DateTimeSelection />}
        {step === 4 && <Confirmation />}
      </ScrollView>
    </SafeAreaView>
  );
}
