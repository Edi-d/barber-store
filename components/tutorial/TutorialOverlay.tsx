/**
 * TutorialOverlay
 *
 * Full-screen overlay with a spotlight cutout that highlights a specific UI
 * element during tutorial walkthroughs. The cutout is formed by four dark
 * rectangular panels arranged around the target bounds — no SVG required.
 *
 * Architecture:
 *   - outer container: absoluteFill, pointerEvents="auto", zIndex 9999
 *   - 4 animated Reanimated.View panels (top, bottom, left, right) each driven
 *     by useSharedValue springs for smooth spotlight repositioning between steps
 *   - TutorialTooltip rendered absolutely above/below the spotlight
 *   - Overlay appears instantly with no fade animation
 */

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { TutorialTooltip } from './TutorialTooltip';

// ─── Constants ────────────────────────────────────────────────────────────────

const SPOTLIGHT_PADDING = 8;
const DIM_COLOR = 'rgba(0,0,0,0.6)';


// ─── Types ────────────────────────────────────────────────────────────────────

interface TargetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TutorialStep {
  title: string;
  description: string;
  position: 'top' | 'bottom';
}

export interface TutorialOverlayProps {
  visible: boolean;
  targetBounds: TargetBounds | null;
  step: TutorialStep | null;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TutorialOverlay({
  visible,
  targetBounds,
  step,
  stepIndex,
  totalSteps,
  onNext,
  onSkip,
}: TutorialOverlayProps) {
  // Spotlight geometry shared values — initialised off-screen so the first
  // spring animation always runs from a sensible starting position.
  const spX = useSharedValue(-SPOTLIGHT_PADDING);
  const spY = useSharedValue(-SPOTLIGHT_PADDING);
  const spW = useSharedValue(0);
  const spH = useSharedValue(0);

  useEffect(() => {
    if (!targetBounds) return;

    const x = targetBounds.x - SPOTLIGHT_PADDING;
    const y = targetBounds.y - SPOTLIGHT_PADDING;
    const w = targetBounds.width + SPOTLIGHT_PADDING * 2;
    const h = targetBounds.height + SPOTLIGHT_PADDING * 2;

    spX.value = withTiming(x, { duration: 120 });
    spY.value = withTiming(y, { duration: 120 });
    spW.value = withTiming(w, { duration: 120 });
    spH.value = withTiming(h, { duration: 120 });
  }, [targetBounds]);

  // ── Animated styles for the four dim panels ──────────────────────────────

  // Top panel: full width, height = spotlight top edge
  const topStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: Math.max(0, spY.value),
    backgroundColor: DIM_COLOR,
  }));

  // Bottom panel: full width, from spotlight bottom edge to screen bottom
  const bottomStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: spY.value + spH.value,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: DIM_COLOR,
  }));

  // Left panel: sits between top and bottom panels, left of spotlight
  const leftStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: spY.value,
    left: 0,
    width: Math.max(0, spX.value),
    height: spH.value,
    backgroundColor: DIM_COLOR,
  }));

  // Right panel: sits between top and bottom panels, right of spotlight
  const rightStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: spY.value,
    left: spX.value + spW.value,
    right: 0,
    height: spH.value,
    backgroundColor: DIM_COLOR,
  }));

  // ── Render guard ─────────────────────────────────────────────────────────

  if (!visible || !targetBounds || !step) return null;

  // ── Full spotlight state ──────────────────────────────────────────────────

  const isLastStep = stepIndex === totalSteps - 1;

  // Derive spotlight bounds with padding for the tooltip (uses padded coords)
  const paddedBounds: TargetBounds = {
    x: targetBounds.x - SPOTLIGHT_PADDING,
    y: targetBounds.y - SPOTLIGHT_PADDING,
    width: targetBounds.width + SPOTLIGHT_PADDING * 2,
    height: targetBounds.height + SPOTLIGHT_PADDING * 2,
  };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.container]}
      pointerEvents="auto"
    >
      {/* Four dim panels forming the spotlight cutout */}
      <Animated.View style={topStyle} pointerEvents="auto" />
      <Animated.View style={bottomStyle} pointerEvents="auto" />
      <Animated.View style={leftStyle} pointerEvents="auto" />
      <Animated.View style={rightStyle} pointerEvents="auto" />

      {/* Tooltip card */}
      <TutorialTooltip
        title={step.title}
        description={step.description}
        position={step.position}
        spotlightBounds={paddedBounds}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        onNext={onNext}
        onSkip={onSkip}
        isLastStep={isLastStep}
      />
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    zIndex: 9999,
  },
});
