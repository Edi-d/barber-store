/**
 * BookingSuccess
 *
 * Animated celebratory screen shown after a booking is confirmed.
 * Supports multiple services, Romanian locale formatting, and a full
 * particle-burst confetti sequence built with react-native-reanimated.
 *
 * Animation timeline:
 *   0 ms   — checkmark circle scales in with bouncy spring (damping 8)
 *   220 ms — check icon fades + scales in
 *   280 ms — 14 confetti particles burst outward
 *   300 ms — title "Programare confirmată!" FadeInDown
 *   500 ms — subtitle FadeIn
 *   600 ms — details card FadeInUp
 *   800 ms — action buttons staggered FadeInUp
 */

import { useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Bubble, Shadows, Typography } from "@/constants/theme";
import { Button } from "@/components/ui/Button";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BookingSuccessResult {
  id: string;
  barberName: string;
  serviceNames: string[];
  date: Date;
  time: string;
  totalPriceCents: number;
  currency: string;
  totalDurationMin: number;
}

export interface BookingSuccessProps {
  result: BookingSuccessResult;
  onAddToCalendar: () => void;
  onViewAppointments: () => void;
  onBookAnother: () => void;
  onGoHome: () => void;
  formatPrice: (cents: number, currency: string) => string;
}

// ─── Confetti particle config ─────────────────────────────────────────────────

interface ParticleConfig {
  color: string;
  size: number;
  tx: number;   // final translateX in px
  ty: number;   // final translateY in px
  rot: number;  // final rotation in degrees
  delay: number;
}

const PARTICLE_COLORS = [
  "#3b82f6", // blue-500
  "#2563eb", // blue-600
  "#1d4ed8", // blue-700
  "#60a5fa", // blue-400
  "#16a34a", // green-600
  "#22c55e", // green-500
  "#4ade80", // green-400
  "#86efac", // green-300
  "#eab308", // yellow-500
  "#f59e0b", // amber-500
  "#fbbf24", // amber-400
  "#fde68a", // amber-200
  "#6366f1", // indigo-500
  "#a78bfa", // violet-400
];

// Build 14 particles with deterministic-but-varied trajectories.
// We avoid Math.random() so the layout is consistent across re-renders.
function buildParticles(): ParticleConfig[] {
  const count = 14;
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI + (i % 2 === 0 ? 0.2 : -0.2);
    const radius = 70 + (i % 4) * 18;
    return {
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      size: 6 + (i % 3) * 3,  // 6, 9, or 12 px
      tx: Math.cos(angle) * radius,
      ty: Math.sin(angle) * radius,
      rot: 45 + i * 28,
      delay: 280 + i * 18,
    };
  });
}

const PARTICLES = buildParticles();

// ─── Single confetti particle ─────────────────────────────────────────────────

/**
 * ConfettiParticle
 *
 * Uses four nested Animated.Views to sidestep the reanimated v4 strict
 * transform union type — each wrapper owns exactly one transform axis,
 * which satisfies the `{ [key]: AnimatableNumericValue }` constraint.
 */
