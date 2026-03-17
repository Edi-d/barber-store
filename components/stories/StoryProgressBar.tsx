import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

type StoryProgressBarProps = {
  totalSegments: number;
  currentIndex: number;
  progress: SharedValue<number>;
};

export function StoryProgressBar({
  totalSegments,
  currentIndex,
  progress,
}: StoryProgressBarProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSegments }).map((_, i) => (
        <View key={i} style={styles.track}>
          {i < currentIndex ? (
            <View style={[styles.fill, { width: "100%" }]} />
          ) : i === currentIndex ? (
            <ActiveFill progress={progress} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function ActiveFill({ progress }: { progress: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return <Animated.View style={[styles.fill, animatedStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 8,
  },
  track: {
    flex: 1,
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
