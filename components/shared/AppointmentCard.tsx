/**
 * AppointmentCard — standalone card component for the appointments screen.
 *
 * Sections (top-to-bottom):
 *   1. Header row  — date label + time chip (left)  |  status badge (right)
 *   2. Services    — single service name + description, or bullet-separated list
 *   3. Footer row  — barber avatar + name (left)  |  price (right)
 *   4. Actions     — "Anulează" + "Reprogramează" (upcoming + pending/confirmed only)
 *
 * Visual rules:
 *   - Upcoming card: white bg, blue left border accent (3px, #4481EB), Shadows.md
 *   - Past card: white bg, opacity 0.7, no accent border, Shadows.md
 *   - className for ALL layout; style={} only for Shadows, Reanimated values, and the
 *     left border accent (those three cannot be expressed as NativeWind classNames).
 *   - Min 44px touch targets on action buttons.
 */

import { View, Text, Pressable } from "react-native";
import Animated, {
  FadeInDown,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Badge } from "@/components/ui";
import { Bubble, Colors, Shadows, Typography } from "@/constants/theme";
import { formatPrice } from "@/lib/utils";
import type { AppointmentWithDetails } from "@/types/database";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    label: "În așteptare",
    variant: "warning" as const,
    icon: "time-outline" as const,
  },
  confirmed: {
    label: "Confirmat",
    variant: "success" as const,
    icon: "checkmark-circle-outline" as const,
  },
  completed: {
    label: "Finalizat",
    variant: "primary" as const,
    icon: "checkmark-done-outline" as const,
  },
  cancelled: {
    label: "Anulat",
    variant: "danger" as const,
    icon: "close-circle-outline" as const,
  },
  no_show: {
    label: "Neprezentare",
    variant: "danger" as const,
    icon: "alert-circle-outline" as const,
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === now.toDateString()) return "Astăzi";
  if (date.toDateString() === tomorrow.toDateString()) return "Mâine";

  return date.toLocaleDateString("ro-RO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isUpcoming(dateString: string): boolean {
  return new Date(dateString) > new Date();
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <Animated.View entering={ZoomIn.springify().damping(14).stiffness(200)}>
      <Badge variant={cfg.variant} size="sm" className="gap-1">
        <Ionicons name={cfg.icon} size={11} color={Colors.white} />
        <Text
          style={{
            fontSize: 11,
            fontFamily: "EuclidCircularA-SemiBold",
            color: Colors.white,
          }}
        >
          {cfg.label}
        </Text>
      </Badge>
    </Animated.View>
  );
}

// ─── PressButton ──────────────────────────────────────────────────────────────

interface PressButtonProps {
  onPress: () => void;
  className?: string;
  style?: object | object[];
  children: React.ReactNode;
  accessibilityLabel?: string;
}