function ConfettiParticle({ config }: { config: ParticleConfig }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const SPRING_CFG = { damping: 12, stiffness: 90, mass: 0.6 };
    const TIMING_FADE = { duration: 500, easing: Easing.out(Easing.quad) };

    tx.value = withDelay(config.delay, withSpring(config.tx, SPRING_CFG));
    ty.value = withDelay(config.delay, withSpring(config.ty, SPRING_CFG));
    scale.value = withDelay(
      config.delay,
      withSequence(
        withSpring(1.2, { damping: 8, stiffness: 200 }),
        withSpring(1.0, { damping: 14, stiffness: 160 })
      )
    );
    opacity.value = withDelay(
      config.delay,
      withSequence(
        withTiming(1, { duration: 80 }),
        withDelay(360, withTiming(0, TIMING_FADE))
      )
    );
  }, []);

  const txStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));
  const tyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
  }));
  const scaleStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.particle, txStyle]}>
      <Animated.View style={tyStyle}>
        <Animated.View
          style={[
            scaleStyle,
            {
              width: config.size,
              height: config.size,
              borderRadius: config.size / 2,
              backgroundColor: config.color,
            },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Animated checkmark circle ────────────────────────────────────────────────

function CheckmarkCircle() {
  const circleScale = useSharedValue(0);
  const circleBorder = useSharedValue(0);
  const checkOpacity = useSharedValue(0);
  const checkScale = useSharedValue(0.5);

  useEffect(() => {
    // Bouncy spring for the circle — damping 8 gives satisfying overshoot
    circleScale.value = withSpring(1, { damping: 8, stiffness: 140, mass: 0.9 });
    circleBorder.value = withDelay(
      100,
      withTiming(3, { duration: 300, easing: Easing.out(Easing.cubic) })
    );

    // Checkmark appears after circle lands
    checkOpacity.value = withDelay(220, withTiming(1, { duration: 220 }));
    checkScale.value = withDelay(
      220,
      withSpring(1, { damping: 10, stiffness: 200 })
    );
  }, []);

  const circleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: circleScale.value }],
    borderWidth: circleBorder.value,
  }));

  const checkAnimStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: checkScale.value }],
  }));

  return (
    <View style={styles.checkmarkOuter}>
      {/* Confetti particles burst from the centre of the circle */}
      {PARTICLES.map((p, i) => (
        <ConfettiParticle key={i} config={p} />
      ))}

      {/* Green circle with animated scale + border */}
      <Animated.View style={[styles.checkCircle, circleAnimStyle]}>
        {/* Soft glow behind the circle */}
        <View
          style={[
            styles.checkGlow,
            Platform.OS === "ios" ? styles.checkGlowIos : styles.checkGlowAndroid,
          ]}
        />
        <Animated.View style={checkAnimStyle}>
          <Ionicons name="checkmark" size={56} color="#16a34a" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ─── Icon badge used in detail rows ──────────────────────────────────────────

interface RowIconProps {
  name: keyof typeof Ionicons.glyphMap;
  bg: string;
  color: string;
}

function RowIcon({ name, bg, color }: RowIconProps) {
  return (
    <View style={[styles.rowIcon, { backgroundColor: bg }]}>
      <Ionicons name={name} size={18} color={color} />
    </View>
  );
}

// ─── Detail row ───────────────────────────────────────────────────────────────

interface DetailRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  children: React.ReactNode;
  delay: number;
  noBorder?: boolean;
}

