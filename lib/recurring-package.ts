// Client-side labels for "pachet recurent" (recurring appointment packages).
// The engine (occurrence generation + placement + pricing) lives in the
// book_recurring_package RPC (migration 158); the mobile app only reads the
// active definitions and renders these friendly labels. Ported from the web's
// lib/recurring-package.ts (label subset).

import type { ServiceRecurringPackage } from "@/types/database";

export type IntervalUnit = "week" | "month";
export type Cadence = "weekly" | "biweekly" | "monthly";

// Owner-facing cadences → interval-engine params. "De 2 ori pe lună" is modelled
// as every 2 weeks. perMonth is used only for deriving occurrence counts.
export const CADENCE_PRESETS = [
  { value: "weekly", label: "Săptămânal", unit: "week", count: 1, perMonth: 4 },
  { value: "biweekly", label: "De 2 ori pe lună", unit: "week", count: 2, perMonth: 2 },
  { value: "monthly", label: "Lunar", unit: "month", count: 1, perMonth: 1 },
] as const;

// The subset of a package's fields the labels need — accepts a full
// ServiceRecurringPackage or any object carrying the engine params + labels.
export type PackageLike = Pick<
  ServiceRecurringPackage,
  "cadence" | "interval_unit" | "interval_count" | "occurrences"
> & { duration_months?: number | null };

export function cadencePreset(cadence: Cadence | null | undefined) {
  if (!cadence) return null;
  return CADENCE_PRESETS.find((c) => c.value === cadence) ?? null;
}

// Cadence label from the raw interval params (fallback when no explicit cadence).
function cadenceLabelFromInterval(unit: IntervalUnit, count: number): string {
  if (unit === "week" && count === 1) return "săptămânal";
  if (unit === "week" && count === 2) return "la 2 săptămâni";
  if (unit === "month" && count === 1) return "lunar";
  return `la ${count} ${unit === "week" ? "săptămâni" : "luni"}`;
}

// Friendly, lowercase cadence for inline copy, e.g. "săptămânal".
export function cadenceLabel(pkg: PackageLike): string {
  const preset = cadencePreset(pkg.cadence);
  return preset
    ? preset.label.toLowerCase()
    : cadenceLabelFromInterval(pkg.interval_unit, pkg.interval_count);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Chooser row title, e.g. "6 luni · Lunar" (falls back to just the cadence).
export function packageTitle(pkg: PackageLike): string {
  const cadence = capitalize(cadenceLabel(pkg));
  return pkg.duration_months ? `${pkg.duration_months} luni · ${cadence}` : cadence;
}

// Chooser row subtitle.
export function packageSubtitle(pkg: PackageLike): string {
  return `${pkg.occurrences} programări · plătiți o singură dată`;
}

// One-line human summary, e.g. "6 luni · 24 programări · lunar".
export function describePackage(pkg: PackageLike): string {
  const cadence = cadenceLabel(pkg);
  const durationPart = pkg.duration_months ? `${pkg.duration_months} luni · ` : "";
  return `${durationPart}${pkg.occurrences} programări · ${cadence}`;
}

// Cheapest package price among a service's offerings (for the "de la {price}"
// trigger row). Returns 0 for an empty list.
export function minPackagePriceCents(list: ServiceRecurringPackage[]): number {
  if (list.length === 0) return 0;
  return list.reduce((min, p) => (p.price_cents < min ? p.price_cents : min), list[0].price_cents);
}
