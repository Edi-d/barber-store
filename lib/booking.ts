/**
 * lib/booking.ts
 *
 * Client-side availability helpers for the consumer booking flow.
 *
 * ── Time-zone note ────────────────────────────────────────────────────────────
 * All wall-clock reasoning (working-hours windows, "is this in the past")
 * uses the JS runtime clock on the device.  By product assumption the device
 * is set to Europe/Bucharest, and all times stored in the DB represent that
 * wall-clock (barber_availability.start_time / end_time are local times, not
 * UTC offsets).  The server is the single source of truth for slot validity —
 * the book_appointment RPC re-validates everything under a transaction lock.
 *
 * ── Availability data source ─────────────────────────────────────────────────
 * Slot generation and first-available-date search both call the
 * get_barber_busy_intervals RPC (migration 144).  This RPC is executed with
 * the caller's auth context and combines:
 *   • other customers' confirmed/pending appointments (customers cannot read
 *     other users' appointment rows directly via RLS)
 *   • barber break rows (barber_breaks — also hidden from customers via RLS)
 * using range-overlap semantics including cross-midnight breaks.
 * Any error from that RPC is surfaced as a thrown error; there are no silent
 * fall-through / fail-open paths.
 */

import { supabase } from "@/lib/supabase";
import { BusyInterval } from "@/types/database";

// ─── Public types ────────────────────────────────────────────────────────────

export interface TimeSlot {
  time: string; // "HH:MM" wall-clock
  available: boolean;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

type DayHours = { start_time: string; end_time: string };

/**
 * Parse a "HH:MM" or "HH:MM:SS" time string into [hours, minutes].
 * Returns [0, 0] on malformed input so slot generation degrades gracefully.
 */
function parseTime(t: string): [number, number] {
  const parts = t.split(":").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0];
}

/**
 * Resolve a barber's effective working schedule: a map of
 * day_of_week (0=Sunday..6=Saturday) → { start_time, end_time }.
 *
 * Precedence rules (verified against migration 144 contract):
 *
 * 1. Fetch ALL barber_availability rows for the barber (not just
 *    is_available=true).  When ANY rows exist the barber owns their
 *    schedule: only is_available=true days become working days.
 *    Days with an is_available=false row (or no row) are off — we do NOT
 *    fall back to salon_hours for a barber that has any availability rows.
 *
 * 2. Only when the barber has ZERO rows in barber_availability do we fall
 *    back to the salon's published salon_hours (is_open=true days).
 *
 * This prevents a barber who has been marked fully unavailable from
 * silently inheriting the salon schedule and becoming bookable again.
 *
 * Every supabase call throws on error so react-query surfaces it.
 */
async function resolveSchedule(
  barberId: string,
  salonId?: string | null
): Promise<Map<number, DayHours>> {
  const map = new Map<number, DayHours>();

  // 1. Fetch ALL availability rows (do NOT filter by is_available here)
  const { data: barberRows, error: barberErr } = await supabase
    .from("barber_availability")
    .select("day_of_week, start_time, end_time, is_available")
    .eq("barber_id", barberId);

  if (barberErr) throw barberErr;

  if (barberRows && barberRows.length > 0) {
    // Barber has an explicit schedule — only is_available=true days work
    for (const r of barberRows) {
      if (r.is_available) {
        map.set(r.day_of_week, {
          start_time: r.start_time,
          end_time: r.end_time,
        });
      }
    }
    return map;
  }

  // 2. Zero barber rows — fall back to salon_hours
  if (salonId) {
    const { data: salonRows, error: salonErr } = await supabase
      .from("salon_hours")
      .select("day_of_week, is_open, open_time, close_time")
      .eq("salon_id", salonId);

    if (salonErr) throw salonErr;

    for (const r of salonRows ?? []) {
      if (r.is_open) {
        map.set(r.day_of_week, {
          start_time: r.open_time,
          end_time: r.close_time,
        });
      }
    }
  }

  return map;
}

/**
 * Fetch busy intervals for a barber over a time window using the
 * get_barber_busy_intervals RPC (migration 144).
 *
 * Throws on any RPC error — no silent fall-through.
 */
