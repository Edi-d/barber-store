import { supabase } from "@/lib/supabase";

export interface TimeSlot {
  time: string; // "HH:MM" format
  available: boolean;
}

type DayHours = { start_time: string; end_time: string };

/**
 * Resolve a barber's effective working schedule: a map of
 * day_of_week (0=Sunday..6=Saturday) -> { start_time, end_time }.
 *
 * Precedence matches the rest of the app (see lib/salon.ts fetchSalonSchedule):
 * a barber's own `barber_availability` rows win when present (per-barber
 * override); otherwise we fall back to the salon's published `salon_hours` —
 * the authoritative schedule owners configure during salon setup. Without this
 * fallback, barbers created after the demo seed (which only populated
 * barber_availability for the three sample barbers) look like they have no
 * working hours, so every date is disabled and no slots are generated.
 */
async function resolveSchedule(
  barberId: string,
  salonId?: string | null
): Promise<Map<number, DayHours>> {
  const map = new Map<number, DayHours>();

  // 1. Barber-specific availability (most specific override)
  const { data: barberRows } = await supabase
    .from("barber_availability")
    .select("day_of_week, start_time, end_time")
    .eq("barber_id", barberId)
    .eq("is_available", true);

  if (barberRows && barberRows.length > 0) {
    for (const r of barberRows) {
      map.set(r.day_of_week, { start_time: r.start_time, end_time: r.end_time });
    }
    return map;
  }

  // 2. Fallback: the salon's published operating hours
  if (salonId) {
    const { data: salonRows } = await supabase
      .from("salon_hours")
      .select("day_of_week, is_open, open_time, close_time")
      .eq("salon_id", salonId);
    for (const r of salonRows ?? []) {
      if (r.is_open) {
        map.set(r.day_of_week, { start_time: r.open_time, end_time: r.close_time });
      }
    }
  }

  return map;
}

/**
 * Generate available time slots for a barber on a specific date.
 * Checks barber availability schedule and existing appointments to find free slots.
 */
export async function generateTimeSlots(
  barberId: string,
  date: Date,
  serviceDurationMin: number,
  salonId?: string | null
): Promise<TimeSlot[]> {
  const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday

  // 1. Resolve working hours for this day (barber override → salon hours)
  const schedule = await resolveSchedule(barberId, salonId);
  const dayHours = schedule.get(dayOfWeek);

  if (!dayHours) {
    // Barber/salon doesn't work this day
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
  const [startH, startM] = dayHours.start_time.split(":").map(Number);
  const [endH, endM] = dayHours.end_time.split(":").map(Number);

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
  serviceDurationMin: number,
  salonId?: string | null
): Promise<{ date: Date | null; offDays: number[] }> {
  const days = getNext14Days();
  const now = new Date();

  // Query 1: barber's full weekly schedule (barber override → salon hours)
  const scheduleMap = await resolveSchedule(barberId, salonId);

  // Days with no schedule entry are days off (used to disable date cells)
  const offDays: number[] = [];
  for (let d = 0; d <= 6; d++) {
    if (!scheduleMap.has(d)) offDays.push(d);
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
