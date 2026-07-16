import { supabase } from "@/lib/supabase";
import { decode } from "base64-arraybuffer";
import {
  BarberService,
  BarberAvailability,
  SalonPhoto,
  SalonHappyHour,
  SalonReview,
  SalonReviewWithAuthor,
} from "@/types/database";
import { fetchSalonExtendedHours } from "@/lib/extended-hours";

// Fetch gallery photos for a salon
export async function fetchSalonPhotos(salonId: string): Promise<SalonPhoto[]> {
  const { data, error } = await supabase
    .from("salon_photos")
    .select("*")
    .eq("salon_id", salonId)
    .order("sort_order");
  if (error) throw error;
  return data as SalonPhoto[];
}

// Fetch active services for a specific salon, grouped by category
export async function fetchServicesGrouped(salonId: string): Promise<Record<string, BarberService[]>> {
  const { data, error } = await supabase
    .from("barber_services")
    .select("*")
    .eq("salon_id", salonId)
    .eq("active", true)
    .order("price_cents");
  if (error) throw error;

  const grouped: Record<string, BarberService[]> = {};
  for (const s of (data as BarberService[])) {
    const cat = s.category || "Altele";
    (grouped[cat] = grouped[cat] || []).push(s);
  }
  return grouped;
}

// A salon's working schedule plus per-barber metadata.
export interface SalonScheduleResult {
  schedule: BarberAvailability[];
  // True when at least two active barbers have different base windows (incl.
  // one being off) on some day the salon is open — the UI shows a
  // "programul diferă în funcție de stilist" note.
  variesByBarber: boolean;
}

