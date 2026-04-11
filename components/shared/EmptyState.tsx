import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Defaults to 64. */
  iconSize?: number;
  /** Extra className applied to the outer container. */
  className?: string;
}

/**
 * EmptyState — icon + title + optional subtitle shown when a list has no items.
 *
 * Usage:
 *   <EmptyState
 *     icon="calendar-outline"
 *     title="Nicio programare"
 *     subtitle="Rezervă o programare din tab-ul Discover"
 *   />
 */
export function EmptyState({
  icon,
  title,
  subtitle,
  iconSize = 64,
  className = "",
}: EmptyStateProps) {
  return (
    <View
      className={`items-center justify-center py-12 px-6 bg-white rounded-xl ${className}`}
    >
      <Ionicons name={icon} size={iconSize} color="#64748b" />
      <Text className="text-dark-700 text-lg font-bold mt-4 text-center">
        {title}
      </Text>
      {subtitle ? (
        <Text className="text-dark-500 text-center mt-2">{subtitle}</Text>
      ) : null}
    </View>
  );
}
