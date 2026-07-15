import { View, Text, Image } from "react-native";
import { experienceMeta } from "@/lib/barber-experience";
import { Shadows } from "@/constants/theme";

/**
 * Tier pill (icon + name, e.g. 🪒 Senior). Renders nothing when the band is unset.
 * - `floating`: white pill + shadow for overlaying an avatar corner.
 * - `showRange`: append the year range ("Senior · 4–8 ani") — used on the barber
 *   details screen so the rank's meaning is explicit.
 * Alignment is left to the caller via `className`.
 */
export function ExperienceBadge({
  band,
  className = "",
  floating = false,
  showRange = false,
}: {
  band?: string | null;
  className?: string;
  floating?: boolean;
  showRange?: boolean;
}) {
  const meta = experienceMeta(band);
  if (!meta) return null;
  return (
    <View
      className={`h-7 flex-row items-center gap-1 pl-1 pr-2.5 rounded-lg border ${
        floating ? "bg-white border-slate-200" : "bg-blue-50 border-blue-200"
      } ${className}`}
      style={floating ? Shadows.sm : undefined}
    >
      <Image
        source={meta.icon}
        style={{ width: 20, height: 20 }}
        resizeMode="contain"
      />
      <Text className="text-[11px] font-bold text-blue-700">
        {showRange ? `${meta.name} · ${meta.range}` : meta.name}
      </Text>
    </View>
  );
}
