/**
 * BookingPersonTabs — step 2's "who am I choosing services for" hub.
 *
 * Replaces the old guest-mode banner/sub-step: a plain chip row lets the
 * user freely switch between the main person and any guest already added —
 * no navigation, no confirm step, just a state change. The service list
 * below this component reads/writes whichever person is currently active.
 * "+ Adaugă" reveals the shared GuestAddForm inline and, on confirm, makes
 * the new guest active immediately.
 *
 * Motion mirrors ServiceCard.tsx: staggered FadeInDown entrances, a
 * press-down spring scale, and interpolateColor for the active/inactive
 * swap — driven by a per-chip shared value kept in sync with the `active`
 * prop (chip selection is parent-driven, not locally toggled, so there's no
 * anticipatory flip to reconcile the way ServiceCard's multi-select does).
 */

import { useEffect, useState } from "react";
import { Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  FadeInDown,
  FadeIn,
  FadeOut,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Bubble, Colors, Typography } from "@/constants/theme";
import { Dependent } from "@/components/shared/BookingForSelector";
import { Guest, GuestAddForm } from "@/components/shared/BookingGuestsSection";

// ─── Spring / motion presets — tuned to match ServiceCard.tsx's feel ──────

/** Tactile press-down: snappy, lightweight (mirrors ServiceCard's PRESS_SPRING) */
const CHIP_PRESS_SPRING = { damping: 14, stiffness: 300, mass: 0.8 } as const;
/** Active/inactive color swap */
const CHIP_SELECT_SPRING = { damping: 18, stiffness: 260, mass: 0.8 } as const;
/** Row + section reflow when a chip or the add form appears/disappears */
const ROW_LAYOUT = LinearTransition.springify().damping(20).stiffness(220);
const CHIP_EXITING = FadeOut.duration(150);

// ─── Person chip (Tu / guest) — selection-interpolated ─────────────────────

