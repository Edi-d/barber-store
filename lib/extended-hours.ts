/**
 * lib/extended-hours.ts
 *
 * Consumer-side helpers for the salon "extended hours" feature: an optional
 * after-close booking window per weekday that carries a price surcharge and is
 * limited to a subset of services.
 *
 * The salon business app owns the editing UI + the canonical surcharge math;
 * here we mirror just enough to (a) stretch the bookable window so after-close
 * slots appear and (b) show the customer the surcharge before they book. The
 * book_appointment RPC re-derives and ENFORCES the surcharge + service subset
 * server-side (migration 149) — this file is display-only and never the source
 * of truth for what gets charged.
 *
 * ── Boundary note ─────────────────────────────────────────────────────────────
 * The surcharge applies to slots that START at/after the day's NORMAL
 * salon_hours.close_time. salon_extended_hours is ONLY the pricing layer
 * (surcharge + allowed services); whether a given barber is actually bookable
 * after-hours is a per-barber OPT-IN (salon_extended_barber_optins — see
 * lib/booking.ts resolveSchedule). A barber with no opt-in row never gets
 * after-close slots, keeping the client boundary in lockstep with the RPC.
 */

import { supabase } from "@/lib/supabase";

export type SurchargeType = "percent" | "fixed";

/** A salon_extended_hours row with its allowed-service set hydrated. */
export interface SalonExtendedHours {
  salon_id: string;
  day_of_week: number; // 0=Sunday..6=Saturday
  enabled: boolean;
  extended_close_time: string; // "HH:MM[:SS]"
  surcharge_type: SurchargeType;
  surcharge_percent: number;
  surcharge_value_cents: number;
  // Services allowed in the extended window for this weekday. null/empty == all.
  service_ids: string[] | null;
}

/** "HH:MM[:SS]" → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Fetch the salon's enabled extended-hours rows, keyed by weekday, with the
 * per-weekday allowed-service set hydrated from salon_extended_services. Returns
 * a Map<day_of_week, SalonExtendedHours>. Best-effort: any error resolves to an
 * empty map so booking still works (the RPC stays authoritative).
 */
export async function fetchSalonExtendedHours(
  salonId: string
): Promise<Map<number, SalonExtendedHours>> {
  const map = new Map<number, SalonExtendedHours>();

  const { data: rows, error } = await supabase
    .from("salon_extended_hours")
    .select(
      "salon_id, day_of_week, enabled, extended_close_time, surcharge_type, surcharge_percent, surcharge_value_cents"
    )
    .eq("salon_id", salonId)
    .eq("enabled", true);

  if (error || !rows || rows.length === 0) return map;

  const { data: links } = await supabase
    .from("salon_extended_services")
    .select("day_of_week, service_id")
    .eq("salon_id", salonId);

  const byDay = new Map<number, string[]>();
  for (const l of (links ?? []) as { day_of_week: number; service_id: string }[]) {
    const arr = byDay.get(l.day_of_week) ?? [];
    arr.push(l.service_id);
    byDay.set(l.day_of_week, arr);
  }

  for (const r of rows as Omit<SalonExtendedHours, "service_ids">[]) {
    map.set(r.day_of_week, { ...r, service_ids: byDay.get(r.day_of_week) ?? null });
  }
  return map;
}

/** Whether the extended window for a day allows a given service (empty == all). */
export function extensionCoversService(
  ext: SalonExtendedHours,
  serviceId: string
): boolean {
  const ids = ext.service_ids;
  if (!ids || ids.length === 0) return true;
  return ids.includes(serviceId);
}

/**
 * Apply the surcharge to a base total (in cents). percent scales the total;
 * fixed adds a flat amount. Used for the customer-facing price preview only.
 */
export function surchargedTotalCents(
  baseCents: number,
  ext: SalonExtendedHours
): number {
  if (ext.surcharge_type === "fixed") {
    return baseCents + ext.surcharge_value_cents;
  }
  return Math.round(baseCents * (1 + ext.surcharge_percent / 100));
}

/**
 * Price (in cents) a service charges while the salon is in its extended-hours
 * window. An explicit price_cents_extended (> 0) REPLACES the base price and the
 * day-level surcharge for that service; null/0 falls back to the base price so
 * the normal surcharge flow applies. Kept dependency-free so it mirrors the web
 * (lib/extended-hours.extendedServicePriceCents) and the book_appointment RPC.
 */
export function extendedServicePriceCents(
  baseCents: number,
  priceCentsExtended: number | null | undefined
): number {
  return priceCentsExtended != null && priceCentsExtended > 0
    ? priceCentsExtended
    : baseCents;
}

/** Minimal service shape needed to price an extended-window booking. */
type PriceableService = { price_cents: number; price_cents_extended?: number | null };

/**
 * Final booking total (in cents) for the chosen slot — the customer-facing
 * preview that must match what book_appointment charges.
 *
 *  - Non-extended slot (or no extension): plain sum of base prices. Mobile
 *    booking totals never apply happy-hour (neither does the RPC).
 *  - Extended slot: a service with an explicit extended price (> 0) is charged
 *    that amount verbatim (replaces base + surcharge); every other service goes
 *    through the day-level surcharge. To match the RPC bit-for-bit the percent
 *    surcharge is rounded PER SERVICE, and a fixed surcharge is added ONCE to the
 *    first surcharged service (dropped entirely when every selected service used
 *    an explicit extended price).
 */
export function finalBookingTotalCents(
  services: PriceableService[],
  ext: SalonExtendedHours | null | undefined,
  extendedSlot: boolean
): number {
  const base = services.reduce((sum, s) => sum + s.price_cents, 0);
  if (!extendedSlot || !ext) return base;

  let total = 0;
  let fixedApplied = false;
  for (const s of services) {
    if (s.price_cents_extended != null && s.price_cents_extended > 0) {
      total += s.price_cents_extended; // explicit extended price, verbatim
    } else if (ext.surcharge_type === "percent") {
      total += Math.round(s.price_cents * (1 + ext.surcharge_percent / 100));
    } else {
      total += s.price_cents + (fixedApplied ? 0 : ext.surcharge_value_cents);
      fixedApplied = true;
    }
  }
  return total;
}

/** Short surcharge label, e.g. "+20%" or "+15 RON". */
export function surchargeLabel(ext: SalonExtendedHours): string {
  if (ext.surcharge_type === "fixed") {
    return `+${Math.round(ext.surcharge_value_cents / 100)} RON`;
  }
  return `+${ext.surcharge_percent}%`;
}
