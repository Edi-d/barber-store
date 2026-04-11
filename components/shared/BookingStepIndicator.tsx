/**
 * BookingStepIndicator
 *
 * Animated 4-step progress indicator for the booking flow.
 * Layout: circles are evenly spaced, connector lines fill between them,
 * and the active step title appears centered below its circle.
 */

import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Platform, LayoutChangeEvent } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

// ─── Constants ────────────────────────────────────────────────────────────────

const CIRCLE_SIZE = 32;
const LINE_HEIGHT = 3;
const TOTAL_STEPS = 4;

const GRADIENT_COLORS: [string, string] = [
  Colors.gradientStart,
  Colors.gradientEnd,
];

const INACTIVE_BG = "#E2E8F0";
const BORDER_COLOR = "#E8EEF4";

const SPRING_CONFIG = {
  damping: 14,
  stiffness: 200,
  mass: 0.8,
};

const TIMING_FAST = { duration: 250, easing: Easing.out(Easing.cubic) };
const TIMING_MED = { duration: 340, easing: Easing.out(Easing.cubic) };
const TIMING_LINE = { duration: 400, easing: Easing.out(Easing.cubic) };

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingStepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  stepTitles: Record<number, string>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StepCircleProps {
  stepIndex: number;
  currentStep: number;
}