// Fetch a salon's working schedule.
//
// The per-day windows are the TEAM ENVELOPE: for each day the salon is open
// (`salon_hours` — the authoritative, owner-managed source), each ACTIVE
// barber's base window is their `barber_hours` override for that weekday
// (skipped when is_open=false = day off) else the salon row; the envelope is
// the earliest open / latest close across those windows. When the salon has no
// active barbers or the barber_hours read fails, the salon hours are kept
// as-is. Falls back to aggregating barber availability (union of all barbers'
// hours) only when a salon has no published hours, so older salons without a
// `salon_hours` row still show something sensible.
//
// Returned in the BarberAvailability shape the display helpers
// (getTodayScheduleText / getWeekSchedule) already consume.
export async function fetchSalonScheduleWithMeta(salonId: string): Promise<SalonScheduleResult> {
  const toAvailability = (dow: number, start: string, end: string): BarberAvailability => ({
    id: `hours-${dow}`,
    barber_id: salonId,
    day_of_week: dow,
    start_time: start,
    end_time: end,
    is_available: true,
    created_at: "",
  });

  // 1. Authoritative source: the salon's own published hours.
  const { data: hours, error: hoursErr } = await supabase
    .from("salon_hours")
    .select("day_of_week, is_open, open_time, close_time")
    .eq("salon_id", salonId)
    .order("day_of_week");

  if (!hoursErr && hours && hours.length > 0) {
    // Closed days are simply omitted → getWeekSchedule renders them as "Închis".
    const openDays = (hours as {
      day_of_week: number;
      is_open: boolean;
      open_time: string;
      close_time: string;
    }[]).filter((h) => h.is_open);

    // Team envelope across active barbers. Fail-soft: any read error keeps the
    // salon's own hours as-is.
    try {
      const { data: barbers, error: barbersErr } = await supabase
        .from("barbers")
        .select("id")
        .eq("salon_id", salonId)
        .eq("active", true);
      if (barbersErr) throw barbersErr;

      if (barbers && barbers.length > 0) {
        const barberIds = barbers.map((b: { id: string }) => b.id);
        const { data: bhRows, error: bhErr } = await supabase
          .from("barber_hours")
          .select("barber_id, day_of_week, is_open, open_time, close_time")
          .in("barber_id", barberIds);
        if (bhErr) throw bhErr;

        const overrides = new Map<
          string,
          { is_open: boolean; open_time: string | null; close_time: string | null }
        >();
        for (const r of (bhRows ?? []) as {
          barber_id: string;
          day_of_week: number;
          is_open: boolean;
          open_time: string | null;
          close_time: string | null;
        }[]) {
          overrides.set(`${r.barber_id}:${r.day_of_week}`, r);
        }

        let variesByBarber = false;
        const schedule: BarberAvailability[] = [];

        for (const h of openDays) {
          const windows: { start: string; end: string }[] = [];
          // Distinct per-barber window signatures (minutes-normalized so
          // "09:00" vs "09:00:00" never reads as different); "off" counts as
          // its own signature — a day off IS a schedule difference.
          const signatures = new Set<string>();

          for (const barberId of barberIds) {
            const o = overrides.get(`${barberId}:${h.day_of_week}`);
            if (o) {
              if (!o.is_open || !o.open_time || !o.close_time) {
                signatures.add("off");
                continue; // explicit day off for this barber
              }
              windows.push({ start: o.open_time, end: o.close_time });
              signatures.add(`${timeToMinutes(o.open_time)}-${timeToMinutes(o.close_time)}`);
            } else {
              windows.push({ start: h.open_time, end: h.close_time });
              signatures.add(`${timeToMinutes(h.open_time)}-${timeToMinutes(h.close_time)}`);
            }
          }

          if (barberIds.length >= 2 && signatures.size > 1) variesByBarber = true;

          if (windows.length === 0) {
            // Every barber is off — keep the salon's own advertised window.
            schedule.push(toAvailability(h.day_of_week, h.open_time, h.close_time));
            continue;
          }

          let start = windows[0].start;
          let end = windows[0].end;
          for (const w of windows) {
            if (timeToMinutes(w.start) < timeToMinutes(start)) start = w.start;
            if (timeToMinutes(w.end) > timeToMinutes(end)) end = w.end;
          }
          schedule.push(toAvailability(h.day_of_week, start, end));
        }

        return { schedule, variesByBarber };
      }
    } catch (err) {
      console.warn("fetchSalonSchedule: team-envelope read failed — using salon hours as-is", err);
    }

    // No active barbers / envelope read failed → salon hours as published.
    return {
      schedule: openDays.map((h) => toAvailability(h.day_of_week, h.open_time, h.close_time)),
      variesByBarber: false,
    };
  }

  // 2. Fallback: aggregate all barbers' availability for this salon.
  // Get all barbers in this salon
  const { data: barbers } = await supabase
    .from("barbers")
    .select("id")
    .eq("salon_id", salonId)
    .eq("active", true);

  if (!barbers || barbers.length === 0) return { schedule: [], variesByBarber: false };

  const barberIds = barbers.map((b) => b.id);

  const { data: avail, error } = await supabase
    .from("barber_availability")
    .select("*")
    .in("barber_id", barberIds)
    .eq("is_available", true)
    .order("day_of_week");

  if (error) throw error;
  if (!avail) return { schedule: [], variesByBarber: false };

  // Aggregate per day: earliest start, latest end.
  // Use timeToMinutes for comparisons — Postgres TIME values arrive as
  // "HH:MM:SS" and lexicographic comparison of mixed formats is unreliable.
  const byDay = new Map<number, { start: string; end: string }>();
  for (const slot of avail) {
    const existing = byDay.get(slot.day_of_week);
    if (!existing) {
      byDay.set(slot.day_of_week, { start: slot.start_time, end: slot.end_time });
    } else {
      if (timeToMinutes(slot.start_time) < timeToMinutes(existing.start)) existing.start = slot.start_time;
      if (timeToMinutes(slot.end_time) > timeToMinutes(existing.end)) existing.end = slot.end_time;
    }
  }

  const schedule = Array.from(byDay.entries()).map(([dow, times]) => ({
    id: `agg-${dow}`,
    barber_id: salonId,
    day_of_week: dow,
    start_time: times.start,
    end_time: times.end,
    is_available: true,
    created_at: "",
  }));
  return { schedule, variesByBarber: false };
}

// Schedule-only variant (team envelope, no metadata) for callers that don't
// need the variesByBarber flag.
export async function fetchSalonSchedule(salonId: string): Promise<BarberAvailability[]> {
  return (await fetchSalonScheduleWithMeta(salonId)).schedule;
}