function DetailRow({
  icon,
  iconBg,
  iconColor,
  label,
  children,
  delay,
  noBorder = false,
}: DetailRowProps) {
  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(320).easing(Easing.out(Easing.cubic))}
      style={[styles.detailRow, noBorder && styles.detailRowNoBorder]}
    >
      <RowIcon name={icon} bg={iconBg} color={iconColor} />
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        {children}
      </View>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BookingSuccess({
  result,
  onAddToCalendar,
  onViewAppointments,
  onBookAnother,
  onGoHome,
  formatPrice,
}: BookingSuccessProps) {
  const insets = useSafeAreaInsets();
  const {
    id,
    barberName,
    serviceNames,
    date,
    time,
    totalPriceCents,
    currency,
    totalDurationMin,
  } = result;

  // Fire haptic on mount to punctuate the confirmation
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const receiptCode = id.slice(-8).toUpperCase();
  const multipleServices = serviceNames.length > 1;

  const formattedDate = date.toLocaleDateString("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const durationLabel =
    totalDurationMin >= 60
      ? `${Math.floor(totalDurationMin / 60)}h ${totalDurationMin % 60 > 0 ? `${totalDurationMin % 60}min` : ""}`.trim()
      : `${totalDurationMin} min`;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: Math.max(insets.bottom + 24, 48) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Background light radial wash — extends above scroll origin to
           cover the safe area region painted by the parent SafeAreaView ── */}
      <View style={styles.bgWash} pointerEvents="none" />

      {/* ── Close button (top-right) ── */}
      <Animated.View
        entering={FadeIn.delay(400).duration(300)}
        style={[styles.closeButton, { top: 12 }]}
      >
        <Pressable
          onPress={onGoHome}
          hitSlop={12}
          style={styles.closeButtonInner}
        >
          <Ionicons name="close" size={22} color="#64748b" />
        </Pressable>
      </Animated.View>

      {/* ── Hero section ── */}
      <View style={styles.heroSection}>
        <CheckmarkCircle />

        <Animated.Text
          entering={FadeInDown.delay(300).duration(380).springify().damping(16)}
          style={styles.title}
        >
          Programare confirmată!
        </Animated.Text>

        <Animated.Text
          entering={FadeIn.delay(500).duration(360)}
          style={styles.subtitle}
        >
          Rezervarea ta a fost înregistrată cu succes.{"\n"}Te așteptăm!
        </Animated.Text>
      </View>

      {/* ── Details card ── */}
      <Animated.View
        entering={FadeInUp.delay(600).duration(400).easing(Easing.out(Easing.cubic))}
        style={[styles.card, Shadows.md]}
      >
        {/* Booking ID row */}
        <DetailRow
          icon="receipt-outline"
          iconBg="#f1f5f9"
          iconColor="#64748b"
          label="Cod rezervare"
          delay={650}
        >
          <Text style={styles.receiptCode}>#{receiptCode}</Text>
        </DetailRow>

        {/* Barber row */}
        <DetailRow
          icon="person"
          iconBg="#eff6ff"
          iconColor={Colors.primary}
          label="Frizer"
          delay={700}
        >
          <Text style={styles.detailPrimary}>{barberName}</Text>
        </DetailRow>

        {/* Services row */}
        <DetailRow
          icon="cut"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          label={
            multipleServices
              ? `${serviceNames.length} servicii selectate`
              : "Serviciu"
          }
          delay={750}
        >
          {multipleServices ? (
            <View style={styles.serviceList}>
              {serviceNames.map((name, i) => (
                <View key={i} style={styles.serviceChip}>
                  <View style={styles.serviceDot} />
                  <Text style={styles.serviceChipText}>{name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.detailPrimary}>{serviceNames[0]}</Text>
          )}
        </DetailRow>

        {/* Date & time row */}
        <DetailRow
          icon="calendar"
          iconBg="#eff6ff"
          iconColor={Colors.primary}
          label="Data & Ora"
          delay={800}
        >
          <Text style={styles.detailPrimary}>{formattedDate}</Text>
          <Text style={styles.detailTime}>{time}</Text>
        </DetailRow>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Total row — no bottom border */}
        <Animated.View
          entering={FadeInUp.delay(850).duration(320).easing(Easing.out(Easing.cubic))}
          style={[styles.totalRow]}
        >
          <View>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalDuration}>{durationLabel}</Text>
          </View>
          <Text style={styles.totalPrice}>
            {formatPrice(totalPriceCents, currency)}
          </Text>
        </Animated.View>
      </Animated.View>

      {/* ── Action buttons ── */}
      <View style={styles.actions}>
        {/* PRIMARY — "Vezi Programările" */}
        <Animated.View
          entering={FadeInUp.delay(880).duration(340).easing(Easing.out(Easing.cubic))}
        >
          <Button
            variant="primary"
            size="lg"
            onPress={onViewAppointments}
            icon={<Ionicons name="list-outline" size={20} color="white" />}
          >
            Vezi Programările
          </Button>
        </Animated.View>

        {/* SECONDARY — two side-by-side buttons */}
        <Animated.View
          entering={FadeInUp.delay(940).duration(340).easing(Easing.out(Easing.cubic))}
          style={styles.secondaryRow}
        >
          <Pressable onPress={onAddToCalendar} style={styles.secondaryButton}>
            <Ionicons name="calendar-outline" size={18} color={Colors.gradientStart} />
            <Text style={[styles.secondaryButtonText, { color: Colors.gradientStart }]}>Calendar</Text>
          </Pressable>

          <Pressable onPress={onBookAnother} style={styles.secondaryButton}>
            <Ionicons name="add-circle-outline" size={18} color={Colors.text} />
            <Text style={styles.secondaryButtonText}>Programare Nouă</Text>
          </Pressable>
        </Animated.View>
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CIRCLE_SIZE = 96;
const CHECK_GREEN = "#16a34a";
const CHECK_GREEN_BG = "#dcfce7";

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },

  scrollContent: {
    flexGrow: 1,
    // paddingBottom is dynamic via insets (applied inline)
  },

  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 10,
  },
  closeButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Soft radial wash — starts 120 px above the scroll content origin so it
  // bleeds into the safe-area region painted by the parent SafeAreaView,
  // eliminating any visible colour seam at the top of the screen.
  bgWash: {
    position: "absolute",
    top: -120,
    left: 0,
    right: 0,
    height: 480,
    backgroundColor: "rgba(68,129,235,0.04)",
    borderBottomLeftRadius: 200,
    borderBottomRightRadius: 200,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────

  heroSection: {
    alignItems: "center",
    paddingTop: 52,
    paddingBottom: 36,
    paddingHorizontal: 24,
  },

  checkmarkOuter: {
    width: CIRCLE_SIZE + 80,
    height: CIRCLE_SIZE + 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },

  checkCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: CHECK_GREEN_BG,
    borderColor: CHECK_GREEN,
    borderWidth: 0,      // animated from 0 → 3
    alignItems: "center",
    justifyContent: "center",
    // Glow is applied via a sibling View below
  },

  checkGlow: {
    position: "absolute",
    width: CIRCLE_SIZE + 16,
    height: CIRCLE_SIZE + 16,
    borderRadius: (CIRCLE_SIZE + 16) / 2,
    backgroundColor: "transparent",
  },

  checkGlowIos: {
    shadowColor: CHECK_GREEN,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
  },

  checkGlowAndroid: {
    backgroundColor: `${CHECK_GREEN}18`,
  },

  particle: {
    position: "absolute",
  },

  title: {
    ...Typography.h1,
    color: "#1e293b",
    textAlign: "center",
    marginBottom: 10,
  },

  subtitle: {
    ...Typography.caption,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },

  // ── Details card ──────────────────────────────────────────────────────────

  card: {
    marginHorizontal: 20,
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },

  detailRowNoBorder: {
    borderBottomWidth: 0,
  },

  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 1,
  },

  detailContent: {
    flex: 1,
  },

  detailLabel: {
    fontFamily: "EuclidCircularA-Regular",
    fontSize: 11,
    color: "#94a3b8",
    lineHeight: 14,
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  detailPrimary: {
    fontFamily: "EuclidCircularA-SemiBold",
    fontSize: 15,
    color: "#1e293b",
    lineHeight: 20,
  },

  detailTime: {
    fontFamily: "EuclidCircularA-SemiBold",
    fontSize: 15,
    color: Colors.primary,
    lineHeight: 20,
    marginTop: 1,
  },

  receiptCode: {
    fontFamily: "EuclidCircularA-SemiBold",
    fontSize: 13,
    color: "#64748b",
    letterSpacing: 1.2,
  },

  // Services list (multiple)
  serviceList: {
    gap: 4,
    marginTop: 2,
  },

  serviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  serviceDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#16a34a",
    marginTop: 1,
  },

  serviceChipText: {
    fontFamily: "EuclidCircularA-Regular",
    fontSize: 14,
    color: "#1e293b",
    lineHeight: 20,
  },

  // Total section
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 16,
  },

  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
  },

  totalLabel: {
    fontFamily: "EuclidCircularA-SemiBold",
    fontSize: 14,
    color: "#64748b",
    lineHeight: 18,
    marginBottom: 2,
  },

  totalDuration: {
    fontFamily: "EuclidCircularA-Regular",
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 16,
  },

  totalPrice: {
    fontFamily: "EuclidCircularA-Bold",
    fontSize: 26,
    color: "#1e293b",
    lineHeight: 30,
  },

  // ── Actions ───────────────────────────────────────────────────────────────

  actions: {
    marginTop: 24,
    paddingHorizontal: 20,
    gap: 12,
  },

  secondaryRow: {
    flexDirection: "row",
    gap: 10,
  },

  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: Colors.inputBackground,
    ...Bubble.radiiSm,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },

  secondaryButtonText: {
    fontFamily: "EuclidCircularA-SemiBold",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 18,
  },
});
