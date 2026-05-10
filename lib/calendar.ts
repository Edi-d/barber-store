/**
 * Calendar integration for Tapzi bookings.
 * Handles permission requests, calendar resolution, and event creation for iOS and Android.
 */
import * as Calendar from "expo-calendar";
import { Linking, Platform } from "react-native";

export interface BookingEventInput {
  id: string;
  barberName: string;
  serviceNames: string[];
  date: Date;
  time: string;
  totalDurationMin: number;
}

export type CalendarErrorCode = "permission_denied" | "no_calendar" | "unknown";

export class CalendarError extends Error {
  code: CalendarErrorCode;
  constructor(code: CalendarErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "CalendarError";
  }
}

export async function addBookingToCalendar(
  input: BookingEventInput
): Promise<{ eventId: string }> {
  // ── Web branch — generate and download an .ics file ──────────────────────
  if (Platform.OS === 'web') {
    const [hours, minutes] = input.time.split(':').map(Number);
    const startDate = new Date(input.date);
    startDate.setHours(hours, minutes, 0, 0);
    const endDate = new Date(startDate.getTime() + input.totalDurationMin * 60_000);

    const rawTitle = `Tapzi — ${input.serviceNames.join(', ')}`;
    const title = rawTitle.length > 80 ? rawTitle.slice(0, 79) + '…' : rawTitle;

    const notes = [
      `Frizer: ${input.barberName}`,
      `Cod rezervare: #${input.id.slice(-8).toUpperCase()}`,
      `Durată: ${input.totalDurationMin} min`,
    ].join('\\n');

    // Format dates to iCalendar YYYYMMDDTHHMMSSZ (UTC)
    const toIcsDate = (d: Date): string =>
      d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    const uid = `${input.id}@tapzi.app`;
    const now = toIcsDate(new Date());
    const dtStart = toIcsDate(startDate);
    const dtEnd = toIcsDate(endDate);

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Tapzi//Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${notes}`,
      `LOCATION:${input.barberName}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${title}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tapzi-booking-${input.id.slice(-8).toUpperCase()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Return a synthetic eventId so callers don't need to branch
    return { eventId: `web-${input.id}` };
  }
  // ── End web branch ────────────────────────────────────────────────────────

  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") {
      throw new CalendarError(
        "permission_denied",
        "Accesul la calendar a fost refuzat."
      );
    }

    let calendarId: string;

    if (Platform.OS === "ios") {
      const defaultCalendar = await Calendar.getDefaultCalendarAsync();
      calendarId = defaultCalendar.id;
    } else {
      const calendars = await Calendar.getCalendarsAsync(
        Calendar.EntityTypes.EVENT
      );
      const writable = calendars.find(
        (cal) =>
          cal.allowsModifications === true &&
          (cal.accessLevel === Calendar.CalendarAccessLevel.OWNER ||
            cal.accessLevel === Calendar.CalendarAccessLevel.CONTRIBUTOR)
      );
      if (!writable) {
        throw new CalendarError(
          "no_calendar",
          "Nu am găsit un calendar editabil."
        );
      }
      calendarId = writable.id;
    }

    const [hours, minutes] = input.time.split(":").map(Number);
    const startDate = new Date(input.date);
    startDate.setHours(hours, minutes, 0, 0);
    const endDate = new Date(startDate.getTime() + input.totalDurationMin * 60_000);

    const rawTitle = `Tapzi — ${input.serviceNames.join(", ")}`;
    const title =
      rawTitle.length > 80 ? rawTitle.slice(0, 79) + "…" : rawTitle;

    const notes = [
      `Frizer: ${input.barberName}`,
      `Cod rezervare: #${input.id.slice(-8).toUpperCase()}`,
      `Durată: ${input.totalDurationMin} min`,
    ].join("\n");

    const eventId = await Calendar.createEventAsync(calendarId, {
      title,
      notes,
      startDate,
      endDate,
      alarms: [{ relativeOffset: -30 }],
      timeZone: undefined,
    });

    return { eventId };
  } catch (err) {
    if (err instanceof CalendarError) throw err;
    const message =
      err instanceof Error ? err.message : "Eroare necunoscută";
    throw new CalendarError("unknown", message);
  }
}

export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Swallow silently — caller does not need to handle this failure.
  }
}
