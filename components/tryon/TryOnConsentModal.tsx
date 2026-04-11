import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Brand, Typography, Bubble, Shadows, Spacing } from "@/constants/theme";
import { Button } from "@/components/ui/Button";

interface TryOnConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const INFO_CARDS = [
  {
    icon: "camera-outline" as const,
    label: "Poza ta este procesată în timp real",
  },
  {
    icon: "shield-checkmark-outline" as const,
    label: "Nu salvăm și nu stocăm pozele tale",
  },
  {
    icon: "globe-outline" as const,
    label: "Procesare AI de Google Gemini",
  },
];

export function TryOnConsentModal({
  visible,
  onAccept,
  onDecline,
}: TryOnConsentModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header icon */}
          <View style={styles.iconWrapper}>
            <Ionicons name="sparkles" size={40} color={Brand.gradientStart} />
          </View>

          {/* Title */}
          <Text style={styles.title}>Previzualizare Stil cu AI</Text>

          {/* Body text */}
          <Text style={styles.body}>
            Facem o poză cu tine și folosim inteligența artificială pentru a-ți
            arăta cum vei arăta cu frizura aleasă.
          </Text>

          {/* Info cards */}
          <View style={styles.cardsContainer}>
            {INFO_CARDS.map((card) => (
              <View key={card.icon} style={styles.infoCard}>
                <Ionicons
                  name={card.icon}
                  size={18}
                  color={Brand.gradientStart}
                />
                <Text style={styles.infoLabel}>{card.label}</Text>
              </View>
            ))}
          </View>

          {/* Primary button */}
          <Button onPress={onAccept} style={styles.acceptButton}>
            Începe
          </Button>

          {/* Decline link */}
          <Pressable
            onPress={onDecline}
            style={({ pressed }) => [
              styles.declineWrapper,
              pressed && styles.declinePressed,
            ]}
            hitSlop={8}
          >
            <Text style={styles.declineText}>Nu acum</Text>
          </Pressable>

          {/* Fine print */}
          <Text style={styles.finePrint}>
            Prin continuare, ești de acord cu procesarea imaginii tale conform
            Politicii de Confidențialitate.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.white,
    ...Bubble.sheetRadii,
    ...Shadows.glass,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing["2xl"],
    alignItems: "center",
  },
  iconWrapper: {
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h3,
    color: Colors.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  body: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  cardsContainer: {
    width: "100%",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFF",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  infoLabel: {
    ...Typography.caption,
    color: Colors.text,
    flex: 1,
  },
  acceptButton: {
    width: "100%",
    marginBottom: Spacing.md,
  },
  declineWrapper: {
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  declinePressed: {
    opacity: 0.5,
  },
  declineText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  finePrint: {
    ...Typography.small,
    color: Colors.textTertiary,
    textAlign: "center",
    lineHeight: 16,
  },
});
