import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { GlassCard } from "@/components/auth/GlassCard";
import { Colors, Typography, Bubble, Shadows, Spacing } from "@/constants/theme";

export default function WelcomeScreen() {
  return (
    <AuthBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.container}>
          {/* Logo & Branding */}
          <View style={styles.brandSection}>
            <Image
              source={require("@/assets/logo-icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[Typography.caption, styles.tagline]}>
              Învață arta frizuriei de la cei mai buni
            </Text>
          </View>

          {/* Features Card */}
          <GlassCard style={styles.featuresCard}>
            <FeatureItem
              icon="videocam"
              title="Cursuri Video"
              description="Lecții premium de la experți"
              color={Colors.gradientStart}
            />
            <FeatureItem
              icon="radio"
              title="Sesiuni Live"
              description="Urmărește tutoriale în direct"
              color={Colors.indigo}
            />
            <FeatureItem
              icon="cart"
              title="Magazin Profesional"
              description="Produse și echipamente de calitate"
              color={Colors.gradientStart}
            />
          </GlassCard>

          {/* Auth Buttons */}
          <View style={styles.buttonsContainer}>
            <Link href="/(auth)/signup" asChild>
              <Pressable style={styles.primaryButtonOuter}>
                <LinearGradient
                  colors={[Colors.gradientStart, Colors.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryButton}
                >
                  <Text style={[Typography.button, { color: "#fff" }]}>
                    Începe Acum
                  </Text>
                </LinearGradient>
              </Pressable>
            </Link>

            <Link href="/(auth)/login" asChild>
              <Pressable style={styles.outlineButton}>
                <Text style={[Typography.button, { color: Colors.gradientStart }]}>
                  Am deja cont
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </SafeAreaView>
    </AuthBackground>
  );
}

function FeatureItem({
  icon,
  title,
  description,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={[styles.featureIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.bodySemiBold, { color: Colors.text }]}>
          {title}
        </Text>
        <Text style={[Typography.caption, { color: Colors.textSecondary }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: "center",
  },
  brandSection: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  logo: {
    width: 180,
    height: 65,
    marginBottom: Spacing.base,
  },
  tagline: {
    color: Colors.textSecondary,
    textAlign: "center",
  },
  featuresCard: {
    marginBottom: Spacing["2xl"],
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.base,
  },
  featureIcon: {
    width: 48,
    height: 48,
    ...Bubble.radiiSm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.base,
  },
  buttonsContainer: {
    gap: Spacing.md,
  },
  primaryButtonOuter: {
    ...Shadows.glow,
    ...Bubble.radii,
  },
  primaryButton: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    ...Bubble.radii,
  },
  outlineButton: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.gradientStart,
    backgroundColor: "transparent",
    ...Bubble.radii,
  },
});