function StepCircle({ stepIndex, currentStep }: StepCircleProps) {
  const isCompleted = stepIndex < currentStep;
  const isActive = stepIndex === currentStep;

  const scale = useSharedValue(1);
  const checkOpacity = useSharedValue(isCompleted ? 1 : 0);
  const numOpacity = useSharedValue(isCompleted ? 0 : 1);
  const glowOpacity = useSharedValue(isActive || isCompleted ? 1 : 0);

  const prevStepRef = useRef(currentStep);

  useEffect(() => {
    const prevStep = prevStepRef.current;
    prevStepRef.current = currentStep;

    if (isActive && stepIndex !== prevStep) {
      scale.value = withSequence(
        withSpring(1.15, SPRING_CONFIG),
        withSpring(1.0, { ...SPRING_CONFIG, damping: 18 })
      );
      glowOpacity.value = withTiming(1, TIMING_FAST);
    }

    if (isCompleted && stepIndex === prevStep) {
      checkOpacity.value = withSpring(1, { ...SPRING_CONFIG, damping: 16 });
      numOpacity.value = withTiming(0, TIMING_FAST);
      glowOpacity.value = withTiming(1, TIMING_FAST);
    }

    if (!isActive && !isCompleted) {
      glowOpacity.value = withTiming(0, TIMING_FAST);
      checkOpacity.value = withTiming(0, TIMING_FAST);
      numOpacity.value = withTiming(1, TIMING_FAST);
      scale.value = withSpring(1, SPRING_CONFIG);
    }
  }, [currentStep]);

  const circleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowAnimStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const checkAnimStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [
      {
        scale: interpolate(
          checkOpacity.value,
          [0, 1],
          [0.6, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const numAnimStyle = useAnimatedStyle(() => ({
    opacity: numOpacity.value,
  }));

  return (
    <Animated.View style={[styles.circleWrapper, circleAnimStyle]}>
      <Animated.View
        style={[
          styles.glowRing,
          glowAnimStyle,
          Platform.OS === "ios" ? styles.glowIos : styles.glowAndroid,
        ]}
      />
      {isActive || isCompleted ? (
        <LinearGradient
          colors={GRADIENT_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.circle}
        >
          <Animated.View style={[styles.iconAbsolute, checkAnimStyle]}>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          </Animated.View>
          <Animated.View style={[styles.iconAbsolute, numAnimStyle]}>
            <Text style={styles.stepNumber}>{stepIndex}</Text>
          </Animated.View>
        </LinearGradient>
      ) : (
        <View style={[styles.circle, styles.circleInactive]}>
          <Text style={styles.stepNumberInactive}>{stepIndex}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── ConnectorLine ───────────────────────────────────────────────────────────

interface ConnectorLineProps {
  leftStepIndex: number;
  currentStep: number;
}

function ConnectorLine({ leftStepIndex, currentStep }: ConnectorLineProps) {
  const isFilled = leftStepIndex < currentStep;
  const [trackWidth, setTrackWidth] = useState(0);
  const fillWidth = useSharedValue(isFilled ? 999 : 0);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackWidth(w);
    // Snap to full if already filled on mount
    if (isFilled) {
      fillWidth.value = w;
    }
  };

  useEffect(() => {
    if (trackWidth === 0) return;
    fillWidth.value = withTiming(isFilled ? trackWidth : 0, TIMING_LINE);
  }, [isFilled, trackWidth]);

  const fillAnimStyle = useAnimatedStyle(() => ({
    width: fillWidth.value,
  }));

  return (
    <View style={styles.lineTrack} onLayout={handleLayout}>
      <Animated.View style={[styles.lineFill, fillAnimStyle]}>
        <LinearGradient
          colors={GRADIENT_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
    </View>
  );
}

// ─── StepTitle ────────────────────────────────────────────────────────────────

interface StepTitleProps {
  title: string;
  isActive: boolean;
}

function StepTitle({ title, isActive }: StepTitleProps) {
  const opacity = useSharedValue(isActive ? 1 : 0);
  const translateY = useSharedValue(isActive ? 0 : 4);

  useEffect(() => {
    opacity.value = withTiming(isActive ? 1 : 0, TIMING_MED);
    translateY.value = withTiming(isActive ? 0 : 4, TIMING_MED);
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.Text style={[styles.titleText, animStyle]} numberOfLines={1}>
      {title}
    </Animated.Text>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BookingStepIndicator({
  currentStep,
  stepTitles,
}: BookingStepIndicatorProps) {
  const prevStep = useRef<number | null>(null);

  useEffect(() => {
    if (prevStep.current !== null && prevStep.current !== currentStep) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    prevStep.current = currentStep;
  }, [currentStep]);

  return (
    <View style={styles.container}>
      {/* Circles + connectors row */}
      <View style={styles.circlesRow}>
        {([1, 2, 3, 4] as const).map((s, i) => (
          <View
            key={s}
            style={{
              flexDirection: "row",
              alignItems: "center",
              flex: i < TOTAL_STEPS - 1 ? 1 : undefined,
            }}
          >
            <StepCircle stepIndex={s} currentStep={currentStep} />
            {i < TOTAL_STEPS - 1 && (
              <ConnectorLine leftStepIndex={s} currentStep={currentStep} />
            )}
          </View>
        ))}
      </View>

      {/* Title — absolutely positioned, centered on the active circle */}
      <View style={styles.titlesRow}>
        {([1, 2, 3, 4] as const).map((s, i) => (
          <View
            key={s}
            style={[
              styles.titleSlot,
              i < TOTAL_STEPS - 1
                ? { flex: 1 }
                : { width: CIRCLE_SIZE },
            ]}
          >
            {/* Anchor the title to the circle's center, not the slot's center */}
            <View style={styles.titleAnchor}>
              <StepTitle
                title={stepTitles[s] ?? ""}
                isActive={s === currentStep}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 10,
  },

  circlesRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  titlesRow: {
    flexDirection: "row",
    marginTop: 5,
  },

  // ── Circle ──────────────────────────────────────────────────────────────────

  circleWrapper: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },

  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  circleInactive: {
    backgroundColor: INACTIVE_BG,
  },

  iconAbsolute: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },

  stepNumber: {
    fontFamily: "EuclidCircularA-Bold",
    fontSize: 13,
    color: Colors.white,
    lineHeight: 16,
  },

  stepNumberInactive: {
    fontFamily: "EuclidCircularA-Bold",
    fontSize: 13,
    color: "#94A3B8",
    lineHeight: 16,
  },

  // ── Glow ring ───────────────────────────────────────────────────────────────

  glowRing: {
    position: "absolute",
    width: CIRCLE_SIZE + 8,
    height: CIRCLE_SIZE + 8,
    borderRadius: (CIRCLE_SIZE + 8) / 2,
    backgroundColor: "transparent",
  },

  glowIos: {
    shadowColor: Colors.gradientStart,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },

  glowAndroid: {
    backgroundColor: `${Colors.gradientStart}22`,
  },

  // ── Connector line ───────────────────────────────────────────────────────────

  lineTrack: {
    flex: 1,
    height: LINE_HEIGHT,
    borderRadius: LINE_HEIGHT / 2,
    backgroundColor: INACTIVE_BG,
    overflow: "hidden",
  },

  lineFill: {
    height: LINE_HEIGHT,
    borderRadius: LINE_HEIGHT / 2,
    overflow: "hidden",
  },

  // ── Title ────────────────────────────────────────────────────────────────────

  titleSlot: {
    height: 18,
  },

  titleAnchor: {
    width: CIRCLE_SIZE,
    alignItems: "center",
    overflow: "visible",
  },

  titleText: {
    width: 120,
    fontFamily: "EuclidCircularA-SemiBold",
    fontSize: 11,
    lineHeight: 14,
    color: Colors.gradientStart,
    textAlign: "center",
  },
});
