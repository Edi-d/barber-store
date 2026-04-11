import { View, Text, Pressable, StyleSheet, Share, Alert } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Colors, Brand, Typography, Bubble, Shadows, Spacing } from "@/constants/theme";
import { Button } from "@/components/ui/Button";

interface TryOnResultActionsProps {
  hairstyleName: string;
  salonId?: string;
  resultImageUri: string;
  onTryAnother: () => void;
  onRetake: () => void;
}

export function TryOnResultActions({
  hairstyleName,
  salonId,
  resultImageUri,
  onTryAnother,
  onRetake,
}: TryOnResultActionsProps) {
  function handleBook() {
    if (salonId) {
      router.push({ pathname: "/book-appointment", params: { salonId } });
    } else {
      router.push("/(tabs)/discover");
    }
  }

  async function handleSave() {
    // expo-media-library is not installed in this project.
    // To enable saving, run: npx expo install expo-media-library
    // and add the NSPhotoLibraryAddUsageDescription key to app.json.
    Alert.alert(
      "Funcție indisponibilă",
      "Salvarea în galerie nu este activată. Instalează expo-media-library pentru a activa această funcție.",
    );
  }

  async function handleShare() {
    try {
      await Share.share({
        message: `Încearcă stilul "${hairstyleName}" cu Tapzi!`,
        url: resultImageUri,
      });
    } catch {
      // User dismissed the share sheet — no action needed.
    }
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(400).delay(100).springify()}
      style={styles.container}
    >
      {/* 1. Hairstyle name badge */}
      <View style={styles.badgeRow}>
        <LinearGradient
          colors={[Brand.gradientStart, Brand.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.badge}
        >
          <Ionicons name="cut-outline" size={16} color={Colors.white} />
          <Text style={styles.badgeText}>{hairstyleName}</Text>
        </LinearGradient>
      </View>

      {/* 2. Primary action buttons row */}
      <View style={styles.buttonsRow}>
        <Button
          variant="outline"
          style={styles.buttonFlex}
          onPress={onTryAnother}
          icon={
            <Ionicons
              name="refresh-outline"
              size={18}
              color={Colors.gradientStart}
            />
          }
        >
          Încearcă Alt Stil
        </Button>

        <Button
          variant="primary"
          style={styles.buttonFlex}
          onPress={handleBook}
          icon={
            <Ionicons name="calendar-outline" size={18} color={Colors.white} />
          }
        >
          Rezervă Acest Stil
        </Button>
      </View>

      {/* 3. Retake text link */}
      <Pressable
        onPress={onRetake}
        style={({ pressed }) => [styles.retakeLink, pressed && styles.retakeLinkPressed]}
        hitSlop={12}
      >
        <Text style={styles.retakeLinkText}>Fă altă poză</Text>
      </Pressable>

      {/* 4. Share button row */}
      <View style={styles.shareRow}>
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [styles.shareButton, pressed && styles.shareButtonPressed]}
          hitSlop={8}
        >
          <View style={styles.shareIconWrap}>
            <Ionicons name="download-outline" size={18} color={Colors.gradientStart} />
          </View>
          <Text style={styles.shareButtonText}>Salvează</Text>
        </Pressable>

        <View style={styles.shareDivider} />

        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [styles.shareButton, pressed && styles.shareButtonPressed]}
          hitSlop={8}
        >
          <View style={styles.shareIconWrap}>
            <Ionicons name="share-outline" size={18} color={Colors.gradientStart} />
          </View>
          <Text style={styles.shareButtonText}>Distribuie</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },

  // Badge
  badgeRow: {
    alignItems: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: 9999,
    ...Shadows.md,
  },
  badgeText: {
    ...Typography.captionSemiBold,
    color: Colors.white,
  },

  // Action buttons
  buttonsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  buttonFlex: {
    flex: 1,
  },

  // Retake link
  retakeLink: {
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  retakeLinkPressed: {
    opacity: 0.5,
  },
  retakeLinkText: {
    ...Typography.captionSemiBold,
    color: Colors.textSecondary,
  },

  // Share row
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  shareButtonPressed: {
    opacity: 0.5,
  },
  shareIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  shareButtonText: {
    ...Typography.captionSemiBold,
    color: Colors.gradientStart,
  },
  shareDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.separator,
  },
});
