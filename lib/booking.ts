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

/**
 * Why a selected day has no bookable slot:
 *   • salon_closed — the barber/salon does not work this weekday at all
 *     (no resolved working hours). These weekdays are also greyed in the strip.
 *   • vacation     — break(s) cover the whole working window and at least one is
 *     a `vacation` break (barber on holiday).
 *   • unavailable  — break(s) cover the whole working window but none is a
 *     vacation (e.g. training / personal all-day block).
 *   • fully_booked — the barber works this day but every slot is taken/past
 *     (blocked by appointments, not a full-day break).
 */
export type DayUnavailableReason =
  | "salon_closed"
  | "vacation"
  | "unavailable"
  | "fully_booked";

/** Per-day availability status for the calendar strip. */
export type DayStatus = "available" | DayUnavailableReason;

export interface DayAvailabilityInfo {
  date: Date;
  status: DayStatus;
}

/**
 * Result of resolving a single day's slots. `unavailableReason` is null when at
 * least one slot is bookable; otherwise it explains why none are, so callers can
 * show a specific message instead of a grid of struck-through times.
 */
export interface DaySlots {
  slots: TimeSlot[];
  unavailableReason: DayUnavailableReason | null;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

// `normal_end_time` is the pre-extension boundary (the SALON's normal close);
// when set, slots starting at/after it fall in the extended window. Only
// populated on days stretched by a per-barber after-hours opt-in.
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
 * Base-window precedence:
 *
 * 1. Fetch ALL barber_availability rows for the barber (not just
 *    is_available=true).  When ANY rows exist the barber owns their
 *    schedule: only is_available=true days become working days.
 *    Days with an is_available=false row (or no row) are off — we do NOT
 *    fall back for a barber that has any availability rows.
 *
 * 2. Otherwise the base is the salon's published salon_hours (is_open=true
 *    days) overlaid per-day with the barber's `barber_hours` overrides:
 *    an is_open row replaces that weekday's window, an is_open=false row is
 *    an explicit day off, and a weekday with no row inherits the salon row.
 *
 * After-hours are OPT-IN per barber (salon_extended_barber_optins): only a
 * weekday with an opt-in row for THIS barber stretches past the base close —
 * until the row's own extended_until, or (when NULL) the enabled
 * salon_extended_hours close for that weekday. A NULL-until row without an
 * enabled extension row is inert; a weekday with no opt-in row never
 * stretches. `normal_end_time` — the boundary that tags slots `extended`
 * (the surcharge boundary) — stays the SALON's normal close.
 *
 * barber_availability / salon_hours base reads throw on error so react-query
 * surfaces them; barber_hours and opt-in reads fail soft (treated as absent).
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

  // The salon's normal close per weekday — needed both as the base fallback
  // and as the `extended` (surcharge) boundary when an opt-in stretches a day.
  let salonHoursByDay: Map<number, { open_time: string; close_time: string }> | null = null;

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
  } else {
    // 2. Zero barber_availability rows — salon_hours base overlaid with the
    // barber's per-day barber_hours overrides.
    let hourRows: {
      day_of_week: number;
      is_open: boolean;
      open_time: string | null;
      close_time: string | null;
    }[] = [];
    const { data: bhData, error: bhErr } = await supabase
      .from("barber_hours")
      .select("day_of_week, is_open, open_time, close_time")
      .eq("barber_id", barberId);
    if (bhErr) {
      // Fail-soft: treat as "no overrides" so the salon base still resolves.
      console.warn("resolveSchedule: barber_hours fetch failed — using salon hours only", bhErr);
    } else {
      hourRows = bhData ?? [];
    }

    if (salonId) {
      const { data: salonRows, error: salonErr } = await supabase
        .from("salon_hours")
        .select("day_of_week, is_open, open_time, close_time")
        .eq("salon_id", salonId);

      if (salonErr) throw salonErr;

      salonHoursByDay = new Map();
      for (const r of salonRows ?? []) {
        if (r.is_open) {
          salonHoursByDay.set(r.day_of_week, { open_time: r.open_time, close_time: r.close_time });
          map.set(r.day_of_week, {
            start_time: r.open_time.slice(0, 5),
            end_time: r.close_time.slice(0, 5),
          });
        }
      }
    }

    // Overlay: an is_open override replaces the day's window; is_open=false is
    // an explicit day off; weekdays without a row keep the inherited salon row.
    for (const r of hourRows) {
      if (r.is_open && r.open_time && r.close_time) {
        map.set(r.day_of_week, {
          start_time: r.open_time.slice(0, 5),
          end_time: r.close_time.slice(0, 5),
        });
      } else if (!r.is_open) {
        map.delete(r.day_of_week);
      }
    }
  }

  // 3. Per-barber after-hours opt-ins — independent of which base won above.
  // Fail-soft: any read error means "no stretch" (the RPC stays authoritative).
  if (salonId && map.size > 0) {
    const { data: optinRows, error: optinErr } = await supabase
      .from("salon_extended_barber_optins")
      .select("day_of_week, extended_until")
      .eq("salon_id", salonId)
      .eq("barber_id", barberId);

    if (optinErr) {
      console.warn("resolveSchedule: extended opt-ins fetch failed — no after-hours stretch", optinErr);
    } else if (optinRows && optinRows.length > 0) {
      // NULL extended_until inherits the enabled salon_extended_hours close.
      // fetchSalonExtendedHours is itself fail-soft (empty map on error).
      const extByDay = await fetchSalonExtendedHours(salonId);

      // The surcharge boundary is the SALON's normal close even when the
      // barber's own base close differs — fetch it if the base path didn't.
      if (salonHoursByDay === null) {
        salonHoursByDay = new Map();
        const { data: salonRows, error: salonErr } = await supabase
          .from("salon_hours")
          .select("day_of_week, is_open, open_time, close_time")
          .eq("salon_id", salonId);
        if (salonErr) {
          console.warn(
            "resolveSchedule: salon_hours fetch failed — using base close as extended boundary",
            salonErr
          );
        } else {
          for (const r of salonRows ?? []) {
            if (r.is_open) {
              salonHoursByDay.set(r.day_of_week, { open_time: r.open_time, close_time: r.close_time });
            }
          }
        }
      }

      for (const row of optinRows as { day_of_week: number; extended_until: string | null }[]) {
        const day = map.get(row.day_of_week);
        if (!day) continue; // barber doesn't work that weekday → nothing to stretch

        const until =
          row.extended_until ??
          extByDay.get(row.day_of_week)?.extended_close_time ??
          null; // NULL until + no enabled extension row → inert opt-in
        if (!until) continue;

        if (timeToMinutes(until) > timeToMinutes(day.end_time)) {
          const salonClose = salonHoursByDay.get(row.day_of_week)?.close_time;
          map.set(row.day_of_week, {
            start_time: day.start_time,
            end_time: until.slice(0, 5),
            normal_end_time: (salonClose ?? day.end_time).slice(0, 5),
          });
        }
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

/**
 * Classify a day that has working hours but no bookable slot.
 *
 * The distinction we care about is "the barber is off all day" (a full-day
 * break — vacation/training/personal) vs "the barber works but is fully booked"
 * (blocked by appointments). We detect the former by testing whether the *break*
 * intervals alone cover the whole working window — robust to how the break is
 * stored (exact window, midnight-to-midnight, or a multi-day range), and to
 * several breaks stitched together. A break is any busy interval carrying a
 * non-null `reason`; appointments carry `reason === null`.
 *
 * Returns "vacation" when a covering break is a holiday, "unavailable" for any
 * other full-day block, and "fully_booked" when breaks don't cover the day
 * (so appointments are what's filling it).
 *
 * Note: if the `reason` column isn't populated yet (RPC not returning it), every
 * interval looks like an appointment and this degrades to "fully_booked" — the
 * caller still shows the next available date, just with generic copy.
 */
function classifyNoSlotDay(
  date: Date,
  dayHours: DayHours,
  busyIntervals: BusyInterval[]
): Exclude<DayUnavailableReason, "salon_closed"> {
  const [sh, sm] = parseTime(dayHours.start_time);
  const [eh, em] = parseTime(dayHours.end_time);
  const workStart = new Date(date);
  workStart.setHours(sh, sm, 0, 0);
  const workEnd = new Date(date);
  workEnd.setHours(eh, em, 0, 0);
  const ws = workStart.getTime();
  const we = workEnd.getTime();

  // Break intervals that overlap the working window, sorted by start.
  const breaks = busyIntervals
    .filter((b) => b.reason != null)
    .map((b) => ({
      s: new Date(b.busy_start).getTime(),
      e: new Date(b.busy_end).getTime(),
      reason: b.reason,
    }))
    .filter((b) => b.e > ws && b.s < we)
    .sort((a, b) => a.s - b.s);

  // Sweep to test whether the union of breaks covers [ws, we] with no gap.
  let cursor = ws;
  for (const b of breaks) {
    if (b.s > cursor) break; // gap before this break → not fully covered
    if (b.e > cursor) cursor = b.e;
    if (cursor >= we) break;
  }
  const coveredByBreaks = cursor >= we;

  if (coveredByBreaks) {
    const hasVacation = breaks.some((b) => b.reason === "vacation");
    return hasVacation ? "vacation" : "unavailable";
  }
  return "fully_booked";
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate the time slots for a barber on a specific date, plus a reason when
 * none are bookable.
 *
 * Uses the get_barber_busy_intervals RPC for a [startOfDay, endOfDay] window
 * so that RLS-hidden appointments and barber breaks (incl. their reason) are
 * both included. Throws on any network or RPC error.
 */
export async function generateTimeSlots(
  barberId: string,
  date: Date,
  serviceDurationMin: number,
  salonId?: string | null
): Promise<DaySlots> {
  const schedule = await resolveSchedule(barberId, salonId);
  const dayHours = schedule.get(date.getDay());

  if (!dayHours) {
    // Barber/salon doesn't work this weekday at all.
    return { slots: [], unavailableReason: "salon_closed" };
  }

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const busyIntervals = await fetchBusyIntervals(barberId, startOfDay, endOfDay);
  const slots = computeSlotsForDay(date, dayHours, busyIntervals, serviceDurationMin, new Date());

  if (slots.some((s) => s.available)) {
    return { slots, unavailableReason: null };
  }

  // No bookable slot — explain why (full-day break vs fully booked).
  return { slots, unavailableReason: classifyNoSlotDay(date, dayHours, busyIntervals) };
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
 *   days    — per-day status for each of the next 14 days, so the calendar strip
 *             can mark closed / vacation / fully-booked days individually
 */
export async function findFirstAvailableDate(
  barberId: string,
  serviceDurationMin: number,
  salonId?: string | null
): Promise<{ date: Date | null; offDays: number[]; days: DayAvailabilityInfo[] }> {
  const days = getNext14Days();
  const now = new Date();

  // 1. Resolve working schedule
  const scheduleMap = await resolveSchedule(barberId, salonId);

  // Days with no schedule entry are always off
  const offDays: number[] = [];
  for (let d = 0; d <= 6; d++) {
    if (!scheduleMap.has(d)) offDays.push(d);
  }

  // Barber has no working days at all — every day is salon_closed.
  if (scheduleMap.size === 0) {
    return {
      date: null,
      offDays,
      days: days.map((date) => ({ date, status: "salon_closed" as DayStatus })),
    };
  }

  // 2. Fetch busy intervals for the entire 14-day window in one RPC call
  const windowStart = new Date(days[0]);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(days[days.length - 1]);
  windowEnd.setHours(23, 59, 59, 999);

  const busyIntervals = await fetchBusyIntervals(barberId, windowStart, windowEnd);

  // 3. Classify every day (single pass) and pick the first available one.
  let firstDate: Date | null = null;
  const dayInfos: DayAvailabilityInfo[] = days.map((day) => {
    const dayHours = scheduleMap.get(day.getDay());
    if (!dayHours) return { date: day, status: "salon_closed" };

    const slots = computeSlotsForDay(day, dayHours, busyIntervals, serviceDurationMin, now);
    if (slots.some((s) => s.available)) {
      if (!firstDate) firstDate = day;
      return { date: day, status: "available" };
    }
    return { date: day, status: classifyNoSlotDay(day, dayHours, busyIntervals) };
  });

  return { date: firstDate, offDays, days: dayInfos };
}

/**
 * Find the first bookable date strictly AFTER `afterDate`, scanning forward up
 * to `horizonDays`. Used to always offer a concrete "next available day" when
 * the selected day has no slot — including when the next opening falls beyond
 * the 14-day strip (e.g. a long vacation). The scan window stays under the RPC's
 * 60-day cap. Returns null only if the barber has no opening in the horizon.
 */
export async function findNextAvailableDateAfter(
  barberId: string,
  serviceDurationMin: number,
  salonId: string | null | undefined,
  afterDate: Date,
  horizonDays = 45
): Promise<Date | null> {
  const now = new Date();
  const scheduleMap = await resolveSchedule(barberId, salonId);
  if (scheduleMap.size === 0) return null;

  // Candidate days: afterDate+1 … afterDate+horizonDays (midnight-normalised).
  const base = new Date(afterDate);
  base.setHours(0, 0, 0, 0);
  const candidates: Date[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    candidates.push(d);
  }

  const windowStart = new Date(candidates[0]);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(candidates[candidates.length - 1]);
  windowEnd.setHours(23, 59, 59, 999);

  const busyIntervals = await fetchBusyIntervals(barberId, windowStart, windowEnd);

  for (const day of candidates) {
    const dayHours = scheduleMap.get(day.getDay());
    if (!dayHours) continue;
    const slots = computeSlotsForDay(day, dayHours, busyIntervals, serviceDurationMin, now);
    if (slots.some((s) => s.available)) return day;
  }
  return null;
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
