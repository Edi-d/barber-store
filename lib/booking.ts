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
import { fetchSalonExtendedHours, timeToMinutes } from "@/lib/extended-hours";

// ─── Public types ────────────────────────────────────────────────────────────

export interface TimeSlot {
  time: string; // "HH:MM" wall-clock
  available: boolean;
  /** True when the slot starts in the salon's after-close "extended" window
   *  (subject to a surcharge enforced by the book_appointment RPC). */
  extended?: boolean;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

// `normal_end_time` is the pre-extension close; when set, slots starting at/after
// it fall in the extended window. Only populated on the salon_hours fallback path.
type DayHours = { start_time: string; end_time: string; normal_end_time?: string };

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

    // Stretch the window with the salon's extended hours: on an enabled day
    // whose extended close is later than the normal close, push end_time out so
    // after-close slots are offered, and remember the normal close so those
    // slots can be tagged `extended` (and surcharged). Extension only applies to
    // salon_hours-governed barbers — a barber with explicit availability owns
    // their schedule and returned above before reaching this branch.
    const extByDay = await fetchSalonExtendedHours(salonId);
    for (const [dow, ext] of extByDay) {
      const day = map.get(dow);
      if (!day) continue; // salon closed that day → nothing to extend
      const closeMin = timeToMinutes(day.end_time);
      if (timeToMinutes(ext.extended_close_time) > closeMin) {
        map.set(dow, {
          ...day,
          end_time: ext.extended_close_time,
          normal_end_time: day.end_time,
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
  // Slots starting at/after the normal close fall in the extended window.
  const normalEndMin = dayHours.normal_end_time
    ? timeToMinutes(dayHours.normal_end_time)
    : null;
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
      extended: normalEndMin != null && h * 60 + m >= normalEndMin,
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

/**
 * Find the first concrete free slot (date + "HH:MM" time) for a single barber
 * within the next 14 days.  Same schedule/busy semantics as
 * findFirstAvailableDate, but also returns the earliest free start time of that
 * day so callers can rank barbers against each other on an absolute timeline.
 *
 * Returns { date: null, time: null } when the barber has no free slot in the
 * window.  Throws on any RPC/network error.
 */
export async function findFirstAvailableSlot(
  barberId: string,
  serviceDurationMin: number,
  salonId?: string | null
): Promise<{ date: Date | null; time: string | null }> {
  const days = getNext14Days();
  const now = new Date();

  const scheduleMap = await resolveSchedule(barberId, salonId);
  if (scheduleMap.size === 0) return { date: null, time: null };

  const windowStart = new Date(days[0]);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(days[days.length - 1]);
  windowEnd.setHours(23, 59, 59, 999);

  const busyIntervals = await fetchBusyIntervals(barberId, windowStart, windowEnd);

  for (const day of days) {
    const dayHours = scheduleMap.get(day.getDay());
    if (!dayHours) continue;

    const slots = computeSlotsForDay(day, dayHours, busyIntervals, serviceDurationMin, now);
    const firstFree = slots.find((s) => s.available);
    if (firstFree) return { date: day, time: firstFree.time };
  }

  return { date: null, time: null };
}

/**
 * "Anyone available" resolver.  Given a roster of barbers, finds the one who
 * can be booked the soonest (earliest absolute date+time) for a service of the
 * given duration, looking across the next 14 days.
 *
 * Each barber's availability is computed in parallel.  A barber whose lookup
 * throws is treated as having no availability rather than failing the whole
 * resolution — so one bad row never blocks the feature.
 *
 * Returns null when no barber has a free slot in the window.
 */
export async function findSoonestAvailableBarber(
  barbers: { id: string; salon_id?: string | null }[],
  serviceDurationMin: number
): Promise<{ barberId: string; date: Date; time: string } | null> {
  const settled = await Promise.allSettled(
    barbers.map((b) =>
      findFirstAvailableSlot(b.id, serviceDurationMin, b.salon_id ?? null).then(
        (slot) => ({ barberId: b.id, slot })
      )
    )
  );

  let best: { barberId: string; date: Date; time: string } | null = null;
  let bestMs = Infinity;
  let sawSuccess = false;
  let firstError: unknown = null;

  for (const s of settled) {
    if (s.status === "rejected") {
      if (firstError === null) firstError = s.reason;
      continue;
    }
    sawSuccess = true;
    const { barberId, slot } = s.value;
    if (!slot.date || !slot.time) continue;
    const [h, m] = parseTime(slot.time);
    const dt = new Date(slot.date);
    dt.setHours(h, m, 0, 0);
    const ms = dt.getTime();
    if (ms < bestMs) {
      bestMs = ms;
      best = { barberId, date: slot.date, time: slot.time };
    }
  }

  // If not a single barber's availability could be computed, the result is an
  // error condition (e.g. the busy-intervals RPC failed) — surface it rather
  // than reporting a misleading "nobody is available".
  if (!sawSuccess && firstError !== null) throw firstError;

  return best;
}
