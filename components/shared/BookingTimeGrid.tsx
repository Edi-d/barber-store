import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';
import { TimeSlot } from '@/lib/booking';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BookingTimeGridProps {
  timeSlots: TimeSlot[] | undefined;
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
  isLoading: boolean;
  hasSelectedDate: boolean;
  morningSectionRef?: React.RefObject<View>;
  afternoonSectionRef?: React.RefObject<View>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLOT_ENTER_BASE_DELAY = 30; // ms per slot index

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Section icon with a gentle continuous rotation */
function SectionIcon({ name }: { name: 'sunny-outline' | 'partly-sunny-outline' }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        withTiming(-8, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.sectionIconCircle}>
      <Animated.View style={animStyle}>
        <Ionicons name={name} size={16} color={Colors.primary} />
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Single time slot button (animated)
// ---------------------------------------------------------------------------

interface SlotButtonProps {
  slot: TimeSlot;
  isSelected: boolean;
  enterDelay: number;
  onPress: (time: string) => void;
}

function SlotButton({ slot, isSelected, enterDelay, onPress }: SlotButtonProps) {
  // 1. Press scale spring
  const pressScale = useSharedValue(1);

  // 2. Selection progress 0→1 (drives bg color + pulse)
  const selectionProgress = useSharedValue(isSelected ? 1 : 0);

  // 3. Pulse for selected state
  const pulseScale = useSharedValue(1);

  // Sync selection progress when external state changes
  useEffect(() => {
    selectionProgress.value = withTiming(isSelected ? 1 : 0, { duration: 220 });

    if (isSelected) {
      // Kick off continuous pulse
      pulseScale.value = withRepeat(
        withSequence(
          withSpring(1.035, { damping: 8, stiffness: 200 }),
          withSpring(1.0, { damping: 8, stiffness: 200 }),
        ),
        -1,
        true,
      );
    } else {
      pulseScale.value = withSpring(1.0, { damping: 12, stiffness: 300 });
    }
  }, [isSelected]);

  const handlePressIn = useCallback(() => {
    if (!slot.available) return;
    pressScale.value = withSpring(0.92, { damping: 10, stiffness: 400 });
  }, [slot.available]);

  const handlePressOut = useCallback(() => {
    if (!slot.available) return;
    pressScale.value = withSpring(1.0, { damping: 10, stiffness: 300 });
  }, [slot.available]);

  const handlePress = useCallback(() => {
    if (!slot.available) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(slot.time);
  }, [slot.available, slot.time, onPress]);

  const containerAnimStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      selectionProgress.value,
      [0, 1],
      [Colors.white, Colors.gradientStart],
    );

    const shadow = isSelected
      ? {
          shadowColor: Colors.gradientStart,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
          elevation: 8,
        }
      : {};

    return {
      backgroundColor: bg,
      transform: [
        { scale: pressScale.value * pulseScale.value },
      ],
      ...shadow,
    };
  });

  const textAnimStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      selectionProgress.value,
      [0, 1],
      [Colors.text, Colors.white],
    );
    return { color };
  });

  if (slot.available) {
    return (
      <Animated.View
        entering={FadeInUp.delay(enterDelay).springify().damping(18).stiffness(180)}
        style={[
          styles.slot,
          styles.slotAvailable,
          containerAnimStyle,
        ]}
      >
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.slotPressable}
          hitSlop={4}
        >
          <Animated.Text style={[styles.slotText, textAnimStyle]}>
            {slot.time}
          </Animated.Text>
        </Pressable>
      </Animated.View>
    );
  }

  // Unavailable — static, no animation, line-through
  return (
    <View style={[styles.slot, styles.slotUnavailable]}>
      <Text style={styles.slotTextUnavailable}>{slot.time}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section (morning or afternoon)
// ---------------------------------------------------------------------------

interface TimeSectionProps {
  slots: TimeSlot[];
  label: string;
  icon: 'sunny-outline' | 'partly-sunny-outline';
  sectionOffset: number; // index offset so afternoon stagger continues from morning
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
}

function TimeSection({
  slots,
  label,
  icon,
  sectionOffset,
  selectedTime,
  onSelectTime,
}: TimeSectionProps) {
  if (slots.length === 0) return null;

  const availableCount = slots.filter((s) => s.available).length;
  const availableLabel =
    availableCount === 1 ? '1 loc liber' : `${availableCount} locuri libere`;

  return (
    <Animated.View
      entering={FadeInUp.delay(sectionOffset * SLOT_ENTER_BASE_DELAY).springify().damping(20).stiffness(160)}
      style={styles.section}
    >
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <SectionIcon name={icon} />
        <Text style={styles.sectionLabel}>{label}</Text>
        <Text style={styles.sectionCount}>{availableLabel}</Text>
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {slots.map((slot, idx) => (
          <SlotButton
            key={slot.time}
            slot={slot}
            isSelected={selectedTime === slot.time}
            enterDelay={(sectionOffset + idx) * SLOT_ENTER_BASE_DELAY}
            onPress={onSelectTime}
          />
        ))}
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Skeleton shimmer placeholder
// ---------------------------------------------------------------------------

function SkeletonSlot({ index }: { index: number }) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 700 + index * 80, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 700 + index * 80, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.slot, styles.slotSkeleton, animStyle]} />;
}

