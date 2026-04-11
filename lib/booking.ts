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

/**
 * Find the first date (from next 14 days) where the barber has at least one free slot.
 * Does 2 parallel queries: barber schedule + all appointments for 14 days.
 * Computes slot availability client-side to avoid N sequential calls.
 */
export async function findFirstAvailableDate(
  barberId: string,
  serviceDurationMin: number
): Promise<{ date: Date | null; offDays: number[] }> {
  const days = getNext14Days();
  const now = new Date();

  // Query 1: barber's full weekly schedule (all 7 days)
  const { data: scheduleData } = await supabase
    .from("barber_availability")
    .select("day_of_week, start_time, end_time, is_available")
    .eq("barber_id", barberId);

  // Build schedule map: day_of_week -> { start_time, end_time }
  const scheduleMap = new Map<number, { start_time: string; end_time: string }>();
  const offDays: number[] = [];
  for (let d = 0; d <= 6; d++) {
    const entry = scheduleData?.find((s) => s.day_of_week === d && s.is_available);
    if (entry) {
      scheduleMap.set(d, { start_time: entry.start_time, end_time: entry.end_time });
    } else {
      offDays.push(d);
    }
  }

  // If no working days at all, return early
  if (scheduleMap.size === 0) return { date: null, offDays };

  // Query 2: all appointments for this barber in the 14-day window
  const windowStart = new Date(days[0]);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(days[days.length - 1]);
  windowEnd.setHours(23, 59, 59, 999);

  const { data: appointmentsData } = await supabase
    .from("appointments")
    .select("scheduled_at, duration_min")
    .eq("barber_id", barberId)
    .in("status", ["pending", "confirmed"])
    .gte("scheduled_at", windowStart.toISOString())
    .lte("scheduled_at", windowEnd.toISOString());

  // Group appointments by date string (toDateString key matches day loop below)
  const appointmentsByDate = new Map<string, { scheduled_at: string; duration_min: number }[]>();
  for (const apt of appointmentsData || []) {
    const dateKey = new Date(apt.scheduled_at).toDateString();
    const list = appointmentsByDate.get(dateKey) || [];
    list.push(apt);
    appointmentsByDate.set(dateKey, list);
  }

  // Walk candidate days and find first with at least one free slot
  const offSet = new Set(offDays);
  const slotIntervalMin = 30;

  for (const day of days) {
    if (offSet.has(day.getDay())) continue;

    const schedule = scheduleMap.get(day.getDay());
    if (!schedule) continue;

    const [startH, startM] = schedule.start_time.split(":").map(Number);
    const [endH, endM] = schedule.end_time.split(":").map(Number);
    const dayAppointments = appointmentsByDate.get(day.toDateString()) || [];
    const isToday = day.toDateString() === now.toDateString();

    // Check if any slot has availability
    let h = startH;
    let m = startM;
    let hasAvailable = false;

    while (true) {
      const serviceEndMin = h * 60 + m + serviceDurationMin;
      const workEndMin = endH * 60 + endM;
      if (serviceEndMin > workEndMin) break;

      const slotStart = new Date(day);
      slotStart.setHours(h, m, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + serviceDurationMin * 60000);

      // Skip past slots for today
      if (isToday && slotStart <= now) {
        m += slotIntervalMin;
        if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
        continue;
      }

      // Check conflict with appointments
      const hasConflict = dayAppointments.some((apt) => {
        const aptStart = new Date(apt.scheduled_at).getTime();
        const aptEnd = aptStart + apt.duration_min * 60000;
        return slotStart.getTime() < aptEnd && slotEnd.getTime() > aptStart;
      });

      if (!hasConflict) {
        hasAvailable = true;
        break;
      }

      m += slotIntervalMin;
      if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
    }

    if (hasAvailable) return { date: day, offDays };
  }

  return { date: null, offDays };
}
