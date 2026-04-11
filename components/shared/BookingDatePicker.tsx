import { useRef, useCallback, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import Animated, {
  FadeInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolateColor,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Bubble, Shadows } from '@/constants/theme';
import { getNext14Days, formatCalendarDay } from '@/lib/booking';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookingDatePickerProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  /** Day-of-week numbers to disable (0 = Sunday). Defaults to [0]. */
  disabledDays?: number[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_WIDTH = 62;
const CARD_GAP = 10;
const H_PADDING = 16;

// Spring config that gives a quick "pop" then settles
const SPRING_SELECT = { damping: 14, stiffness: 220, mass: 0.8 };

// Glow shadow for selected card (iOS shadow props become style values)
const GLOW_SHADOW = Platform.select({
  ios: {
    shadowColor: Colors.gradientStart,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
  },
  android: { elevation: 10 },
  default: {},
}) as object;

// ---------------------------------------------------------------------------
// DateCard — single animated date cell
// ---------------------------------------------------------------------------

interface DateCardProps {
  date: Date;
  index: number;
  isSelected: boolean;
  isToday: boolean;
  isDisabled: boolean;
  onPress: (date: Date) => void;
}

function DateCard({ date, index, isSelected, isToday, isDisabled, onPress }: DateCardProps) {
  const { dayName, dayNumber, monthName } = formatCalendarDay(date);

  // 0 → unselected, 1 → selected
  const progress = useSharedValue(isSelected ? 1 : 0);
  // Scale overshoot: bounces to 1.05, settles at 1
  const scale = useSharedValue(1);
  // Glow opacity
  const glowOpacity = useSharedValue(isSelected ? 1 : 0);
  // Pulse opacity for the "today" dot (only relevant when isToday)
  const pulseOpacity = useSharedValue(1);

  // Start pulse loop once, independently of selection state
  useEffect(() => {
    if (isToday) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.25, { duration: 900 }),
          withTiming(1, { duration: 900 }),
        ),
        -1, // infinite
        false,
      );
    }
    // Intentionally runs once on mount — `isToday` is stable per card instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive selection animations whenever `isSelected` changes (JS thread — safe).
  useEffect(() => {
    if (isSelected) {
      progress.value = withTiming(1, { duration: 220 });
      glowOpacity.value = withTiming(1, { duration: 220 });
      scale.value = withSpring(1.05, SPRING_SELECT, () => {
        scale.value = withSpring(1, SPRING_SELECT);
      });
    } else {
      progress.value = withTiming(0, { duration: 180 });
      glowOpacity.value = withTiming(0, { duration: 180 });
      scale.value = withSpring(1, SPRING_SELECT);
    }
  }, [isSelected]);

  // Plain JS press handler — no worklet, no bridge serialisation issues.
  const handlePress = useCallback(() => {
    if (isDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(date);
  }, [isDisabled, onPress, date]);

  // Card background: white → gradientStart
  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [Colors.white, Colors.gradientStart],
    ),
  }));

  // Glow layer (sits behind the card, matches same shape)
  const glowAnimStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value * 0.55,
  }));

  // Day name text: muted → white
  const dayNameStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      ['#94a3b8', 'rgba(255,255,255,0.8)'],
    ),
  }));

  // Day number text: dark → white
  const dayNumberStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      ['#1e293b', '#ffffff'],
    ),
  }));

  // Month text: muted → faded white
  const monthStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      ['#94a3b8', 'rgba(255,255,255,0.7)'],
    ),
  }));

  // Pulse dot for "today" indicator
  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Determine border style (not animated — static per state)
  const borderStyle = isDisabled
    ? styles.cardBorderDisabled
    : isToday && !isSelected
    ? styles.cardBorderToday
    : styles.cardBorderDefault;

  return (
    <Animated.View
      entering={FadeInRight.delay(index * 40).springify().damping(18).stiffness(200)}
      style={[styles.cardWrapper, isDisabled && styles.cardDisabledWrapper]}
    >
      {/* Glow layer */}
      <Animated.View
        style={[styles.glowLayer, GLOW_SHADOW, glowAnimStyle]}
        pointerEvents="none"
      />

      <Pressable onPress={handlePress} disabled={isDisabled}>
        <Animated.View style={[styles.card, borderStyle, cardAnimStyle]}>
          {/* Day name ("Lun", "Azi", etc.) */}
          <Animated.Text style={[styles.dayName, dayNameStyle]}>
            {isToday ? 'Azi' : dayName}
          </Animated.Text>

          {/* Day number */}
          <Animated.Text style={[styles.dayNumber, dayNumberStyle]}>
            {dayNumber}
          </Animated.Text>

          {/* Month abbreviation */}
          <Animated.Text style={[styles.monthName, monthStyle]}>
            {monthName}
          </Animated.Text>

          {/* Today pulse dot */}
          {isToday && (
            <Animated.View
              style={[
                styles.todayDot,
                isSelected ? styles.todayDotSelected : styles.todayDotDefault,
                dotStyle,
              ]}
            />
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// BookingDatePicker — exported component
// ---------------------------------------------------------------------------

export function BookingDatePicker({
  selectedDate,
  onSelectDate,
  disabledDays = [0],
}: BookingDatePickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const days = getNext14Days();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Scroll the selected card into the center of the visible area when a date
  // is pressed. We know each card's offset from index + fixed sizes.
  const handleSelectDate = useCallback(
    (date: Date, index: number) => {
      onSelectDate(date);

      // Compute the x-offset that centers this card in a ~375px viewport.
      // ScrollView.scrollTo is called imperatively after the animation starts.
      const cardCenter = H_PADDING + index * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2;
      const targetX = cardCenter - 375 / 2; // approximate screen center
      scrollRef.current?.scrollTo({ x: Math.max(0, targetX), animated: true });
    },
    [onSelectDate],
  );

  return (
    <View style={styles.container}>
      {/* Section label */}
      <Text style={styles.sectionLabel}>Alege ziua</Text>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        scrollEventThrottle={16}
      >
        {days.map((day, index) => {
          const isSelected =
            selectedDate !== null &&
            selectedDate.toDateString() === day.toDateString();
          const isToday = day.toDateString() === today.toDateString();
          const isDisabled = disabledDays.includes(day.getDay());

          return (
            <DateCard
              key={day.toISOString()}
              date={day}
              index={index}
              isSelected={isSelected}
              isToday={isToday}
              isDisabled={isDisabled}
              onPress={(d) => handleSelectDate(d, index)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },

  sectionLabel: {
    paddingHorizontal: H_PADDING,
    marginBottom: 12,
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: '#475569', // dark-600
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    gap: CARD_GAP,
  },

  // Wrapper carries the disabled opacity so the glow fades too
  cardWrapper: {
    position: 'relative',
  },
  cardDisabledWrapper: {
    opacity: 0.3,
  },

  // Glow halo — absolutely positioned behind the card
  glowLayer: {
    ...StyleSheet.absoluteFillObject,
    ...Bubble.radiiSm,
  },

  // The main card surface (background animated separately)
  card: {
    width: CARD_WIDTH,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 2,
    ...Bubble.radiiSm,
    ...Shadows.sm,
  },

  // Border variants (static)
  cardBorderDefault: {
    borderColor: '#e2e8f0',
  },
  cardBorderToday: {
    borderColor: Colors.gradientStart,
    borderStyle: 'solid', // RN doesn't support dashed on all platforms; solid keeps it clean
  },
  cardBorderDisabled: {
    borderColor: '#e2e8f0',
    backgroundColor: '#e2e8f0',
  },

  // Text
  dayName: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 11,
    lineHeight: 14,
  },
  dayNumber: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 22,
    lineHeight: 28,
    marginTop: 1,
  },
  monthName: {
    fontFamily: 'EuclidCircularA-Medium',
    fontSize: 10,
    lineHeight: 13,
    marginTop: 1,
  },

  // Today indicator dot
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
  },
  todayDotDefault: {
    backgroundColor: Colors.gradientStart,
  },
  todayDotSelected: {
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
});
