/**
 * BookingGuestsSection — "Persoane suplimentare" (step 4 only)
 *
 * One summary card per guest (name, service count + price, "Modifică" /
 * remove) plus the shared `GuestAddForm` to add a new one. Choosing a
 * person's actual services happens on step 2 via `BookingPersonTabs`, which
 * reuses `GuestAddForm` for its own "+ Adaugă" chip — same inline flow, two
 * entry points.
 *
 * Motion: guest cards stagger in / fade out like ServiceCard.tsx, with a
 * `layout` transition on each so a removal makes the remaining cards slide
 * up smoothly instead of snapping (mirrors app/cart.tsx's swipeable rows).
 */

import { useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import Animated, { FadeInDown, FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Bubble, Colors, Shadows, Typography } from "@/constants/theme";
import { BarberService } from "@/types/database";
import { Dependent, dependentDisplayName } from "@/components/shared/BookingForSelector";

export type Guest = {
  key: string;
  name: string;
  dependentClientId?: string;
  services: BarberService[];
};

const CARD_LAYOUT = LinearTransition.springify().damping(20).stiffness(220);

// ─── Shared inline "add guest" form ───────────────────────────────────────
// Quick-pick chips for saved dependents not already in use, a free-text name
// fallback, and Anulează / "Alege serviciile" actions. Purely a name-capture
// step — the caller decides what happens next (see onConfirm).

interface GuestAddFormProps {
  dependents: Dependent[];
  /** Dependent IDs to exclude from the quick-pick chips (already a guest, or
   *  already the main "bookingFor" person). */
  usedDependentIds: Set<string>;
  onConfirm: (name: string, dependentClientId?: string) => void;
  onCancel: () => void;
}

export function GuestAddForm({
  dependents,
  usedDependentIds,
  onConfirm,
  onCancel,
}: GuestAddFormProps) {
  const [name, setName] = useState("");
  const [dependentClientId, setDependentClientId] = useState<string | undefined>(undefined);

  const availableDependents = dependents.filter((d) => !usedDependentIds.has(d.id));

  const handlePickDependent = (d: Dependent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setName(dependentDisplayName(d));
    setDependentClientId(d.id);
  };

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onConfirm(trimmed, dependentClientId);
  };

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18).stiffness(240)}
      exiting={FadeOut.duration(120)}
      layout={CARD_LAYOUT}
      style={[formStyles.addForm, Bubble.radiiSm, Shadows.sm]}
    >
      <View style={formStyles.header}>
        <View style={formStyles.headerIcon}>
          <Ionicons name="person-add-outline" size={18} color={Colors.primary} />
        </View>
        <View style={formStyles.headerText}>
          <Text style={formStyles.headerTitle}>Adaugă o persoană</Text>
          <Text style={formStyles.headerSubtitle}>Copil sau prieten — cu serviciile lui</Text>
        </View>
      </View>

      {availableDependents.length > 0 && (
        <View style={formStyles.chips}>
          {availableDependents.map((d) => {
            const dName = dependentDisplayName(d);
            const active = dependentClientId === d.id;
            return (
              <Pressable
                key={d.id}
                onPress={() => handlePickDependent(d)}
                className="flex-row items-center gap-x-1.5 px-3 py-2"
                style={[formStyles.chip, Bubble.radiiSm, active ? formStyles.chipActive : formStyles.chipInactive]}
              >
                <Ionicons
                  name="happy-outline"
                  size={14}
                  color={active ? Colors.white : Colors.textSecondary}
                />
                <Text style={[formStyles.chipText, active ? formStyles.chipTextActive : formStyles.chipTextInactive]}>
                  {dName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <TextInput
        style={formStyles.input}
        placeholder="Numele persoanei"
        value={name}
        onChangeText={(t) => {
          setName(t);
          // Manual edits detach from the tapped dependent — otherwise a
          // freely-typed name would silently keep writing into that
          // dependent's booking history.
          if (dependentClientId) setDependentClientId(undefined);
        }}
        autoCapitalize="words"
        autoFocus
        maxLength={80}
        placeholderTextColor={Colors.textTertiary}
      />

      <View style={formStyles.addFormActions}>
        <Pressable onPress={onCancel} className="px-4 py-2.5" style={formStyles.cancelBtn}>
          <Text style={formStyles.cancelBtnText}>Anulează</Text>
        </Pressable>
        <Pressable
          onPress={handleConfirm}
          disabled={name.trim().length === 0}
          className="flex-row items-center justify-center gap-x-1.5 px-4 py-2.5"
          style={[
            formStyles.confirmBtn,
            Bubble.radiiSm,
            name.trim().length === 0 && formStyles.confirmBtnDisabled,
          ]}
        >
          <Text style={formStyles.confirmBtnText}>Alege serviciile</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.white} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Guest cards + add trigger (step 4) ───────────────────────────────────

interface Props {
  guests: Guest[];
  dependents: Dependent[];
  usedDependentIds: Set<string>;
  /** Whether "Adaugă persoană" is currently allowed (main person has ≥1
   *  service selected, and fewer than 5 guests so far). */
  canAdd: boolean;
  formatPrice: (cents: number, currency: string) => string;
  onAdd: (name: string, dependentClientId?: string) => void;
  onEdit: (key: string) => void;
  onRemove: (key: string) => void;
}

export function BookingGuestsSection({
  guests,
  dependents,
  usedDependentIds,
  canAdd,
  formatPrice,
  onAdd,
  onEdit,
  onRemove,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Persoane suplimentare</Text>

      {guests.map((g, index) => {
        const count = g.services.length;
        const cents = g.services.reduce((sum, s) => sum + s.price_cents, 0);
        const currency = g.services[0]?.currency ?? "RON";
        return (
          <Animated.View
            key={g.key}
            entering={FadeInDown.delay(index * 60).springify().damping(18).stiffness(240)}
            exiting={FadeOut.duration(150)}
            layout={CARD_LAYOUT}
            style={[styles.card, Bubble.radiiSm]}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="person-outline" size={18} color={Colors.primary} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName} numberOfLines={1}>
                {g.name}
              </Text>
              <Text style={styles.cardMeta}>
                {count === 0
                  ? "Fără servicii alese"
                  : `${count === 1 ? "1 serviciu" : `${count} servicii`} · ${formatPrice(cents, currency)}`}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onEdit(g.key);
              }}
              className="px-3 py-2 mr-1.5"
              style={styles.editBtn}
            >
              <Text style={styles.editBtnText}>Modifică</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onRemove(g.key);
              }}
              hitSlop={8}
              className="w-7 h-7 items-center justify-center"
              style={styles.removeBtn}
            >
              <Ionicons name="close" size={16} color={Colors.textSecondary} />
            </Pressable>
          </Animated.View>
        );
      })}

      {showAddForm ? (
        <GuestAddForm
          dependents={dependents}
          usedDependentIds={usedDependentIds}
          onConfirm={(name, dependentClientId) => {
            setShowAddForm(false);
            onAdd(name, dependentClientId);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} layout={CARD_LAYOUT}>
          <Pressable
            onPress={() => {
              if (!canAdd) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setShowAddForm(true);
            }}
            disabled={!canAdd}
            className="flex-row items-center justify-center gap-x-2 px-4 py-3.5"
            style={[styles.addBtn, Bubble.radiiSm, !canAdd && styles.addBtnDisabled]}
          >
            <Ionicons
              name="person-add-outline"
              size={18}
              color={canAdd ? Colors.primary : Colors.textTertiary}
            />
            <Text style={[styles.addBtnText, !canAdd && styles.addBtnTextDisabled]}>
              Adaugă persoană
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

// ─── GuestAddForm styles ───────────────────────────────────────────────────

const formStyles = StyleSheet.create({
  addForm: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.separator,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  headerSubtitle: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipInactive: {
    backgroundColor: Colors.background,
    borderColor: Colors.separator,
  },
  chipText: {
    ...Typography.smallSemiBold,
  },
  chipTextActive: {
    color: Colors.white,
  },
  chipTextInactive: {
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.separator,
    // Squircle radii — same asymmetric corner language as BookingForSelector's
    // "Numele copilului" input (Bubble.radiiSm inlined; ViewStyle isn't
    // assignable to a TextInput's TextStyle, so it's spelled out here too).
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Typography.body,
    color: Colors.text,
  },
  addFormActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  cancelBtn: {
    backgroundColor: "transparent",
  },
  cancelBtnText: {
    ...Typography.captionSemiBold,
    color: Colors.textSecondary,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    ...Typography.captionSemiBold,
    color: Colors.white,
  },
});

// ─── BookingGuestsSection styles ───────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
    gap: 10,
  },
  label: {
    ...Typography.captionSemiBold,
    color: Colors.textSecondary,
  },

  // ── Guest card ──────────────────────────────────────────────────────────
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.separator,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    ...Typography.captionSemiBold,
    color: Colors.text,
  },
  cardMeta: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  editBtn: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: 999,
  },
  editBtnText: {
    ...Typography.smallSemiBold,
    color: Colors.primary,
  },
  removeBtn: {
    borderRadius: 14,
    backgroundColor: Colors.background,
  },

  // ── Add button ──────────────────────────────────────────────────────────
  addBtn: {
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: "transparent",
  },
  addBtnDisabled: {
    backgroundColor: Colors.background,
  },
  addBtnText: {
    ...Typography.captionSemiBold,
    color: Colors.primary,
  },
  addBtnTextDisabled: {
    color: Colors.textTertiary,
  },
});