async function fetchBusyIntervals(
  barberId: string,
  from: Date,
  to: Date
): Promise<BusyInterval[]> {
  const { data, error } = await supabase.rpc("get_barber_busy_intervals", {
    p_barber_id: barberId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error) throw error;
  return (data as BusyInterval[]) ?? [];
}

/**
 * Core slot computation shared by generateTimeSlots and findFirstAvailableDate.
 *
 * Given:
 *   - working hours for a single day (start_time / end_time "HH:MM[SS]")
 *   - the busy intervals for that day already fetched from the server
 *   - the date itself (to build absolute Date objects for past-filter)
 *   - service duration
 *
 * Returns an array of TimeSlots.  A slot is available when:
 *   1. The service would finish within the working-hours window.
 *   2. The slot range does NOT intersect any busy interval.
 *   3. The slot start is not in the past (for today).
 */
function computeSlotsForDay(
  date: Date,
  dayHours: DayHours,
  busyIntervals: BusyInterval[],
  serviceDurationMin: number,
  now: Date
): TimeSlot[] {
  const [startH, startM] = parseTime(dayHours.start_time);
  const [endH, endM] = parseTime(dayHours.end_time);
  const workEndMin = endH * 60 + endM;
  const slotIntervalMin = 30;
  const isToday = date.toDateString() === now.toDateString();

  // Pre-compute busy intervals as ms pairs for fast numeric comparison
  const busyMs = busyIntervals.map((b) => ({
    start: new Date(b.busy_start).getTime(),
    end: new Date(b.busy_end).getTime(),
  }));

  const slots: TimeSlot[] = [];
  let h = startH;
  let m = startM;

  while (true) {
    const serviceEndMin = h * 60 + m + serviceDurationMin;
    if (serviceEndMin > workEndMin) break;

    const timeStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;

    const slotStart = new Date(date);
    slotStart.setHours(h, m, 0, 0);
    const slotStartMs = slotStart.getTime();
    const slotEndMs = slotStartMs + serviceDurationMin * 60_000;

    // Past-filter: skip slots that have already started today
    const isPast = isToday && slotStartMs <= now.getTime();

    // Conflict: slot range intersects any busy range (inclusive start, exclusive end
    // but consistent with range-overlap: A.start < B.end && A.end > B.start)
    const hasConflict = busyMs.some(
      (b) => slotStartMs < b.end && slotEndMs > b.start
    );

    slots.push({
      time: timeStr,
      available: !isPast && !hasConflict,
    });

    m += slotIntervalMin;
    if (m >= 60) {
      h += Math.floor(m / 60);
      m = m % 60;
    }
  }

  return slots;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate available time slots for a barber on a specific date.
 *
 * Uses the get_barber_busy_intervals RPC for a [startOfDay, endOfDay] window
 * so that RLS-hidden appointments and barber breaks are both included.
 * Throws on any network or RPC error.
 */
export async function generateTimeSlots(
  barberId: string,
  date: Date,
  serviceDurationMin: number,
  salonId?: string | null
): Promise<TimeSlot[]> {
  const schedule = await resolveSchedule(barberId, salonId);
  const dayHours = schedule.get(date.getDay());

  if (!dayHours) {
    // Barber/salon doesn't work this day
    return [];
  }

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const busyIntervals = await fetchBusyIntervals(barberId, startOfDay, endOfDay);

  return computeSlotsForDay(date, dayHours, busyIntervals, serviceDurationMin, new Date());
}

/**
 * Get the next 14 days starting from today (midnight-normalised).
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
 * Format a date for display in the calendar strip.
 */
export function formatCalendarDay(date: Date): {
  dayName: string;
  dayNumber: string;
  monthName: string;
} {
  const dayNames = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];
  const monthNames = [
    "Ian", "Feb", "Mar", "Apr", "Mai", "Iun",
    "Iul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  return {
    dayName: dayNames[date.getDay()],
    dayNumber: date.getDate().toString(),
    monthName: monthNames[date.getMonth()],
  };
}

/**
 * Find the first date (within next 14 days) where the barber has at least
 * one free slot.  Uses a single get_barber_busy_intervals call for the full
 * 14-day window to avoid N sequential RPC calls.
 *
 * Returns:
 *   date    — first day with a free slot, or null if none found
 *   offDays — day-of-week numbers (0–6) that are always off for this barber
 *             (undefined when still loading; pass as-is to BookingDatePicker)
 */
export async function findFirstAvailableDate(
  barberId: string,
  serviceDurationMin: number,
  salonId?: string | null
): Promise<{ date: Date | null; offDays: number[] }> {
  const days = getNext14Days();
  const now = new Date();

  // 1. Resolve working schedule
  const scheduleMap = await resolveSchedule(barberId, salonId);

  // Days with no schedule entry are always off
  const offDays: number[] = [];
  for (let d = 0; d <= 6; d++) {
    if (!scheduleMap.has(d)) offDays.push(d);
  }

  if (scheduleMap.size === 0) return { date: null, offDays };

  // 2. Fetch busy intervals for the entire 14-day window in one RPC call
  const windowStart = new Date(days[0]);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(days[days.length - 1]);
  windowEnd.setHours(23, 59, 59, 999);

  const busyIntervals = await fetchBusyIntervals(barberId, windowStart, windowEnd);

  const offSet = new Set(offDays);

  for (const day of days) {
    if (offSet.has(day.getDay())) continue;

    const dayHours = scheduleMap.get(day.getDay());
    if (!dayHours) continue;

    const slots = computeSlotsForDay(day, dayHours, busyIntervals, serviceDurationMin, now);
    if (slots.some((s) => s.available)) return { date: day, offDays };
  }

  return { date: null, offDays };
}