function PersonChip({
  active,
  icon,
  label,
  onPress,
  index,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  index: number;
}) {
  const selection = useSharedValue(active ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    selection.value = withSpring(active ? 1 : 0, CHIP_SELECT_SPRING);
  }, [active]);

  const chipStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(selection.value, [0, 1], [Colors.white, Colors.primary]);
    const borderColor = interpolateColor(selection.value, [0, 1], [Colors.separator, Colors.primary]);
    return {
      backgroundColor,
      borderColor,
      transform: [{ scale: 1 - press.value * 0.04 }],
    };
  });

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).springify().damping(16).stiffness(260)}
      exiting={CHIP_EXITING}
      layout={ROW_LAYOUT}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          press.value = withSpring(1, CHIP_PRESS_SPRING);
        }}
        onPressOut={() => {
          press.value = withSpring(0, CHIP_PRESS_SPRING);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <Animated.View style={[styles.chip, Bubble.radiiSm, chipStyle]}>
          <Ionicons name={icon} size={14} color={active ? Colors.white : Colors.textSecondary} />
          <Text
            style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ─── "+ Adaugă" trigger — plain press-scale, no selection state ───────────

function AddPersonChip({
  canAdd,
  index,
  onPress,
}: {
  canAdd: boolean;
  index: number;
  onPress: () => void;
}) {
  const press = useSharedValue(0);

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.04 }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).springify().damping(16).stiffness(260)}
      exiting={FadeOut.duration(120)}
      layout={ROW_LAYOUT}
    >
      <Pressable
        onPress={() => {
          if (!canAdd) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        onPressIn={() => {
          if (!canAdd) return;
          press.value = withSpring(1, CHIP_PRESS_SPRING);
        }}
        onPressOut={() => {
          press.value = withSpring(0, CHIP_PRESS_SPRING);
        }}
        disabled={!canAdd}
        accessibilityRole="button"
      >
        <Animated.View
          style={[styles.chip, Bubble.radiiSm, styles.chipAdd, !canAdd && styles.chipAddDisabled, chipStyle]}
        >
          <Ionicons name="add" size={16} color={canAdd ? Colors.primary : Colors.textTertiary} />
          <Text style={[styles.chipAddText, !canAdd && styles.chipAddTextDisabled]}>Adaugă</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

interface Props {
  /** "self" or a guest's key. */
  activePersonKey: string;
  onSelectPerson: (key: string) => void;
  mainServiceCount: number;
  guests: Guest[];
  dependents: Dependent[];
  usedDependentIds: Set<string>;
  barberName?: string;
  onAddGuest: (name: string, dependentClientId?: string) => void;
  onRemoveGuest: (key: string) => void;
}

export function BookingPersonTabs({
  activePersonKey,
  onSelectPerson,
  mainServiceCount,
  guests,
  dependents,
  usedDependentIds,
  barberName,
  onAddGuest,
  onRemoveGuest,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);

  // Main person needs ≥1 service before a guest can be added, and the group
  // is capped at 5 (mirrors the book_appointment RPC's own p_guests limit).
  const canAdd = mainServiceCount > 0 && guests.length < 5;
  const activeGuest =
    activePersonKey === "self" ? null : guests.find((g) => g.key === activePersonKey) ?? null;

  const selectPerson = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelectPerson(key);
  };

  return (
    <Animated.View style={styles.wrap} layout={ROW_LAYOUT}>
      <Text style={styles.title}>Alege serviciile</Text>

      <Animated.View style={styles.chips} layout={ROW_LAYOUT}>
        <PersonChip
          active={activePersonKey === "self"}
          icon="person"
          label={`Tu (${mainServiceCount})`}
          onPress={() => selectPerson("self")}
          index={0}
        />

        {guests.map((g, i) => (
          <PersonChip
            key={g.key}
            active={g.key === activePersonKey}
            icon="happy-outline"
            label={`${g.name} (${g.services.length})`}
            onPress={() => selectPerson(g.key)}
            index={i + 1}
          />
        ))}

        {!showAddForm && (
          <AddPersonChip
            canAdd={canAdd}
            index={guests.length + 1}
            onPress={() => setShowAddForm(true)}
          />
        )}
      </Animated.View>

      {showAddForm ? (
        <GuestAddForm
          dependents={dependents}
          usedDependentIds={usedDependentIds}
          onConfirm={(name, dependentClientId) => {
            setShowAddForm(false);
            onAddGuest(name, dependentClientId);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : activeGuest ? (
        // Replaces the plain subtitle when a guest is active — same spot,
        // but carries the "remove this guest" affordance since that's only
        // ever relevant while their chip is the one being edited. Keyed on
        // the guest so switching between two different guests re-plays the
        // fade instead of the text just snapping to the new name.
        <Animated.View
          key={activeGuest.key}
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          style={styles.activeGuestRow}
        >
          <Text style={styles.activeGuestText} numberOfLines={1}>
            Alegi serviciile pentru {activeGuest.name}
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onRemoveGuest(activeGuest.key);
            }}
            className="flex-row items-center gap-x-1 px-2 py-1"
          >
            <Ionicons name="trash-outline" size={13} color={Colors.error} />
            <Text style={styles.removeGuestText}>Șterge persoana</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Text style={styles.subtitle}>
          Cu {barberName ?? "frizerul tău"} · poți selecta mai multe
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  title: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: 12,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    maxWidth: 170,
    paddingHorizontal: 14,
    paddingVertical: 10,
    // backgroundColor / borderColor overridden by the animated style above
    borderColor: Colors.separator,
    backgroundColor: Colors.white,
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
  chipAdd: {
    backgroundColor: Colors.primaryMuted,
    borderColor: "transparent",
  },
  chipAddDisabled: {
    backgroundColor: Colors.background,
  },
  chipAddText: {
    ...Typography.captionSemiBold,
    color: Colors.primary,
  },
  chipAddTextDisabled: {
    color: Colors.textTertiary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  activeGuestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  activeGuestText: {
    ...Typography.captionSemiBold,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  removeGuestText: {
    ...Typography.captionSemiBold,
    color: Colors.error,
  },
});
