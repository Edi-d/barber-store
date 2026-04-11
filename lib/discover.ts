import { Salon, SalonHappyHour } from "@/types/database";

export interface SalonWithDistance extends Salon {
  distance_km: number | null;
  travel_time_min: number | null;
  is_favorite: boolean;
  has_happy_hour: boolean;
  happy_hour_discount: number | null;
  happy_hour_ends_at: string | null;
  is_available_now: boolean;
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
function checkAvailableNow(
  availability: { barber_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean }[],
  barberAppointments: Map<string, BarberAppointment[]>
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

  if (activeBarbers.length === 0) return false;

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

// Enrich salons with computed fields from real DB data
export function enrichSalons(
  salons: Salon[],
  userLat: number | null,
  userLng: number | null,
  favoriteIds: Set<string>,
  happyHours: SalonHappyHour[],
  availabilityMap: Map<string, { barber_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean }[]>,
  barberAppointments: Map<string, BarberAppointment[]>,
  priceRangeMap: Map<string, { min: number; max: number }> = new Map()
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

      return {
        ...salon,
        distance_km: distKm,
        travel_time_min: null,
        is_favorite: favoriteIds.has(salon.id),
        has_happy_hour: !!hh,
        happy_hour_discount: hh?.discount_percent ?? null,
        happy_hour_ends_at: hh?.ends_at ?? null,
        is_available_now: checkAvailableNow(availability, barberAppointments),
        price_range_label: formatPriceRange(priceRangeMap.get(salon.id), salon.avg_price_cents),
      };
    });
}
