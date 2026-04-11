import { useEffect, useState } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Typography } from "@/constants/theme";

interface TryOnLoadingOverlayProps {
  hairstyleName: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const DOT_SIZE = 8;
const DOT_DELAYS = [0, 200, 400];

function AnimatedDot({ delay }: { delay: number }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.4, { duration: 400, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 400, easing: Easing.in(Easing.quad) })
        ),
        -1
      )
    );
  }, [delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export default function TryOnLoadingOverlay({
  hairstyleName,
}: TryOnLoadingOverlayProps) {
  const messages = [
    "Analizăm trăsăturile tale...",
    `Aplicăm stilul ${hairstyleName}...`,
    "Finalizăm aspectul...",
  ];

  const [messageIndex, setMessageIndex] = useState(0);
  const [fadeAnim, setFadeAnim] = useState(1);

  const overlayOpacity = useSharedValue(0.5);
  const shimmerX = useSharedValue(-SCREEN_WIDTH);
  const textOpacity = useSharedValue(1);

  useEffect(() => {
    overlayOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );

    shimmerX.value = withRepeat(
      withSequence(
        withTiming(SCREEN_WIDTH * 1.5, {
          duration: 2000,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(-SCREEN_WIDTH, { duration: 0 })
      ),
      -1
    );
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      textOpacity.value = withSequence(
        withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 250, easing: Easing.in(Easing.quad) })
      );

      setTimeout(() => {
        setMessageIndex((prev) => (prev + 1) % messages.length);
      }, 250);
    }, 3000);

    return () => clearInterval(interval);
  }, [hairstyleName]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shimmerX.value },
      { rotate: "15deg" as const },
    ] as const,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Pulsing dark overlay */}
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.darkOverlay, overlayStyle]} />

      {/* Diagonal shimmer strip */}
      <Animated.View style={[styles.shimmerWrapper, shimmerStyle as any]}>
        <LinearGradient
          colors={[
            "transparent",
            "rgba(255,255,255,0.06)",
            "rgba(255,255,255,0.18)",
            "rgba(255,255,255,0.06)",
            "transparent",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.shimmerGradient}
        />
      </Animated.View>

      {/* Center content */}
      <View style={styles.centerContent}>
        {/* Dots loader */}
        <View style={styles.dotsRow}>
          {DOT_DELAYS.map((delay, i) => (
            <AnimatedDot key={i} delay={delay} />
          ))}
        </View>

        {/* Cycling message */}
        <Animated.Text
          style={[
            styles.message,
            textStyle,
          ]}
          numberOfLines={1}
        >
          {messages[messageIndex]}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderRadius: 16,
  },
  darkOverlay: {
    backgroundColor: "#000",
  },
  shimmerWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
  },
  shimmerGradient: {
    width: SCREEN_WIDTH * 0.45,
    height: "200%",
  },
  centerContent: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.white,
  },
  message: {
    ...Typography.bodySemiBold,
    color: Colors.white,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    letterSpacing: 0.1,
  },
});
