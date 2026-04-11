import { StyleSheet, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Brand, Colors, Spacing, Typography } from "@/constants/theme";

interface SectionHeaderProps {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Tint color for the icon and "Vezi toate" link. Defaults to `Colors.primary`. */
  iconColor?: string;
  onSeeAll?: () => void;
}

/**
 * SectionHeader — section title row with an optional icon badge and a
 * "Vezi toate" action link. Used in courses, discover bottom sheet, and
 * any screen that groups content into named sections.
 *
 * Usage:
 *   <SectionHeader title="Cursuri Premium" icon="diamond" iconColor="#d4af37" />
 *   <SectionHeader title="Recomandate" onSeeAll={() => router.push('/salons')} />
 */
export function SectionHeader({
  title,
  icon,
  iconColor = Brand.primary,
  onSeeAll,
}: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        {icon ? (
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: iconColor + "18" },
            ]}
          >
            <Ionicons name={icon} size={16} color={iconColor} />
          </View>
        ) : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {onSeeAll ? (
        <Pressable
          onPress={onSeeAll}
          style={styles.seeAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.seeAllText}>Vezi toate</Text>
          <Ionicons name="chevron-forward" size={14} color={Brand.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.h3,
    color: Colors.text,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    ...Typography.captionSemiBold,
    color: Brand.primary,
  },
});