function LoadingState() {
  return (
    <View>
      {/* Fake section header shimmer */}
      <View style={styles.skeletonHeader} />
      <View style={styles.grid}>
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonSlot key={i} index={i} />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty / no-date state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}

function InlineEmptyState({ icon, title, subtitle }: EmptyStateProps) {
  const floatY = useSharedValue(0);

  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, []);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  return (
    <Animated.View
      entering={FadeInUp.delay(80).springify().damping(20).stiffness(160)}
      style={styles.emptyContainer}
    >
      <Animated.View style={[styles.emptyIconCircle, iconAnimStyle]}>
        <Ionicons name={icon} size={28} color={Colors.primary} />
      </Animated.View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BookingTimeGrid({
  timeSlots,
  selectedTime,
  onSelectTime,
  isLoading,
  hasSelectedDate,
  morningSectionRef,
  afternoonSectionRef,
}: BookingTimeGridProps) {
  const morningSlots = useMemo(
    () => (timeSlots ?? []).filter((s) => parseInt(s.time.split(':')[0], 10) < 12),
    [timeSlots],
  );

  const afternoonSlots = useMemo(
    () => (timeSlots ?? []).filter((s) => parseInt(s.time.split(':')[0], 10) >= 12),
    [timeSlots],
  );

  // --- Guard: no date selected ---
  if (!hasSelectedDate) {
    return (
      <InlineEmptyState
        icon="calendar-outline"
        title="Alege o zi"
        subtitle="Selecteaza o data din calendarul de mai sus pentru a vedea orele disponibile."
      />
    );
  }

  // --- Loading ---
  if (isLoading) {
    return <LoadingState />;
  }

  // --- No slots at all (day off / fully booked) ---
  if (!timeSlots || timeSlots.length === 0) {
    return (
      <InlineEmptyState
        icon="moon-outline"
        title="Nicio ora disponibila"
        subtitle="Frizerul nu lucreaza in aceasta zi sau toate orele sunt ocupate. Incearca alta data."
      />
    );
  }

  const afternoonOffset = morningSlots.length;

  return (
    <View style={styles.root}>
      <View ref={morningSectionRef}>
        <TimeSection
          slots={morningSlots}
          label="Dimineata"
          icon="sunny-outline"
          sectionOffset={0}
          selectedTime={selectedTime}
          onSelectTime={onSelectTime}
        />
      </View>
      <View ref={afternoonSectionRef}>
        <TimeSection
          slots={afternoonSlots}
          label="Dupa-amiaza"
          icon="partly-sunny-outline"
          sectionOffset={afternoonOffset}
          selectedTime={selectedTime}
          onSelectTime={onSelectTime}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },

  // Section
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  sectionLabel: {
    ...Typography.captionSemiBold,
    color: Colors.text,
    flex: 1,
  },
  sectionCount: {
    ...Typography.small,
    color: Colors.textTertiary,
  },

  // Slot grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // Slot base
  slot: {
    width: '22%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Bubble.radiiSm,
  },
  slotPressable: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
  },

  // Available (default)
  slotAvailable: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: Colors.white,
    ...Platform.select({
      ios: Shadows.sm,
      android: { elevation: 1 },
    }),
  },

  // Unavailable
  slotUnavailable: {
    backgroundColor: '#e2e8f0',
    opacity: 0.3,
  },

  // Skeleton
  slotSkeleton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
  },
  skeletonHeader: {
    width: 160,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
    marginBottom: 12,
    opacity: 0.6,
  },

  // Slot text
  slotText: {
    ...Typography.captionSemiBold,
    color: Colors.text,
  },
  slotTextUnavailable: {
    ...Typography.captionSemiBold,
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
