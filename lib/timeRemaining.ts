/**
 * timeRemaining.ts
 *
 * Utility for calculating and formatting time remaining until an appointment.
 * Used by the UpcomingAppointmentBanner drain bar component.
 * All display text is in Romanian.
 */

const FULL_BAR_MINUTES = 24 * 60; // 24 hours = progress 1.0

export interface TimeRemaining {
  /** Raw difference between scheduledAt and now, in whole minutes. May be negative if past. */
  totalMinutes: number;
  /** Whole hours component of totalMinutes (floored). */
  hours: number;
  /** Remaining minutes after subtracting whole hours. */
  minutes: number;
  /**
   * Drain-bar progress value from 0 to 1.
   * 1 = appointment is 24 h or more away (bar full).
   * 0 = appointment is now or past (bar empty).
   * Linear between the two extremes.
   */
  progress: number;
  /**
   * Human-readable Romanian label.
   * Examples: "în 2h 30min", "în 45 min", "în 5 min", "Acum"
   */
  label: string;
  /**
   * Very short live-status label for display inside a small pill (~10 chars max).
   * Examples: "Programat", "Mâine", "în 8h", "în 1h 30m", "în 45m", "Curând", "Acum!"
   */
  pillLabel: string;
  /**
   * Semantic state of the appointment relative to now.
   * Drives color, icon, and animation decisions in the UI.
   *
   * "scheduled" — more than 24 h away
   * "tomorrow"  — 12–24 h away
   * "today"     — 2–12 h away
   * "soon"      — 15–60 min away
   * "urgent"    — 2–15 min away
   * "now"       — 0–2 min away (or past)
   */
  state: "scheduled" | "tomorrow" | "today" | "soon" | "urgent" | "now";
  /** true when less than 60 minutes remain. */
  isUrgent: boolean;
  /** true when less than 15 minutes remain. */
  isSoon: boolean;
}

/**
 * Calculates time remaining until an appointment and returns structured data
 * suitable for driving a drain-bar UI component.
 *
 * @param scheduledAt - ISO 8601 date-time string of the appointment.
 */
export function getTimeRemaining(scheduledAt: string): TimeRemaining {
  const now = new Date();
  const target = new Date(scheduledAt);

  const diffMs = target.getTime() - now.getTime();
  const rawMinutes = diffMs / (1000 * 60);

  // Clamp to 0 for past appointments so UI stays consistent.
  const totalMinutes = Math.max(0, Math.floor(rawMinutes));

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Linear interpolation: clamp between 0 and FULL_BAR_MINUTES.
  const clamped = Math.min(Math.max(totalMinutes, 0), FULL_BAR_MINUTES);
  const progress = clamped / FULL_BAR_MINUTES;

  // Calendar-day relationship between now and the appointment target.
  const calendarRel = getCalendarDayRelation(now, target);

  const label = buildLabel(totalMinutes, hours, minutes);
  const pillLabel = buildPillLabel(totalMinutes, hours, minutes, calendarRel);
  const state = buildState(totalMinutes, calendarRel);

  return {
    totalMinutes,
    hours,
    minutes,
    progress,
    label,
    pillLabel,
    state,
    isUrgent: totalMinutes < 60,
    isSoon: totalMinutes < 15,
  };
}

function buildLabel(totalMinutes: number, hours: number, minutes: number): string {
  if (totalMinutes < 2) return "Acum";

  if (totalMinutes >= 24 * 60) {
    const days = Math.floor(totalMinutes / (24 * 60));
    return `${days}z`;
  }

  if (hours >= 2) {
    return `${hours}h`;
  }

  if (hours >= 1) {
    return `1h ${minutes}m`;
  }

  // >= 2 min, < 1 hour
  return `${totalMinutes}m`;
}

// ---------------------------------------------------------------------------
// Calendar-day relation helper
// ---------------------------------------------------------------------------

/**
 * Returns the calendar-day relationship between `now` and `target`.
 *
 * "same"     — target falls on the same calendar day as now
 * "tomorrow" — target falls on the next calendar day after now
 * "later"    — target is two or more calendar days away
 *
 * This is equivalent to the logic used by formatAppointmentTimeContext's
 * isSameDay / tomorrow check, keeping both functions consistent.
 */
type CalendarDayRelation = "same" | "tomorrow" | "later";