// Fetch availability for a specific barber (all days)
export async function fetchBarberAvailability(barberId: string): Promise<BarberAvailability[]> {
  const { data, error } = await supabase
    .from("barber_availability")
    .select("*")
    .eq("barber_id", barberId)
    .order("day_of_week");
  if (error) throw error;
  return data as BarberAvailability[];
}

// A barber's schedule, falling back to the salon's published hours — overlaid
// with the barber's per-day `barber_hours` overrides — when the barber has no
// `barber_availability` rows at all (common — many salons only manage
// `salon_hours`). Without this, such barbers render as "Închis astăzi" even
// while the salon page shows the shop open.
//
// Deliberately NOT the team envelope (fetchSalonSchedule): this is a SINGLE
// barber's base, mirroring lib/booking.ts resolveSchedule.
export async function fetchBarberScheduleWithFallback(
  barberId: string,
  salonId: string | null
): Promise<BarberAvailability[]> {
  const own = await fetchBarberAvailability(barberId);
  if (own.length > 0) return own;
  if (!salonId) return own;

  const { data: hours, error: hoursErr } = await supabase
    .from("salon_hours")
    .select("day_of_week, is_open, open_time, close_time")
    .eq("salon_id", salonId);

  if (!hoursErr && hours && hours.length > 0) {
    const byDay = new Map<number, { start: string; end: string }>();
    for (const h of hours as {
      day_of_week: number;
      is_open: boolean;
      open_time: string;
      close_time: string;
    }[]) {
      if (h.is_open) byDay.set(h.day_of_week, { start: h.open_time, end: h.close_time });
    }

    // Per-day override: is_open row replaces the window, is_open=false row is
    // a day off, no row inherits the salon hours. Fail-soft on read error.
    const { data: bhRows, error: bhErr } = await supabase
      .from("barber_hours")
      .select("day_of_week, is_open, open_time, close_time")
      .eq("barber_id", barberId);
    if (bhErr) {
      console.warn("fetchBarberScheduleWithFallback: barber_hours fetch failed — using salon hours", bhErr);
    } else {
      for (const r of (bhRows ?? []) as {
        day_of_week: number;
        is_open: boolean;
        open_time: string | null;
        close_time: string | null;
      }[]) {
        if (r.is_open && r.open_time && r.close_time) {
          byDay.set(r.day_of_week, { start: r.open_time, end: r.close_time });
        } else if (!r.is_open) {
          byDay.delete(r.day_of_week);
        }
      }
    }

    return Array.from(byDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dow, w]) => ({
        id: `barber-hours-${dow}`,
        barber_id: barberId,
        day_of_week: dow,
        start_time: w.start,
        end_time: w.end,
        is_available: true,
        created_at: "",
      }));
  }

  // No published salon hours — the salon-level aggregate fallback still applies.
  return fetchSalonSchedule(salonId);
}

// Resolved after-hours "open until" per weekday (minutes since midnight),
// derived from per-barber opt-ins (salon_extended_barber_optins). A weekday's
// value = the MAX resolved until across matching opt-in rows: a row's own
// extended_until, or — when NULL — the salon's ENABLED salon_extended_hours
// close for that weekday (a NULL-until row without an enabled extension row is
// inert). Weekdays with zero opt-in rows are absent — nobody works after-hours
// then. Pass `barberId` to restrict to a single barber's opt-ins (barber
// profile page). Fail-soft: any error resolves to an empty map.
export async function fetchSalonExtendedUntil(
  salonId: string,
  barberId?: string
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  try {
    let query = supabase
      .from("salon_extended_barber_optins")
      .select("day_of_week, extended_until")
      .eq("salon_id", salonId);
    if (barberId) query = query.eq("barber_id", barberId);
    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows || rows.length === 0) return result;

    // Inherit the enabled extension close for NULL-until rows (fail-soft too).
    const extByDay = await fetchSalonExtendedHours(salonId);

    for (const r of rows as { day_of_week: number; extended_until: string | null }[]) {
      const until =
        r.extended_until ?? extByDay.get(r.day_of_week)?.extended_close_time ?? null;
      if (!until) continue; // inert opt-in
      const min = timeToMinutes(until);
      const prev = result.get(r.day_of_week);
      if (prev == null || min > prev) result.set(r.day_of_week, min);
    }
  } catch (err) {
    console.warn("fetchSalonExtendedUntil failed — no extended-hours display", err);
    return new Map();
  }
  return result;
}

