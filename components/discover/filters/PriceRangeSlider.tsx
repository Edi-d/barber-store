// components/discover/filters/PriceRangeSlider.tsx
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
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
const TRACK_HEIGHT = 4;

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

  const makeKnobGesture = (isLeft: boolean) =>
    Gesture.Pan()
      .onBegin(() => {
        leftStart.value = leftPct.value;
        rightStart.value = rightPct.value;
      })
      .onUpdate((e) => {
        if (width === 0) return;
        const delta = e.translationX / width;
        if (isLeft) {
          const next = Math.max(0, Math.min(rightPct.value - 0.05, leftStart.value + delta));
          leftPct.value = next;
        } else {
          const next = Math.min(1, Math.max(leftPct.value + 0.05, rightStart.value + delta));
          rightPct.value = next;
        }
      })
      .onEnd(() => {
        runOnJS(emit)(leftPct.value, rightPct.value);
      });

  const leftGesture = makeKnobGesture(true);
  const rightGesture = makeKnobGesture(false);

  const leftStyle = useAnimatedStyle(() => ({
    left: `${leftPct.value * 100}%`,
  }));
  const rightStyle = useAnimatedStyle(() => ({
    left: `${rightPct.value * 100}%`,
  }));
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
          <Animated.View style={[styles.knob, leftStyle]} />
        </GestureDetector>
        <GestureDetector gesture={rightGesture}>
          <Animated.View style={[styles.knob, rightStyle]} />
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
    height: KNOB,
    justifyContent: 'center',
    marginHorizontal: KNOB / 2,
    marginTop: 6,
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK_HEIGHT,
    backgroundColor: Colors.inputBorder,
    borderRadius: TRACK_HEIGHT / 2,
  },
  fill: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    backgroundColor: Colors.primary,
    borderRadius: TRACK_HEIGHT / 2,
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    marginLeft: -KNOB / 2,
    borderRadius: KNOB / 2,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  labelText: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: Colors.textSecondary,
  },
});
