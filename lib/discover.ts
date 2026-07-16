import { Salon, SalonHappyHour } from "@/types/database";

export interface SalonWithDistance extends Salon {
  distance_km: number | null;
  travel_time_min: number | null;
  is_favorite: boolean;
  has_happy_hour: boolean;
  happy_hour_discount: number | null;
  happy_hour_ends_at: string | null;
  is_available_now: boolean;
  // True when the salon is currently open (within today's hours / a barber is
  // scheduled now / extended window) — regardless of whether a slot is free.
  // A salon can be open (is_open_now) but not bookable (is_available_now).
  is_open_now: boolean;
  // True when the salon is currently inside its after-close extended window
  // today (past the normal close, before the latest close some barber OPTED IN
  // to via salon_extended_barber_optins — zero opt-ins means never extended).
  extended_open_now: boolean;
  price_range_label: string | null;
}

export type BarberAppointment = {
  barber_id: string;
  scheduled_at: string;
  duration_min: number;
};

// Haversine distance in km
export function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Format price from cents to RON label
function formatPriceLabel(cents: number | null): string | null {
  if (!cents || cents <= 0) return null;
  const ron = Math.round(cents / 100);
  return `~${ron} RON`;
}

function formatPriceRange(range: { min: number; max: number } | undefined, avgCents: number | null): string | null {
  if (range) {
    const minRon = Math.round(range.min / 100);
    const maxRon = Math.round(range.max / 100);
    if (minRon === maxRon) return `${minRon} lei`;
    return `${minRon} \u2013 ${maxRon} lei`;
  }
  // Fallback to avg price
  if (!avgCents || avgCents <= 0) return null;
  return `~${Math.round(avgCents / 100)} lei`;
}

// Check if a salon is currently available based on barber schedules and real appointments.
// A salon is "truly available now" if ANY barber:
//   a) Has a schedule slot covering the current time
//   b) AND has at least one free 30-min window in the next 60 minutes
//
// Fallback: many salons publish hours in `salon_hours` but never set per-barber
// `barber_availability`. When no barber slot covers now, defer to the salon's
// published hours so this stays consistent with the salon page (which is
// salon_hours-authoritative). `salonHoursToday` is today's open window, or null
// when the salon is closed today / has no published hours.
function checkAvailableNow(
  availability: { barber_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean }[],
  barberAppointments: Map<string, BarberAppointment[]>,
  salonHoursToday: { start: string; end: string } | null
): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  // Collect barbers whose schedule covers now
  const activeBarbers = availability.filter(
    (a) =>
      a.day_of_week === dayOfWeek &&
      a.is_available &&
      currentTime >= a.start_time &&
      currentTime < a.end_time
  );

  if (activeBarbers.length === 0) {
    // No per-barber schedule covers now — fall back to the salon's own hours.
    return (
      salonHoursToday != null &&
      currentTime >= salonHoursToday.start &&
      currentTime < salonHoursToday.end
    );
  }

  const nowMs = now.getTime();
  const sixtyMinLater = nowMs + 60 * 60 * 1000;
  const slotDuration = 30 * 60 * 1000;

  // Check if ANY active barber has a free 30-min slot in the next 60 min
  return activeBarbers.some((barber) => {
    const appointments = barberAppointments.get(barber.barber_id) ?? [];

    // Clamp window to the barber's own end time
    const [endH, endM] = barber.end_time.split(":").map(Number);
    const barberEnd = new Date(now);
    barberEnd.setHours(endH, endM, 0, 0);
    const windowEnd = Math.min(sixtyMinLater, barberEnd.getTime());

    if (windowEnd <= nowMs) return false;

    // Step through 30-min slots at 15-min granularity
    for (let slotStart = nowMs; slotStart + slotDuration <= windowEnd; slotStart += 15 * 60 * 1000) {
      const slotEnd = slotStart + slotDuration;
      const hasConflict = appointments.some((apt) => {
        const aptStart = new Date(apt.scheduled_at).getTime();
        const aptEnd = aptStart + apt.duration_min * 60 * 1000;
        return slotStart < aptEnd && slotEnd > aptStart;
      });
      if (!hasConflict) return true;
    }

    return false;
  });
}