// Fetch reviews with author profile
export async function fetchSalonReviews(
  salonId: string,
  limit: number = 5
): Promise<SalonReviewWithAuthor[]> {
  const { data, error } = await supabase
    .from("salon_reviews")
    .select("*, profile:profiles(username, display_name, avatar_url), barber:barbers(name)")
    .eq("salon_id", salonId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as SalonReviewWithAuthor[];
}

// Fetch reviews for a specific barber only (not the whole salon feed)
export async function fetchBarberReviews(
  barberId: string,
  limit: number = 5
): Promise<SalonReviewWithAuthor[]> {
  const { data, error } = await supabase
    .from("salon_reviews")
    .select("*, profile:profiles(username, display_name, avatar_url)")
    .eq("barber_id", barberId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as SalonReviewWithAuthor[];
}

// A client can only review a salon (or a specific barber at that salon) after
// having at least one completed appointment there. Appointments don't carry
// salon_id directly, so we join through barbers.salon_id.
export async function hasCompletedAppointment(
  userId: string,
  salonId: string,
  barberId?: string | null
): Promise<boolean> {
  let query = supabase
    .from("appointments")
    .select("id, barbers!inner(salon_id)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed")
    .eq("barbers.salon_id", salonId);
  if (barberId) query = query.eq("barber_id", barberId);
  const { count, error } = await query;
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Upload multiple review photos in parallel. Returns the public URLs in the same order.
 */
export async function uploadReviewPhotos(
  userId: string,
  photos: Array<{ base64: string; mimeType?: string }>
): Promise<string[]> {
  if (photos.length === 0) return [];

  const uploads = photos.map(async (photo, index) => {
    const mimeType = photo.mimeType ?? "image/jpeg";
    const ext = mimeType === "image/png" ? "png" : "jpg";
    const path = `${userId}/${Date.now()}_${index}.${ext}`;

    const { error } = await supabase.storage
      .from("review-photos")
      .upload(path, decode(photo.base64), { contentType: mimeType });
    if (error) throw error;

    const { data } = supabase.storage.from("review-photos").getPublicUrl(path);
    return data.publicUrl;
  });

  return Promise.all(uploads);
}

export async function submitReview(params: {
  userId: string;
  salonId: string;
  barberId?: string | null;
  rating: number;
  comment?: string;
  photoUrls?: string[];
}): Promise<SalonReview> {
  const { data, error } = await supabase
    .from("salon_reviews")
    .upsert(
      {
        user_id: params.userId,
        salon_id: params.salonId,
        barber_id: params.barberId ?? null,
        rating: params.rating,
        comment: params.comment || null,
        photo_urls: params.photoUrls ?? [],
      },
      { onConflict: "user_id,salon_id,barber_id_norm" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as SalonReview;
}

// Fetch active happy hour for a salon
export async function fetchActiveHappyHour(salonId: string): Promise<SalonHappyHour | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("salon_happy_hours")
    .select("*")
    .eq("salon_id", salonId)
    .eq("active", true)
    .lte("starts_at", now)
    .gte("ends_at", now)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as SalonHappyHour | null;
}

// Toggle favorite: returns new state (true = favorited)
export async function toggleFavorite(userId: string, salonId: string, currentlyFavorite: boolean): Promise<boolean> {
  if (currentlyFavorite) {
    await supabase
      .from("salon_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("salon_id", salonId);
    return false;
  } else {
    await supabase
      .from("salon_favorites")
      .insert({ user_id: userId, salon_id: salonId });
    return true;
  }
}

// Amenity config — keys match the owner app's amenity editor (salons.amenities).
// whisky/reviste are legacy keys with no editor toggle anymore, kept only so
// old salons that still have them set render something instead of nothing.
export const AMENITY_CONFIG: Record<string, { label: string; icon: string }> = {
  wifi: { label: "WiFi", icon: "wifi-outline" },
  parcare: { label: "Parcare", icon: "location-outline" },
  cafea: { label: "Cafea", icon: "cafe-outline" },
  ac: { label: "Aer condiționat", icon: "snow-outline" },
  muzica: { label: "Muzică", icon: "musical-notes-outline" },
  tv: { label: "TV", icon: "tv-outline" },
  card_bancar: { label: "Card bancar", icon: "card-outline" },
  programare_online: { label: "Programare online", icon: "globe-outline" },
  // Legacy keys (no editor toggle, display-only)
  whisky: { label: "Whisky", icon: "wine-outline" },
  reviste: { label: "Reviste", icon: "newspaper-outline" },
};

// Service category display order
export const SERVICE_CATEGORY_ORDER = ["Tuns", "Barbă", "Colorare", "Pachete", "Altele"];

// Romanian day names
const DAY_NAMES = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];

// Strip seconds from PostgreSQL TIME format ("HH:MM:SS" -> "HH:MM").
// Used for display only — do NOT use for comparisons (see timeToMinutes).
function stripSeconds(time: string): string {
  return time.slice(0, 5);
}

// Convert a Postgres TIME value to whole minutes since midnight.
// Handles both "HH:MM" and "HH:MM:SS" so lexicographic comparison bugs
// (e.g. "09:00" < "09:00:00") cannot occur.
function timeToMinutes(time: string): number {
  const parts = time.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// "HH:MM" from minutes since midnight (for extended-close display).
function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Get today's schedule text. `extendedUntil` (optional — see
// fetchSalonExtendedUntil) is the opt-in-derived after-hours close per weekday
// in minutes; it lets the schedule read as open past its normal close while
// inside that window.
export function getTodayScheduleText(
  availability: BarberAvailability[],
  extendedUntil?: Map<number, number> | null
): {
  isOpen: boolean;
  text: string;
} {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // Use minutes-since-midnight for all comparisons — Postgres TIME columns
  // arrive as "HH:MM:SS", so plain string comparison against "HH:MM" is
  // unreliable (e.g. "09:00" >= "09:00:00" is false).
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const todaySlot = availability.find(
    (a) => a.day_of_week === dayOfWeek && a.is_available
  );

  if (!todaySlot) {
    return { isOpen: false, text: "Închis astăzi" };
  }

  const startMinutes = timeToMinutes(todaySlot.start_time);
  const endMinutes = timeToMinutes(todaySlot.end_time);

  const isOpen = currentMinutes >= startMinutes && currentMinutes < endMinutes;

  if (isOpen) {
    return {
      isOpen: true,
      text: `Deschis · ${stripSeconds(todaySlot.start_time)} - ${stripSeconds(todaySlot.end_time)}`,
    };
  }

  // Past normal close — still open if inside the opt-in after-hours window.
  const extEnd = extendedUntil?.get(dayOfWeek);
  if (extEnd != null && extEnd > endMinutes && currentMinutes >= endMinutes && currentMinutes < extEnd) {
    return {
      isOpen: true,
      text: `Deschis prelungit · până la ${minutesToHHMM(extEnd)}`,
    };
  }

  if (currentMinutes < startMinutes) {
    return {
      isOpen: false,
      text: `Închis · Deschide la ${stripSeconds(todaySlot.start_time)}`,
    };
  }

  return { isOpen: false, text: "Închis acum" };
}

// Get full week schedule. `extendedUntil` (optional — see
// fetchSalonExtendedUntil) annotates days with an opt-in after-hours window
// later than the day's close with that extended close.
export function getWeekSchedule(
  availability: BarberAvailability[],
  extendedUntil?: Map<number, number> | null
): {
  day: string;
  hours: string;
  isToday: boolean;
}[] {
  const todayDow = new Date().getDay();

  return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const slot = availability.find((a) => a.day_of_week === dow && a.is_available);
    let hours = "Închis";
    if (slot) {
      hours = `${stripSeconds(slot.start_time)} - ${stripSeconds(slot.end_time)}`;
      const extEnd = extendedUntil?.get(dow);
      if (extEnd != null && extEnd > timeToMinutes(slot.end_time)) {
        hours += ` · prelungit ${minutesToHHMM(extEnd)}`;
      }
    }
    return {
      day: DAY_NAMES[dow],
      hours,
      isToday: dow === todayDow,
    };
  });
}