export function PressButton({
  onPress,
  className,
  style,
  children,
  accessibilityLabel,
}: PressButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, { flex: 1 }]}>
      <Pressable
        className={className}
        style={style}
        accessibilityLabel={accessibilityLabel}
        onPressIn={() => {
          scale.value = withSpring(0.94, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        }}
        onPress={onPress}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── AppointmentCard ──────────────────────────────────────────────────────────

export interface AppointmentCardProps {
  item: AppointmentWithDetails;
  index: number;
  onCancel: (item: AppointmentWithDetails) => void;
  onReschedule: (item: AppointmentWithDetails) => void;
}

export function AppointmentCard({
  item,
  index,
  onCancel,
  onReschedule,
}: AppointmentCardProps) {
  // Upcoming = in the future AND not cancelled
  const upcoming = isUpcoming(item.scheduled_at) && item.status !== "cancelled";
  // Actions only shown when upcoming and modifiable
  const canModify =
    upcoming &&
    (item.status === "pending" || item.status === "confirmed");

  // Prefer junction-table services list; fall back to single service relation
  const serviceList =
    item.services && item.services.length > 0
      ? item.services.map((s) => s.service)
      : item.service
      ? [item.service]
      : [];

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 70)
        .springify()
        .damping(16)
        .stiffness(180)}
      // Past cards are visually de-emphasised
      className={upcoming ? undefined : "opacity-70"}
    >
      {/*
        Outer shell carries the shadow and squircle clip.
        overflow-hidden ensures the blue left-border accent doesn't bleed
        outside the squircle boundary.
      */}
      <View
        className="bg-white overflow-hidden"
        style={[
          Shadows.md,
          Bubble.radii,
          // Left accent border for upcoming cards — cannot be a className
          // because NativeWind doesn't support asymmetric border widths.
          upcoming
            ? {
                borderLeftWidth: 3,
                borderLeftColor: "#4481EB",
              }
            : undefined,
        ]}
      >
        {/* ── Card body ───────────────────────────────────────────────────── */}
        <View className="p-4">

          {/* ── 1. Header: date/time left, status right ──────────────────── */}
          <View className="flex-row items-start justify-between">

            {/* Date + time chip */}
            <View className="flex-row items-center gap-2.5">
              {/* Calendar icon container — squircle-ish */}
              <View
                className="w-[42px] h-[42px] items-center justify-center"
                style={[
                  Bubble.radiiSm,
                  {
                    backgroundColor: upcoming
                      ? "rgba(68,129,235,0.10)"
                      : "rgba(0,0,0,0.05)",
                  },
                ]}
              >
                <Ionicons
                  name="calendar"
                  size={22}
                  color={upcoming ? Colors.gradientStart : Colors.textSecondary}
                />
              </View>

              <View>
                {/* Bold date label */}
                <Text
                  style={Typography.bodySemiBold}
                  className="text-[#191919]"
                >
                  {formatDate(item.scheduled_at)}
                </Text>

                {/* Time chip */}
                <View className="flex-row items-center gap-[3px] mt-0.5 self-start px-1.5 py-0.5 rounded-[6px] bg-black/5">
                  <Ionicons
                    name="time-outline"
                    size={11}
                    color={Colors.textSecondary}
                  />
                  <Text
                    style={Typography.small}
                    className="text-[#65676B]"
                  >
                    {formatTime(item.scheduled_at)} · {item.duration_min} min
                  </Text>
                </View>
              </View>
            </View>

            {/* Status badge */}
            <StatusBadge status={item.status as keyof typeof STATUS_CONFIG} />
          </View>

          {/* ── 2. Services ───────────────────────────────────────────────── */}
          <View className="mt-3">
            {serviceList.length > 1 ? (
              // Multiple services: compact list with bullet separators
              <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
                {serviceList.map((svc, i) => (
                  <View key={svc?.id ?? i} className="flex-row items-center">
                    {i > 0 && (
                      <Text
                        className="mr-1.5 text-[#65676B]"
                        style={{ fontSize: 11, lineHeight: 20 }}
                      >
                        ·
                      </Text>
                    )}
                    <Text
                      style={Typography.bodySemiBold}
                      className="text-[#191919]"
                      numberOfLines={1}
                    >
                      {svc?.name ?? "Serviciu"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              // Single service: name + optional description
              <>
                <Text
                  style={Typography.bodySemiBold}
                  className="text-[#191919]"
                  numberOfLines={1}
                >
                  {serviceList[0]?.name ?? "Serviciu"}
                </Text>
                {serviceList[0]?.description ? (
                  <Text
                    style={Typography.caption}
                    className="text-[#65676B] mt-0.5"
                    numberOfLines={2}
                  >
                    {serviceList[0].description}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          {/* ── 3. Footer: barber left, price right ───────────────────────── */}
          <View className="flex-row items-center gap-2.5 mt-3">
            {/* Barber avatar placeholder — squircle */}
            <View
              className="w-9 h-9 items-center justify-center bg-black/[0.06]"
              style={Bubble.radiiSm}
            >
              <Ionicons
                name="person"
                size={18}
                color={Colors.textSecondary}
              />
            </View>

            {/* Barber name block */}
            <View className="flex-1">
              <Text
                style={Typography.small}
                className="text-[#999999]"
              >
                Frizer
              </Text>
              <Text
                style={Typography.captionSemiBold}
                className="text-[#191919]"
                numberOfLines={1}
              >
                {item.barber?.name ?? "—"}
              </Text>
            </View>

            {/* Price */}
            <Text
              style={{ ...Typography.bodySemiBold, fontSize: 17 }}
              className="text-[#191919]"
            >
              {formatPrice(item.total_cents, item.currency)}
            </Text>
          </View>

          {/* ── Notes (optional) ──────────────────────────────────────────── */}
          {item.notes ? (
            <View className="mt-2">
              <Text
                style={{ ...Typography.caption, fontStyle: "italic" }}
                className="text-[#65676B]"
                numberOfLines={2}
              >
                "{item.notes}"
              </Text>
            </View>
          ) : null}

          {/* ── 4. Action buttons (upcoming + pending/confirmed only) ─────── */}
          {canModify ? (
            <View className="flex-row gap-2.5 mt-3">
              {/* Cancel */}
              <PressButton
                className="flex-row items-center justify-center gap-1.5 min-h-[44px]"
                style={[
                  { backgroundColor: "rgba(0,0,0,0.05)" },
                  Bubble.radiiSm,
                ]}
                accessibilityLabel="Anulează programarea"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onCancel(item);
                }}
              >
                <Ionicons
                  name="close-outline"
                  size={17}
                  color={Colors.textSecondary}
                />
                <Text style={Typography.captionSemiBold} className="text-[#65676B]">
                  Anulează
                </Text>
              </PressButton>

              {/* Reschedule */}
              <PressButton
                className="flex-row items-center justify-center gap-1.5 min-h-[44px]"
                style={[
                  { backgroundColor: "#4481EB" },
                  Bubble.radiiSm,
                ]}
                accessibilityLabel="Reprogramează"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onReschedule(item);
                }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={17}
                  color={Colors.white}
                />
                <Text style={Typography.captionSemiBold} className="text-white">
                  Reprogramează
                </Text>
              </PressButton>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
