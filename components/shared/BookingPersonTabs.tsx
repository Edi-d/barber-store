/**
 * BookingPersonTabs — step 2's "who am I choosing services for" hub.
 *
 * Replaces the old guest-mode banner/sub-step: a plain chip row lets the
 * user freely switch between the main person and any guest already added —
 * no navigation, no confirm step, just a state change. The service list
 * below this component reads/writes whichever person is currently active.
 * "+ Adaugă" reveals the shared GuestAddForm inline and, on confirm, makes
 * the new guest active immediately.
 */

import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Bubble, Colors, Typography } from "@/constants/theme";
import { Dependent } from "@/components/shared/BookingForSelector";
import { Guest, GuestAddForm } from "@/components/shared/BookingGuestsSection";

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
    <View style={styles.wrap}>
      <Text style={styles.title}>Alege serviciile</Text>

      <View style={styles.chips}>
        <Pressable
          onPress={() => selectPerson("self")}
          className="flex-row items-center gap-x-1.5 px-3.5 py-2.5"
          style={[
            styles.chip,
            Bubble.radiiSm,
            activePersonKey === "self" ? styles.chipActive : styles.chipInactive,
          ]}
        >
          <Ionicons
            name="person"
            size={14}
            color={activePersonKey === "self" ? Colors.white : Colors.textSecondary}
          />
          <Text
            style={[
              styles.chipText,
              activePersonKey === "self" ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            Tu ({mainServiceCount})
          </Text>
        </Pressable>

        {guests.map((g) => {
          const active = g.key === activePersonKey;
          return (
            <Pressable
              key={g.key}
              onPress={() => selectPerson(g.key)}
              className="flex-row items-center gap-x-1.5 px-3.5 py-2.5"
              style={[styles.chip, Bubble.radiiSm, active ? styles.chipActive : styles.chipInactive]}
            >
              <Ionicons
                name="happy-outline"
                size={14}
                color={active ? Colors.white : Colors.textSecondary}
              />
              <Text
                style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}
                numberOfLines={1}
              >
                {g.name} ({g.services.length})
              </Text>
            </Pressable>
          );
        })}

        {!showAddForm && (
          <Pressable
            onPress={() => {
              if (!canAdd) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setShowAddForm(true);
            }}
            disabled={!canAdd}
            className="flex-row items-center gap-x-1 px-3.5 py-2.5"
            style={[styles.chip, Bubble.radiiSm, styles.chipAdd, !canAdd && styles.chipAddDisabled]}
          >
            <Ionicons name="add" size={16} color={canAdd ? Colors.primary : Colors.textTertiary} />
            <Text style={[styles.chipAddText, !canAdd && styles.chipAddTextDisabled]}>Adaugă</Text>
          </Pressable>
        )}
      </View>

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
        // ever relevant while their chip is the one being edited.
        <View style={styles.activeGuestRow}>
          <Text style={styles.activeGuestText} numberOfLines={1}>
            Alegi serviciile pentru {activeGuest.name}
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onRemoveGuest(activeGuest.key);
            }}
            className="px-2 py-1"
          >
            <Text style={styles.removeGuestText}>Șterge persoana</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.subtitle}>
          Cu {barberName ?? "frizerul tău"} · poți selecta mai multe
        </Text>
      )}
    </View>
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
    borderWidth: 1,
    maxWidth: 170,
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
