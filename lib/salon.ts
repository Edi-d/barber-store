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

// Fetch aggregated salon schedule from all barbers' availability
export async function fetchSalonSchedule(salonId: string): Promise<BarberAvailability[]> {
  // Get all barbers in this salon
  const { data: barbers } = await supabase
    .from("barbers")
    .select("id")
    .eq("salon_id", salonId)
    .eq("active", true);

  if (!barbers || barbers.length === 0) return [];

  const barberIds = barbers.map((b) => b.id);

  const { data: avail, error } = await supabase
    .from("barber_availability")
    .select("*")
    .in("barber_id", barberIds)
    .eq("is_available", true)
    .order("day_of_week");

  if (error) throw error;
  if (!avail) return [];

  // Aggregate per day: earliest start, latest end
  const byDay = new Map<number, { start: string; end: string }>();
  for (const slot of avail) {
    const existing = byDay.get(slot.day_of_week);
    if (!existing) {
      byDay.set(slot.day_of_week, { start: slot.start_time, end: slot.end_time });
    } else {
      if (slot.start_time < existing.start) existing.start = slot.start_time;
      if (slot.end_time > existing.end) existing.end = slot.end_time;
    }
  }

  return Array.from(byDay.entries()).map(([dow, times]) => ({
    id: `agg-${dow}`,
    barber_id: salonId,
    day_of_week: dow,
    start_time: times.start,
    end_time: times.end,
    is_available: true,
    created_at: "",
  }));
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

// Fetch reviews with author profile
export async function fetchSalonReviews(
  salonId: string,
  limit: number = 5
): Promise<SalonReviewWithAuthor[]> {
  const { data, error } = await supabase
    .from("salon_reviews")
    .select("*, profile:profiles(username, display_name, avatar_url)")
    .eq("salon_id", salonId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as SalonReviewWithAuthor[];
}

// Upload a review photo and return the public URL
export async function uploadReviewPhoto(
  userId: string,
  base64: string,
  mimeType: string = "image/jpeg"
): Promise<string> {
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("review-photos")
    .upload(path, decode(base64), { contentType: mimeType });
  if (error) throw error;

  const { data } = supabase.storage.from("review-photos").getPublicUrl(path);
  return data.publicUrl;
}

// Submit a new review (or update existing one)
export async function submitReview(params: {
  userId: string;
  salonId: string;
  rating: number;
  comment?: string;
  photoUrl?: string;
}): Promise<SalonReview> {
  const { data, error } = await supabase
    .from("salon_reviews")
    .upsert(
      {
        user_id: params.userId,
        salon_id: params.salonId,
        rating: params.rating,
        comment: params.comment || null,
        photo_url: params.photoUrl || null,
      },
      { onConflict: "user_id,salon_id" }
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

// Amenity config
export const AMENITY_CONFIG: Record<string, { label: string; icon: string }> = {
  parking: { label: "Parcare", icon: "car-outline" },
  pets: { label: "Animale", icon: "paw-outline" },
  card: { label: "Card", icon: "card-outline" },
  cash: { label: "Cash", icon: "cash-outline" },
  wifi: { label: "Wi-Fi", icon: "wifi-outline" },
  ac: { label: "Aer condiționat", icon: "snow-outline" },
  coffee: { label: "Cafea", icon: "cafe-outline" },
};

// Service category display order
export const SERVICE_CATEGORY_ORDER = ["Tuns", "Barbă", "Colorare", "Pachete", "Altele"];

// Romanian day names
const DAY_NAMES = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];

// Strip seconds from PostgreSQL TIME format ("HH:MM:SS" -> "HH:MM")
function stripSeconds(time: string): string {
  return time.slice(0, 5);
}

// Get today's schedule text
export function getTodayScheduleText(availability: BarberAvailability[]): {
  isOpen: boolean;
  text: string;
} {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  const todaySlot = availability.find(
    (a) => a.day_of_week === dayOfWeek && a.is_available
  );

  if (!todaySlot) {
    return { isOpen: false, text: "Închis astăzi" };
  }

  const isOpen = currentTime >= todaySlot.start_time && currentTime < todaySlot.end_time;

  if (isOpen) {
    return {
      isOpen: true,
      text: `Deschis · ${stripSeconds(todaySlot.start_time)} - ${stripSeconds(todaySlot.end_time)}`,
    };
  }

  if (currentTime < todaySlot.start_time) {
    return {
      isOpen: false,
      text: `Închis · Deschide la ${stripSeconds(todaySlot.start_time)}`,
    };
  }

  return { isOpen: false, text: "Închis acum" };
}

// Get full week schedule
export function getWeekSchedule(availability: BarberAvailability[]): {
  day: string;
  hours: string;
  isToday: boolean;
}[] {
  const todayDow = new Date().getDay();

  return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const slot = availability.find((a) => a.day_of_week === dow && a.is_available);
    return {
      day: DAY_NAMES[dow],
      hours: slot ? `${stripSeconds(slot.start_time)} - ${stripSeconds(slot.end_time)}` : "Închis",
      isToday: dow === todayDow,
    };
  });
}
