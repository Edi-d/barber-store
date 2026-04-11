import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

const DURATION = 320;
const EASING = Easing.out(Easing.cubic);

/**
 * Wraps a tab screen's content with a fade + subtle scale-up entrance.
 * When the tab gains focus the content fades in from 0 → 1 and scales
 * from 0.97 → 1, producing a polished "lift into view" effect.
 */
export function AnimatedScreen({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.97);

  useEffect(() => {
    if (isFocused) {
      opacity.value = withTiming(1, { duration: DURATION, easing: EASING });
      scale.value = withTiming(1, { duration: DURATION, easing: EASING });
    } else {
      opacity.value = 0;
      scale.value = 0.97;
    }
  }, [isFocused]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.fill, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
