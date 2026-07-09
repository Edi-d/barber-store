/**
 * BookingForSelector — "Pentru cine este programarea?"
 *
 * Lets a signed-in customer book for themselves, a saved dependent (a child /
 * other person they manage at this salon), or a brand-new child added inline.
 * The account holder always stays the contact; only the person NAME changes.
 * Mirrors the web app's booking "book for" selector.
 *
 * A dependent is a per-salon salon_clients row with managed_by_profile_id = the
 * parent's profile. New children are created server-side by book_appointment.
 */

import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Bubble, Colors, Typography } from "@/constants/theme";

export type Dependent = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export type BookingFor =
  | { kind: "self" }
  | { kind: "dependent"; clientId: string; name: string }
  | { kind: "new_child"; name: string };

export function dependentDisplayName(d: Dependent): string {
  return [d.first_name, d.last_name].filter(Boolean).join(" ").trim() || "Copil";
}

function Chip({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        Bubble.radiiSm,
        active ? styles.chipActive : styles.chipInactive,
      ]}
    >
      <Ionicons
        name={icon}
        size={15}
        color={active ? Colors.white : Colors.textSecondary}
      />
      <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
        {label}
      </Text>
    </Pressable>
  );
}

interface Props {
  dependents: Dependent[];
  value: BookingFor;
  onChange: (v: BookingFor) => void;
}

export function BookingForSelector({ dependents, value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Pentru cine este programarea?</Text>

      <View style={styles.chips}>
        <Chip
          active={value.kind === "self"}
          icon="person"
          label="Pentru mine"
          onPress={() => onChange({ kind: "self" })}
        />

        {dependents.map((d) => {
          const name = dependentDisplayName(d);
          return (
            <Chip
              key={d.id}
              active={value.kind === "dependent" && value.clientId === d.id}
              icon="happy-outline"
              label={name}
              onPress={() => onChange({ kind: "dependent", clientId: d.id, name })}
            />
          );
        })}

        <Chip
          active={value.kind === "new_child"}
          icon="add"
          label="Adaugă copil"
          onPress={() =>
            onChange({
              kind: "new_child",
              name: value.kind === "new_child" ? value.name : "",
            })
          }
        />
      </View>

      {value.kind === "new_child" && (
        <TextInput
          style={styles.input}
          placeholder="Numele copilului"
          value={value.name}
          onChangeText={(t) => onChange({ kind: "new_child", name: t })}
          autoCapitalize="words"
          maxLength={80}
          placeholderTextColor={Colors.textTertiary}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    gap: 10,
  },
  label: {
    ...Typography.captionSemiBold,
    color: Colors.textSecondary,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipInactive: {
    backgroundColor: Colors.white,
    borderColor: Colors.separator,
  },
  chipText: {
    ...Typography.captionSemiBold,
  },
  chipTextActive: {
    color: Colors.white,
  },
  chipTextInactive: {
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.separator,
    // Squircle radii inlined (Bubble.radiiSm is typed ViewStyle, which isn't
    // assignable to a TextInput's TextStyle).
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Typography.body,
    color: Colors.text,
  },
});
