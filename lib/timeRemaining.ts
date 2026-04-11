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

  const label = buildLabel(totalMinutes, hours, minutes);
  const pillLabel = buildPillLabel(totalMinutes, hours, minutes);
  const state = buildState(totalMinutes);

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

/**
 * Builds the short pill label — a live-status indicator in Romanian.
 * Designed to fit inside a small pill (~10 chars).
 *
 * Ranges:
 *   > 1440 min  →  "Programat"     (confirmed/scheduled)
 *   720–1440    →  "Mâine"         (tomorrow indicator)
 *   120–720     →  "în Xh"         (e.g. "în 8h")
 *   60–120      →  "în 1h Xm"      (e.g. "în 1h 30m")
 *   15–60       →  "în Xm"         (e.g. "în 45m")
 *   2–15        →  "Curând"        (get ready – 6 chars, fits pill)
 *   <= 2        →  "Acum!"         (it's now)
 */
function buildPillLabel(totalMinutes: number, hours: number, minutes: number): string {
  if (totalMinutes <= 2) return "Acum!";

  if (totalMinutes <= 15) return "Curând";

  if (totalMinutes <= 60) return `în ${totalMinutes}m`;

  if (totalMinutes <= 120) {
    // 1h + remaining minutes
    const rem = totalMinutes - 60;
    return rem > 0 ? `în 1h ${rem}m` : "în 1h";
  }

  if (totalMinutes <= 720) {
    return `în ${hours}h`;
  }

  if (totalMinutes <= 1440) return "Mâine";

  return "Programat";
}

function buildState(totalMinutes: number): TimeRemaining["state"] {
  if (totalMinutes <= 2) return "now";
  if (totalMinutes <= 15) return "urgent";
  if (totalMinutes <= 60) return "soon";
  if (totalMinutes <= 720) return "today";
  if (totalMinutes <= 1440) return "tomorrow";
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
