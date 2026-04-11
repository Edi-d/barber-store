/**
 * UpcomingAppointmentBanner
 *
 * Compact horizontal card with a draining squircle pill on the right.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  ┌──────┐  Buzz Cut       ┌──────────────────────┐  [›]  │
 *   │  │  📅  │  Mâine · 09:30  │ ██████ 18h ░░░░░░░░ │       │
 *   │  └──────┘  Edi Barber     └──────────────────────┘       │
 *   └────────────────────────────────────────────────────────────┘
 *
 *   The pill on the right is the drain indicator — gradient fills
 *   from left, drains toward right as appointment approaches.
 *   Text inside pill shows compact time label ("18h", "45m", "Acum").
 */

import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { Bubble, Colors, FontFamily, Shadows } from "@/constants/theme";
import { formatDate, formatTime } from "@/components/shared/AppointmentCard";
import { getTimeRemaining } from "@/lib/timeRemaining";
import type { AppointmentWithDetails } from "@/types/database";

// ─── getPillColors ────────────────────────────────────────────────────────────

function getPillColors(state: string) {
  switch (state) {
    case "now":
    case "urgent":
      // Energetic red-orange
      return {
        track: "rgba(220,38,38,0.75)",
        gradient: ["#EF4444", "#F97316"] as const,
        text: "#FFFFFF",
        border: "rgba(239,68,68,0.25)",
      };
    case "soon":
      // Warm amber
      return {
        track: "rgba(217,119,6,0.72)",
        gradient: ["#F59E0B", "#F97316"] as const,
        text: "#FFFFFF",
        border: "rgba(245,158,11,0.20)",
      };
    case "today":
      // Active blue
      return {
        track: "rgba(37,99,235,0.72)",
        gradient: ["#3B82F6", "#6366F1"] as const,
        text: "#FFFFFF",
        border: "rgba(68,129,235,0.18)",
      };
    case "tomorrow":
    case "scheduled":
    default:
      // Brand blue — solid mid-tone
      return {
        track: "rgba(68,129,235,0.55)",
        gradient: ["#4481EB", "#5B6CF0"] as const,
        text: "#FFFFFF",
        border: "rgba(68,129,235,0.15)",
      };
  }
}

// ─── DrainPill ───────────────────────────────────────────────────────────────

interface DrainPillProps {
  progress: number; // 0–1, 1 = full (far away), 0 = empty (now)
  label: string;
  isUrgent: boolean;
  colors: {
    track: string;
    gradient: readonly [string, string];
    text: string;
  };
}

function DrainPill({ progress, label, isUrgent, colors }: DrainPillProps) {
  const fillWidth = useSharedValue(progress);

  useEffect(() => {
    fillWidth.value = withTiming(progress, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value * 100}%` as `${number}%`,
  }));

  // Subtle pulse when urgent
  const pulseScale = useSharedValue(1);
  useEffect(() => {
    if (isUrgent) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 800, easing: Easing.inOut(Easing.sine) }),
          withTiming(1.0, { duration: 800, easing: Easing.inOut(Easing.sine) })
        ),
        -1,
        false
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
    }
  }, [isUrgent]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View style={pulseStyle}>
      <View
        style={[
          Bubble.radiiSm,
          {
            height: 28,
            minWidth: 84,
            overflow: "hidden",
            backgroundColor: colors.track,
          },
        ]}
      >
        {/* Gradient fill */}
        <Animated.View
          style={[
            fillStyle,
            { position: "absolute", top: 0, left: 0, bottom: 0 },
          ]}
        >
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        {/* Label — centered on top */}
        <View
          className="absolute inset-0 items-center justify-center"
          style={{ paddingHorizontal: 10 }}
          pointerEvents="none"
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: FontFamily.semiBold,
              fontSize: 11,
              color: colors.text,
              letterSpacing: 0.2,
            }}
          >
            {label}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── UpcomingAppointmentBanner ────────────────────────────────────────────────

export interface UpcomingAppointmentBannerProps {
  appointment: AppointmentWithDetails;
  onPress: () => void;
}

export function UpcomingAppointmentBanner({
  appointment,
  onPress,
}: UpcomingAppointmentBannerProps) {
  // ── Derived data ──────────────────────────────────────────────────────────

  const primaryService =
    appointment.services && appointment.services.length > 0
      ? appointment.services[0]?.service
      : (appointment.service ?? null);

  const serviceName = primaryService?.name ?? "Programare";
  const barberName = appointment.barber?.name ?? "—";
  const dateTime =
    formatDate(appointment.scheduled_at) +
    " · " +
    formatTime(appointment.scheduled_at);

  // ── Time remaining ────────────────────────────────────────────────────────

  const [timeData, setTimeData] = useState(() =>
    getTimeRemaining(appointment.scheduled_at)
  );

  useEffect(() => {
    const tick = () =>
      setTimeData(getTimeRemaining(appointment.scheduled_at));

    const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
    const initial = setTimeout(() => {
      tick();
      const interval = setInterval(tick, 60_000);
      return () => clearInterval(interval);
    }, msUntilNextMinute);

    return () => clearTimeout(initial);
  }, [appointment.scheduled_at]);

  const { progress, pillLabel, state, isUrgent } = timeData;
  const pillColors = getPillColors(state);

  // ── Press scale ───────────────────────────────────────────────────────────

  const scaleAnim = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(20).stiffness(240).delay(80)}
      style={pressStyle}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={() => {
          scaleAnim.value = withSpring(0.98, { damping: 18, stiffness: 300 });
        }}
        onPressOut={() => {
          scaleAnim.value = withSpring(1, { damping: 18, stiffness: 300 });
        }}
        accessibilityRole="button"
        accessibilityLabel={`Programare: ${serviceName}, ${dateTime}`}
      >
        <View
          style={[
            Bubble.radii,
            Shadows.md,
            {
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: pillColors.border,
              overflow: "hidden",
            },
          ]}
        >
          {/* Single horizontal row */}
          <View className="flex-row items-center px-3 py-2.5" style={{ gap: 10 }}>

            {/* Left: Calendar icon squircle */}
            <View
              style={[
                Bubble.radiiSm,
                {
                  width: 40,
                  height: 40,
                  backgroundColor: "rgba(68,129,235,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                },
              ]}
            >
              <Ionicons name="calendar" size={19} color="#4481EB" />
            </View>

            {/* Center: text block */}
            <View className="flex-1" style={{ gap: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: FontFamily.semiBold,
                  fontSize: 14,
                  lineHeight: 18,
                  color: "#191919",
                }}
              >
                {serviceName}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: FontFamily.regular,
                  fontSize: 12,
                  lineHeight: 16,
                  color: "#65676B",
                }}
              >
                {dateTime}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: FontFamily.regular,
                  fontSize: 11,
                  lineHeight: 14,
                  color: "#999999",
                }}
              >
                {barberName}
              </Text>
            </View>

            {/* Right: Drain pill + chevron */}
            <View className="flex-row items-center" style={{ gap: 6, flexShrink: 0 }}>
              <DrainPill
                progress={progress}
                label={pillLabel}
                isUrgent={isUrgent}
                colors={pillColors}
              />
              <Ionicons name="chevron-forward" size={16} color="#C0C0C0" />
            </View>

          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
