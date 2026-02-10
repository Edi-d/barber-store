import { supabase } from "@/lib/supabase";
import { BarberAvailability } from "@/types/database";

export interface TimeSlot {
  time: string; // "HH:MM" format
  available: boolean;
}

/**
 * Generate available time slots for a barber on a specific date.
 * Checks barber availability schedule and existing appointments to find free slots.
 */
export async function generateTimeSlots(
  barberId: string,
  date: Date,
  serviceDurationMin: number
): Promise<TimeSlot[]> {
  const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday

  // 1. Get barber's working hours for this day
  const { data: availability, error: availError } = await supabase
    .from("barber_availability")
    .select("*")
    .eq("barber_id", barberId)
    .eq("day_of_week", dayOfWeek)
    .eq("is_available", true)
    .single();

  if (availError || !availability) {
    // Barber doesn't work this day
    return [];
  }

  // 2. Get existing appointments for this barber on this date
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const { data: existingAppointments } = await supabase
    .from("appointments")
    .select("scheduled_at, duration_min")
    .eq("barber_id", barberId)
    .in("status", ["pending", "confirmed"])
    .gte("scheduled_at", startOfDay.toISOString())
    .lte("scheduled_at", endOfDay.toISOString());

  // 3. Parse working hours
  const [startH, startM] = (availability as BarberAvailability).start_time.split(":").map(Number);
  const [endH, endM] = (availability as BarberAvailability).end_time.split(":").map(Number);

  // 4. Generate 30-minute interval slots
  const slots: TimeSlot[] = [];
  const slotIntervalMin = 30;

  let currentH = startH;
  let currentM = startM;

  while (true) {
    // Check if service would finish before end of working hours
    const serviceEndMin = currentH * 60 + currentM + serviceDurationMin;
    const workEndMin = endH * 60 + endM;

    if (serviceEndMin > workEndMin) break;

    const timeStr = `${currentH.toString().padStart(2, "0")}:${currentM.toString().padStart(2, "0")}`;

    // Check if this slot conflicts with any existing appointment
    const slotStart = new Date(date);
    slotStart.setHours(currentH, currentM, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + serviceDurationMin * 60000);

    const isConflict = (existingAppointments || []).some((apt) => {
      const aptStart = new Date(apt.scheduled_at);
      const aptEnd = new Date(aptStart.getTime() + apt.duration_min * 60000);
      // Overlap check: slot starts before apt ends AND slot ends after apt starts
      return slotStart < aptEnd && slotEnd > aptStart;
    });

    // Also check if slot is in the past (for today)
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isPast = isToday && slotStart <= now;

    slots.push({
      time: timeStr,
      available: !isConflict && !isPast,
    });

    // Advance by slot interval
    currentM += slotIntervalMin;
    if (currentM >= 60) {
      currentH += Math.floor(currentM / 60);
      currentM = currentM % 60;
    }
  }

  return slots;
}

/**
 * Get the next 14 days starting from today.
 */
export function getNext14Days(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    days.push(day);
  }

  return days;
}

/**
 * Format a date for display in the calendar.
 */
export function formatCalendarDay(date: Date): { dayName: string; dayNumber: string; monthName: string } {
  const dayNames = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];
  const monthNames = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return {
    dayName: dayNames[date.getDay()],
    dayNumber: date.getDate().toString(),
    monthName: monthNames[date.getMonth()],
  };
}