// "HH:MM[:SS]" → minutes since midnight (seconds ignored).
function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// Whether the salon is currently inside its after-close extended window today:
// past the normal close and before the extended close (which must be later).
// `extendedCloseToday` is opt-in-derived (max resolved until across the
// salon's salon_extended_barber_optins rows for today) — undefined when no
// barber opted in, in which case the salon is never "extended open".
function checkExtendedOpenNow(
  salonHoursToday: { start: string; end: string } | null,
  extendedCloseToday: string | undefined
): boolean {
  if (!salonHoursToday || !extendedCloseToday) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const end = hhmmToMinutes(salonHoursToday.end);
  const ext = hhmmToMinutes(extendedCloseToday);
  return ext > end && cur >= end && cur < ext;
}

// Whether the salon is currently open — a barber is scheduled now, OR we're
// inside today's published hours, OR inside the extended window. This is the
// superset of is_available_now (which additionally requires a free slot); use it
// to tell "closed" apart from "open but fully booked".
function checkOpenNow(
  availability: { barber_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean }[],
  salonHoursToday: { start: string; end: string } | null,
  extendedOpenNow: boolean
): boolean {
  if (extendedOpenNow) return true;
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  const barberOpen = availability.some(
    (a) =>
      a.day_of_week === dayOfWeek &&
      a.is_available &&
      currentTime >= a.start_time &&
      currentTime < a.end_time
  );
  if (barberOpen) return true;

  return (
    salonHoursToday != null &&
    currentTime >= salonHoursToday.start &&
    currentTime < salonHoursToday.end
  );
}

// Enrich salons with computed fields from real DB data
export function enrichSalons(
  salons: Salon[],
  userLat: number | null,
  userLng: number | null,
  favoriteIds: Set<string>,
  happyHours: SalonHappyHour[],
  availabilityMap: Map<string, { barber_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean }[]>,
  barberAppointments: Map<string, BarberAppointment[]>,
  priceRangeMap: Map<string, { min: number; max: number }> = new Map(),
  salonHoursTodayMap: Map<string, { start: string; end: string }> = new Map(),
  extendedTodayMap: Map<string, string> = new Map()
): SalonWithDistance[] {
  const now = Date.now();
  const activeHappyHours = new Map<string, SalonHappyHour>();

  for (const hh of happyHours) {
    const startsAt = new Date(hh.starts_at).getTime();
    const endsAt = new Date(hh.ends_at).getTime();
    if (hh.active && now >= startsAt && now < endsAt) {
      activeHappyHours.set(hh.salon_id, hh);
    }
  }

  return salons
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((salon) => {
      const distKm =
        userLat && userLng && salon.latitude && salon.longitude
          ? getDistanceKm(userLat, userLng, salon.latitude, salon.longitude)
          : null;

      const hh = activeHappyHours.get(salon.id);
      const availability = availabilityMap.get(salon.id) ?? [];
      const salonHoursToday = salonHoursTodayMap.get(salon.id) ?? null;
      const extendedOpen = checkExtendedOpenNow(salonHoursToday, extendedTodayMap.get(salon.id));

      return {
        ...salon,
        distance_km: distKm,
        travel_time_min: null,
        is_favorite: favoriteIds.has(salon.id),
        has_happy_hour: !!hh,
        happy_hour_discount: hh?.discount_percent ?? null,
        happy_hour_ends_at: hh?.ends_at ?? null,
        is_available_now: checkAvailableNow(availability, barberAppointments, salonHoursToday),
        is_open_now: checkOpenNow(availability, salonHoursToday, extendedOpen),
        extended_open_now: extendedOpen,
        price_range_label: formatPriceRange(priceRangeMap.get(salon.id), salon.avg_price_cents),
      };
    });
}
