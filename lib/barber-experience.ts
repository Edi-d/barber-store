import type { ImageSourcePropType } from "react-native";

// Barber experience tier — mirrors the web app (tazpi-website lib/barber-experience.ts)
// and the shared `barbers.experience_band` column. Named tiers with a year range
// and the craft-progression icon (comb → scissors → razor → maestru).

export type ExperienceBand = "y1_2" | "y2_4" | "y4_8" | "y8_plus";

const META: Record<
  ExperienceBand,
  { name: string; range: string; icon: ImageSourcePropType }
> = {
  y1_2: {
    name: "Junior",
    range: "1–2 ani",
    icon: require("@/assets/barber-experience/piaptan.png"),
  },
  y2_4: {
    name: "Stylist",
    range: "2–4 ani",
    icon: require("@/assets/barber-experience/foarfeca.png"),
  },
  y4_8: {
    name: "Senior",
    range: "4–8 ani",
    icon: require("@/assets/barber-experience/briceag.png"),
  },
  y8_plus: {
    name: "Master",
    range: "8+ ani",
    icon: require("@/assets/barber-experience/maestru.png"),
  },
};

/** Tier meta for a band value, or null when unset/unknown. */
export function experienceMeta(
  band?: string | null,
): { name: string; range: string; icon: ImageSourcePropType } | null {
  if (!band) return null;
  return (
    (META as Record<string, { name: string; range: string; icon: ImageSourcePropType }>)[
      band
    ] ?? null
  );
}
