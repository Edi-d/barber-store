import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Brand, Typography, Bubble, Shadows, Spacing } from "@/constants/theme";
import { Button } from "@/components/ui/Button";
import {
  ACADEMY_CONSENT_TITLE,
  ACADEMY_CONSENT_BODY_PARAGRAPHS,
} from "@/constants/academy";

interface AcademyConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const INFO_CARDS = [
  {
    icon: "school-outline" as const,
    label: "Tunsoarea este realizată de un cursant al academiei",
  },
  {
    icon: "alert-circle-outline" as const,
    label: "Rezultatul poate varia față de un frizer cu experiență",
  },
  {
    icon: "shield-outline" as const,
    label: "Platforma nu răspunde pentru rezultatul serviciului",
  },
];

export function AcademyConsentModal({
  visible,
  onAccept,
  onDecline,
}: AcademyConsentModalProps) {
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
            <Ionicons name="cut" size={40} color={Brand.gradientStart} />
          </View>

          {/* Title */}
          <Text style={styles.title}>{ACADEMY_CONSENT_TITLE}</Text>

          {/* Body text */}
          {ACADEMY_CONSENT_BODY_PARAGRAPHS.map((paragraph, index) => (
            <Text
              key={index}
              style={[
                styles.body,
                index < ACADEMY_CONSENT_BODY_PARAGRAPHS.length - 1 &&
                  styles.bodyParagraphSpacing,
              ]}
            >
              {paragraph}
            </Text>
          ))}

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
            Sunt de acord
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
  },
  bodyParagraphSpacing: {
    marginBottom: Spacing.sm,
  },
  cardsContainer: {
    width: "100%",
    gap: Spacing.sm,
    marginTop: Spacing.md,
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
  },
  declinePressed: {
    opacity: 0.5,
  },
  declineText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