function getCalendarDayRelation(now: Date, target: Date): CalendarDayRelation {
  if (isSameDay(now, target)) return "same";
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  if (isSameDay(tomorrowDate, target)) return "tomorrow";
  return "later";
}

/**
 * Builds the short pill label — a live-status indicator in Romanian.
 * Designed to fit inside a small pill (~10 chars).
 *
 * The label tiers based on minutes-remaining for short distances, but for
 * same-day vs next-day the calendar boundary is used, not a fixed 720-minute
 * threshold. This prevents an appointment at 22:00 viewed at 08:00 (14h away
 * but same calendar day) from showing "Mâine" when the time-context line
 * correctly says "Astăzi".
 *
 * Ranges:
 *   calendarRel = "later" (2+ days)  →  "Programat"
 *   calendarRel = "tomorrow"         →  "Mâine"
 *   calendarRel = "same" (today):
 *     120+ min  →  "în Xh"           (e.g. "în 8h")
 *     60–120    →  "în 1h Xm"        (e.g. "în 1h 30m")
 *     15–60     →  "în Xm"           (e.g. "în 45m")
 *     2–15      →  "Curând"
 *     <= 2      →  "Acum!"
 */
function buildPillLabel(
  totalMinutes: number,
  hours: number,
  minutes: number,
  calendarRel: CalendarDayRelation
): string {
  if (totalMinutes <= 2) return "Acum!";

  if (totalMinutes <= 15) return "Curând";

  if (totalMinutes <= 60) return `în ${totalMinutes}m`;

  if (totalMinutes <= 120) {
    // 1h + remaining minutes
    const rem = totalMinutes - 60;
    return rem > 0 ? `în 1h ${rem}m` : "în 1h";
  }

  // Beyond 2 hours: use calendar-day relation rather than a fixed minute
  // threshold so same-day evening appointments are not mislabelled "Mâine".
  if (calendarRel === "same") return `în ${hours}h`;
  if (calendarRel === "tomorrow") return "Mâine";
  return "Programat";
}

/**
 * Semantic state of the appointment relative to now.
 * Drives color, icon, and animation decisions in the UI.
 *
 * For the "tomorrow" / "scheduled" boundary the calendar day is used rather
 * than a fixed 720-minute window, matching formatAppointmentTimeContext.
 */
function buildState(
  totalMinutes: number,
  calendarRel: CalendarDayRelation
): TimeRemaining["state"] {
  if (totalMinutes <= 2) return "now";
  if (totalMinutes <= 15) return "urgent";
  if (totalMinutes <= 60) return "soon";

  // Within the same calendar day but more than 60 min away → "today".
  // This correctly gives today-evening appointments the active-blue styling
  // instead of the muted tomorrow/scheduled styling.
  if (calendarRel === "same") return "today";
  if (calendarRel === "tomorrow") return "tomorrow";
  return "scheduled";
}

// ---------------------------------------------------------------------------
// Short Romanian weekday names used by formatAppointmentTimeContext.
// ---------------------------------------------------------------------------

const WEEKDAYS_RO: readonly string[] = [
  "Dum",
  "Lun",
  "Mar",
  "Mie",
  "Joi",
  "Vin",
  "Sâm",
];

const MONTHS_RO: readonly string[] = [
  "Ian",
  "Feb",
  "Mar",
  "Apr",
  "Mai",
  "Iun",
  "Iul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Returns a human-friendly Romanian context string for when the appointment is.
 *
 * Examples:
 *   "Astăzi · 14:30"
 *   "Mâine · 09:30"
 *   "Lun, 31 Mar · 10:00"
 *
 * @param scheduledAt - ISO 8601 date-time string of the appointment.
 */
export function formatAppointmentTimeContext(scheduledAt: string): string {
  const now = new Date();
  const target = new Date(scheduledAt);

  const timeStr = formatTime24(target);

  if (isSameDay(now, target)) {
    return `Astăzi · ${timeStr}`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (isSameDay(tomorrow, target)) {
    return `Mâine · ${timeStr}`;
  }

  // Further away: "Lun, 31 Mar · 10:00"
  const weekday = WEEKDAYS_RO[target.getDay()];
  const day = target.getDate();
  const month = MONTHS_RO[target.getMonth()];

  return `${weekday}, ${day} ${month} · ${timeStr}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatTime24(date: Date): string {
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
