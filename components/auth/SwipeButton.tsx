import { useState, forwardRef, useImperativeHandle } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { Colors, Typography, Bubble, Shadows } from "@/constants/theme";

const TRACK_HEIGHT = 60;
const THUMB_SIZE = 52;
const TRACK_PADDING = 4;

export interface SwipeButtonRef {
  reset: () => void;
}

interface SwipeButtonProps {
  onSwipeComplete: () => void;
  loading?: boolean;
  label?: string;
  successLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export const SwipeButton = forwardRef<SwipeButtonRef, SwipeButtonProps>(
  function SwipeButton(
    {
      onSwipeComplete,
      loading = false,
      label = "Glisează pentru a continua",
      successLabel = "Bine ai venit!",
      icon = "cut-outline",
    },
    ref
  ) {
    const [trackWidth, setTrackWidth] = useState(0);
    const translateX = useSharedValue(0);
    const maxSlide = trackWidth - THUMB_SIZE - TRACK_PADDING * 2;

    const reset = () => {
      translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
    };

    useImperativeHandle(ref, () => ({ reset }), []);

    const panGesture = Gesture.Pan()
      .enabled(!loading)
      .onUpdate((e) => {
        const clamp = Math.min(Math.max(e.translationX, 0), maxSlide);
        translateX.value = clamp;
      })
      .onEnd(() => {
        if (translateX.value > maxSlide * 0.85) {
          translateX.value = withSpring(maxSlide, {
            damping: 20,
            stiffness: 200,
          });
          runOnJS(onSwipeComplete)();
        } else {
          translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
        }
      });

    const thumbStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    const textStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        translateX.value,
        [0, maxSlide * 0.5],
        [1, 0],
        "clamp"
      ),
    }));

    const chevronStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        translateX.value,
        [0, maxSlide * 0.3],
        [1, 0],
        "clamp"
      ),
    }));

    const revealStyle = useAnimatedStyle(() => ({
      width: translateX.value + THUMB_SIZE + TRACK_PADDING,
    }));

    const successTextStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        translateX.value,
        [maxSlide * 0.4, maxSlide * 0.8],
        [0, 1],
        "clamp"
      ),
    }));

    return (
      <View style={[styles.shadow, Shadows.glow]}>
        <View
          style={styles.track}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* White reveal trail */}
          <Animated.View style={[styles.reveal, revealStyle]} />

          {/* Hint text */}
          <Animated.View style={[styles.textContainer, textStyle]}>
            <Text style={styles.text}>{label}</Text>
            <Animated.View style={chevronStyle}>
              <Ionicons
                name="chevron-forward"
                size={18}
                color="rgba(255,255,255,0.6)"
              />
            </Animated.View>
          </Animated.View>

          {/* Success text */}
          <Animated.View style={[styles.successContainer, successTextStyle]}>
            <Text style={styles.successText}>{successLabel}</Text>
          </Animated.View>

          {/* Draggable thumb */}
          {trackWidth > 0 && (
            <GestureDetector gesture={panGesture}>
              <Animated.View style={[styles.thumb, thumbStyle]}>
                {loading ? (
                  <ActivityIndicator color={Colors.gradientStart} size="small" />
                ) : (
                  <Ionicons name={icon} size={22} color={Colors.gradientStart} />
                )}
              </Animated.View>
            </GestureDetector>
          )}
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  shadow: {
    ...Bubble.radii,
  },
  track: {
    height: TRACK_HEIGHT,
    ...Bubble.radii,
    overflow: "hidden",
    justifyContent: "center",
    paddingHorizontal: TRACK_PADDING,
  },
  reveal: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    ...Bubble.radii,
  },
  textContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingLeft: THUMB_SIZE,
  },
  text: {
    color: "rgba(255,255,255,0.9)",
    ...Typography.button,
  },
  successContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingRight: THUMB_SIZE,
  },
  successText: {
    color: Colors.gradientStart,
    ...Typography.button,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    ...Bubble.radiiSm,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
