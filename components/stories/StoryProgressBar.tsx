import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

const SCREEN_WIDTH = Dimensions.get("window").width;
const HORIZONTAL_PADDING = 8 * 2;
const GAP = 3;

type StoryProgressBarProps = {
  totalSegments: number;
  currentIndex: number;
  progress: SharedValue<number>;
  /** Pixel width of each segment bar. Computed from screen width when omitted. */
  barWidth?: number;
};

export function StoryProgressBar({
  totalSegments,
  currentIndex,
  progress,
  barWidth,
}: StoryProgressBarProps) {
  const resolvedBarWidth =
    barWidth ??
    (SCREEN_WIDTH - HORIZONTAL_PADDING - GAP * (totalSegments - 1)) /
      totalSegments;

  return (
    <View style={styles.container}>
      {Array.from({ length: totalSegments }).map((_, i) => (
        <View key={i} style={[styles.track, { width: resolvedBarWidth }]}>
          {i < currentIndex ? (
            <View style={[styles.fill, { width: resolvedBarWidth }]} />
          ) : i === currentIndex ? (
            <ActiveFill progress={progress} barWidth={resolvedBarWidth} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

type ActiveFillProps = {
  progress: SharedValue<number>;
  barWidth: number;
};

const ActiveFill = React.memo(function ActiveFill({
  progress,
  barWidth,
}: ActiveFillProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    width: progress.value * barWidth,
  }));

  return <Animated.View style={[styles.fill, animatedStyle]} />;
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: GAP,
    paddingHorizontal: 8,
  },
  track: {
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 1.5,
  },
});
