// components/discover/filters/PriceRangeSlider.tsx
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Colors, FontFamily } from '@/constants/theme';

interface Props {
  /** Current range in LEI (not cents). */
  minLei: number | null;
  maxLei: number | null;
  boundsMinLei: number;
  boundsMaxLei: number;
  stepLei: number;
  onChange: (next: { minLei: number | null; maxLei: number | null }) => void;
}

const KNOB = 22;
const KNOB_ACTIVE = 24;
const TRACK_HEIGHT = 4;
const TOUCH_HEIGHT = 28;

export function PriceRangeSlider({
  minLei,
  maxLei,
  boundsMinLei,
  boundsMaxLei,
  stepLei,
  onChange,
}: Props) {
  const [width, setWidth] = React.useState(0);
  const leftPct = useSharedValue(toPct(minLei ?? boundsMinLei, boundsMinLei, boundsMaxLei));
  const rightPct = useSharedValue(toPct(maxLei ?? boundsMaxLei, boundsMinLei, boundsMaxLei));
  const leftStart = useSharedValue(leftPct.value);
  const rightStart = useSharedValue(rightPct.value);
  const leftActive = useSharedValue(false);
  const rightActive = useSharedValue(false);

  // Keep shared values in sync when props change (ex: reset)
  React.useEffect(() => {
    leftPct.value = withTiming(toPct(minLei ?? boundsMinLei, boundsMinLei, boundsMaxLei), {
      duration: 150,
    });
    rightPct.value = withTiming(toPct(maxLei ?? boundsMaxLei, boundsMinLei, boundsMaxLei), {
      duration: 150,
    });
  }, [minLei, maxLei, boundsMinLei, boundsMaxLei, leftPct, rightPct]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const emit = useCallback(
    (lp: number, rp: number) => {
      const lVal = snap(fromPct(lp, boundsMinLei, boundsMaxLei), stepLei);
      const rVal = snap(fromPct(rp, boundsMinLei, boundsMaxLei), stepLei);
      const minOut = lVal === boundsMinLei ? null : lVal;
      const maxOut = rVal === boundsMaxLei ? null : rVal;
      onChange({ minLei: minOut, maxLei: maxOut });
    },
    [boundsMinLei, boundsMaxLei, stepLei, onChange]
  );

  const leftGesture = Gesture.Pan()
    .onBegin(() => {
      leftStart.value = leftPct.value;
      rightStart.value = rightPct.value;
      leftActive.value = true;
    })
    .onUpdate((e) => {
      if (width === 0) return;
      const delta = e.translationX / width;
      const next = Math.max(0, Math.min(rightPct.value - 0.05, leftStart.value + delta));
      leftPct.value = next;
    })
    .onEnd(() => {
      leftActive.value = false;
      runOnJS(emit)(leftPct.value, rightPct.value);
    });

  const rightGesture = Gesture.Pan()
    .onBegin(() => {
      leftStart.value = leftPct.value;
      rightStart.value = rightPct.value;
      rightActive.value = true;
    })
    .onUpdate((e) => {
      if (width === 0) return;
      const delta = e.translationX / width;
      const next = Math.min(1, Math.max(leftPct.value + 0.05, rightStart.value + delta));
      rightPct.value = next;
    })
    .onEnd(() => {
      rightActive.value = false;
      runOnJS(emit)(leftPct.value, rightPct.value);
    });

  const leftKnobStyle = useAnimatedStyle(() => {
    const size = withSpring(leftActive.value ? KNOB_ACTIVE : KNOB, {
      mass: 0.4,
      stiffness: 280,
      damping: 20,
    });
    const shadowOpacity = withTiming(leftActive.value ? 0.16 : 0.08, { duration: 150 });
    const shadowRadius = withTiming(leftActive.value ? 10 : 6, { duration: 150 });
    return {
      left: `${leftPct.value * 100}%`,
      width: size,
      height: size,
      borderRadius: size / 2,
      marginLeft: -(size / 2),
      shadowOpacity,
      shadowRadius,
    };
  });

  const rightKnobStyle = useAnimatedStyle(() => {
    const size = withSpring(rightActive.value ? KNOB_ACTIVE : KNOB, {
      mass: 0.4,
      stiffness: 280,
      damping: 20,
    });
    const shadowOpacity = withTiming(rightActive.value ? 0.16 : 0.08, { duration: 150 });
    const shadowRadius = withTiming(rightActive.value ? 10 : 6, { duration: 150 });
    return {
      left: `${rightPct.value * 100}%`,
      width: size,
      height: size,
      borderRadius: size / 2,
      marginLeft: -(size / 2),
      shadowOpacity,
      shadowRadius,
    };
  });

  const fillStyle = useAnimatedStyle(() => ({
    left: `${leftPct.value * 100}%`,
    right: `${(1 - rightPct.value) * 100}%`,
  }));

  const currentMin = snap(fromPct(leftPct.value, boundsMinLei, boundsMaxLei), stepLei);
  const currentMax = snap(fromPct(rightPct.value, boundsMinLei, boundsMaxLei), stepLei);

  return (
    <View>
      <View style={styles.track} onLayout={onLayout}>
        <View style={styles.trackBg} />
        <Animated.View style={[styles.fill, fillStyle]} />
        <GestureDetector gesture={leftGesture}>
          <Animated.View style={[styles.knob, leftKnobStyle]} />
        </GestureDetector>
        <GestureDetector gesture={rightGesture}>
          <Animated.View style={[styles.knob, rightKnobStyle]} />
        </GestureDetector>
      </View>
      <View style={styles.labelsRow}>
        <Text style={styles.labelText}>{currentMin} lei</Text>
        <Text style={styles.labelText}>{currentMax} lei</Text>
      </View>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toPct(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function fromPct(pct: number, min: number, max: number): number {
  return min + pct * (max - min);
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  track: {
    height: TOUCH_HEIGHT,
    justifyContent: 'center',
    marginHorizontal: KNOB_ACTIVE / 2,
    marginTop: 6,
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK_HEIGHT,
    backgroundColor: 'rgba(15,23,42,0.08)',
    borderRadius: 2,
  },
  fill: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  knob: {
    position: 'absolute',
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  labelText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    color: Colors.text,
  },
});
